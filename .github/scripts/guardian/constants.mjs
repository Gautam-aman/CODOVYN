export const STATES = Object.freeze({
  AWAITING_ASSIGNMENT: 'AWAITING_ASSIGNMENT',
  NEEDS_CHANGES: 'NEEDS_CHANGES',
  CHECKS_RUNNING: 'CHECKS_RUNNING',
  CHECKS_FAILED: 'CHECKS_FAILED',
  INFRASTRUCTURE_BLOCKED: 'INFRASTRUCTURE_BLOCKED',
  AWAITING_AI_REVIEW: 'AWAITING_AI_REVIEW',
  AWAITING_HUMAN_REVIEW: 'AWAITING_HUMAN_REVIEW',
  READY_FOR_MAINTAINER_REVIEW: 'READY_FOR_MAINTAINER_REVIEW',
  STALE: 'STALE',
  MERGED: 'MERGED',
  CLOSED: 'CLOSED',
  UNKNOWN: 'UNKNOWN',
});

export const STATE_DESCRIPTIONS = Object.freeze({
  AWAITING_ASSIGNMENT: 'The linked issue is missing or is not assigned to the pull request author.',
  NEEDS_CHANGES: 'A reviewer requested changes, the branch has a conflict, or the pull request is still a draft.',
  CHECKS_RUNNING: 'CI checks are queued or in progress.',
  CHECKS_FAILED: 'At least one required or security check did not succeed.',
  INFRASTRUCTURE_BLOCKED: 'Guardian could not obtain trustworthy check, review, or policy data, or an expected check is missing.',
  AWAITING_AI_REVIEW: 'Configured AI review is enabled and has not reviewed the current head commit.',
  AWAITING_HUMAN_REVIEW: 'Legacy state retained for compatibility. Guardian now reports READY_FOR_MAINTAINER_REVIEW for the first human review; approval is tracked separately.',
  READY_FOR_MAINTAINER_REVIEW: 'Automated readiness conditions are satisfied. A maintainer can perform the first review; human approval and merge eligibility are separate.',
  STALE: 'The pull request has had no activity for longer than the configured stale window.',
  MERGED: 'The pull request was merged. Guardian never merges pull requests.',
  CLOSED: 'The pull request was closed without merging.',
  UNKNOWN: 'Guardian could not determine a trustworthy readiness state.',
});

export const CHECK_RUN_NAME = 'CODOVYN Guardian / readiness (advisory)';
export const CHECK_RUN_EXTERNAL_ID_PREFIX = 'codovyn-guardian:';

export const DEFAULT_STALE_DAYS = 30;
export const DEFAULT_NO_CHECKS_GRACE_MINUTES = 15;
export const DEFAULT_AI_REVIEW_LOGIN = 'coderabbitai[bot]';
export const DEFAULT_MAINTAINER = 'Gautam-aman';

export const MAX_FINDINGS = 40;
export const MAX_DISMISSALS = 50;
export const DISMISSAL_REASON_MAX = 500;
export const FINDING_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,120}$/;

/** Findings with these prefixes can be dismissed with a maintainer command. */
export const DISMISSIBLE_FINDING_PREFIXES = Object.freeze(['checks.', 'review.', 'pr.']);

/** Unknown data and evaluation failures must never be dismissible. */
export const NON_DISMISSIBLE_FINDING_IDS = Object.freeze([
  'checks.no-data',
  'checks.infrastructure-blocked',
  'checks.repository-policy-unknown',
  'checks.api-unavailable',
  'checks.expected-missing',
  'checks.files-unavailable',
  'checks.security-failed',
  'checks.unknown-conclusion',
  'policy.api-unavailable',
  'review.api-unavailable',
  'pr.draft',
  'pr.merge-conflict',
  'pr.mergeability-unknown',
  'guardian.evaluation-failed',
]);

export const SEVERITIES = Object.freeze({
  BLOCKER: 'blocker',
  WARNING: 'warning',
  INFO: 'info',
});

export const COMMAND_NAMES = Object.freeze([
  'status',
  'recheck',
  'explain',
  'dismiss',
  'help',
]);
