import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeReadiness, isDismissibleFinding, checkRunConclusion } from './readiness.mjs';
import { STATES, SEVERITIES } from './constants.mjs';
import { makePull, NOW } from './test-helpers.mjs';

function finding(id, severity = SEVERITIES.BLOCKER, title = id, detail = 'detail') {
  return { id, severity, title, detail };
}

function policy(overrides = {}) {
  return { status: 'compliant', findings: [finding('policy.assignment-verified', SEVERITIES.INFO)], issues: [], ...overrides };
}

function checks(overrides = {}) {
  return { status: 'passed', findings: [finding('checks.passed', SEVERITIES.INFO)], total: 1, failing: [], pending: [], ...overrides };
}

function reviews(overrides = {}) {
  return { status: 'none', approvedBy: [], changesRequestedBy: [], aiReviewed: false, findings: [finding('review.no-human-approval', SEVERITIES.INFO)], ...overrides };
}

function evaluate({ pull = makePull(), policy: policyValue = policy(), checks: checksValue = checks(), reviews: reviewsValue = reviews(), dismissals = {}, staleDays = 30, aiReviewEnabled = false, now = NOW } = {}) {
  return computeReadiness({
    pull,
    policy: policyValue,
    checks: checksValue,
    reviews: reviewsValue,
    staleDays,
    aiReviewEnabled,
    dismissals,
    now,
  });
}

test('checks pass with no approval is ready for the first maintainer review', () => {
  assert.equal(evaluate().state, STATES.READY_FOR_MAINTAINER_REVIEW);
});

test('human approval with passing checks is ready for maintainer review', () => {
  const result = evaluate({
    reviews: reviews({ status: 'approved', approvedBy: ['maintainer'], findings: [finding('review.approved', SEVERITIES.INFO)] }),
  });
  assert.equal(result.state, STATES.READY_FOR_MAINTAINER_REVIEW);
  assert.equal(checkRunConclusion(result.state), 'success');
});

test('assignment policy takes precedence over draft and check state', () => {
  const result = evaluate({
    pull: makePull({ draft: true }),
    policy: policy({ status: 'blocked', findings: [finding('policy.no-issue-reference')] }),
    checks: checks({ status: 'failed', findings: [finding('checks.failed.test')] }),
  });
  assert.equal(result.state, STATES.AWAITING_ASSIGNMENT);
});

test('draft and merge conflict produce NEEDS_CHANGES', () => {
  assert.equal(evaluate({ pull: makePull({ draft: true }) }).state, STATES.NEEDS_CHANGES);
  assert.equal(evaluate({ pull: makePull({ mergeable: false, mergeable_state: 'dirty' }) }).state, STATES.NEEDS_CHANGES);
});

test('human change requests produce NEEDS_CHANGES', () => {
  const result = evaluate({
    reviews: reviews({
      status: 'changes-requested',
      changesRequestedBy: ['reviewer'],
      findings: [finding('review.changes-requested')],
    }),
  });
  assert.equal(result.state, STATES.NEEDS_CHANGES);
});

test('failed checks produce CHECKS_FAILED', () => {
  const result = evaluate({
    checks: checks({
      status: 'failed',
      failing: ['test'],
      findings: [finding('checks.failed.github-actions-test')],
    }),
  });
  assert.equal(result.state, STATES.CHECKS_FAILED);
  assert.equal(checkRunConclusion(result.state), 'action_required');
});

test('running checks produce CHECKS_RUNNING', () => {
  const result = evaluate({
    checks: checks({ status: 'running', pending: ['test'], findings: [finding('checks.pending', SEVERITIES.INFO)] }),
  });
  assert.equal(result.state, STATES.CHECKS_RUNNING);
});

test('missing checks remain blocked even after a dismissal attempt', () => {
  const blocked = evaluate({
    checks: checks({ status: 'blocked', findings: [finding('checks.no-data')] }),
  });
  assert.equal(blocked.state, STATES.INFRASTRUCTURE_BLOCKED);
  assert.equal(isDismissibleFinding('checks.no-data'), false);

  const dismissed = evaluate({
    checks: checks({ status: 'blocked', findings: [finding('checks.no-data')] }),
    dismissals: {
      'checks.no-data': {
        reason: 'Docs-only change; CI path filters intentionally skip it.',
        by: 'maintainer',
        at: '2026-10-22T10:00:00Z',
        headSha: 'a'.repeat(40),
      },
    },
  });
  assert.equal(dismissed.state, STATES.INFRASTRUCTURE_BLOCKED);
  assert.equal(dismissed.dismissedFindings.length, 0);
});

test('missing expected checks block and cannot be dismissed', () => {
  const blocked = evaluate({
    checks: checks({
      status: 'blocked',
      expected: ['test (ubuntu-latest)'],
      missing: ['test (ubuntu-latest)'],
      findings: [finding('checks.expected-missing')],
    }),
  });
  assert.equal(blocked.state, STATES.INFRASTRUCTURE_BLOCKED);
  assert.equal(isDismissibleFinding('checks.expected-missing'), false);
  const dismissed = evaluate({
    checks: checks({
      status: 'blocked',
      expected: ['test (ubuntu-latest)'],
      missing: ['test (ubuntu-latest)'],
      findings: [finding('checks.expected-missing')],
    }),
    dismissals: {
      'checks.expected-missing': {
        reason: 'trying to bypass required CI',
        by: 'maintainer',
        at: '2026-10-22T10:00:00Z',
        headSha: 'a'.repeat(40),
      },
    },
  });
  assert.equal(dismissed.state, STATES.INFRASTRUCTURE_BLOCKED);
});

test('a failed security check blocks readiness', () => {
  const result = evaluate({
    checks: checks({
      status: 'failed',
      failing: ['GitGuardian Security Checks'],
      findings: [finding('checks.security-failed')],
    }),
  });
  assert.equal(result.state, STATES.CHECKS_FAILED);
  assert.equal(isDismissibleFinding('checks.security-failed'), false);
});

test('unknown check data cannot be dismissed', () => {
  const result = evaluate({
    checks: checks({ status: 'unknown', findings: [finding('checks.api-unavailable')] }),
    dismissals: {
      'checks.api-unavailable': {
        reason: 'ignore',
        by: 'maintainer',
        at: '2026-10-22T10:00:00Z',
        headSha: 'a'.repeat(40),
      },
    },
  });
  assert.equal(result.state, STATES.INFRASTRUCTURE_BLOCKED);
  assert.equal(result.dismissedFindings.length, 0);
  assert.equal(isDismissibleFinding('checks.api-unavailable'), false);
});

test('unknown review data blocks readiness', () => {
  const result = evaluate({
    reviews: reviews({ status: 'unknown', findings: [finding('review.api-unavailable')] }),
  });
  assert.equal(result.state, STATES.INFRASTRUCTURE_BLOCKED);
});

test('unknown mergeability blocks readiness', () => {
  const result = evaluate({ pull: makePull({ mergeable: null }) });
  assert.equal(result.state, STATES.INFRASTRUCTURE_BLOCKED);
});

test('AI review is required before human review when enabled', () => {
  const pending = evaluate({ aiReviewEnabled: true });
  assert.equal(pending.state, STATES.AWAITING_AI_REVIEW);
  const reviewed = evaluate({
    aiReviewEnabled: true,
    reviews: reviews({ aiReviewed: true }),
  });
  assert.equal(reviewed.state, STATES.READY_FOR_MAINTAINER_REVIEW);
  const approved = evaluate({
    aiReviewEnabled: true,
    reviews: reviews({ status: 'approved', approvedBy: ['maintainer'], aiReviewed: true, findings: [finding('review.approved', SEVERITIES.INFO)] }),
  });
  assert.equal(approved.state, STATES.READY_FOR_MAINTAINER_REVIEW);
});

test('stale overrides an otherwise awaiting or ready state', () => {
  const pull = makePull({ updated_at: '2026-08-01T00:00:00Z' });
  assert.equal(evaluate({ pull }).state, STATES.STALE);
  const ready = evaluate({
    pull,
    reviews: reviews({ status: 'approved', approvedBy: ['maintainer'], findings: [] }),
  });
  assert.equal(ready.state, STATES.STALE);
});

test('stale does not mask assignment, check failures, or infrastructure blockers', () => {
  const pull = makePull({ updated_at: '2026-08-01T00:00:00Z' });
  assert.equal(evaluate({
    pull,
    policy: policy({ status: 'blocked', findings: [finding('policy.no-issue-reference')] }),
  }).state, STATES.AWAITING_ASSIGNMENT);
  assert.equal(evaluate({
    pull,
    checks: checks({ status: 'failed', findings: [finding('checks.failed.test')] }),
  }).state, STATES.CHECKS_FAILED);
});

test('required failures remain blocking even with current-head dismissal', () => {
  const headSha = 'a'.repeat(40);
  const dismissal = {
    'checks.failed.test': {
      reason: 'Known flaky check, tracked separately.',
      by: 'maintainer',
      at: '2026-10-22T10:00:00Z',
      headSha,
    },
  };
  const current = evaluate({
    checks: checks({ status: 'failed', findings: [finding('checks.failed.test')] }),
    dismissals: dismissal,
  });
  assert.equal(current.state, STATES.CHECKS_FAILED);
  assert.equal(current.dismissedFindings.length, 0);

  const newHead = evaluate({
    pull: makePull({ head: { sha: 'b'.repeat(40), repo: { full_name: 'alice/CODOVYN' } } }),
    checks: checks({ status: 'failed', findings: [finding('checks.failed.test')] }),
    dismissals: dismissal,
  });
  assert.equal(newHead.state, STATES.CHECKS_FAILED);
  assert.equal(newHead.dismissedFindings.length, 0);
});

test('required failures dominate pending checks despite dismissal', () => {
  const headSha = 'a'.repeat(40);
  const result = evaluate({
    checks: checks({
      status: 'failed',
      failing: ['test'],
      pending: ['lint'],
      findings: [finding('checks.failed.test'), finding('checks.pending', SEVERITIES.INFO)],
    }),
    dismissals: {
      'checks.failed.test': {
        reason: 'Known flaky check, tracked separately.',
        by: 'maintainer',
        at: '2026-10-22T10:00:00Z',
        headSha,
      },
    },
  });
  assert.equal(result.state, STATES.CHECKS_FAILED);
});

test('draft and merge-conflict findings cannot be dismissed', () => {
  assert.equal(isDismissibleFinding('pr.draft'), false);
  assert.equal(isDismissibleFinding('pr.merge-conflict'), false);
});

test('dismissed human change requests stop blocking, but policy cannot be dismissed', () => {
  const pull = makePull();
  const result = evaluate({
    pull,
    reviews: reviews({
      status: 'changes-requested',
      changesRequestedBy: ['reviewer'],
      findings: [finding('review.changes-requested')],
    }),
    dismissals: {
      'review.changes-requested': {
        reason: 'Review was for an obsolete commit and has been superseded.',
        by: 'maintainer',
        at: '2026-10-22T10:00:00Z',
        headSha: pull.head.sha,
      },
    },
  });
  assert.equal(result.state, STATES.READY_FOR_MAINTAINER_REVIEW);
  assert.equal(isDismissibleFinding('policy.no-issue-reference'), false);
});

test('merged and closed are terminal states independent of stale data', () => {
  assert.equal(evaluate({ pull: makePull({ state: 'closed', merged: true }) }).state, STATES.MERGED);
  assert.equal(evaluate({ pull: makePull({ state: 'closed' }) }).state, STATES.CLOSED);
});

test('an invalid or non-open pull request shape is UNKNOWN', () => {
  assert.equal(evaluate({ pull: makePull({ state: 'mystery' }) }).state, STATES.UNKNOWN);
  assert.equal(evaluate({ pull: { number: null } }).state, STATES.UNKNOWN);
});

test('check run conclusions map to advisory outcomes', () => {
  assert.equal(checkRunConclusion(STATES.READY_FOR_MAINTAINER_REVIEW), 'success');
  assert.equal(checkRunConclusion(STATES.CHECKS_FAILED), 'action_required');
  assert.equal(checkRunConclusion(STATES.UNKNOWN), 'action_required');
  assert.equal(checkRunConclusion(STATES.AWAITING_HUMAN_REVIEW), 'neutral');
  assert.equal(checkRunConclusion(STATES.CLOSED), 'skipped');
});
