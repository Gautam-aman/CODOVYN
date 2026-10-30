import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleGuardianCommand, parseGuardianCommand } from './commands.mjs';
import { STATES, SEVERITIES } from './constants.mjs';
import { parseStateMetadata } from './comments.mjs';
import { encodeStateMetadata } from './comments.mjs';
import {
  BOT_LOGIN,
  baseConfig,
  createApi,
  makeComment,
  makePull,
  NOW,
  REPOSITORY,
} from './test-helpers.mjs';

const pull = makePull();

const snapshot = {
  pull,
  policy: { status: 'compliant', findings: [] },
  checks: {
    status: 'failed',
    total: 1,
    failing: ['test'],
    pending: [],
    findings: [{
      id: 'checks.failed.github-actions-test',
      severity: SEVERITIES.BLOCKER,
      title: 'Check failed: test',
      detail: 'failure',
    }],
  },
  reviews: { status: 'none', approvedBy: [], changesRequestedBy: [], aiReviewed: false, findings: [] },
  outcome: {
    state: STATES.CHECKS_FAILED,
    stateDescription: 'At least one CI check did not succeed.',
    findings: [{
      id: 'checks.failed.github-actions-test',
      severity: SEVERITIES.BLOCKER,
      title: 'Check failed: test',
      detail: 'failure',
    }],
    activeFindings: [],
    dismissedFindings: [],
    dismissals: {},
  },
  comments: [],
  previousState: null,
};

function event({ body = '/guardian status', login = 'alice', type = 'User', pullRequest = true, number = 90 } = {}) {
  return {
    issue: { number, ...(pullRequest ? { pull_request: {} } : {}) },
    comment: { body, user: { login, type } },
  };
}

function setup({ permission = 'read', comments = [] } = {}) {
  const api = createApi({ comments, permissions: { alice: { permission } } });
  const calls = { evaluate: [], persist: [] };
  const evaluate = async (options) => {
    calls.evaluate.push(options);
    return snapshot;
  };
  const persist = async (options) => {
    calls.persist.push(options);
    return { outcome: options.snapshot.outcome, summary: { action: 'updated' } };
  };
  return { api, calls, evaluate, persist };
}

test('parses supported commands without accepting free-form shell text', () => {
  assert.deepEqual(parseGuardianCommand('/guardian status'), { command: 'status', raw: '/guardian status' });
  assert.equal(parseGuardianCommand('/guardian').command, 'help');
  assert.equal(parseGuardianCommand('/guardian help').command, 'help');
  assert.equal(parseGuardianCommand('/guardian merge').command, 'merge');
  assert.equal(parseGuardianCommand('/guardian nope').command, 'unknown');
  assert.equal(parseGuardianCommand('/guardian status extra').command, 'usage');
  assert.equal(parseGuardianCommand('/guardian dismiss checks.failed.test flaky check').command, 'dismiss');
  assert.equal(parseGuardianCommand('/guardian dismiss checks.failed.test').command, 'usage');
  assert.equal(parseGuardianCommand('/guardian dismiss checks.failed.test ' + 'x'.repeat(600)).command, 'usage');
  assert.equal(parseGuardianCommand('/guardian; rm -rf /'), null);
  assert.equal(parseGuardianCommand('please run /guardian status'), null);
});

test('status reports the last recorded state and never invents one', async () => {
  const empty = setup();
  await handleGuardianCommand({
    api: empty.api,
    event: event(),
    config: baseConfig({ notify: false }),
    now: NOW,
    evaluate: empty.evaluate,
    persist: empty.persist,
  });
  assert.match(empty.api.state.comments[0].body, /has not recorded a state/);
  assert.equal(empty.calls.evaluate.length, 0);

  const metadata = encodeStateMetadata({ state: STATES.AWAITING_HUMAN_REVIEW, headSha: pull.head.sha });
  const recorded = setup({ comments: [makeComment({ body: `<!-- codovyn-guardian-summary -->\n<!-- codovyn-guardian-state:${metadata} -->` })] });
  await handleGuardianCommand({
    api: recorded.api,
    event: event(),
    config: baseConfig({ notify: false }),
    now: NOW,
    evaluate: recorded.evaluate,
    persist: recorded.persist,
  });
  assert.match(recorded.api.state.comments.at(-1).body, /AWAITING.*HUMAN.*REVIEW/);
});

test('explain evaluates live without persisting', async () => {
  const state = setup();
  await handleGuardianCommand({
    api: state.api,
    event: event({ body: '/guardian explain' }),
    config: baseConfig(),
    now: NOW,
    evaluate: state.evaluate,
    persist: state.persist,
  });
  assert.equal(state.calls.evaluate.length, 1);
  assert.equal(state.calls.persist.length, 0);
  assert.match(state.api.state.comments.at(-1).body, /CHECKS_FAILED/);
});

test('recheck requires repository write permission', async () => {
  const denied = setup({ permission: 'read' });
  await handleGuardianCommand({
    api: denied.api,
    event: event({ body: '/guardian recheck' }),
    config: baseConfig(),
    now: NOW,
    evaluate: denied.evaluate,
    persist: denied.persist,
  });
  assert.equal(denied.calls.evaluate.length, 0);
  assert.equal(denied.calls.persist.length, 0);
  assert.match(denied.api.state.comments.at(-1).body, /write permission/);

  const allowed = setup({ permission: 'write' });
  await handleGuardianCommand({
    api: allowed.api,
    event: event({ body: '/guardian recheck' }),
    config: baseConfig(),
    now: NOW,
    evaluate: allowed.evaluate,
    persist: allowed.persist,
  });
  assert.equal(allowed.calls.evaluate.length, 1);
  assert.equal(allowed.calls.persist.length, 1);
  assert.match(allowed.api.state.comments.at(-1).body, /re-evaluated/);
});

test('required check failures cannot be dismissed by a maintainer', async () => {
  const state = setup({permission:'maintain'});
  await handleGuardianCommand({api:state.api,event:event({body:'/guardian dismiss checks.failed.github-actions-test flaky runner'}),config:baseConfig(),now:NOW,evaluate:state.evaluate,persist:state.persist});
  assert.equal(state.calls.persist.length,0);
  assert.match(state.api.state.comments.at(-1).body,/cannot be dismissed/);
});

test('policy, unknown-data, and informational findings cannot be dismissed', async () => {
  for (const [finding, pattern] of [
    [{ id: 'policy.no-issue-reference', severity: SEVERITIES.BLOCKER, title: 'No issue', detail: '' }, /Policy findings cannot be dismissed/],
    [{ id: 'checks.api-unavailable', severity: SEVERITIES.BLOCKER, title: 'No data', detail: '' }, /cannot be dismissed/],
    [{ id: 'checks.passed', severity: SEVERITIES.INFO, title: 'Passed', detail: '' }, /informational/],
  ]) {
    const state = setup({ permission: 'write' });
    const custom = structuredClone(snapshot);
    custom.outcome.findings = [finding];
    custom.outcome.state = STATES.CHECKS_FAILED;
    await handleGuardianCommand({
      api: state.api,
      event: event({ body: `/guardian dismiss ${finding.id} because` }),
      config: baseConfig(),
      now: NOW,
      evaluate: async () => custom,
      persist: state.persist,
    });
    assert.equal(state.calls.persist.length, 0, finding.id);
    assert.match(state.api.state.comments.at(-1).body, pattern, finding.id);
  }
});

test('dismissing an absent finding lists what can be dismissed and writes nothing', async () => {
  const state = setup({ permission: 'write' });
  await handleGuardianCommand({
    api: state.api,
    event: event({ body: '/guardian dismiss checks.failed.not-present because' }),
    config: baseConfig(),
    now: NOW,
    evaluate: state.evaluate,
    persist: state.persist,
  });
  assert.equal(state.calls.persist.length, 0);
  assert.match(state.api.state.comments.at(-1).body, /not present/);
  assert.doesNotMatch(state.api.state.comments.at(-1).body, /checks\.failed\.github-actions-test/);
});

test('dismiss requires write permission and a reason', async () => {
  const denied = setup({ permission: 'read' });
  await handleGuardianCommand({
    api: denied.api,
    event: event({ body: '/guardian dismiss checks.failed.github-actions-test because' }),
    config: baseConfig(),
    now: NOW,
    evaluate: denied.evaluate,
    persist: denied.persist,
  });
  assert.equal(denied.calls.persist.length, 0);
  assert.match(denied.api.state.comments.at(-1).body, /write permission/);

  const usage = setup({ permission: 'write' });
  await handleGuardianCommand({
    api: usage.api,
    event: event({ body: '/guardian dismiss checks.failed.github-actions-test' }),
    config: baseConfig(),
    now: NOW,
    evaluate: usage.evaluate,
    persist: usage.persist,
  });
  assert.equal(usage.calls.persist.length, 0);
});

test('/guardian merge is refused and never reaches persistence', async () => {
  const state = setup({ permission: 'admin' });
  await handleGuardianCommand({
    api: state.api,
    event: event({ body: '/guardian merge' }),
    config: baseConfig(),
    now: NOW,
    evaluate: state.evaluate,
    persist: state.persist,
  });
  assert.equal(state.calls.persist.length, 0);
  assert.match(state.api.state.comments.at(-1).body, /never merge/);
});

test('/guardian merge is refused even for a read-access commenter', async () => {
  const state = setup({ permission: 'read' });
  await handleGuardianCommand({
    api: state.api,
    event: event({ body: '/guardian merge' }),
    config: baseConfig(),
    now: NOW,
    evaluate: state.evaluate,
    persist: state.persist,
  });
  assert.equal(state.calls.persist.length, 0);
  assert.equal(state.calls.evaluate.length, 0);
  assert.match(state.api.state.comments.at(-1).body, /never merge/);
});

test('dry-run logs replies without writing comments', async () => {
  const state = setup();
  const logs = [];
  await handleGuardianCommand({
    api: state.api,
    event: event({ body: '/guardian help' }),
    config: baseConfig({ dryRun: true }),
    now: NOW,
    evaluate: state.evaluate,
    persist: state.persist,
    log: (message) => logs.push(message),
  });
  assert.equal(state.api.state.comments.length, 0);
  assert.match(logs.join('\n'), /dry-run reply/);
});

test('bot comments and non-pull-request issues are ignored', async () => {
  for (const args of [
    { event: event({ type: 'Bot' }) },
    { event: event({ pullRequest: false }) },
    { event: event({ body: 'commentary' }) },
  ]) {
    const state = setup();
    const result = await handleGuardianCommand({
      api: state.api,
      event: args.event,
      config: baseConfig(),
      now: NOW,
      evaluate: state.evaluate,
      persist: state.persist,
    });
    assert.equal(result.action, 'ignored');
    assert.equal(state.api.state.comments.length, 0);
  }
});

test('permission lookup failures do not write a dismissal', async () => {
  const state = setup({ permission: 'write' });
  state.api.getCollaboratorPermission = async () => {
    throw Object.assign(new Error('Resource not accessible by integration'), { status: 403 });
  };
  await handleGuardianCommand({
    api: state.api,
    event: event({ body: '/guardian dismiss checks.failed.github-actions-test because' }),
    config: baseConfig(),
    now: NOW,
    evaluate: state.evaluate,
    persist: state.persist,
  });
  assert.equal(state.calls.persist.length, 0);
  assert.match(state.api.state.comments.at(-1).body, /could not verify/);
});

test('summary metadata in a command reply is not interpreted as a summary', () => {
  const metadata = encodeStateMetadata({ state: STATES.AWAITING_HUMAN_REVIEW, headSha: pull.head.sha });
  assert.equal(parseStateMetadata(`<!-- codovyn-guardian-command -->\n${metadata}`), null);
});
