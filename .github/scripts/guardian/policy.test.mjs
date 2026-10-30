import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluatePolicy } from './policy.mjs';
import {
  createApi,
  labelEvent,
  makeIssue,
  makePull,
  REPOSITORY,
} from './test-helpers.mjs';

async function run({ pull, issues, permissions, labelEvents }) {
  const api = createApi({ pull, issues, permissions, labelEvents });
  return evaluatePolicy({ api, pull: api.state.pull, repository: REPOSITORY });
}

test('assigned author is compliant and records the verification', async () => {
  const result = await run({
    pull: makePull(),
    issues: new Map([[42, makeIssue(42, { assignees: [{ login: 'alice' }] })]]),
  });
  assert.equal(result.status, 'compliant');
  assert.equal(result.issues[0].assigned, true);
  assert.ok(result.findings.some((item) => item.id === 'policy.assignment-verified'));
});

test('unassigned issue blocks readiness', async () => {
  const result = await run({ pull: makePull(), issues: new Map([[42, makeIssue(42)]]) });
  assert.equal(result.status, 'blocked');
  assert.ok(result.findings.some((item) => item.id === 'policy.issue-42-unassigned'));
});

test('issue assigned to another contributor is a blocker, not a silent pass', async () => {
  const result = await run({
    pull: makePull(),
    issues: new Map([[42, makeIssue(42, { assignees: [{ login: 'bob' }] })]]),
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.findings.some((item) => item.id === 'policy.issue-42-assigned-elsewhere'));
});

test('multiple linked issues require every issue to be assigned', async () => {
  const result = await run({
    pull: makePull({ body: 'Closes #42 and Fixes #43' }),
    issues: new Map([
      [42, makeIssue(42, { assignees: [{ login: 'alice' }] })],
      [43, makeIssue(43)],
    ]),
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.findings.some((item) => item.id === 'policy.issue-43-unassigned'));
});

test('a missing issue reference blocks with actionable text', async () => {
  const result = await run({ pull: makePull({ body: 'Docs cleanup.' }) });
  assert.equal(result.status, 'blocked');
  assert.equal(result.findings[0].id, 'policy.no-issue-reference');
  assert.match(result.findings[0].detail, /Closes #123/);
});

test('a 404 issue reference is unverified, not successful', async () => {
  const result = await run({
    pull: makePull({ body: 'Closes #404' }),
    issues: new Map(),
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.findings.some((item) => item.id === 'policy.issue-404-unverified'));
});

test('a 403 on linked issue data produces unknown, never a pass', async () => {
  const result = await run({
    pull: makePull(),
    issues: new Map([[42, { error: { status: 403, message: 'Resource not accessible by integration' } }]]),
  });
  assert.equal(result.status, 'unknown');
  assert.ok(result.findings.some((item) => item.id === 'policy.api-unavailable'));
});

test('a maintainer-applied exception label is accepted only with write permission', async () => {
  const approved = await run({
    pull: makePull({ body: 'Docs cleanup.', labels: [{ name: 'no-issue-required' }] }),
    labelEvents: [labelEvent('labeled', 'maintainer')],
    permissions: { maintainer: { permission: 'write' } },
  });
  assert.equal(approved.status, 'compliant');
  assert.equal(approved.exception, true);
  assert.ok(approved.findings.some((item) => item.id === 'policy.exception-approved'));

  const denied = await run({
    pull: makePull({ body: 'Docs cleanup.', labels: [{ name: 'no-issue-required' }] }),
    labelEvents: [labelEvent('labeled', 'contributor')],
    permissions: { contributor: { permission: 'read' } },
  });
  assert.equal(denied.status, 'blocked');
  assert.ok(denied.findings.some((item) => item.id === 'policy.exception-unauthorized'));
});

test('a later unlabel event revokes an earlier exception', async () => {
  const result = await run({
    pull: makePull({ body: 'Docs cleanup.', labels: [{ name: 'no-issue-required' }] }),
    labelEvents: [
      labelEvent('labeled', 'maintainer', 'no-issue-required', '2026-10-21T10:00:00Z'),
      labelEvent('unlabeled', 'maintainer', 'no-issue-required', '2026-10-21T11:00:00Z'),
    ],
    permissions: { maintainer: { permission: 'write' } },
  });
  assert.equal(result.status, 'blocked');
});

test('the exception label cannot be authorized by a bot or a forged label', async () => {
  const bot = await run({
    pull: makePull({ body: 'Docs cleanup.', labels: [{ name: 'no-issue-required' }] }),
    labelEvents: [labelEvent('labeled', 'helper[bot]')],
    permissions: { 'helper[bot]': { permission: 'write' } },
  });
  assert.equal(bot.status, 'blocked');
});

test('a label with no readable event history is not trusted', async () => {
  const result = await run({
    pull: makePull({ body: 'Docs cleanup.', labels: [{ name: 'no-issue-required' }] }),
    labelEvents: [],
    permissions: { maintainer: { permission: 'write' } },
  });
  assert.equal(result.status, 'blocked');
});

test('maintainers and trusted automation bypass the assignment policy', async () => {
  const maintainer = await run({
    pull: makePull({ body: 'No issue needed.', author_association: 'MEMBER' }),
    permissions: { alice: { permission: 'write' } },
  });
  assert.equal(maintainer.status, 'compliant');
  assert.ok(maintainer.findings.some((item) => item.id === 'policy.maintainer-bypass'));

  const api = createApi({ pull: makePull({ user: { login: 'renovate[bot]', type: 'Bot' } }) });
  const bot = await evaluatePolicy({ api, pull: api.state.pull, repository: REPOSITORY, trustedAutomation: true });
  assert.equal(bot.status, 'compliant');
  assert.ok(bot.findings.some((item) => item.id === 'policy.trusted-automation'));
});

test('security-sensitive issues are flagged but still require an assignment', async () => {
  const unassigned = await run({
    pull: makePull(),
    issues: new Map([[42, makeIssue(42, { labels: [{ name: 'security' }], title: 'CVE-2026-0001 in transport' })]]),
  });
  assert.equal(unassigned.status, 'blocked');
  assert.ok(unassigned.findings.some((item) => item.id === 'policy.issue-42-security-sensitive'));
  assert.ok(unassigned.findings.some((item) => item.id === 'policy.issue-42-unassigned'));

  const assigned = await run({
    pull: makePull(),
    issues: new Map([[42, makeIssue(42, { labels: [{ name: 'security' }], assignees: [{ login: 'alice' }] })]]),
  });
  assert.equal(assigned.status, 'compliant');
  assert.ok(assigned.findings.some((item) => item.id === 'policy.issue-42-security-sensitive'));
});

test('external owner/repo references and quoted examples do not satisfy policy', async () => {
  for (const body of [
    'Fixes other/repo#42',
    '`Closes #42`',
    '```md\nCloses #42\n```',
    'See PR #19 and issue text #42',
  ]) {
    const result = await run({ pull: makePull({ body }) });
    assert.equal(result.status, 'blocked', body);
  }
});

test('a reference to a pull request is not a valid issue', async () => {
  const result = await run({
    pull: makePull(),
    issues: new Map([[42, makeIssue(42, { pull_request: { url: 'https://example.test' } })]]),
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.findings.some((item) => item.id === 'policy.issue-42-unverified'));
});

test('a cross-repository issue object is rejected even if the number matches', async () => {
  const result = await run({
    pull: makePull(),
    issues: new Map([[42, makeIssue(42, { repository: { full_name: 'attacker/fork' }, assignees: [{ login: 'alice' }] })]]),
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.findings.some((item) => item.id === 'policy.issue-42-unverified'));
});
