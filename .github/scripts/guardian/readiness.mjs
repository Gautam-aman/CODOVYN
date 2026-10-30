import {
  DISMISSIBLE_FINDING_PREFIXES,
  NON_DISMISSIBLE_FINDING_IDS,
  SEVERITIES,
  STATE_DESCRIPTIONS,
  STATES,
} from './constants.mjs';
import { ageInDays, parseDate, stableFindingSort } from './util.mjs';

const HEAD_SCOPED_PREFIXES = ['checks.', 'review.'];
const DISMISSAL_MAX_AGE_DAYS = 90;

function finding(id, severity, title, detail) {
  return { id, severity, title, detail };
}

export function isDismissibleFinding(findingId) {
  if (findingId.startsWith('checks.failed.')) return false;
  if (!DISMISSIBLE_FINDING_PREFIXES.some((prefix) => findingId.startsWith(prefix))) return false;
  if (NON_DISMISSIBLE_FINDING_IDS.includes(findingId)) return false;
  return true;
}

export function dismissalApplies(findingId, headSha, dismissal) {
  if (!dismissal || !isDismissibleFinding(findingId)) return false;
  if (HEAD_SCOPED_PREFIXES.some((prefix) => findingId.startsWith(prefix))) {
    return dismissal.headSha === headSha;
  }
  return true;
}

export function pruneDismissals(dismissals, findings, headSha, now = Date.now()) {
  const present = new Set(findings.map((item) => item.id));
  const pruned = {};
  for (const [id, dismissal] of Object.entries(dismissals ?? {})) {
    if (!present.has(id) || !isDismissibleFinding(id)) continue;
    if (!dismissalApplies(id, headSha, dismissal)) continue;
    const dismissedAt = parseDate(dismissal.at);
    if (dismissedAt == null) continue;
    if ((now - dismissedAt) / 86_400_000 > DISMISSAL_MAX_AGE_DAYS) continue;
    pruned[id] = {
      reason: String(dismissal.reason ?? '').slice(0, 500),
      by: String(dismissal.by ?? ''),
      at: dismissal.at,
      headSha: dismissal.headSha ?? headSha,
    };
  }
  return pruned;
}

export function evaluatePullSignals({ pull, staleDays = 30, now = Date.now() }) {
  const findings = [];
  if (!pull || pull.invalid === true) {
    return {
      findings: [
        finding('pr.invalid', SEVERITIES.BLOCKER, 'Pull request data is unavailable',
          'Guardian could not read trustworthy pull request data.'),
      ],
      stale: false,
    };
  }

  if (pull.draft === true) {
    findings.push(finding(
      'pr.draft',
      SEVERITIES.BLOCKER,
      'Pull request is a draft',
      'Mark the pull request ready for review when it is complete. Draft pull requests are not ready for maintainer review.',
    ));
  }

  if (pull.mergeable === false || String(pull.mergeable_state ?? '').toLowerCase() === 'dirty') {
    findings.push(finding(
      'pr.merge-conflict',
      SEVERITIES.BLOCKER,
      'Merge conflict',
      'The branch conflicts with its base branch. Rebase or merge the base branch and resolve the conflict.',
    ));
  } else if (pull.state === 'open' && pull.mergeable == null) {
    findings.push(finding(
      'pr.mergeability-unknown',
      SEVERITIES.BLOCKER,
      'Mergeability is unknown',
      'GitHub has not finished calculating mergeability. Guardian does not treat unknown mergeability as ready.',
    ));
  }

  const age = ageInDays(pull.updated_at, now);
  const stale = age != null && age > staleDays;
  if (stale) {
    findings.push(finding(
      'pr.stale',
      SEVERITIES.WARNING,
      'No recent activity',
      `The pull request has not been updated for ${Math.floor(age)} day(s), beyond the ${staleDays}-day stale window.`,
    ));
  }

  return { findings, stale, ageDays: age };
}

/**
 * Deterministic readiness precedence. Inputs are evaluated in this order so the
 * reported state always names the first actionable blocker:
 *
 * merged/closed, policy unknown, assignment, draft/conflict/review changes,
 * failed checks, infrastructure, running checks, AI review, ready.
 *
 * Human approval is deliberately not a readiness gate. A contributor PR is
 * ready for the maintainer's first review once the automated conditions are
 * satisfied; approval and merge eligibility are reported separately.
 *
 * Dismissed findings stop blocking, except for unknown-data, missing-expected-
 * check, and security findings, which can never be dismissed.
 */
export function computeReadiness({
  pull,
  policy,
  checks,
  reviews,
  staleDays = 30,
  aiReviewEnabled = false,
  dismissals = {},
  now = Date.now(),
}) {
  const pullSignals = evaluatePullSignals({ pull, staleDays, now });
  const byId = new Map();
  for (const item of [
    ...(policy?.findings ?? []),
    ...(checks?.findings ?? []),
    ...(reviews?.findings ?? []),
    ...pullSignals.findings,
  ]) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const findings = stableFindingSort([...byId.values()]);
  const headSha = pull?.head?.sha ?? '';
  const appliedDismissals = pruneDismissals(dismissals, findings, headSha, now);
  const activeFindings = findings.filter((item) => item.severity === SEVERITIES.BLOCKER
    && !dismissalApplies(item.id, headSha, appliedDismissals[item.id]));
  const dismissedFindings = findings.filter((item) => dismissalApplies(item.id, headSha, appliedDismissals[item.id]));

  const hasActive = (id) => activeFindings.some((item) => item.id === id);
  const hasActivePrefix = (prefix) => activeFindings.some((item) => item.id.startsWith(prefix));

  let state = STATES.UNKNOWN;
  if (!pull || !Number.isSafeInteger(pull.number)) {
    state = STATES.UNKNOWN;
  } else if (pull.merged === true || pull.merged_at) {
    state = STATES.MERGED;
  } else if (pull.state === 'closed') {
    state = STATES.CLOSED;
  } else if (pull.state !== 'open') {
    state = STATES.UNKNOWN;
  } else if (policy?.status === 'unknown') {
    state = STATES.INFRASTRUCTURE_BLOCKED;
  } else if (policy?.status === 'blocked') {
    state = STATES.AWAITING_ASSIGNMENT;
  } else if (hasActive('pr.draft') || hasActive('pr.merge-conflict')) {
    state = STATES.NEEDS_CHANGES;
  } else if (hasActive('review.changes-requested') || hasActive('review.ai-changes-requested')) {
    state = STATES.NEEDS_CHANGES;
  } else if (checks?.status === 'failed' && (hasActivePrefix('checks.failed.') || hasActive('checks.security-failed'))) {
    state = STATES.CHECKS_FAILED;
  } else if (checks?.status === 'blocked'
    && (hasActive('checks.no-data') || hasActive('checks.expected-missing'))) {
    state = STATES.INFRASTRUCTURE_BLOCKED;
  } else if (checks?.status === 'unknown' || hasActive('checks.unknown-conclusion')) {
    state = STATES.INFRASTRUCTURE_BLOCKED;
  } else if (reviews?.status === 'unknown') {
    state = STATES.INFRASTRUCTURE_BLOCKED;
  } else if (hasActive('pr.mergeability-unknown')) {
    state = STATES.INFRASTRUCTURE_BLOCKED;
  } else if (checks?.status === 'running' || (checks?.pending?.length ?? 0) > 0) {
    state = STATES.CHECKS_RUNNING;
  } else if (aiReviewEnabled && !reviews?.aiReviewed) {
    state = STATES.AWAITING_AI_REVIEW;
  } else {
    state = STATES.READY_FOR_MAINTAINER_REVIEW;
  }

  if (pullSignals.stale && [
    STATES.AWAITING_AI_REVIEW,
    STATES.AWAITING_HUMAN_REVIEW,
    STATES.READY_FOR_MAINTAINER_REVIEW,
  ].includes(state)) {
    state = STATES.STALE;
  }

  return {
    state,
    stateDescription: STATE_DESCRIPTIONS[state],
    findings,
    activeFindings,
    dismissedFindings,
    dismissals: appliedDismissals,
    approvedBy: reviews?.approvedBy ?? [],
    changesRequestedBy: reviews?.changesRequestedBy ?? [],
    stale: Boolean(pullSignals.stale),
    ageDays: pullSignals.ageDays ?? null,
  };
}

/** Check-run conclusion for the advisory Guardian check. */
export function checkRunConclusion(state) {
  switch (state) {
    case STATES.READY_FOR_MAINTAINER_REVIEW:
      return 'success';
    case STATES.MERGED:
    case STATES.CLOSED:
      return 'skipped';
    case STATES.NEEDS_CHANGES:
    case STATES.CHECKS_FAILED:
    case STATES.AWAITING_ASSIGNMENT:
    case STATES.INFRASTRUCTURE_BLOCKED:
    case STATES.UNKNOWN:
      return 'action_required';
    default:
      return 'neutral';
  }
}

export function isReadyState(state) {
  return state === STATES.READY_FOR_MAINTAINER_REVIEW;
}

export function isTerminalState(state) {
  return state === STATES.MERGED || state === STATES.CLOSED;
}
