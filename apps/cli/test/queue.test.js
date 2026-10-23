import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/index.js';

test('CLI queue commands preserve configuration and require an unchanged repository before claim', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-queue-cli-'));
  const repository = join(directory, 'repo');
  const previousData = process.env.CODOVYN_DATA_DIR;
  const previousBaseline = process.env.CODOVYN_EXPECTED_BASELINE;
  const data = join(directory, 'data');
  try {
    execFileSync('git', ['init', '-q', '-b', 'main', repository]);
    writeFileSync(join(repository, 'readme.md'), 'baseline');
    execFileSync('git', ['-C', repository, 'add', '.']);
    execFileSync('git', ['-C', repository, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline']);
    process.env.CODOVYN_DATA_DIR = data;
    const call = async args => {
      const lines = [];
      const code = await main(args, { log: value => lines.push(value), error: value => { throw new Error(value); } });
      return { code, value: JSON.parse(lines.at(-1)) };
    };
    const config = JSON.stringify({ provider: 'codex', modelId: null, permission: 'read', routingMode: 'manual', reasoning: null });
    const first = await call(['queue-add', repository, 'Inspect files', config]);
    const second = await call(['queue-add', repository, 'Explain tests', config]);
    assert.equal(first.code, 0); assert.equal(first.value.task.status, 'queued');
    assert.equal(first.value.task.schemaVersion, 1); assert.equal(first.value.task.configuration.permission, 'read');
    assert.equal(second.value.task.position, 1);
    await call(['queue-pause', repository]);
    assert.equal((await call(['queue-list', repository])).value.paused, true);
    await assert.rejects(call(['queue-claim', first.value.task.id, repository]), /paused/);
    await call(['queue-resume', repository]);
    writeFileSync(join(repository, 'readme.md'), 'changed after enqueue');
    await assert.rejects(call(['queue-claim', first.value.task.id, repository]), /baseline changed/);
    process.env.CODOVYN_EXPECTED_BASELINE = first.value.task.baselineFingerprint;
    let providerConstructed = false;
    await assert.rejects(main(['codex', repository, 'Do not start against a changed baseline'], { log: () => {}, error: () => {} }, undefined, undefined,
      { createCodexAdapter: () => { providerConstructed = true; throw new Error('must not launch'); } }), /baseline changed before provider dispatch/);
    assert.equal(providerConstructed, false);
    if (previousBaseline === undefined) delete process.env.CODOVYN_EXPECTED_BASELINE; else process.env.CODOVYN_EXPECTED_BASELINE = previousBaseline;
    await call(['queue-reorder', second.value.task.id, '0', repository]);
    assert.equal((await call(['queue-list', repository])).value.tasks[0].id, second.value.task.id);
    await call(['queue-cancel', first.value.task.id, repository]);
    assert.equal((await call(['queue-list', repository])).value.tasks.find(task => task.id === first.value.task.id).status, 'cancelled');
    await assert.rejects(call(['queue-add', repository, 'bad config', '{"provider":"openrouter"}']), /Invalid task configuration/);
  } finally {
    if (previousData === undefined) delete process.env.CODOVYN_DATA_DIR;
    else process.env.CODOVYN_DATA_DIR = previousData;
    if (previousBaseline === undefined) delete process.env.CODOVYN_EXPECTED_BASELINE; else process.env.CODOVYN_EXPECTED_BASELINE = previousBaseline;
    rmSync(directory, { recursive: true, force: true });
  }
});
