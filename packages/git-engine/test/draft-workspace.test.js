import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDraftWorkspace, reviewDraftWorkspace, acceptDraftWorkspace, rejectDraftWorkspace } from '../src/draft-workspace.js';
import { repositorySnapshot } from '../src/index.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-draft-'));
  const repository = join(directory, 'repo');
  const drafts = join(directory, 'private', 'drafts');
  execFileSync('mkdir', ['-p', repository]);
  execFileSync('git', ['-C', repository, 'init', '-q']);
  writeFileSync(join(repository, 'README.md'), 'before\n');
  execFileSync('git', ['-C', repository, 'add', 'README.md']);
  execFileSync('git', ['-C', repository, '-c', 'user.name=CODOVYN', '-c', 'user.email=codovyn@example.invalid', 'commit', '-qm', 'fixture']);
  return { directory, repository, drafts };
}

test('isolated draft reviews tracked and new files before applying to the original repository', async () => {
  const { directory, repository, drafts } = fixture();
  try {
    const draft = await createDraftWorkspace(repository, drafts, 'task_one');
    writeFileSync(join(draft.path, 'README.md'), 'after\n');
    writeFileSync(join(draft.path, 'new.txt'), 'new file\n');
    assert.equal(readFileSync(join(repository, 'README.md'), 'utf8'), 'before\n');
    const review = await reviewDraftWorkspace(repository, drafts, 'task_one', draft.baseCommit);
    assert.deepEqual(review.changedPaths, ['README.md', 'new.txt']);
    assert.match(review.patch, /\+after/);
    assert.match(review.patch, /\+new file/);
    await assert.rejects(acceptDraftWorkspace(repository, drafts, 'task_one', draft.baseCommit, '0'.repeat(64)), /changed since review/);
    const applied = await acceptDraftWorkspace(repository, drafts, 'task_one', draft.baseCommit, review.patchHash);
    assert.deepEqual(applied.changedPaths, review.changedPaths);
    assert.equal(readFileSync(join(repository, 'README.md'), 'utf8').replaceAll('\r\n', '\n'), 'after\n');
    assert.equal(readFileSync(join(repository, 'new.txt'), 'utf8').replaceAll('\r\n', '\n'), 'new file\n');
    assert.equal(existsSync(draft.path), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('reject discards a draft while the repository remains clean', async () => {
  const { directory, repository, drafts } = fixture();
  try {
    const draft = await createDraftWorkspace(repository, drafts, 'task_two');
    writeFileSync(join(draft.path, 'README.md'), 'discard me\n');
    await rejectDraftWorkspace(repository, drafts, 'task_two', draft.baseCommit);
    assert.equal(existsSync(draft.path), false);
    assert.equal((await repositorySnapshot(repository)).dirty, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('accept refuses concurrent edits in the original repository', async () => {
  const { directory, repository, drafts } = fixture();
  try {
    const draft = await createDraftWorkspace(repository, drafts, 'task_three');
    writeFileSync(join(draft.path, 'README.md'), 'draft\n');
    const review = await reviewDraftWorkspace(repository, drafts, 'task_three', draft.baseCommit);
    writeFileSync(join(repository, 'README.md'), 'user edit\n');
    await assert.rejects(acceptDraftWorkspace(repository, drafts, 'task_three', draft.baseCommit, review.patchHash), /Repository changed/);
    assert.equal(readFileSync(join(repository, 'README.md'), 'utf8'), 'user edit\n');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('editing requires a clean committed repository', async () => {
  const { directory, repository, drafts } = fixture();
  try {
    writeFileSync(join(repository, 'README.md'), 'uncommitted\n');
    await assert.rejects(createDraftWorkspace(repository, drafts, 'task_four'), /Commit or remove/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
