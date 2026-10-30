/**
 * Minimal, dependency-free GitHub REST/GraphQL transport.
 *
 * The transport is deliberately conservative:
 * - it retries only safe/idempotent requests and transient failures;
 * - it never logs request headers or tokens;
 * - it preserves GitHub's own diagnostic headers so a 403 can be classified
 *   as a permission problem instead of being reported as a code failure.
 */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class GitHubApiError extends Error {
  constructor({ method, path, status = 0, kind = 'unknown', message, requestId, documentationUrl, acceptedPermissions, details, retryable = false, cause }) {
    super(message ?? `GitHub API ${method} ${path} failed with HTTP ${status}`);
    this.name = 'GitHubApiError';
    this.method = method;
    this.path = path;
    this.status = status;
    this.kind = kind;
    this.requestId = requestId ?? null;
    this.documentationUrl = documentationUrl ?? null;
    this.acceptedPermissions = acceptedPermissions ?? null;
    this.details = details ?? null;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }

  /** A single-line, secret-free diagnostic suitable for a workflow log. */
  diagnostic() {
    const parts = [`GitHub API ${this.method} ${this.path}`];
    if (this.status) parts.push(`HTTP ${this.status}`);
    parts.push(`classification=${this.kind}`);
    if (this.requestId) parts.push(`request-id=${this.requestId}`);
    if (this.acceptedPermissions) parts.push(`accepted-permissions=${this.acceptedPermissions}`);
    if (this.kind === 'permission') {
      // GitHub lists accepted permissions as alternatives, not as a diff. The
      // workflow's effective token and event context still have to be checked.
      parts.push('next-check=effective-workflow-token-and-event-context');
    }
    if (this.details) parts.push(`details=${this.details}`);
    let text = parts.join(' ');
    if (this.message && !this.message.startsWith('GitHub API ')) text += `: ${this.message}`;
    if (this.documentationUrl) text += ` (docs: ${this.documentationUrl})`;
    return text;
  }
}

function header(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

function parseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 1000);
  }
}

function bodyMessage(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (typeof body.message === 'string') return body.message;
  return '';
}

function bodyDetails(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.errors) || !body.errors.length) return null;
  try {
    return JSON.stringify(body.errors).slice(0, 500);
  } catch {
    return null;
  }
}

/**
 * Classify an HTTP failure. The distinction matters: a missing permission
 * must not be shown to a contributor as a failed test, and a rate limit must
 * not be reported as a broken repository.
 */
export function classifyHttpError({ status, body, headers, method = 'GET', path = '' }) {
  const message = bodyMessage(body);
  const lower = message.toLowerCase();
  const remaining = header(headers, 'x-ratelimit-remaining');
  const retryAfter = header(headers, 'retry-after');
  const rateLimited = status === 429
    || lower.includes('rate limit')
    || lower.includes('secondary rate')
    || (status === 403 && (remaining === '0' || retryAfter != null));
  const permission = status === 403 && (
    lower.includes('resource not accessible by integration')
    || lower.includes('not accessible by integration')
    || (lower.includes('must have') && lower.includes('permission'))
    || lower.includes('forbidden')
    || lower.includes('not have permission')
  );
  let kind = 'unknown';
  if (status === 0) kind = 'network';
  else if (status === 401) kind = 'authentication';
  else if (rateLimited) kind = 'rate_limit';
  else if (status === 403 && permission) kind = 'permission';
  else if (status === 403) kind = 'authorization';
  else if (status === 404) kind = 'not_found';
  else if (status === 409) kind = 'conflict';
  else if (status === 410) kind = 'gone';
  else if (status === 422) kind = 'validation';
  else if (RETRYABLE_STATUS.has(status)) kind = 'server';
  else if (status === 403) kind = 'authorization';
  return new GitHubApiError({
    method,
    path,
    status,
    kind,
    message: message || undefined,
    requestId: header(headers, 'x-github-request-id'),
    documentationUrl: body && typeof body === 'object' ? body.documentation_url : undefined,
    acceptedPermissions: header(headers, 'x-accepted-github-permissions'),
    details: bodyDetails(body),
    retryable: kind === 'network' || kind === 'server' || kind === 'rate_limit',
  });
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number(header(response.headers, 'retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 60_000);
  const reset = Number(header(response.headers, 'x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    const wait = reset * 1000 - Date.now();
    if (wait > 0) return Math.min(wait, 60_000);
  }
  return Math.min(1000 * 2 ** (attempt - 1), 30_000);
}

/**
 * Perform one HTTP request with bounded retries.
 *
 * @param {typeof fetch} fetchImpl
 * @param {string} url
 * @param {object} options
 */
export async function requestJson(fetchImpl, url, options = {}) {
  const {
    method = 'GET',
    token,
    body,
    headers = {},
    retry = method === 'GET' || method === 'HEAD',
    maxAttempts = 3,
    timeoutMs = 20_000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    maxRetryDelayMs = 60_000,
  } = options;

  const payload = body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
  const requestHeaders = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CODOVYN-Guardian/1.0',
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(payload != null ? { 'Content-Type': 'application/json' } : {}),
  };

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: requestHeaders,
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastError = new GitHubApiError({
        method,
        path: url,
        status: 0,
        kind: 'network',
        message: `network error: ${error?.name ?? 'request failed'}`,
        retryable: true,
        cause: error,
      });
      if (!retry || attempt >= maxAttempts) throw lastError;
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 30_000));
      continue;
    }

    const text = await response.text();
    const parsed = parseBody(text);
    if (response.ok) {
      return { data: parsed, headers: response.headers, status: response.status };
    }

    const error = classifyHttpError({ status: response.status, body: parsed, headers: response.headers, method, path: url });
    lastError = error;
    if (!retry || !error.retryable || attempt >= maxAttempts) throw error;

    const delay = retryDelayMs(response, attempt);
    if (delay > maxRetryDelayMs) throw error;
    await sleep(delay);
  }
  throw lastError;
}

export function isGitHubApiError(error, kind) {
  return error instanceof GitHubApiError && (kind == null || error.kind === kind);
}
