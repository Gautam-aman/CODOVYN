import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { repositorySnapshot } from '../../../packages/git-engine/src/index.js';

test('CLI opens a real repository and persists a simulated handoff', async () => {
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
    const tasks = JSON.parse(execFileSync(process.execPath, [script, 'tasks'], { encoding: 'utf8', env }));
    assert.ok(tasks.some((task) => task.id === result.taskId && task.status === 'completed'));
    const scoped = JSON.parse(execFileSync(process.execPath, [script, 'tasks', repository], { encoding: 'utf8', env }));
    assert.ok(scoped.some((task) => task.id === result.taskId));
    const streamedHistory = JSON.parse(execFileSync(process.execPath, [script, 'history', result.taskId], {
      encoding: 'utf8', env: { ...env, CODOVYN_EVENT_STREAM: '1' },
    }));
    assert.equal(streamedHistory.type, 'result');
    assert.equal(streamedHistory.task.repositoryRoot, (await repositorySnapshot(repository)).root);
    writeFileSync(join(repository, 'file.txt'), 'changed');
    const patch = JSON.parse(execFileSync(process.execPath, [script, 'diff', repository], {
      encoding: 'utf8', env: { ...env, CODOVYN_EVENT_STREAM: '1' },
    }));
    assert.match(patch.diff, /\+changed/);
    execFileSync('git', ['-C', repository, 'config', 'user.name', 'Test']);
    execFileSync('git', ['-C', repository, 'config', 'user.email', 'test@example.invalid']);
    execFileSync(process.execPath, [script, 'stage', repository, 'file.txt'], { encoding: 'utf8', env });
    const committed = JSON.parse(execFileSync(process.execPath, [script, 'commit', repository, 'Save', 'change'], { encoding: 'utf8', env }));
    assert.equal(committed.dirty, false);
    assert.equal(execFileSync('git', ['-C', repository, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim(), 'Save change');
    const remote = join(directory, 'remote.git');
    execFileSync('git', ['init', '--bare', '-q', remote]);
    execFileSync('git', ['-C', repository, 'remote', 'add', 'origin', remote]);
    const pushed = JSON.parse(execFileSync(process.execPath, [script, 'push', repository], { encoding: 'utf8', env }));
    assert.equal(execFileSync('git', ['-C', remote, 'rev-parse', 'refs/heads/main'], { encoding: 'utf8' }).trim(), pushed.commit);
    const another = join(directory, 'another');
    mkdirSync(another);
    execFileSync('git', ['-C', another, 'init', '-q', '-b', 'other']);
    assert.throws(() => execFileSync(process.execPath, [script, 'history', result.taskId, another], { encoding: 'utf8', env, stdio: 'pipe' }));
    assert.throws(() => execFileSync(process.execPath, [script, 'task-delete', result.taskId, another], { encoding: 'utf8', env, stdio: 'pipe' }));

    const streamed = execFileSync(process.execPath, [script, 'demo', repository, 'Inspect'], {
      encoding: 'utf8', env: { ...env, CODOVYN_EVENT_STREAM: '1' },
    }).trim().split('\n').map((line) => JSON.parse(line));
    assert.ok(streamed.some((line) => line.type === 'event' && line.event.kind === 'handoff'));
    assert.equal(streamed.at(-1).type, 'result');
    assert.equal(streamed.at(-1).status, 'completed');
    const deleted = JSON.parse(execFileSync(process.execPath, [script, 'task-delete', result.taskId, repository], { encoding: 'utf8', env }));
    assert.deepEqual(deleted, { deleted: true, taskId: result.taskId });
    assert.throws(() => execFileSync(process.execPath, [script, 'history', result.taskId], { encoding: 'utf8', env, stdio: 'pipe' }));
    const before = new Date(Date.now() + 60_000).toISOString();
    const pruned = JSON.parse(execFileSync(process.execPath, [script, 'task-prune', repository, before], { encoding: 'utf8', env }));
    assert.deepEqual(pruned.deletedTaskIds, [streamed.at(-1).taskId]);
    assert.throws(() => execFileSync(process.execPath, [script, 'history', streamed.at(-1).taskId], { encoding: 'utf8', env, stdio: 'pipe' }));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
