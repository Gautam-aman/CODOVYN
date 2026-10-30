import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMMENT_MARKER, RESOLUTION_MARKER, LABELS, extractIssueNumbers, handleIssueEvent, handlePullEvent, revalidateIssue, validatePull } from './pr-assignment-bot.mjs';

function fixture(overrides = {}, apiOptions = {}) {
  const pull = {
    number: 90, state: 'open', draft: false, body: 'Closes #42',
    user: { login: 'alice', type: 'User' }, author_association: 'CONTRIBUTOR',
    base: { repo: { full_name: 'Gautam-aman/CODOVYN' } }, labels: [], ...overrides,
  };
  const issues = new Map([[42, { number: 42, repository: { full_name: 'Gautam-aman/CODOVYN' }, assignees: [] }], [43, { number: 43, repository: { full_name: 'Gautam-aman/CODOVYN' }, assignees: [] }], [999, { number: 999, repository: { full_name: 'Other/repo' }, assignees: [] }]]);
  const comments = [];
  const calls = [];
  let nextId = 1;
  const api = {
    issue: async (number) => {
      calls.push(['issue', number]);
      if (!issues.has(number)) throw Object.assign(new Error('Not Found'), { status: 404 });
      return issues.get(number);
    },
    comments: async () => comments,
    comment: async (number, body) => { const item = { id: nextId++, user: { login: 'github-actions[bot]', type: 'Bot' }, body }; comments.push(item); calls.push(['comment', number, body]); return item; },
    updateComment: async (_number, id, body) => { const item = comments.find((comment) => comment.id === id); item.body = body; calls.push(['update', id, body]); },
    ensureLabel: async (label) => calls.push(['ensure', label]),
    addLabel: async (number, label) => { calls.push(['add', number, label]); pull.labels.push({ name: label }); },
    removeLabel: async (number, label) => { calls.push(['remove', number, label]); pull.labels = pull.labels.filter((item) => item.name !== label); },
    searchPulls: async () => [{ number: pull.number }],
    pull: async () => pull,
    permission: async () => ({ permission: 'write' }),
    exceptionAuthorized: async () => apiOptions.exceptionAuthorized ?? false,
  };
  return { pull, issues, comments, calls, api };
}

const opts = { repository: 'Gautam-aman/CODOVYN' };

test('extracts intentional same-repository issue references, excluding code and external refs', () => {
  assert.deepEqual(extractIssueNumbers('Closes #42; Fixes #43; Related issue: #42; Issue #44\n`Closes #45`\n```md\nFixes #46\n```\nFixes other/repo#47'), [42, 43, 44]);
  assert.deepEqual(extractIssueNumbers('PR #19 updates docs; see #20'), []);
});

test('assigned author is compliant without a new comment', async () => {
  const f = fixture();
  f.issues.get(42).assignees = [{ login: 'ALICE' }];
  const result = await validatePull(f.pull, f.api, opts);
  assert.equal(result.state, 'ok');
  assert.equal(f.comments.length, 0);
  const resolved = fixture();
  resolved.comments.push({ id: 12, user: { login: 'github-actions[bot]', type: 'Bot' }, body: `${COMMENT_MARKER}\nOld reminder` });
  resolved.issues.get(42).assignees = [{ login: 'alice' }];
  await validatePull(resolved.pull, resolved.api, opts);
  assert.match(resolved.comments[0].body, /Assignment verified/);
  const fresh = fixture({ labels: [{ name: LABELS.ok }] });
  fresh.issues.get(42).assignees = [{ login: 'alice' }];
  await validatePull(fresh.pull, fresh.api, opts);
  assert.equal(fresh.comments.length, 0);
});

test('unassigned author receives one reminder and repeated runs do not duplicate it', async () => {
  const f = fixture();
  const result = await validatePull(f.pull, f.api, opts);
  assert.equal(result.state, 'warning');
  assert.match(f.comments[0].body, /comment `\/assign`/);
  await validatePull(f.pull, f.api, opts);
  assert.equal(f.comments.length, 1);
});

test('assignment to another contributor produces a coordination warning', async () => {
  const f = fixture();
  f.issues.get(42).assignees = [{ login: 'bob' }];
  await validatePull(f.pull, f.api, opts);
  assert.equal((await validatePull(f.pull, f.api, opts)).state, 'coordination');
  assert.match(f.comments[0].body, /assigned to @bob/);
});

test('no linked issue asks for a reference; maintainer exception label is accepted', async () => {
  const f = fixture({ body: 'A small docs cleanup.', labels: [] });
  assert.equal((await validatePull(f.pull, f.api, opts)).state, 'missing');
  assert.match(f.comments[0].body, /Closes #123/);
  const exception = fixture({ body: 'A small docs cleanup.', labels: [{ name: LABELS.exception }] }, { exceptionAuthorized: true });
  assert.equal((await validatePull(exception.pull, exception.api, opts)).state, 'exception');
  assert.equal(exception.comments.length, 0);
});

test('multiple issues report individual assignment state', async () => {
  const f = fixture({ body: 'Closes #42 and Fixes #43' });
  f.issues.get(42).assignees = [{ login: 'alice' }];
  f.issues.get(43).assignees = [{ login: 'bob' }];
  const result = await validatePull(f.pull, f.api, opts);
  assert.equal(result.state, 'coordination');
  assert.match(f.comments[0].body, /Issue #43 is assigned to @bob/);
  assert.equal(f.comments[0].body.includes('#42'), false);
});

test('editing to a different issue updates the existing validation comment', async () => {
  const f = fixture();
  await validatePull(f.pull, f.api, opts);
  f.pull.body = 'Closes #43';
  f.issues.get(43).assignees = [{ login: 'alice' }];
  const result = await validatePull(f.pull, f.api, opts);
  assert.equal(result.state, 'ok');
  assert.equal(f.comments.length, 1);
  assert.match(f.comments[0].body, /issue #43/);
  assert.equal(f.calls.filter(([method]) => method === 'update').length, 1);
});

test('assignment claimed after opening resolves warning and losing assignment restores it', async () => {
  const f = fixture();
  await validatePull(f.pull, f.api, opts);
  f.issues.get(42).assignees = [{ login: 'alice' }];
  await revalidateIssue(42, f.api, opts);
  assert.match(f.comments[0].body, /Assignment verified/);
  assert.equal(f.pull.labels.some((label) => label.name === LABELS.awaiting), false);
  f.issues.get(42).assignees = [];
  await revalidateIssue(42, f.api, opts);
  assert.match(f.comments[0].body, /not assigned to you/);
  assert.equal(f.comments.length, 1);
});

test('already compliant PR with no prior warning is silent', async () => {
  const f = fixture();
  f.issues.get(42).assignees = [{ login: 'alice' }];
  await validatePull(f.pull, f.api, opts);
  assert.equal(f.comments.length, 0);
});

test('maintainers bypass assignment policy and no-issue label is maintainer controlled', async () => {
  const f = fixture({ author_association: 'MEMBER' });
  assert.equal((await validatePull(f.pull, f.api, opts)).state, 'bypass');
  assert.equal(f.comments.length, 0);
  const authorLabel = fixture({ body: 'No issue needed because I say so.' });
  assert.equal((await validatePull(authorLabel.pull, authorLabel.api, opts)).state, 'missing');
});

test('cross-repository issue references fail safely without claiming success', async () => {
  const f = fixture({ body: 'Closes #999' });
  const result = await validatePull(f.pull, f.api, opts);
  assert.equal(result.state, 'warning');
  assert.match(f.comments[0].body, /could not be verified/);
});

test('API failure propagates before comment or success label is changed', async () => {
  const f = fixture();
  f.api.issue = async () => { throw new Error('rate limited'); };
  await assert.rejects(validatePull(f.pull, f.api, opts), /rate limited/);
  assert.equal(f.comments.length, 0);
  assert.equal(f.calls.some(([method]) => method === 'add'), false);
});

test('bot-authored PR is ignored and untrusted or cross-repository PR identity rejected', async () => {
  const bot = fixture({ user: { login: 'renovate[bot]', type: 'Bot' } });
  assert.equal((await validatePull(bot.pull, bot.api, opts)).state, 'skipped');
  const cross = fixture({ base: { repo: { full_name: 'attacker/fork' } } });
  await assert.rejects(validatePull(cross.pull, cross.api, opts), /Invalid pull request/);
});

test('existing marker comments are recognized only when authored by a bot', async () => {
  const f = fixture();
  f.comments.push({ id: 9, user: { login: 'alice', type: 'User' }, body: `${COMMENT_MARKER}\nforged` });
  await validatePull(f.pull, f.api, opts);
  assert.equal(f.comments.length, 2);
});

test('comments from unrelated bots cannot satisfy this bot marker', async () => {
  const f = fixture();
  f.comments.push({ id: 8, user: { login: 'other-helper[bot]', type: 'Bot' }, body: `${COMMENT_MARKER}\nnot ours` });
  await validatePull(f.pull, f.api, opts);
  assert.equal(f.comments.length, 2);
  assert.equal(f.comments[1].user.login, 'github-actions[bot]');
});

test('resolution state uses an explicit marker, not the word verified in warning text', async () => {
  const f = fixture({ author_association: 'MEMBER' });
  f.comments.push({
    id: 7,
    user: { login: 'github-actions[bot]', type: 'Bot' },
    body: `${COMMENT_MARKER}\nIssue #42 could not be verified in this repository.`,
  });
  await validatePull(f.pull, f.api, opts);
  assert.ok(f.comments[0].body.includes(RESOLUTION_MARKER));
  assert.match(f.comments[0].body, /reminder is no longer needed/);
  const updateCount = f.calls.filter(([method]) => method === 'update').length;
  await validatePull(f.pull, f.api, opts);
  assert.equal(f.calls.filter(([method]) => method === 'update').length, updateCount);
});

test('assignment and unassignment events update an existing draft PR advisory', async () => {
  const f = fixture({ draft: true });
  await validatePull(f.pull, f.api, { ...opts, allowDraft: true });
  assert.match(f.comments[0].body, /not assigned to you/);

  f.issues.get(42).assignees = [{ login: 'alice' }];
  const assigned = await handleIssueEvent({
    action: 'assigned', issue: { number: 42 },
  }, f.api, opts);
  assert.equal(assigned[0].state, 'ok');
  assert.ok(f.comments[0].body.includes(RESOLUTION_MARKER));

  f.issues.get(42).assignees = [];
  const unassigned = await handleIssueEvent({
    action: 'unassigned', issue: { number: 42 },
  }, f.api, opts);
  assert.equal(unassigned[0].state, 'warning');
  assert.match(f.comments[0].body, /not assigned to you/);
  assert.equal(f.comments.length, 1);
});

test('assignment events do not create reminders on drafts without an existing advisory', async () => {
  const f = fixture({ draft: true });
  const outcome = await handleIssueEvent({
    action: 'assigned', issue: { number: 42 },
  }, f.api, opts);
  assert.equal(outcome[0].state, 'skipped');
  assert.equal(f.comments.length, 0);
});

test('only an authorized repository collaborator can approve the exception label', async () => {
  const f = fixture({ body: 'Docs only.' });
  f.api.permission = async () => ({ permission: 'read' });
  const result = await handleIssueEvent({
    action: 'labeled', issue: { number: f.pull.number, pull_request: {} },
    label: { name: LABELS.exception }, sender: { login: 'contributor' },
  }, f.api, opts);
  assert.equal(result.state, 'ignored');
  assert.equal(f.comments.length, 0);
});

test('label event from authorized maintainer revalidates the PR exception', async () => {
  const f = fixture({ body: 'Docs only.', author_association: 'CONTRIBUTOR', labels: [{ name: LABELS.exception }] }, { exceptionAuthorized: true });
  const result = await handleIssueEvent({
    action: 'labeled', issue: { number: f.pull.number, pull_request: {} },
    label: { name: LABELS.exception }, sender: { login: 'maintainer' },
  }, f.api, opts);
  assert.equal(result.state, 'exception');
});

test('PR events preserve maintainer-approved exceptions and ignore unauthorized label additions', async () => {
  const f = fixture({ body: 'Docs only.', labels: [{ name: LABELS.exception }] }, { exceptionAuthorized: true });
  const approved = await handlePullEvent({
    action: 'synchronize', pull_request: { number: f.pull.number },
  }, f.api, opts);
  assert.equal(approved.state, 'exception');
  assert.equal(f.comments.length, 0);

  const unauthorized = fixture({ body: 'Docs only.', labels: [{ name: LABELS.exception }] }, { exceptionAuthorized: false });
  const result = await handlePullEvent({
    action: 'labeled', pull_request: { number: unauthorized.pull.number },
    label: { name: LABELS.exception }, sender: { login: 'contributor' },
  }, unauthorized.api, opts);
  assert.equal(result.state, 'missing');
  assert.match(unauthorized.comments[0].body, /Closes #123/);
});

test('unauthorized exception label stays unauthorized after synchronize, edited, and reopened', async () => {
  const f = fixture({ body: 'Docs only.', labels: [{ name: LABELS.exception }] }, { exceptionAuthorized: false });
  for (const action of ['labeled', 'synchronize', 'edited', 'reopened']) {
    const result = await handlePullEvent({
      action, pull_request: { number: f.pull.number },
      ...(action === 'labeled' ? { label: { name: LABELS.exception }, sender: { login: 'untrusted' } } : {}),
    }, f.api, opts);
    assert.equal(result.state, 'missing', action);
  }
  assert.equal(f.comments.length, 1);
  assert.match(f.comments[0].body, /Closes #123/);
});

test('newly opened draft PR gets an advisory; later draft sync is skipped until ready', async () => {
  const f = fixture({ draft: true });
  const opened = await handlePullEvent({ action: 'opened', pull_request: { number: f.pull.number } }, f.api, opts);
  assert.equal(opened.state, 'warning');
  assert.equal(f.comments.length, 1);
  const sync = await handlePullEvent({ action: 'synchronize', pull_request: { number: f.pull.number } }, f.api, opts);
  assert.equal(sync.state, 'skipped');
  f.pull.draft = false;
  const ready = await handlePullEvent({ action: 'ready_for_review', pull_request: { number: f.pull.number } }, f.api, opts);
  assert.equal(ready.state, 'warning');
  assert.equal(f.comments.length, 1);
});
