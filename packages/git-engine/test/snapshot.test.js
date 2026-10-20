import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { commitStaged, createBranch, fetchRemote, pullFastForward, pushCurrentBranch, repositoryDiff, repositorySnapshot, stagePaths } from '../src/index.js';

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

test('fetches remote changes without changing the active branch or working tree', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-fetch-'));
  const remote = mkdtempSync(join(tmpdir(), 'codovyn-fetch-bare-'));
  const contributor = mkdtempSync(join(tmpdir(), 'codovyn-contributor-'));
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { stdio: 'pipe' });
  try {
    execFileSync('git', ['-C', remote, 'init', '--bare', '-q']);
    git('init', '-q', '-b', 'main');
    git('remote', 'add', 'origin', remote);
    writeFileSync(join(directory, 'file.txt'), 'original');
    git('add', 'file.txt');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'initial');
    await pushCurrentBranch(directory);
    execFileSync('git', ['-C', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
    execFileSync('git', ['clone', '-q', remote, contributor]);
    writeFileSync(join(contributor, 'file.txt'), 'from contributor');
    execFileSync('git', ['-C', contributor, 'add', 'file.txt']);
    execFileSync('git', ['-C', contributor, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'second']);
    execFileSync('git', ['-C', contributor, 'push', '-q', 'origin', 'main']);
    const before = await repositorySnapshot(directory);
    const result = await fetchRemote(directory);
    assert.deepEqual(result.snapshot, before);
    assert.equal(result.remote, 'origin');
    assert.notEqual(git('rev-parse', 'refs/remotes/origin/main').toString().trim(), before.commit);
    await assert.rejects(fetchRemote(directory, '--force'), /configured Git remote name/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
    rmSync(contributor, { recursive: true, force: true });
  }
});

test('pulls only a clean fast-forward branch and skips merge hooks', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-pull-'));
  const remote = mkdtempSync(join(tmpdir(), 'codovyn-pull-bare-'));
  const contributor = mkdtempSync(join(tmpdir(), 'codovyn-pull-contributor-'));
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { stdio: 'pipe' });
  try {
    execFileSync('git', ['-C', remote, 'init', '--bare', '-q']);
    git('init', '-q', '-b', 'main');
    git('remote', 'add', 'origin', remote);
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    writeFileSync(join(directory, 'file.txt'), 'initial');
    git('add', 'file.txt');
    git('commit', '-qm', 'initial');
    await pushCurrentBranch(directory);
    execFileSync('git', ['-C', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
    execFileSync('git', ['clone', '-q', remote, contributor]);
    execFileSync('git', ['-C', contributor, 'config', 'user.name', 'Test']);
    execFileSync('git', ['-C', contributor, 'config', 'user.email', 'test@example.invalid']);
    writeFileSync(join(contributor, 'file.txt'), 'remote edit');
    execFileSync('git', ['-C', contributor, 'add', 'file.txt']);
    execFileSync('git', ['-C', contributor, 'commit', '-qm', 'remote edit']);
    execFileSync('git', ['-C', contributor, 'push', '-q', 'origin', 'main']);
    if (process.platform !== 'win32') {
      const hook = join(directory, '.git', 'hooks', 'post-merge');
      writeFileSync(hook, '#!/bin/sh\ntouch hook-ran\n');
      chmodSync(hook, 0o755);
    }
    writeFileSync(join(directory, 'untracked.txt'), 'keep');
    await assert.rejects(pullFastForward(directory), /working-tree changes/);
    unlinkSync(join(directory, 'untracked.txt'));
    const pulled = await pullFastForward(directory);
    assert.equal(pulled.commit, execFileSync('git', ['-C', remote, 'rev-parse', 'refs/heads/main'], { encoding: 'utf8' }).trim());
    assert.equal(existsSync(join(directory, 'hook-ran')), false);
    writeFileSync(join(directory, 'local.txt'), 'local');
    git('add', 'local.txt');
    git('commit', '-qm', 'local edit');
    writeFileSync(join(contributor, 'remote.txt'), 'remote');
    execFileSync('git', ['-C', contributor, 'add', 'remote.txt']);
    execFileSync('git', ['-C', contributor, 'commit', '-qm', 'another remote edit']);
    execFileSync('git', ['-C', contributor, 'push', '-q', 'origin', 'main']);
    const before = await repositorySnapshot(directory);
    await assert.rejects(pullFastForward(directory), /may have diverged/);
    assert.equal((await repositorySnapshot(directory)).commit, before.commit);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
    rmSync(contributor, { recursive: true, force: true });
  }
});
