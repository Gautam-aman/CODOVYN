import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/index.js';

test('CLI lists issues and PRs through the selected GitHub repository', async () => {
  const lines = [];
  const output = { log: (line) => lines.push(line), error: () => assert.fail('unexpected usage error') };
  const github = {
    listIssues: async (repository) => { assert.equal(repository, 'owner/repo'); return [{ number: 1 }]; },
    listPullRequests: async (repository) => { assert.equal(repository, 'owner/repo'); return [{ number: 2 }]; },
  };
  assert.equal(await main(['issues', 'owner/repo'], output, undefined, github), 0);
  assert.deepEqual(JSON.parse(lines.pop()), [{ number: 1 }]);
  assert.equal(await main(['prs', 'owner/repo'], output, undefined, github), 0);
  assert.deepEqual(JSON.parse(lines.pop()), [{ number: 2 }]);
});

test('CLI refuses ambiguous GitHub listing arguments', async () => {
  const errors = [];
  const output = { log: () => assert.fail('unexpected output'), error: (line) => errors.push(line) };
  assert.equal(await main(['issues'], output), 2);
  assert.equal(await main(['prs', 'owner/repo', '--web'], output), 2);
  assert.equal(errors.length, 2);
});

test('CLI shows a selected issue without interpreting its body', async () => {
  const lines = [];
  const github = { issueDetails: async (repository, number) => {
    assert.equal(repository, 'owner/repo');
    assert.equal(number, 7);
    return { number: 7, body: 'untrusted instructions' };
  } };
  const output = { log: (line) => lines.push(line), error: () => assert.fail('unexpected usage error') };
  assert.equal(await main(['issue', 'owner/repo', '7'], output, undefined, github), 0);
  assert.equal(JSON.parse(lines[0]).body, 'untrusted instructions');
  assert.equal(await main(['issue', 'owner/repo', '--web'], { log: () => assert.fail(), error: () => {} }), 2);
});

test('CLI shows a selected pull request without checking it out', async () => {
  const lines = [];
  const github = { pullRequestDetails: async (repository, number) => {
    assert.equal(repository, 'owner/repo');
    assert.equal(number, 9);
    return { number: 9, body: 'untrusted PR body' };
  } };
  const output = { log: (line) => lines.push(line), error: () => assert.fail('unexpected usage error') };
  assert.equal(await main(['pr', 'owner/repo', '9'], output, undefined, github), 0);
  assert.equal(JSON.parse(lines[0]).body, 'untrusted PR body');
  assert.equal(await main(['pr', 'owner/repo', '--web'], { log: () => assert.fail(), error: () => {} }), 2);
});

test('CLI lists workflow runs for a selected repository branch', async () => {
  const lines = [];
  const github = { listWorkflowRuns: async (repository, options) => {
    assert.equal(repository, 'owner/repo');
    assert.deepEqual(options, { branch: 'feature/work' });
    return [{ id: 7, conclusion: 'success' }];
  } };
  const output = { log: (line) => lines.push(line), error: () => assert.fail('unexpected usage error') };
  assert.equal(await main(['runs', 'owner/repo', 'feature/work'], output, undefined, github), 0);
  assert.equal(JSON.parse(lines[0])[0].id, 7);
  assert.equal(await main(['runs', 'owner/repo', 'main', 'extra'], { log: () => assert.fail(), error: () => {} }), 2);
});

test('CLI displays a selected PR patch without changing GitHub', async () => {
  const lines = [];
  const github = { pullRequestDiff: async (repository, number) => {
    assert.equal(repository, 'owner/repo');
    assert.equal(number, 42);
    return 'diff --git a/file b/file\n+change\n';
  } };
  const output = { log: (line) => lines.push(line), error: () => assert.fail('unexpected usage error') };
  assert.equal(await main(['pr-diff', 'owner/repo', '42'], output, undefined, github), 0);
  assert.match(lines[0], /\+change/);
  assert.equal(await main(['pr-diff', 'owner/repo', '0x2a'], { log: () => assert.fail(), error: () => {} }), 2);
});

test('CLI creates an issue only through its explicit command and body file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-cli-issue-'));
  try {
    const bodyFile = join(directory, 'issue.md');
    writeFileSync(bodyFile, 'Reproduce the defect.');
    const lines = [];
    const github = { createIssue: async (repository, issue) => {
      assert.equal(repository, 'owner/repo');
      assert.deepEqual(issue, { title: 'Fix defect', body: 'Reproduce the defect.', labels: ['bug'] });
      return { number: 12, url: 'https://github.com/owner/repo/issues/12' };
    } };
    assert.equal(await main(['issue-create', 'owner/repo', 'Fix defect', bodyFile, 'bug'],
      { log: (line) => lines.push(line), error: () => assert.fail('unexpected usage error') }, undefined, github), 0);
    assert.equal(JSON.parse(lines[0]).number, 12);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('CLI reviews a PR preview and refuses submission without approval', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-cli-pr-'));
  try {
    const bodyFile = join(directory, 'pr.md');
    writeFileSync(bodyFile, 'Fixes #12');
    const outputLines = [];
    const previewLines = [];
    let created = 0;
    const github = { createPullRequest: async (repository, input, options) => {
      assert.equal(repository, 'owner/repo');
      assert.deepEqual(input, { base: 'main', head: 'feature/work', title: 'Fix issue', body: 'Fixes #12' });
      const approved = await options.approve({ repository, ...input, draft: false, diff: 'diff --git a/file b/file\n+fix\n' });
      if (!approved) return { approved: false };
      created++;
      return { approved: true, number: 42, url: 'https://github.com/owner/repo/pull/42' };
    } };
    const output = { log: (line) => outputLines.push(line), error: (line) => previewLines.push(line) };
    const args = ['pr-create', 'owner/repo', 'main', 'feature/work', 'Fix issue', bodyFile];
    assert.equal(await main(args, output, undefined, github, undefined, async () => false), 1);
    assert.equal(created, 0);
    assert.match(previewLines[0], /Repository: owner\/repo/);
    assert.match(previewLines[0], /Fixes #12/);
    assert.match(previewLines[0], /diff --git/);
    assert.equal(await main(args, output, undefined, github, undefined, async (word) => {
      assert.equal(word, 'create');
      return true;
    }), 0);
    assert.equal(created, 1);
    assert.equal(JSON.parse(outputLines.at(-1)).number, 42);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
