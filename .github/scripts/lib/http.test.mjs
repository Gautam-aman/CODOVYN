import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyHttpError,
  isGitHubApiError,
  requestJson,
} from './http.mjs';

function response(status, body, headers = {}) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('classifies the PR #58/#60/#61 permission shape without leaking the token', () => {
  const error = classifyHttpError({
    status: 403,
    method: 'POST',
    path: '/repos/Gautam-aman/CODOVYN/issues/58/comments',
    headers: new Headers({
      'x-github-request-id': 'req-123',
      'x-accepted-github-permissions': 'issues=write; pull_requests=write',
    }),
    body: { message: 'Resource not accessible by integration', documentation_url: 'https://docs.github.com/rest' },
  });
  assert.equal(error.kind, 'permission');
  assert.equal(error.status, 403);
  assert.equal(error.retryable, false);
  const diagnostic = error.diagnostic();
  assert.match(diagnostic, /HTTP 403/);
  assert.match(diagnostic, /classification=permission/);
  assert.match(diagnostic, /request-id=req-123/);
  assert.match(diagnostic, /accepted-permissions=issues=write; pull_requests=write/);
  assert.equal(diagnostic.includes('secret-token'), false);
  assert.equal(isGitHubApiError(error, 'permission'), true);
});

test('a 403 diagnostic reports accepted permissions as alternatives, not proof of a root cause', () => {
  const error = classifyHttpError({
    status: 403,
    method: 'POST',
    path: '/repos/Gautam-aman/CODOVYN/issues/60/labels',
    headers: new Headers({
      'x-github-request-id': 'req-403',
      'x-accepted-github-permissions': 'issues=write; pull_requests=write',
    }),
    body: {
      message: 'Resource not accessible by integration',
      documentation_url: 'https://docs.github.com/rest/issues/labels#add-labels-to-an-issue',
    },
  });
  const diagnostic = error.diagnostic();
  assert.match(diagnostic, /HTTP 403/);
  assert.match(diagnostic, /classification=permission/);
  assert.match(diagnostic, /accepted-permissions=issues=write; pull_requests=write/);
  assert.match(diagnostic, /next-check=effective-workflow-token-and-event-context/);
  assert.match(diagnostic, /Resource not accessible by integration/);
  assert.match(diagnostic, /docs: https:\/\/docs.github.com\/rest\/issues\/labels/);
  assert.equal(/root cause/i.test(diagnostic), false);
});

test('validation failures include bounded API error details', () => {
  const error = classifyHttpError({
    status: 422,
    body: {
      message: 'Validation Failed',
      errors: [{ resource: 'Issue', field: 'labels', code: 'invalid' }],
    },
  });
  assert.equal(error.kind, 'validation');
  assert.match(error.diagnostic(), /details=\[.*labels.*\]/);
});

test('retries an idempotent GET after a transient 500', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1 ? response(500, { message: 'temporary' }) : response(200, { ok: true });
  };
  const result = await requestJson(fetchImpl, 'https://api.github.com/repos/x/y', {
    token: 'secret-token',
    sleep: async () => {},
    maxAttempts: 3,
  });
  assert.deepEqual(result.data, { ok: true });
  assert.equal(calls, 2);
});

test('does not retry a mutating POST on 500', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response(500, { message: 'temporary' });
  };
  await assert.rejects(
    requestJson(fetchImpl, 'https://api.github.com/repos/x/y/issues/1/comments', {
      method: 'POST',
      token: 'secret-token',
      body: { body: 'hello' },
      sleep: async () => {},
      maxAttempts: 3,
    }),
    (error) => error.status === 500 && error.kind === 'server',
  );
  assert.equal(calls, 1);
});

test('retries a rate-limited GET using the rate-limit signal', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return response(403, { message: 'API rate limit exceeded' }, {
        'x-ratelimit-remaining': '0',
        'retry-after': '0',
      });
    }
    return response(200, []);
  };
  const result = await requestJson(fetchImpl, 'https://api.github.com/repos/x/y/issues', {
    token: 'secret-token',
    sleep: async () => {},
  });
  assert.deepEqual(result.data, []);
  assert.equal(calls, 2);
});

test('retries network failures and reports a network classification after exhaustion', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new TypeError('fetch failed');
  };
  await assert.rejects(
    requestJson(fetchImpl, 'https://api.github.com/repos/x/y', {
      token: 'secret-token',
      sleep: async () => {},
      maxAttempts: 2,
    }),
    (error) => error.kind === 'network' && error.retryable === true,
  );
  assert.equal(calls, 2);
});

test('returns null for 204 responses', async () => {
  const fetchImpl = async () => new Response(null, { status: 204 });
  const result = await requestJson(fetchImpl, 'https://api.github.com/repos/x/y', {
    method: 'DELETE',
    token: 'secret-token',
  });
  assert.equal(result.data, null);
});

test('classifies 401, 404, 409, 422 and unknown failures distinctly', () => {
  assert.equal(classifyHttpError({ status: 401, body: { message: 'Bad credentials' } }).kind, 'authentication');
  assert.equal(classifyHttpError({ status: 404, body: { message: 'Not Found' } }).kind, 'not_found');
  assert.equal(classifyHttpError({ status: 409, body: { message: 'Conflict' } }).kind, 'conflict');
  assert.equal(classifyHttpError({ status: 422, body: { message: 'Validation Failed' } }).kind, 'validation');
  assert.equal(classifyHttpError({ status: 418, body: { message: 'teapot' } }).kind, 'unknown');
});
