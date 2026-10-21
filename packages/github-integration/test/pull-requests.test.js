import test from 'node:test';
import assert from 'node:assert/strict';
import { listPullRequests } from '../src/index.js';

test('pull request listing requests only metadata for a selected repository', async () => {
  let called;
  const pullRequests = await listPullRequests('owner/repo', { limit: 3, run: async (args) => {
    called = args;
    return JSON.stringify([{ number: 8, title: 'Improve docs', state: 'OPEN',
      url: 'https://github.com/owner/repo/pull/8', headRefName: 'docs', baseRefName: 'main',
      isDraft: true, body: 'not requested' }]);
  } });
  assert.deepEqual(called, ['pr', 'list', '--repo', 'owner/repo', '--state', 'open', '--limit', '3',
    '--json', 'number,title,state,url,headRefName,baseRefName,isDraft']);
  assert.deepEqual(pullRequests, [{ number: 8, title: 'Improve docs', state: 'OPEN',
    url: 'https://github.com/owner/repo/pull/8', headRefName: 'docs', baseRefName: 'main', isDraft: true }]);
});

test('pull request listing rejects invalid input and malformed output', async () => {
  await assert.rejects(listPullRequests('owner/repo --web'), /OWNER\/REPO/);
  await assert.rejects(listPullRequests('owner/repo', { limit: 0 }), /between 1 and 100/);
  await assert.rejects(listPullRequests('owner/repo', { run: async () => '[] trailing' }), /invalid JSON/);
});
