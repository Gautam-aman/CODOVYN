import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runGuardian, loadConfig } from './index.mjs';
import { STATES } from './constants.mjs';
import {
  BOT_LOGIN,
  baseConfig,
  checkRun,
  createApi,
  makeComment,
  makeIssue,
  makePull,
  NOW,
  REPOSITORY,
  review,
} from './test-helpers.mjs';

function summaryComments(api) {
  return api.state.comments.filter((comment) => comment.body.startsWith('<!-- codovyn-guardian-summary -->'));
}

function notificationComments(api) {
  return api.state.comments.filter((comment) => comment.body.startsWith('<!-- codovyn-guardian-notification:'));
}

test('lifecycle: assignment, review, failure, recovery, and notification dedupe', async () => {
  const issue = makeIssue(42);
  const api = createApi({
    issues: new Map([[42, issue]]),
    checkRuns: [checkRun('test (ubuntu-latest)'), checkRun('test (macos-latest)'), checkRun('test (windows-latest)')],
    files: [{ filename: 'apps/desktop/build/macos.js' }],
    permissions: { maintainer: { permission: 'write' } },
    timelineEvents: [{
      event: 'cross-referenced',
      source: { issue: { number: 90, state: 'open', pull_request: {}, body: 'Closes #42' } },
    }],
  });
  const config = baseConfig();
  const event = { pull_request: { number: 90 } };

  const opened = await runGuardian({ eventName: 'pull_request_target', event, api, config, now: NOW });
  assert.equal(opened.failed, 0);
  assert.equal(opened.results[0].state, STATES.AWAITING_ASSIGNMENT);
  assert.equal(summaryComments(api).length, 1);
  assert.equal(notificationComments(api).length, 0);

  api.state.issues.get(42).assignees = [{ login: 'alice' }];
  const assigned = await runGuardian({ eventName: 'issues', event: { action: 'assigned', issue: { number: 42 } }, api, config, now: NOW });
  assert.equal(assigned.results[0].state, STATES.READY_FOR_MAINTAINER_REVIEW);
  assert.equal(summaryComments(api).length, 1);
  assert.equal(notificationComments(api).length, 1);
  assert.match(notificationComments(api)[0].body, /@Gautam-aman/);
  assert.match(notificationComments(api)[0].body, /first maintainer review/);
  assert.match(notificationComments(api)[0].body, /none yet/);

  api.state.reviews = [review('maintainer', 'APPROVED')];
  const ready = await runGuardian({ eventName: 'pull_request_review', event: { pull_request: { number: 90 } }, api, config, now: NOW });
  assert.equal(ready.results[0].state, STATES.READY_FOR_MAINTAINER_REVIEW);
  assert.equal(summaryComments(api).length, 1);
  assert.equal(notificationComments(api).length, 1);
  assert.match(summaryComments(api)[0].body, /Approved by maintainer/);

  const rerun = await runGuardian({ eventName: 'pull_request_target', event, api, config, now: NOW });
  assert.equal(rerun.results[0].summary, 'unchanged');
  assert.equal(notificationComments(api).length, 1);
  assert.equal(api.calls.filter(([method]) => method === 'createPullComment').length, 2);

  api.state.pull.head = { sha: 'b'.repeat(40), repo: { full_name: 'alice/CODOVYN' } };
  api.state.pull.updated_at = '2026-10-22T12:01:00Z';
  const failedRun = checkRun('test (ubuntu-latest)', { conclusion: 'failure' });
  failedRun.completed_at = '2026-10-22T12:05:00Z';
  api.state.checkRuns = [failedRun];
  const failed = await runGuardian({ eventName: 'workflow_run', event: { workflow_run: { name: 'CI', head_sha: 'b'.repeat(40), pull_requests: [{ number: 90 }] } }, api, config, now: NOW });
  assert.equal(failed.results[0].state, STATES.CHECKS_FAILED);
  assert.equal(summaryComments(api).length, 1);

  api.state.pull.head = { sha: 'c'.repeat(40), repo: { full_name: 'alice/CODOVYN' } };
  api.state.pull.updated_at = '2026-10-22T12:02:00Z';
  const fixedRun = checkRun('test (ubuntu-latest)', { conclusion: 'success' });
  fixedRun.completed_at = '2026-10-22T12:10:00Z';
  api.state.checkRuns = [fixedRun, checkRun('test (macos-latest)'), checkRun('test (windows-latest)')];
  const recovered = await runGuardian({ eventName: 'workflow_run', event: { workflow_run: { name: 'CI', head_sha: 'c'.repeat(40), pull_requests: [{ number: 90 }] } }, api, config, now: NOW });
  assert.equal(recovered.results[0].state, STATES.READY_FOR_MAINTAINER_REVIEW);
  assert.equal(summaryComments(api).length, 1);
  assert.equal(notificationComments(api).length, 2);
  assert.equal(api.calls.filter(([method]) => method === 'createPullComment').length, 3);
});

test('check_suite resolves a fork PR from the head SHA when pull_requests is empty', async () => {
  const api = createApi({ pullRequestsForCommit: [{ number: 90, state: 'open' }] });
  const result = await runGuardian({
    eventName: 'check_suite',
    event: {
      check_suite: {
        app: { slug: 'gitguardian' },
        head_sha: 'a'.repeat(40),
        pull_requests: [],
      },
    },
    api,
    config: baseConfig(),
    now: NOW,
  });
  assert.deepEqual(result.results.map((item) => item.pullNumber), [90]);
  assert.ok(api.calls.some(([method, sha]) => method === 'listPullsForCommit' && sha === 'a'.repeat(40)));
});

test('GitHub Actions check_suite events are ignored to avoid a Guardian loop', async () => {
  const api = createApi();
  const result = await runGuardian({
    eventName: 'check_suite',
    event: { check_suite: { app: { slug: 'github-actions' }, head_sha: 'a'.repeat(40), pull_requests: [{ number: 90 }] } },
    api,
    config: baseConfig(),
    now: NOW,
  });
  assert.deepEqual(result.results, []);
  assert.equal(api.calls.length, 0);
});

test('workflow_run ignores untrusted workflow names and follows allowed ones', async () => {
  const api = createApi();
  const ignored = await runGuardian({
    eventName: 'workflow_run',
    event: { workflow_run: { name: 'Guardian', head_sha: 'a'.repeat(40), pull_requests: [{ number: 90 }] } },
    api,
    config: baseConfig(),
    now: NOW,
  });
  assert.deepEqual(ignored.results, []);

  const followed = await runGuardian({
    eventName: 'workflow_run',
    event: { workflow_run: { name: 'CI', head_sha: 'a'.repeat(40), pull_requests: [{ number: 90 }] } },
    api,
    config: baseConfig(),
    now: NOW,
  });
  assert.equal(followed.results[0].pullNumber, 90);

  const guardianTests = await runGuardian({
    eventName: 'workflow_run',
    event: { workflow_run: { name: 'Guardian tests', head_sha: 'a'.repeat(40), pull_requests: [{ number: 90 }] } },
    api: createApi(),
    config: baseConfig(),
    now: NOW,
  });
  assert.equal(guardianTests.results[0].pullNumber, 90);
});

test('Guardian and bot changes cannot be ready without their test job', async () => {
  const base = {
    issues: new Map([[42, makeIssue(42, { assignees: ['alice'] })]]),
    timelineEvents: [{
      event: 'cross-referenced',
      source: { issue: { number: 90, state: 'open', pull_request: {}, body: 'Closes #42' } },
    }],
    files: [{ filename: '.github/scripts/guardian/index.mjs' }],
    commitDate: '2026-10-22T10:00:00Z',
  };
  const config = baseConfig({ dryRun: true, notify: false, checkRun: false });
  const event = { pull_request: { number: 90 } };

  const missingApi = createApi({
    ...base,
    checkRuns: [checkRun('GitGuardian Security Checks', { app: 'gitguardian' })],
  });
  const missing = await runGuardian({ eventName: 'pull_request_target', event, api: missingApi, config, now: NOW });
  assert.equal(missing.results[0].state, STATES.INFRASTRUCTURE_BLOCKED);

  const failingApi = createApi({
    ...base,
    commitDate: '2026-10-22T11:55:00Z',
    checkRuns: [checkRun('guardian + bot tests', { conclusion: 'failure' })],
  });
  const failing = await runGuardian({ eventName: 'pull_request_target', event, api: failingApi, config, now: NOW });
  assert.equal(failing.results[0].state, STATES.CHECKS_FAILED);
});

test('issue assignment events resolve linked pull requests from the issue timeline', async () => {
  const api = createApi({
    timelineEvents: [{
      event: 'cross-referenced',
      source: {
        issue: {
          number: 90,
          state: 'open',
          pull_request: {},
          body: 'Fixes #42',
        },
      },
    }],
    searchPulls: [{ number: 91 }],
  });
  const result = await runGuardian({
    eventName: 'issues',
    event: { action: 'assigned', issue: { number: 42 } },
    api,
    config: baseConfig(),
    now: NOW,
  });
  assert.deepEqual(result.results.map((item) => item.pullNumber), [90]);
  assert.ok(api.calls.some(([method, number]) => method === 'listIssueTimeline' && number === 42));
  assert.ok(!api.calls.some(([method]) => method === 'searchOpenPullsForIssue'));
});

test('issue assignment ignores cross-references that do not deliberately link the issue', async () => {
  const api = createApi({
    timelineEvents: [{
      event: 'cross-referenced',
      source: {
        issue: {
          number: 90,
          state: 'open',
          pull_request: {},
          body: 'See #42 for background only.',
        },
      },
    }],
    searchPulls: [{ number: 91 }],
  });
  const result = await runGuardian({
    eventName: 'issues',
    event: { action: 'assigned', issue: { number: 42 } },
    api,
    config: baseConfig(),
    now: NOW,
  });
  assert.deepEqual(result.results, []);
  assert.ok(!api.calls.some(([method]) => method === 'searchOpenPullsForIssue'));
});

test('issue assignment falls back to text search only when the timeline API fails', async () => {
  const api = createApi({
    searchPulls: [{ number: 91 }],
    errors: { listIssueTimeline: { status: 500, message: 'server error' } },
  });
  const result = await runGuardian({
    eventName: 'issues',
    event: { action: 'assigned', issue: { number: 42 } },
    api,
    config: baseConfig(),
    now: NOW,
  });
  assert.deepEqual(result.results.map((item) => item.pullNumber), [91]);
  assert.ok(api.calls.some(([method, number]) => method === 'searchOpenPullsForIssue' && number === 42));
});

test('schedule and manual runs reconcile open pull requests up to the configured limit', async () => {
  const api = createApi({ openPulls: [{ number: 90 }, { number: 91 }] });
  const scheduled = await runGuardian({
    eventName: 'schedule',
    event: {},
    api,
    config: baseConfig({ maxPullsPerRun: 1 }),
    now: NOW,
  });
  assert.equal(scheduled.results.length, 1);
  const manual = await runGuardian({
    eventName: 'workflow_dispatch',
    event: { inputs: { pr: '90, 91' } },
    api,
    config: baseConfig(),
    now: NOW,
  });
  assert.deepEqual(manual.results.map((item) => item.pullNumber), [90, 91]);
});

test('dry-run writes nothing, including summaries, check runs, and notifications', async () => {
  const api = createApi({
    reviews: [review('maintainer', 'APPROVED')],
    permissions: { maintainer: { permission: 'write' } },
  });
  const result = await runGuardian({
    eventName: 'pull_request_target',
    event: { pull_request: { number: 90 } },
    api,
    config: baseConfig({ dryRun: true, notify: true }),
    now: NOW,
  });
  assert.equal(result.failed, 0);
  assert.equal(api.state.comments.length, 0);
  assert.equal(api.state.checkRuns.filter((run) => run.name === 'CODOVYN Guardian / readiness (advisory)').length, 0);
  assert.equal(api.calls.filter(([method]) => method.startsWith('create') || method.startsWith('update')).length, 0);
});

test('the default notification recipient is the repository maintainer', () => {
  assert.deepEqual(loadConfig({}).maintainers, ['Gautam-aman']);
  assert.deepEqual(loadConfig({ GUARDIAN_MAINTAINERS: 'maintainer, helper' }).maintainers, ['maintainer', 'helper']);
  assert.deepEqual(loadConfig({ GUARDIAN_MAINTAINERS: ' , ' }).maintainers, ['Gautam-aman']);
  assert.deepEqual(loadConfig({ GUARDIAN_MAINTAINERS: 'maintainer, maintainer' }).maintainers, ['maintainer']);
});

test('an approval of an earlier commit is not reported as current-head approval', async () => {
  const api = createApi({
    files: [{ filename: 'apps/desktop/build/macos.js' }],
    checkRuns: [checkRun('test (ubuntu-latest)'), checkRun('test (macos-latest)'), checkRun('test (windows-latest)')],
    reviews: [review('maintainer', 'APPROVED', '2026-10-21T10:00:00Z', 'User', 'b'.repeat(40))],
    permissions: { maintainer: { permission: 'write' } },
  });
  api.state.issues.get(42).assignees = [{ login: 'alice' }];
  const result = await runGuardian({
    eventName: 'pull_request_target',
    event: { pull_request: { number: 90 } },
    api,
    config: baseConfig({ notify: true }),
    now: NOW,
  });
  assert.equal(result.results[0].state, STATES.READY_FOR_MAINTAINER_REVIEW);
  assert.match(summaryComments(api)[0].body, /Approval is for an earlier commit/);
  assert.match(notificationComments(api)[0].body, /none yet/);
  assert.doesNotMatch(notificationComments(api)[0].body, /Human approval already recorded/);
});

test('maintainer-authored and bot-authored ready pull requests do not notify a maintainer', async () => {
  for (const pull of [
    makePull({ author_association: 'OWNER', user: { login: 'Gautam-aman', type: 'User' } }),
    makePull({ author_association: 'NONE', user: { login: 'dependabot[bot]', type: 'Bot' } }),
  ]) {
    const api = createApi({
      pull,
      permissions: { 'Gautam-aman': { permission: 'admin' } },
      files: [{ filename: 'apps/desktop/build/macos.js' }],
      checkRuns: [checkRun('test (ubuntu-latest)'), checkRun('test (macos-latest)'), checkRun('test (windows-latest)')],
    });
    const result = await runGuardian({
      eventName: 'pull_request_target',
      event: { pull_request: { number: 90 } },
      api,
      config: baseConfig({ notify: true }),
      now: NOW,
    });
    assert.equal(result.results[0].state, STATES.READY_FOR_MAINTAINER_REVIEW);
    assert.equal(notificationComments(api).length, 0);
  }
});

test('the first ready evaluation notifies the default maintainer even with no approvals', async () => {
  const api = createApi({
    files: [{ filename: 'apps/desktop/build/macos.js' }],
    checkRuns: [checkRun('test (ubuntu-latest)'), checkRun('test (macos-latest)'), checkRun('test (windows-latest)')],
  });
  api.state.issues.get(42).assignees = [{ login: 'alice' }];
  const result = await runGuardian({
    eventName: 'pull_request_target',
    event: { pull_request: { number: 90 } },
    api,
    config: baseConfig({ notify: true }),
    now: NOW,
  });
  assert.equal(result.results[0].state, STATES.READY_FOR_MAINTAINER_REVIEW);
  assert.equal(notificationComments(api).length, 1);
  assert.match(notificationComments(api)[0].body, /@Gautam-aman/);
  assert.match(notificationComments(api)[0].body, /none yet/);
  assert.match(notificationComments(api)[0].body, /did not approve or merge/);
});

test('permission failures in the summary write are reported with a 403 diagnostic', async () => {
  const api = createApi({ errors: { createPullComment: { status: 403, message: 'Resource not accessible by integration' } } });
  const result = await runGuardian({
    eventName: 'pull_request_target',
    event: { pull_request: { number: 90 } },
    api,
    config: baseConfig(),
    now: NOW,
  });
  assert.equal(result.failed, 1);
  assert.match(result.results[0].error, /HTTP 403/);
  assert.match(result.results[0].error, /classification=permission/);
});

test('an advisory check-run permission failure does not prevent the summary', async () => {
  const api = createApi({ errors: { createCheckRun: { status: 403, message: 'Resource not accessible by integration' } } });
  const logs = [];
  const result = await runGuardian({
    eventName: 'pull_request_target',
    event: { pull_request: { number: 90 } },
    api,
    config: baseConfig(),
    now: NOW,
    log: (message) => logs.push(message),
  });
  assert.equal(result.failed, 0);
  assert.equal(summaryComments(api).length, 1);
  assert.equal(result.results[0].checkRun, 'skipped');
  assert.match(logs.join('\n'), /could not publish advisory check/);
});

test('the advisory check-run update is idempotent across reruns', async () => {
  const api = createApi({ checkRuns: [checkRun('test')] });
  const config = baseConfig();
  const event = { pull_request: { number: 90 } };
  await runGuardian({ eventName: 'pull_request_target', event, api, config, now: NOW });
  const updateCount = api.calls.filter(([method]) => method === 'updateCheckRun').length;
  await runGuardian({ eventName: 'pull_request_target', event, api, config, now: NOW });
  assert.equal(api.calls.filter(([method]) => method === 'updateCheckRun').length, updateCount);
});

test('an untrustworthy pull response is recorded as UNKNOWN instead of aborting', async () => {
  const api = createApi();
  api.getPull = async () => null;
  const result = await runGuardian({
    eventName: 'pull_request_target',
    event: { pull_request: { number: 90 } },
    api,
    config: baseConfig(),
    now: NOW,
  });
  assert.equal(result.failed, 0);
  assert.equal(result.results[0].state, STATES.UNKNOWN);
  assert.equal(summaryComments(api).length, 1);
  assert.match(summaryComments(api)[0].body, /UNKNOWN/);
  assert.equal(result.results[0].checkRun, 'missing-identity');
});

test('a Guardian summary suppresses the older PR assignment bot comment', async () => {
  const api = createApi();
  const { validatePull } = await import('../pr-assignment-bot.mjs');
  api.state.issues.get(42).assignees = [];
  const guardianComment = makeComment({
    id: 77,
    body: '<!-- codovyn-guardian-summary -->\n<!-- codovyn-guardian-state:e30 -->\n## CODOVYN Guardian — `AWAITING_ASSIGNMENT`',
  });
  api.state.comments.push(guardianComment);
  const pull = makePull();
  const result = await validatePull(pull, api, { repository: REPOSITORY });
  assert.equal(result.state, 'warning');
  assert.equal(api.calls.filter(([method]) => method === 'createPullComment' || method === 'createIssueComment').length, 0);
  assert.equal(api.state.comments.filter((comment) => comment.user.login === BOT_LOGIN && comment.body.startsWith('<!-- codovyn-pr-assignment-bot -->')).length, 0);
});
