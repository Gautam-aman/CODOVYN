import test from 'node:test';
import assert from 'node:assert/strict';
import { listWorkflowRuns } from '../src/index.js';

test('workflow run listing scopes a bounded request to repository and branch', async () => {
  const runs = await listWorkflowRuns('owner/repo', { branch: 'feature/work', limit: 3, run: async (args) => {
    assert.deepEqual(args, ['run', 'list', '--repo', 'owner/repo', '--limit', '3', '--branch', 'feature/work',
      '--json', 'databaseId,workflowName,status,conclusion,headSha,headBranch,url,createdAt']);
    return JSON.stringify([{ databaseId: 42, workflowName: 'CI', status: 'completed', conclusion: 'success',
      headSha: 'abc', headBranch: 'feature/work', url: 'https://github.com/owner/repo/actions/runs/42',
      createdAt: '2026-01-01T00:00:00Z' }]);
  } });
  assert.equal(runs[0].id, 42);
  assert.equal(runs[0].conclusion, 'success');
});

test('workflow run listing rejects invalid filters and responses', async () => {
  await assert.rejects(listWorkflowRuns('owner/repo', { limit: 101, run: async () => '[]' }), /Run limit/);
  await assert.rejects(listWorkflowRuns('owner/repo', { branch: '--web', run: async () => '[]' }), /branch filter/);
  await assert.rejects(listWorkflowRuns('owner/repo', { run: async () => '{}' }), /invalid list/);
});
