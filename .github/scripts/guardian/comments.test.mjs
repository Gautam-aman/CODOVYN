import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  encodeStateMetadata,
  findGuardianSummary,
  parseStateMetadata,
  reconcileSummary,
  renderSummaryBody,
} from './comments.mjs';
import { STATES, SEVERITIES } from './constants.mjs';
import {
  BOT_LOGIN,
  createApi,
  makeComment,
  makePull,
} from './test-helpers.mjs';

const outcome = {
  state: STATES.AWAITING_HUMAN_REVIEW,
  stateDescription: 'Checks pass and no human reviewer has approved the current pull request.',
  findings: [
    { id: 'checks.passed', severity: SEVERITIES.INFO, title: 'Checks passed', detail: '2 check(s) completed successfully.' },
    { id: 'review.no-human-approval', severity: SEVERITIES.INFO, title: 'Waiting for human review', detail: 'No human reviewer has approved the current pull request.' },
  ],
  activeFindings: [],
  dismissedFindings: [],
  dismissals: {},
};

function body(overrides = {}) {
  return renderSummaryBody({
    pull: makePull(),
    outcome,
    policy: { status: 'compliant' },
    checks: { status: 'passed', total: 2, failing: [], pending: [] },
    reviews: { status: 'none', approvedBy: [], changesRequestedBy: [] },
    settings: {},
    ...overrides,
  });
}

test('state metadata round-trips and bounds untrusted dismissal fields', () => {
  const encoded = encodeStateMetadata({
    state: STATES.CHECKS_FAILED,
    headSha: 'a'.repeat(40),
    dismissals: {
      'checks.failed.test': {
        reason: 'Flaky infrastructure, tracked in issue #77.',
        by: 'maintainer',
        at: '2026-10-22T10:00:00Z',
        headSha: 'a'.repeat(40),
      },
    },
  });
  const parsed = parseStateMetadata(`<!-- codovyn-guardian-state:${encoded} -->`);
  assert.equal(parsed.state, STATES.CHECKS_FAILED);
  assert.equal(parsed.dismissals['checks.failed.test'].by, 'maintainer');
});

test('invalid or missing metadata is ignored rather than trusted', () => {
  assert.equal(parseStateMetadata('no metadata'), null);
  assert.equal(parseStateMetadata('<!-- codovyn-guardian-state:not-base64! -->'), null);
  assert.equal(parseStateMetadata(`<!-- codovyn-guardian-state:${Buffer.from('{"v":2}').toString('base64url')} -->`), null);
});

test('summary body is deterministic for identical inputs', () => {
  assert.equal(body(), body());
  assert.match(body(), /codovyn-guardian-summary/);
  assert.match(body(), /AWAITING.*HUMAN.*REVIEW/);
  assert.match(body(), /checks\.passed/);
  assert.match(body(), /never merges/);
});

test('untrusted check names and details are escaped in the summary', () => {
  const rendered = body({
    outcome: {
      ...outcome,
      findings: [
        {
          id: 'checks.failed.evil',
          severity: SEVERITIES.BLOCKER,
          title: '<script>alert(1)</script>',
          detail: '<img src=x onerror=alert(1)> | @everyone',
        },
      ],
      activeFindings: [],
    },
  });
  assert.equal(rendered.includes('<script>'), false);
  assert.equal(rendered.includes('<img'), false);
  assert.match(rendered, /&lt;script&gt;/);
});

test('one summary comment is created, then edited in place', async () => {
  const api = createApi({ comments: [] });
  const rendered = body();
  const first = await reconcileSummary({
    api,
    pullNumber: 90,
    body: rendered,
    comments: api.state.comments,
    botLogin: BOT_LOGIN,
  });
  assert.equal(first.action, 'created');
  assert.equal(api.state.comments.length, 1);

  const second = await reconcileSummary({
    api,
    pullNumber: 90,
    body: rendered,
    comments: api.state.comments,
    botLogin: BOT_LOGIN,
  });
  assert.equal(second.action, 'unchanged');
  assert.equal(api.state.comments.length, 1);
  assert.equal(api.calls.filter(([method]) => method === 'createPullComment').length, 1);

  const changed = body({
    outcome: { ...outcome, state: STATES.CHECKS_RUNNING },
  });
  const third = await reconcileSummary({
    api,
    pullNumber: 90,
    body: changed,
    comments: api.state.comments,
    botLogin: BOT_LOGIN,
  });
  assert.equal(third.action, 'updated');
  assert.equal(api.state.comments.length, 1);
  assert.match(api.state.comments[0].body, /CHECKS_RUNNING/);
});

test('duplicate Guardian summaries are superseded, not left ambiguous', async () => {
  const rendered = body();
  const comments = [
    makeComment({ id: 1, body: rendered }),
    makeComment({ id: 2, body: body() }),
  ];
  const api = createApi({ comments });
  const result = await reconcileSummary({
    api,
    pullNumber: 90,
    body: rendered,
    comments: api.state.comments,
    botLogin: BOT_LOGIN,
  });
  assert.equal(result.action, 'unchanged');
  assert.equal(api.state.comments.length, 2);
  assert.match(api.state.comments[1].body, /codovyn-guardian-summary:superseded/);
  assert.equal(findGuardianSummary(api.state.comments, BOT_LOGIN).duplicates.length, 0);
});

test('forged summary markers from users or other bots are ignored', async () => {
  const forged = [
    makeComment({ id: 1, login: 'alice', type: 'User', body: body() }),
    makeComment({ id: 2, login: 'other-helper[bot]', type: 'Bot', body: body() }),
  ];
  const api = createApi({ comments: forged });
  const result = await reconcileSummary({
    api,
    pullNumber: 90,
    body: body(),
    comments: api.state.comments,
    botLogin: BOT_LOGIN,
  });
  assert.equal(result.action, 'created');
  assert.equal(api.state.comments.length, 3);
  assert.notEqual(result.id, 1);
  assert.notEqual(result.id, 2);
});

test('dry-run reports the intended write without calling the API', async () => {
  const api = createApi({ comments: [] });
  const result = await reconcileSummary({
    api,
    pullNumber: 90,
    body: body(),
    comments: api.state.comments,
    dryRun: true,
    botLogin: BOT_LOGIN,
  });
  assert.equal(result.action, 'would-create');
  assert.equal(api.state.comments.length, 0);
  assert.equal(api.calls.filter(([method]) => method.startsWith('create') || method.startsWith('update')).length, 0);
});
