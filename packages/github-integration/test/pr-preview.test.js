import test from 'node:test';
import assert from 'node:assert/strict';
import { previewPullRequest } from '../src/index.js';

test('PR preview fetches a bounded same-repository comparison diff', async () => {
  const result = await previewPullRequest('owner/repo', { base: 'main', head: 'feature/work' }, { run: async (args) => {
    assert.deepEqual(args, ['api', '-H', 'Accept: application/vnd.github.diff',
      'repos/owner/repo/compare/main...feature%2Fwork']);
    return 'diff --git a/file b/file\n+work\n';
  } });
  assert.match(result.diff, /\+work/);
  assert.equal(result.head, 'feature/work');
});

test('PR preview refuses invalid branches and incomplete diffs', async () => {
  await assert.rejects(previewPullRequest('owner/repo', { base: 'main', head: '--web' }), /branch name/);
  await assert.rejects(previewPullRequest('owner/repo', { base: 'main', head: 'main' }), /must differ/);
  await assert.rejects(previewPullRequest('owner/repo', { base: 'main', head: 'work' },
    { run: async () => '{"files":[]}' }), /preview is unavailable/);
});
