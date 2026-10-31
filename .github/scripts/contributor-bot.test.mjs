import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, handle } from './contributor-bot.mjs';

function setup(body, options = {}) {
  const issue = {
    number: 2, title: 'Backend: assign endpoint fails validation', state: 'open',
    assignees: [], labels: [], ...options.issue,
  };
  const event = {
    issue, comment: { body, user: { login: 'alice', type: 'User', id: 1 }, ...options.comment },
  };
  const replies = [];
  const calls = [];
  const api = {
    issue: async () => issue,
    comments: async () => options.comments ?? [],
    assignedOpenIssues: async () => options.active ?? [],
    comment: async (_number, text) => { replies.push(text); },
    assign: async (_number, login) => { calls.push(['assign', login]); issue.assignees.push({ login }); },
    unassign: async (_number, login) => { calls.push(['unassign', login]); issue.assignees = issue.assignees.filter((user) => user.login !== login); },
  };
  return { event, api, issue, replies, calls };
}

const PRANITA_COMMENT = 'Hi, I’d like to work on this for my college project. I’ll fix it with tests and open a PR soon. Could you assign it to me?\n';

const INTEREST_VARIATIONS = [
  "I'd like to work on this",
  'I’d like to work on this issue.',
  'I would like to work on this issue.',
  'Can you assign it to me?',
  'Could you please assign this issue to me?',
  'Can I work on this?',
  'May I take this issue?',
  'I want to work on this issue.',
  'I am interested in working on this issue.',
  "I'd like to take this issue.",
  'Could I be assigned to this issue?',
  'Please assign me to this issue.',
  'Assign it to me please.',
  'I am a beginner and would like to work on this issue.',
  "I'd like this issue assigned to me.",
];

test('welcomes interest once per contributor', async () => {
  const state = setup("I'd like to work on this");
  await handle(state.event, state.api);
  assert.match(state.replies[0], /Comment `\/assign`/);
  assert.match(state.replies[0], /CONTRIBUTING\.md/);
  const again = setup('Can I take this issue?', { comments: [{ body: state.replies[0], user: { type: 'Bot' } }] });
  await handle(again.event, again.api);
  assert.equal(again.replies.length, 0);
  const forged = setup('Can I take this issue?', { comments: [{ body: state.replies[0], user: { type: 'User' } }] });
  await handle(forged.event, forged.api);
  assert.equal(forged.replies.length, 1);
  const namedBot = setup(PRANITA_COMMENT, { comments: [{ body: state.replies[0], user: { login: 'github-actions[bot]' } }] });
  await handle(namedBot.event, namedBot.api);
  assert.equal(namedBot.replies.length, 0);
});

test('recognizes Pranita’s exact issue #4 comment without assigning', async () => {
  assert.equal(classify(PRANITA_COMMENT), 'interest');
  const state = setup(PRANITA_COMMENT, { comment: { user: { login: 'Pranita1846', type: 'User', id: 4 } } });
  await handle(state.event, state.api);
  assert.deepEqual(state.calls, []);
  assert.match(state.replies[0], /@Pranita1846/);
  assert.match(state.replies[0], /`\/assign`/);
  assert.match(state.replies[0], /CONTRIBUTING\.md/);
});

test('recognizes common natural-language interest variations without assigning', async () => {
  for (const body of INTEREST_VARIATIONS) {
    assert.equal(classify(body), 'interest', body);
    const state = setup(body);
    await handle(state.event, state.api);
    assert.deepEqual(state.calls, [], body);
    assert.match(state.replies[0], /`\/assign`/, body);
  }
});

test('keeps automatic assignment restricted to explicit commands', async () => {
  for (const body of [PRANITA_COMMENT, ...INTEREST_VARIATIONS]) {
    assert.notEqual(classify(body), 'assign', body);
    const state = setup(body);
    await handle(state.event, state.api);
    assert.deepEqual(state.calls, [], body);
  }
  for (const body of ['/assign', '/unassign']) {
    assert.notEqual(classify(body), 'interest', body);
  }
});

test('assigns an unassigned issue and confirms', async () => {
  const state = setup('/assign');
  await handle(state.event, state.api);
  assert.deepEqual(state.calls, [['assign', 'alice']]);
  assert.match(state.replies[0], /assigned/);
});

test('does not add a second assignee, including issue #2 shape', async () => {
  const state = setup('/assign', { issue: { assignees: [{ login: 'AryanGupta833' }] } });
  await handle(state.event, state.api);
  assert.deepEqual(state.calls, []);
  assert.match(state.replies[0], /@AryanGupta833/);
  assert.match(state.replies[0], /good first issues/);
});

test('repeated assign is idempotent', async () => {
  const state = setup('/assign', { issue: { assignees: [{ login: 'alice' }] } });
  await handle(state.event, state.api);
  assert.deepEqual(state.calls, []);
  assert.match(state.replies[0], /already assigned/);
});

test('assigned user can unassign', async () => {
  const state = setup('/unassign', { issue: { assignees: [{ login: 'alice' }] } });
  await handle(state.event, state.api);
  assert.deepEqual(state.calls, [['unassign', 'alice']]);
  assert.match(state.replies[0], /unassigned/);
});

test('other users cannot unassign', async () => {
  const state = setup('/unassign', { issue: { assignees: [{ login: 'bob' }] } });
  await handle(state.event, state.api);
  assert.deepEqual(state.calls, []);
  assert.deepEqual(state.replies, []);
});

test('two open issue assignments are the limit', async () => {
  const state = setup('/assign', { active: [{ number: 3 }, { number: 4 }] });
  await handle(state.event, state.api);
  assert.deepEqual(state.calls, []);
  assert.match(state.replies[0], /2 open issues/);
});

test('closed issues, PR comments and bot comments are ignored', async () => {
  for (const options of [
    { issue: { state: 'closed' } },
    { issue: { pull_request: { url: 'https://example.test/pr' } } },
    { comment: { user: { login: 'github-actions[bot]', type: 'Bot' } } },
    { comment: { user: { login: 'github-actions[bot]' } } },
  ]) {
    const state = setup('/assign', options);
    await handle(state.event, state.api);
    assert.deepEqual(state.calls, []);
    assert.deepEqual(state.replies, []);
  }
});

test('security-labeled issues need a maintainer', async () => {
  const state = setup('/assign', { issue: { labels: [{ name: 'security' }] } });
  await handle(state.event, state.api);
  assert.deepEqual(state.calls, []);
  assert.match(state.replies[0], /maintainer/);
});

test('rejects invalid and malicious comment content', async () => {
  for (const body of ['/assign; rm -rf .', '/assign\n/unassign', 'please assign this to me ${github.token}', 'assign', '/assign @bob']) {
    assert.equal(classify(body), null);
    const state = setup(body);
    await handle(state.event, state.api);
    assert.deepEqual(state.calls, []);
    assert.deepEqual(state.replies, []);
  }
});

test('competing attempts under the issue concurrency lock never add a second assignee', async () => {
  const state = setup('/assign');
  let prior = Promise.resolve();
  const locked = (event) => {
    const task = prior.then(() => handle(event, state.api));
    prior = task;
    return task;
  };
  const bob = structuredClone(state.event);
  bob.comment.user = { login: 'bob', type: 'User', id: 2 };
  await Promise.all([locked(state.event), locked(bob)]);
  assert.deepEqual(state.calls, [['assign', 'alice']]);
  assert.match(state.replies[1], /@alice/);
});

test('a maintainer assignment appearing during API assignment is preserved', async () => {
  const state = setup('/assign');
  state.api.assign = async (_number, login) => {
    state.issue.assignees.push({ login: 'maintainer' }, { login });
  };
  await handle(state.event, state.api);
  assert.deepEqual(state.issue.assignees, [{ login: 'maintainer' }]);
  assert.deepEqual(state.calls, [['unassign', 'alice']]);
});

test('GitHub assignment refusal directs the user to a maintainer', async () => {
  const state = setup('/assign');
  state.api.assign = async () => { throw Object.assign(new Error('not assignable'), { status: 422 }); };
  await handle(state.event, state.api);
  assert.match(state.replies[0], /maintainer/);
});

test('bot does not react recursively to its own welcome', async () => {
  const state = setup("I'd like to contribute");
  await handle(state.event, state.api);
  state.event.comment = { body: state.replies[0], user: { login: 'github-actions[bot]', type: 'Bot' } };
  await handle(state.event, state.api);
  assert.equal(state.replies.length, 1);
});

const ISSUE_34_COMMENT = '/assign\n\nI would like to document the existing TaskStore deletion and pruning behavior in the development guide, including a preview-first CLI example, open-draft and ownership restrictions, campaign-accounting retention, and the distinction between logical deletion and secure erasure. I am using Codex to help prepare the documentation and will verify it against the source and existing tests.';

test('issue #34 exact multiline comment claims only through normal assignment checks', async () => {
  assert.equal(classify(ISSUE_34_COMMENT), 'assign');
  const state = setup(ISSUE_34_COMMENT);
  await handle(state.event, state.api);
  assert.deepEqual(state.calls, [['assign', 'alice']]);
  assert.equal(state.replies.length, 1);
});

test('first-line commands accept ordinary explanatory prose and CRLF', async () => {
  assert.equal(classify('/ASSIGN\r\n\r\nI will update the guide and verify the examples.'), 'assign');
  const state = setup('/unassign\n\nI need to release this task due to other commitments.', { issue: { assignees: [{ login: 'alice' }] } });
  await handle(state.event, state.api);
  assert.deepEqual(state.calls, [['unassign', 'alice']]);
});

test('multiline commands reject extra commands, arguments, hidden controls and executable syntax', async () => {
  for (const body of [
    '/assign @bob\nI would like to work on this.',
    '/assign --force\nPlease assign this to me.',
    '/assign\n/unassign', '/unassign\n/assign', '/assign\n/assign',
    '/assign\nI will also use /unassign later.', '/assign\n/guardian recheck',
    '/assign\n@bob', '/assign\n--force', '/assign\n$(touch witness)',
    '/assign\n${github.token}', '/assign\n`touch witness`',
    '/assign\n<script>alert(1)</script>', '/assign\nokay && touch witness',
    '/assign\nokay || touch witness', '/assign\nokay ; touch witness',
    '/assign\nokay\u0000', '/assign\n\u202Ehidden',
    '/assign; touch witness', 'I would like to work on this.\n/assign',
  ]) {
    assert.equal(classify(body), null, body);
    const state = setup(body);
    await handle(state.event, state.api);
    assert.deepEqual(state.calls, [], body);
    assert.deepEqual(state.replies, [], body);
  }
  for (const body of [null, {}, 1, '/assign\n' + 'x'.repeat(65_536)]) assert.equal(classify(body), null);
});

test('issue #34 syntax cannot bypass limits, sensitive issues or existing assignment', async () => {
  for (const options of [
    { active: [{ number: 1 }, { number: 2 }] },
    { issue: { labels: [{ name: 'security' }] } },
    { issue: { labels: [{ name: 'no-auto-assign' }] } },
    { issue: { title: 'Protect credential storage' } },
    { issue: { assignees: [{ login: 'bob' }] } },
  ]) {
    const state = setup(ISSUE_34_COMMENT, options);
    await handle(state.event, state.api);
    assert.deepEqual(state.calls, []);
  }
});

test('replaying the exact issue #34 command does not duplicate writes', async () => {
  const state = setup(ISSUE_34_COMMENT, { comment: { id: 6538501331 } });
  const comments = [];
  state.api.comments = async () => comments;
  state.api.comment = async (_number, body) => comments.push({ body, user: { login: 'github-actions[bot]', type: 'Bot' } });
  await handle(state.event, state.api);
  await handle(state.event, state.api);
  assert.deepEqual(state.calls, [['assign', 'alice']]);
  assert.equal(comments.length, 1);
});
