import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createPullRequest } from '../src/index.js';

const input = { base: 'main', head: 'feature/work', title: 'Fix issue', body: 'Fixes #12', draft: true };
const patch = 'diff --git a/file b/file\n+fix\n';

test('PR creation requires approval of a stable diff and verifies the returned URL', async () => {
  let previews = 0;
  let bodyFile;
  const result = await createPullRequest('owner/repo', input, { approve: async (preview) => {
    assert.equal(preview.repository, 'owner/repo');
    assert.equal(preview.base, 'main');
    assert.equal(preview.head, 'feature/work');
    assert.equal(preview.title, 'Fix issue');
    assert.equal(preview.body, 'Fixes #12');
    assert.equal(preview.diff, patch);
    return true;
  }, run: async (args) => {
    if (args[0] === 'api') { previews++; return patch; }
    assert.equal(previews, 2);
    assert.deepEqual(args.slice(0, 10), ['pr', 'create', '--repo', 'owner/repo', '--base', 'main',
      '--head', 'feature/work', '--title', 'Fix issue']);
    bodyFile = args[11];
    assert.equal(readFileSync(bodyFile, 'utf8'), 'Fixes #12');
    assert.equal(args[12], '--draft');
    return 'https://github.com/owner/repo/pull/42\n';
  } });
  assert.deepEqual(result, { approved: true, number: 42, url: 'https://github.com/owner/repo/pull/42' });
  assert.equal(existsSync(bodyFile), false);
});

test('PR refusal and changed preview never submit creation', async () => {
  let calls = 0;
  const run = async (args) => { assert.equal(args[0], 'api'); calls++; return calls === 3 ? `${patch}+more\n` : patch; };
  assert.deepEqual(await createPullRequest('owner/repo', input, { run, approve: async () => false }), { approved: false });
  assert.equal(calls, 1);
  await assert.rejects(createPullRequest('owner/repo', input, { run, approve: async () => true }), /diff changed/);
  assert.equal(calls, 3);
});

test('PR creation refuses missing approval and uncertain CLI responses', async () => {
  await assert.rejects(createPullRequest('owner/repo', input), /approval callback/);
  await assert.rejects(createPullRequest('owner/repo', input, { approve: async () => true,
    run: async (args) => args[0] === 'api' ? patch : 'https://github.com/other/repo/pull/1' }), /uncertain/);
  await assert.rejects(createPullRequest('owner/repo', input, { approve: async () => true,
    run: async (args) => { if (args[0] === 'api') return patch; throw new Error('authentication failed'); } }), /uncertain/);
});
