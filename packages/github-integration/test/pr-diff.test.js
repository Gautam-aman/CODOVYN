import test from 'node:test';
import assert from 'node:assert/strict';
import { pullRequestDiff } from '../src/index.js';

test('PR diff requests a bounded plain patch for a selected repository and number', async () => {
  let called;
  const patch = await pullRequestDiff('owner/repo', 42, { run: async (args) => {
    called = args;
    return 'diff --git a/file b/file\n+safe change\n';
  } });
  assert.deepEqual(called, ['pr', 'diff', '42', '--repo', 'owner/repo', '--color', 'never', '--patch']);
  assert.match(patch, /safe change/);
});

test('PR diff rejects ambiguous numbers and oversized patches', async () => {
  await assert.rejects(pullRequestDiff('owner/repo', '--web'), /number must be positive/);
  await assert.rejects(pullRequestDiff('owner/repo', 0), /number must be positive/);
  await assert.rejects(pullRequestDiff('owner/repo', 1,
    { run: async () => 'x'.repeat(1024 * 1024 + 1) }), /display limit/);
});
