import {
  CHECK_RUN_EXTERNAL_ID_PREFIX,
  CHECK_RUN_NAME,
  DEFAULT_NO_CHECKS_GRACE_MINUTES,
  SEVERITIES,
} from './constants.mjs';
import {
  AUTOMATION_CHECK_NAMES,
  SECURITY_CHECK_NAMES,
  expectedChecksForFiles,
  normalizeCheckName,
} from './ci-policy.mjs';
import { ageInMinutes, codeSpan, escapeInline, slug } from './util.mjs';

const FAILURE_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
  'stale',
]);
const PASSING_CONCLUSIONS = new Set(['success']);
const PENDING_STATUSES = new Set([
  'queued',
  'in_progress',
  'waiting',
  'requested',
  'pending',
]);
const INTERNAL_NAMES = new Set(AUTOMATION_CHECK_NAMES.map(normalizeCheckName));
const SECURITY_NAMES = new Set(SECURITY_CHECK_NAMES.map(normalizeCheckName));

function finding(id, severity, title, detail) {
  return { id, severity, title, detail };
}

function timestamp(item) {
  return Date.parse(item?.completed_at ?? item?.started_at ?? item?.updated_at ?? '') || 0;
}

function latestByName(items, keyFor) {
  const latest = new Map();
  for (const item of items) {
    const key = keyFor(item);
    const current = latest.get(key);
    if (!current || timestamp(item) >= timestamp(current)) latest.set(key, item);
  }
  return [...latest.values()];
}

function isGuardianCheck(item) {
  // Only the external_id is attacker-independent. A pull-request workflow can
  // choose its own job names, so filtering by name would let a contributor
  // hide a failing check behind Guardian's advisory name.
  return String(item?.external_id ?? '').startsWith(CHECK_RUN_EXTERNAL_ID_PREFIX);
}

function normalizeCheckRun(run) {
  const status = String(run?.status ?? 'unknown').toLowerCase();
  const conclusion = run?.conclusion == null ? null : String(run.conclusion).toLowerCase();
  return {
    infrastructure: run?.conclusion === 'startup_failure' || /billing|spending limit|job was not started|runner.*(?:unavailable|capacity)/i.test(String(run?.output?.title ?? '') + ' ' + String(run?.output?.summary ?? '').slice(0,8000)),
    kind: 'check-run',
    name: String(run?.name ?? 'unnamed check'),
    status,
    conclusion,
    app: String(run?.app?.slug ?? run?.app?.name ?? 'unknown'),
    appId: Number.isSafeInteger(run?.app?.id) ? run.app.id : null,
    targetUrl: typeof run?.details_url === 'string' ? run.details_url : '',
  };
}

function normalizeStatus(status) {
  const state = String(status?.state ?? 'unknown').toLowerCase();
  return {
    kind: 'status',
    name: String(status?.context ?? 'unnamed status'),
    status: state === 'pending' ? 'pending' : 'completed',
    conclusion: state === 'success' ? 'success'
      : state === 'pending' ? null
        : state === 'failure' ? 'failure'
          : state === 'error' ? 'failure'
            : 'unknown',
    app: String(status?.creator?.login ?? 'legacy-status'),
    appId: null,
    targetUrl: typeof status?.target_url === 'string' ? status.target_url : '',
    description: typeof status?.description === 'string' ? status.description : '',
  };
}

function classifyItem(item) {
  if (item.kind === 'check-run') {
    if (PENDING_STATUSES.has(item.status) || item.status === 'unknown') return 'pending';
    if (item.status !== 'completed') return 'pending';
    if (item.conclusion == null) return 'unknown';
    if (FAILURE_CONCLUSIONS.has(item.conclusion)) return 'failed';
    if (PASSING_CONCLUSIONS.has(item.conclusion)) return 'passed';
    return 'unknown';
  }
  if (item.status === 'pending') return 'pending';
  if (item.conclusion === 'success') return 'passed';
  if (item.conclusion === 'failure') return 'failed';
  return 'unknown';
}

function describeItems(items) {
  return items
    .map((item) => `${codeSpan(item.name)} (${escapeInline(item.conclusion ?? item.status, { maxLength: 40 })})`)
    .join(', ');
}

function describeNames(names) {
  return names.map((name) => codeSpan(name)).join(', ');
}

function isInternalItem(item) {
  return INTERNAL_NAMES.has(normalizeCheckName(item.name));
}

function isSecurityItem(item) {
  return item.app.toLowerCase() === 'gitguardian'
    || /security|codeql|dependency[ -]review|secret[ -]scanning/i.test(item.name)
    || SECURITY_NAMES.has(normalizeCheckName(item.name));
}

function isVercelAuthorizationFailure(item) {
  if (!normalizeCheckName(item.name).includes('vercel')) return false;
  return /vercel\.com\/git\/authorize|git\/authorize/i.test(item.targetUrl ?? '');
}

function expectedCheckKey(name) {
  return normalizeCheckName(name);
}

function addExpected(map, check, source) {
  const name = String(check?.name ?? check ?? '').trim();
  if (!name || normalizeCheckName(name) === normalizeCheckName(CHECK_RUN_NAME)) return;
  const key = expectedCheckKey(name);
  const appId = Number.isSafeInteger(check?.appId) && check.appId > 0 ? check.appId : null;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { name, appId, sources: [source] });
    return;
  }
  if (!existing.sources.includes(source)) existing.sources.push(source);
  if (existing.appId != null && appId != null && existing.appId !== appId) existing.appId = -1; // Contradictory app identities cannot satisfy this requirement.
  else if (existing.appId == null && appId != null) existing.appId = appId;
}

export function expectedChecks({ changedFiles, repositoryPolicy } = {}) {
  if (!Array.isArray(changedFiles)) return null;
  const map = new Map();
  const pathPolicy = expectedChecksForFiles(changedFiles);
  for (const check of pathPolicy.checks) addExpected(map, check, 'path-policy');
  for (const check of repositoryPolicy?.requiredChecks ?? []) {
    addExpected(map, check, check.sources?.[0] ?? 'repository-policy');
  }
  return [...map.values()];
}

function expectedItem(item, check) {
  if (normalizeCheckName(item.name) !== normalizeCheckName(check.name)) return false;
  if (check.appId == null) return true;
  return item.appId === check.appId;
}

function chooseItem(matches) {
  if (!matches.length) return null;
  return matches.find((item) => item.app === 'github-actions') ?? matches[0];
}

async function headAgeMinutes({ api, sha, now }) {
  if (!sha) return { age: null, error: 'missing-sha' };
  try {
    const commit = await api.getCommit(sha);
    const committedAt = commit?.commit?.committer?.date ?? commit?.commit?.author?.date ?? null;
    return { age: ageInMinutes(committedAt, now), error: null };
  } catch (error) {
    return { age: null, error: error?.status ?? 'error' };
  }
}

/**
 * Normalise check runs, commit statuses, and the path-aware expected-check
 * policy into a readiness signal.
 *
 * A missing expected check is never a pass. If it has not appeared shortly
 * after the head commit the result is `running`; after the grace window it is
 * `blocked` and cannot be dismissed. Optional provider failures (for example a
 * Vercel authorization redirect) are reported as warnings, but a required
 * failure and a GitGuardian failure always block.
 */
export async function evaluateChecks({
  api,
  pull,
  now = Date.now(),
  noChecksGraceMinutes = DEFAULT_NO_CHECKS_GRACE_MINUTES,
  changedFiles = [],
  repositoryPolicy = null,
}) {
  const sha = pull?.head?.sha;
  if (!sha) {
    return {
      status: 'unknown',
      findings: [
        finding('checks.api-unavailable', SEVERITIES.BLOCKER, 'Head commit is missing',
          'Guardian cannot read checks without a head commit SHA.'),
      ],
      total: 0,
      expected: [],
      missing: [],
      failing: [],
      optionalFailing: [],
      pending: [],
    };
  }

  let checkRuns;
  let combinedStatus;
  try {
    [checkRuns, combinedStatus] = await Promise.all([
      api.listCheckRunsForRef(sha),
      api.getCombinedStatus(sha),
    ]);
  } catch (error) {
    return {
      status: 'unknown',
      findings: [
        finding('checks.api-unavailable', SEVERITIES.BLOCKER, 'Check data is unavailable',
          `Guardian could not read checks for ${codeSpan(sha.slice(0, 7))} (HTTP ${error?.status ?? 'unknown'}). Missing data is not treated as a pass.`),
      ],
      total: 0,
      expected: [],
      missing: [],
      failing: [],
      optionalFailing: [],
      pending: [],
    };
  }

  const runs = latestByName(
    (Array.isArray(checkRuns) ? checkRuns : []).filter((run) => !isGuardianCheck(run)),
    (run) => `${run?.app?.id ?? 'app'}:${run?.name ?? 'unnamed'}`,
  ).map(normalizeCheckRun);
  const statuses = latestByName(
    Array.isArray(combinedStatus?.statuses) ? combinedStatus.statuses : [],
    (status) => String(status?.context ?? 'unnamed'),
  ).map(normalizeStatus);
  const items = [...runs, ...statuses].map((item) => ({ ...item, outcome: classifyItem(item) }));

  if (repositoryPolicy?.unavailable?.length) return { status: 'unknown', total: items.length, expected: [], missing: [], failing: [], optionalFailing: [], pending: [], findings: [finding('checks.repository-policy-unknown', SEVERITIES.BLOCKER, 'Repository requirements are unreadable', 'Guardian cannot verify branch protection or ruleset requirements. Ask a maintainer to inspect permissions; no readiness success is inferred.')] };
  const required = expectedChecks({ changedFiles, repositoryPolicy });
  if (required == null) {
    return {
      status: 'unknown',
      findings: [
        finding('checks.files-unavailable', SEVERITIES.BLOCKER, 'Changed files are unavailable',
          'Guardian could not read the complete changed-file list, so it cannot verify which CI checks are expected. Missing policy data is not treated as a pass.'),
      ],
      total: items.length,
      expected: [],
      missing: [],
      failing: [],
      optionalFailing: [],
      pending: [],
    };
  }

  const findings = [];
  const expectedNames = required.map((check) => check.name);
  const expectedResults = required.map((check) => {
    const matches = items.filter((item) => expectedItem(item, check));
    const item = chooseItem(matches);
    return { check, item, outcome: item?.outcome ?? 'missing' };
  });
  const matchedItems = new Set(expectedResults.map((result) => result.item).filter(Boolean));

  const infrastructureFailures = expectedResults.filter(result => result.outcome === 'failed' && result.item?.infrastructure);
  const requiredFailures = expectedResults.filter((result) => result.outcome === 'failed' && result.item && !result.item.infrastructure);
  const missing = expectedResults.filter((result) => result.outcome === 'missing').map((result) => result.check.name);
  const pendingExpected = expectedResults.filter((result) => result.outcome === 'pending');
  const unknownExpected = expectedResults.filter((result) => result.outcome === 'unknown');

  const securityItems = items.filter(isSecurityItem);
  const securityFailed = securityItems.filter((item) => item.outcome === 'failed');
  const securityPending = securityItems.filter((item) => item.outcome === 'pending');
  const securityUnknown = securityItems.filter((item) => item.outcome === 'unknown');
  const securitySet = new Set(securityItems);
  const requiredSet = new Set([...matchedItems, ...securitySet]);

  const optionalFailures = items.filter((item) => item.outcome === 'failed'
    && !requiredSet.has(item)
    && !isSecurityItem(item));

  for (const result of requiredFailures) {
    if (isSecurityItem(result.item)) continue;
    findings.push(finding(
      `checks.failed.${slug(`${result.item.app}-${result.item.name}`)}`,
      SEVERITIES.BLOCKER,
      `Check failed: ${escapeInline(result.item.name, { maxLength: 100 })}`,
      `GitHub reported ${codeSpan(result.item.conclusion ?? 'failure')} for ${codeSpan(result.item.name)}. Required CI failures block readiness; fix the underlying failure instead of dismissing it.`,
    ));
  }

  if (infrastructureFailures.length) findings.push(finding('checks.infrastructure-blocked', SEVERITIES.BLOCKER, 'Required CI could not start', 'GitHub reported a startup or infrastructure restriction. Ask a maintainer to inspect Actions; this is not a passing test result.'));

  if (securityFailed.length) {
    findings.push(finding(
      'checks.security-failed',
      SEVERITIES.BLOCKER,
      'Security check failed',
      `GitHub reported a failure for ${describeItems(securityFailed)}. A security-check failure blocks readiness and is not treated as an optional provider problem.`,
    ));
  }

  if (unknownExpected.length || securityUnknown.length) {
    const unknown = [...unknownExpected.map((result) => result.item), ...securityUnknown];
    findings.push(finding(
      'checks.unknown-conclusion',
      SEVERITIES.BLOCKER,
      'Check data has an unknown conclusion',
      `Guardian could not classify ${describeItems(unknown)}. Unknown data is not treated as a pass.`,
    ));
  }

  for (const item of optionalFailures) {
    const reason = isVercelAuthorizationFailure(item)
      ? 'This is Vercel authorization/deployment state, not a required repository test.'
      : isInternalItem(item)
        ? 'This is repository automation, not a required code test.'
        : 'This check is not part of the path-aware required-check policy.';
    findings.push(finding(
      `checks.optional-failed.${slug(`${item.app}-${item.name}`)}`,
      SEVERITIES.WARNING,
      `Optional check failed: ${escapeInline(item.name, { maxLength: 100 })}`,
      `GitHub reported ${codeSpan(item.conclusion ?? 'failure')} for ${codeSpan(item.name)}. ${reason} It is visible here but does not block readiness.`,
    ));
  }

  let missingPending = false;
  let missingBlocked = false;
  let missingAge = null;
  if (missing.length) {
    const head = await headAgeMinutes({ api, sha, now });
    missingAge = head.age;
    if (head.age != null && head.age <= noChecksGraceMinutes) {
      missingPending = true;
    } else {
      missingBlocked = true;
    }
    if (missingPending) {
      findings.push(finding(
        'checks.pending',
        SEVERITIES.INFO,
        'Expected checks have not reported yet',
        `Waiting for ${describeNames(missing)}. The head commit is ${Math.floor(head.age)} minute(s) old; Guardian will block if they remain absent after the grace window.`,
      ));
    } else {
      findings.push(finding(
        'checks.expected-missing',
        SEVERITIES.BLOCKER,
        'Expected CI checks are missing',
        `No result was reported for ${describeNames(missing)}${head.age == null ? '' : ` after ${Math.floor(head.age)} minute(s)`}. Missing expected checks are not a pass and this finding cannot be dismissed; fix the workflow trigger or the check name.`,
      ));
    }
  }

  if (pendingExpected.length || securityPending.length) {
    const pending = [...pendingExpected.map((result) => result.item), ...securityPending];
    findings.push(finding(
      'checks.pending',
      SEVERITIES.INFO,
      'Required checks are still running',
      `Waiting for ${describeItems(pending)}.`,
    ));
  }

  let status = 'passed';
  if (requiredFailures.length || securityFailed.length) {
    status = 'failed';
  } else if (infrastructureFailures.length || unknownExpected.length || securityUnknown.length) {
    status = 'unknown';
  } else if (pendingExpected.length || securityPending.length || missingPending) {
    status = 'running';
  } else if (missingBlocked) {
    status = 'blocked';
  } else if (!items.length) {
    // No checks were reported at all. This is only reachable without an
    // expected-check policy selecting something, so keep the explicit
    // no-data/grace behaviour and allow a maintainer to confirm the absence.
    const head = await headAgeMinutes({ api, sha, now });
    if (head.error) {
      status = 'unknown';
      findings.push(finding(
        'checks.api-unavailable',
        SEVERITIES.BLOCKER,
        'Check and commit data are unavailable',
        `Guardian found no checks and could not read the head commit (HTTP ${head.error}). Readiness cannot be treated as passing.`,
      ));
    } else if (head.age != null && head.age <= noChecksGraceMinutes) {
      status = 'running';
      findings.push(finding(
        'checks.pending',
        SEVERITIES.INFO,
        'Checks have not reported yet',
        `No check runs or commit statuses were reported for ${codeSpan(sha.slice(0, 7))} yet. The head commit is ${Math.floor(head.age)} minute(s) old.`,
      ));
    } else {
      status = 'blocked';
      findings.push(finding(
        'checks.no-data',
        SEVERITIES.BLOCKER,
        'No checks were reported',
        `No check runs or commit statuses were found for ${codeSpan(sha.slice(0, 7))}${head.age == null ? '' : ` after ${Math.floor(head.age)} minute(s)`}. Guardian does not treat missing checks as a pass. A maintainer can dismiss this finding only after confirming the absence is expected.`,
      ));
    }
  } else {
    const passed = items.filter((item) => item.outcome === 'passed');
    findings.push(finding(
      'checks.passed',
      SEVERITIES.INFO,
      'Required checks passed',
      `${expectedNames.length ? `${expectedNames.length} expected check(s)` : 'All reported checks'} completed successfully${items.length !== expectedNames.length ? ` (${items.length} total observed)` : ''}.`,
    ));
    if (passed.length && passed.every((item) => item.conclusion === 'skipped')) {
      findings.push(finding(
        'checks.all-skipped',
        SEVERITIES.WARNING,
        'All reported checks were skipped',
        'GitHub reported only skipped checks for this head commit. Confirm that this is expected for the changed paths.',
      ));
    }
  }

  return {
    status,
    findings,
    total: items.length,
    expected: expectedNames,
    missing,
    missingAgeMinutes: missingAge,
    failing: [
      ...requiredFailures.filter((result) => !isSecurityItem(result.item)).map((result) => result.item.name),
      ...securityFailed.map((item) => item.name),
    ],
    optionalFailing: optionalFailures.map((item) => item.name),
    pending: [
      ...pendingExpected.map((result) => result.item.name),
      ...securityPending.map((item) => item.name),
      ...(missingPending ? missing : []),
    ],
  };
}
