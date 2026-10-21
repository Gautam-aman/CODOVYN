import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/index.js';

test('CLI runs an approved edit in a worktree and applies only a reviewed patch', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-cli-edit-'));
  const repository = join(directory, 'repo');
  const oldDataDirectory = process.env.CODOVYN_DATA_DIR;
  try {
    mkdirSync(repository);
    execFileSync('git', ['-C', repository, 'init', '-q']);
    writeFileSync(join(repository, 'README.md'), 'before\n');
    execFileSync('git', ['-C', repository, 'add', 'README.md']);
    execFileSync('git', ['-C', repository, '-c', 'user.name=CODOVYN', '-c', 'user.email=codovyn@example.invalid', 'commit', '-qm', 'fixture']);
    process.env.CODOVYN_DATA_DIR = join(directory, 'private');
    const lines = [];
    const errors = [];
    const output = { log: (line) => lines.push(line), error: (line) => errors.push(line) };
    const adapters = { createCodexAdapter: ({ cwd, write }) => ({
      id: 'codex', capabilities: { writes: write }, availability: async () => 'available',
      async *run() {
        assert.equal(write, true);
        assert.notEqual(cwd, repository);
        writeFileSync(join(cwd, 'README.md'), 'after\n');
        yield { type: 'tool-start', actionId: 'edit-1', action: 'file_change' };
        yield { type: 'tool-complete', actionId: 'edit-1', action: 'file_change' };
        yield { type: 'completed' };
      },
    }) };
    assert.equal(await main(['codex-edit', repository, 'Change README'], output, undefined, undefined, adapters), 2);
    assert.match(errors.at(-1), /allow-writes/);
    assert.equal(await main(['codex-edit', repository, 'Change README', '--allow-writes'], output,
      undefined, undefined, adapters), 0);
    const result = JSON.parse(lines.at(-1));
    assert.equal(result.status, 'completed');
    assert.equal(result.draftReviewAvailable, true);
    assert.equal(readFileSync(join(repository, 'README.md'), 'utf8'), 'before\n');
    assert.equal(await main(['draft-review', result.taskId, repository], output), 0);
    const review = JSON.parse(lines.at(-1));
    assert.match(review.patch, /\+after/);
    assert.equal(await main(['draft-accept', result.taskId, repository, review.patchHash, '--yes'], output), 0);
    assert.equal(readFileSync(join(repository, 'README.md'), 'utf8'), 'after\n');
    assert.equal(await main(['draft-accept', result.taskId, repository, review.patchHash, '--yes'], output), 1);
    assert.match(errors.at(-1), /no open edit draft/);
  } finally {
    if (oldDataDirectory === undefined) delete process.env.CODOVYN_DATA_DIR;
    else process.env.CODOVYN_DATA_DIR = oldDataDirectory;
    rmSync(directory, { recursive: true, force: true });
  }
});
