import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { commitStaged, createBranch, pushCurrentBranch, repositoryDiff, repositorySnapshot, stagePaths } from '../src/index.js';

test('records real branch, commit and working-tree changes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-git-'));
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { stdio: 'pipe' });
  try {
    git('init', '-q', '-b', 'feature');
    writeFileSync(join(directory, 'file.txt'), 'initial');
    git('add', 'file.txt');
    git('-c', 'user.name=Codovyn Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'initial');
    const clean = await repositorySnapshot(directory);
    assert.equal(clean.branch, 'feature');
    assert.match(clean.commit, /^[a-f0-9]{40}$/);
    assert.equal(clean.dirty, false);
    writeFileSync(join(directory, 'file.txt'), 'modified');
    const dirty = await repositorySnapshot(directory);
    assert.deepEqual(dirty.changedPaths, ['file.txt']);
    assert.equal(dirty.commit, clean.commit);
    writeFileSync(join(directory, 'file.txt'), 'modified again');
    const dirtyAgain = await repositorySnapshot(directory);
    assert.deepEqual(dirtyAgain.changedPaths, dirty.changedPaths);
    assert.notEqual(dirtyAgain.workingTreeHash, dirty.workingTreeHash);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('opens a newly initialized repository before its first commit', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-empty-git-'));
  try {
    execFileSync('git', ['-C', directory, 'init', '-q', '-b', 'new-project']);
    const snapshot = await repositorySnapshot(directory);
    assert.equal(snapshot.branch, 'new-project');
    assert.equal(snapshot.commit, null);
    assert.equal(snapshot.dirty, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('reads staged and unstaged patches without invoking external diff tools', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-diff-'));
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { stdio: 'pipe' });
  try {
    git('init', '-q', '-b', 'main');
    writeFileSync(join(directory, 'file.txt'), 'first\n');
    git('add', 'file.txt');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'initial');
    writeFileSync(join(directory, 'file.txt'), 'second\n');
    assert.match(await repositoryDiff(directory), /\+second/);
    assert.equal(await repositoryDiff(directory, { staged: true }), '');
    git('add', 'file.txt');
    assert.match(await repositoryDiff(directory, { staged: true }), /\+second/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('stages selected repository files and rejects traversal', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-stage-'));
  try {
    execFileSync('git', ['-C', directory, 'init', '-q', '-b', 'main']);
    writeFileSync(join(directory, 'chosen.txt'), 'chosen');
    writeFileSync(join(directory, 'other.txt'), 'other');
    await stagePaths(directory, ['chosen.txt']);
    assert.match(await repositoryDiff(directory, { staged: true }), /chosen/);
    assert.ok(!(await repositoryDiff(directory, { staged: true })).includes('other.txt'));
    await assert.rejects(stagePaths(directory, ['../outside']), /repository-relative/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('commits the selected index and leaves unstaged work alone', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-commit-'));
  try {
    execFileSync('git', ['-C', directory, 'init', '-q', '-b', 'main']);
    execFileSync('git', ['-C', directory, 'config', 'user.name', 'Test']);
    execFileSync('git', ['-C', directory, 'config', 'user.email', 'test@example.invalid']);
    writeFileSync(join(directory, 'staged.txt'), 'staged');
    writeFileSync(join(directory, 'unstaged.txt'), 'unstaged');
    await stagePaths(directory, ['staged.txt']);
    const committed = await commitStaged(directory, 'Add staged file');
    assert.match(committed.commit, /^[a-f0-9]{40}$/);
    assert.deepEqual(committed.changedPaths, ['unstaged.txt']);
    await assert.rejects(commitStaged(directory, 'No changes'), /No staged changes/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('commits a staged patch larger than the diff display limit', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-large-commit-'));
  try {
    execFileSync('git', ['-C', directory, 'init', '-q', '-b', 'main']);
    execFileSync('git', ['-C', directory, 'config', 'user.name', 'Test']);
    execFileSync('git', ['-C', directory, 'config', 'user.email', 'test@example.invalid']);
    writeFileSync(join(directory, 'large.txt'), 'long line\n'.repeat(140_000));
    await stagePaths(directory, ['large.txt']);
    await assert.rejects(repositoryDiff(directory, { staged: true }), /display limit/);
    const committed = await commitStaged(directory, 'Store large staged change');
    assert.match(committed.commit, /^[a-f0-9]{40}$/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('creates a local branch while preserving work and skipping checkout hooks', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-branch-'));
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { stdio: 'pipe' });
  try {
    git('init', '-q', '-b', 'main');
    writeFileSync(join(directory, 'file.txt'), 'initial');
    git('add', 'file.txt');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'initial');
    writeFileSync(join(directory, 'file.txt'), 'work in progress');
    if (process.platform !== 'win32') {
      const hook = join(directory, '.git', 'hooks', 'post-checkout');
      writeFileSync(hook, '#!/bin/sh\ntouch hook-ran\n');
      chmodSync(hook, 0o755);
    }
    const before = await repositorySnapshot(directory);
    const after = await createBranch(directory, 'feature/work');
    assert.equal(after.branch, 'feature/work');
    assert.equal(after.commit, before.commit);
    assert.equal(after.workingTreeHash, before.workingTreeHash);
    assert.equal(existsSync(join(directory, 'hook-ran')), false);
    await assert.rejects(createBranch(directory, '--force'), /Invalid Git branch name/);
    await assert.rejects(createBranch(directory, 'bad..name'), /Invalid Git branch name/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('pushes the current branch to a configured local remote without force', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-push-'));
  const remote = mkdtempSync(join(tmpdir(), 'codovyn-bare-'));
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { stdio: 'pipe' });
  try {
    execFileSync('git', ['-C', remote, 'init', '--bare', '-q']);
    git('init', '-q', '-b', 'feature');
    git('remote', 'add', 'origin', remote);
    writeFileSync(join(directory, 'file.txt'), 'content');
    git('add', 'file.txt');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'initial');
    if (process.platform !== 'win32') {
      const hooks = join(directory, '.git', 'hooks');
      mkdirSync(hooks, { recursive: true });
      const hook = join(hooks, 'pre-push');
      writeFileSync(hook, '#!/bin/sh\nexit 1\n');
      chmodSync(hook, 0o755);
    }
    const pushed = await pushCurrentBranch(directory);
    assert.equal(pushed.branch, 'feature');
    assert.equal(execFileSync('git', ['-C', remote, 'rev-parse', 'refs/heads/feature'], { encoding: 'utf8' }).trim(), pushed.commit);
    await assert.rejects(pushCurrentBranch(directory, '--force'), /configured Git remote name/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  }
});
