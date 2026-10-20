import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createIssue } from '../src/index.js';

test('issue creation sends validated fields through a temporary body file', async () => {
  let path;
  const created = await createIssue('owner/repo', {
    title: 'Fix task', body: 'Detailed reproduction\n', labels: ['bug', 'help wanted'],
  }, { run: async (args) => {
    assert.deepEqual(args.slice(0, 6), ['issue', 'create', '--repo', 'owner/repo', '--title', 'Fix task']);
    assert.equal(args[6], '--body-file');
    path = args[7];
    assert.equal(readFileSync(path, 'utf8'), 'Detailed reproduction\n');
    assert.deepEqual(args.slice(8), ['--label', 'bug', '--label', 'help wanted']);
    return 'https://github.com/Owner/Repo/issues/12\n';
  } });
  assert.deepEqual(created, { number: 12, url: 'https://github.com/Owner/Repo/issues/12' });
  assert.equal(existsSync(path), false);
});

test('issue creation rejects invalid input and unexpected URLs', async () => {
  await assert.rejects(createIssue('owner/repo', { title: '', body: 'Body' }), /title/);
  await assert.rejects(createIssue('owner/repo', { title: 'Title', body: '' }), /body/);
  await assert.rejects(createIssue('owner/repo', { title: 'Title', body: 'Body', labels: ['bad\0label'] }), /labels/);
  await assert.rejects(createIssue('owner/repo', { title: 'Title', body: 'Body' },
    { run: async () => 'https://github.com/other/repo/issues/1' }), /verify before retrying/);
});

test('issue creation removes the body file after a CLI failure', async () => {
  let path;
  await assert.rejects(createIssue('owner/repo', { title: 'Title', body: 'Body' }, { run: async (args) => {
    path = args[7];
    assert.equal(existsSync(path), true);
    throw new Error('GitHub unavailable');
  } }), /GitHub unavailable/);
  assert.equal(existsSync(path), false);
});
