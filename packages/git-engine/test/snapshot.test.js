import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { commitStaged, repositoryDiff, repositorySnapshot, stagePaths } from '../src/index.js';

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
