import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repositorySnapshot } from '../src/index.js';

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
