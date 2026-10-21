import test from 'node:test';
import assert from 'node:assert/strict';
import { listIssues } from '../src/index.js';

test('issue listing scopes the CLI request and returns a small public shape', async () => {
  let called;
  const issues = await listIssues('owner/repo', { limit: 2, run: async (args) => {
    called = args;
    return JSON.stringify([{ number: 7, title: 'Fix task', state: 'OPEN', url: 'https://github.com/owner/repo/issues/7',
      labels: [{ name: 'bug', color: 'red' }], body: 'private detail' }]);
  } });
  assert.deepEqual(called, ['issue', 'list', '--repo', 'owner/repo', '--state', 'open', '--limit', '2',
    '--json', 'number,title,state,url,labels']);
  assert.deepEqual(issues, [{ number: 7, title: 'Fix task', state: 'OPEN',
    url: 'https://github.com/owner/repo/issues/7', labels: ['bug'] }]);
});

test('issue listing rejects invalid repositories, limits, and output', async () => {
  await assert.rejects(listIssues('-R/other'), /OWNER\/REPO/);
  await assert.rejects(listIssues('owner/repo', { limit: 101 }), /between 1 and 100/);
  await assert.rejects(listIssues('owner/repo', { run: async () => 'not json' }), /invalid JSON/);
  await assert.rejects(listIssues('owner/repo', { run: async () => '{}' }), /invalid list/);
});
