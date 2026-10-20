import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

test('CLI opens a real repository and persists a simulated handoff', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-cli-'));
  const repository = join(directory, 'repo');
  const data = join(directory, 'data');
  try {
    mkdirSync(repository);
    execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main']);
    writeFileSync(join(repository, 'file.txt'), 'content');
    execFileSync('git', ['-C', repository, 'add', '.']);
    execFileSync('git', ['-C', repository, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'initial']);
    const script = fileURLToPath(new URL('../src/index.js', import.meta.url));
    const env = { ...process.env, CODOVYN_DATA_DIR: data };
    const result = JSON.parse(execFileSync(process.execPath, [script, 'demo', repository, 'Inspect', 'the', 'project'], { encoding: 'utf8', env }));
    assert.equal(result.status, 'completed');
    assert.equal(result.activeAgent, 'simulated-backup');
    assert.deepEqual(result.events.filter((event) => event.kind === 'handoff').map((event) => event.data.to), ['simulated-backup']);
    const history = JSON.parse(execFileSync(process.execPath, [script, 'history', result.taskId], { encoding: 'utf8', env }));
    assert.equal(history.task.request, 'Inspect the project');
    assert.equal(history.events.find((event) => event.kind === 'checkpoint').data.repository.branch, 'main');

    const streamed = execFileSync(process.execPath, [script, 'demo', repository, 'Inspect'], {
      encoding: 'utf8', env: { ...env, CODOVYN_EVENT_STREAM: '1' },
    }).trim().split('\n').map((line) => JSON.parse(line));
    assert.ok(streamed.some((line) => line.type === 'event' && line.event.kind === 'handoff'));
    assert.equal(streamed.at(-1).type, 'result');
    assert.equal(streamed.at(-1).status, 'completed');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
