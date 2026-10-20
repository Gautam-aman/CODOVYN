import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../src/index.js';

test('persists task and checkpoint events across process-like reopening', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-store-'));
  const filename = join(directory, 'tasks.sqlite');
  try {
    const first = new TaskStore(filename);
    if (process.platform !== 'win32') assert.equal(statSync(filename).mode & 0o777, 0o600);
    first.create({ id: 'task-1', request: 'Fix the build', primaryAgent: 'alpha', fallbackAgents: ['beta'] });
    first.update('task-1', { status: 'interrupted', activeAgent: 'alpha', step: 2 });
    first.append('task-1', 'checkpoint', { branch: 'feature', commit: 'abc' });
    first.close();

    const reopened = new TaskStore(filename);
    assert.equal(reopened.get('task-1').step, 2);
    assert.deepEqual(reopened.events('task-1').map((event) => event.kind), ['checkpoint']);
    assert.deepEqual(reopened.listInterrupted().map((task) => task.id), ['task-1']);
    reopened.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('rejects unsafe ids and unknown task updates', () => {
  const store = new TaskStore(':memory:');
  assert.throws(() => store.create({ id: '../bad', request: 'x', primaryAgent: 'a' }), /Invalid task id/);
  assert.throws(() => store.update('missing', { status: 'running', activeAgent: 'a', step: 0 }), /Unknown task/);
  store.close();
});
