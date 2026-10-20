import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../src/index.js';
import { DatabaseSync } from 'node:sqlite';

test('persists task and checkpoint events across process-like reopening', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-store-'));
  const filename = join(directory, 'tasks.sqlite');
  try {
    const first = new TaskStore(filename);
    if (process.platform !== 'win32') assert.equal(statSync(filename).mode & 0o777, 0o600);
    first.create({ id: 'task-1', request: 'Fix the build', repositoryRoot: '/project-a', primaryAgent: 'alpha', fallbackAgents: ['beta'] });
    first.update('task-1', { status: 'interrupted', activeAgent: 'alpha', step: 2 });
    first.append('task-1', 'checkpoint', { branch: 'feature', commit: 'abc' });
    first.close();

    const reopened = new TaskStore(filename);
    assert.equal(reopened.get('task-1').step, 2);
    assert.deepEqual(reopened.events('task-1').map((event) => event.kind), ['checkpoint']);
    assert.deepEqual(reopened.listInterrupted().map((task) => task.id), ['task-1']);
    assert.deepEqual(reopened.list({ limit: 1 }).map((task) => task.id), ['task-1']);
    assert.deepEqual(reopened.list({ repositoryRoot: '/project-a' }).map((task) => task.id), ['task-1']);
    assert.deepEqual(reopened.list({ repositoryRoot: '/project-b' }), []);
    reopened.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('rejects unsafe ids and unknown task updates', () => {
  const store = new TaskStore(':memory:');
  assert.throws(() => store.create({ id: '../bad', request: 'x', primaryAgent: 'a' }), /Invalid task id/);
  assert.throws(() => store.update('missing', { status: 'running', activeAgent: 'a', step: 0 }), /Unknown task/);
  assert.throws(() => store.list({ limit: 101 }), /Limit must be/);
  store.close();
});

test('adds repository association to an existing task database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-migrate-'));
  const filename = join(directory, 'old.sqlite');
  try {
    const old = new DatabaseSync(filename);
    old.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, request TEXT NOT NULL, primary_agent TEXT NOT NULL, fallback_agents TEXT NOT NULL, active_agent TEXT, status TEXT NOT NULL, step INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
    old.close();
    const store = new TaskStore(filename);
    assert.equal(store.create({ id: 'new', request: 'Inspect', repositoryRoot: '/repo', primaryAgent: 'agent' }).repositoryRoot, '/repo');
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('task database rejects a shared directory that could expose WAL sidecars', () => {
  if (process.platform === 'win32') return;
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-public-'));
  try {
    const shared = join(directory, 'shared');
    mkdirSync(shared, { mode: 0o755 });
    chmodSync(shared, 0o755);
    assert.throws(() => new TaskStore(join(shared, 'tasks.sqlite')), /must be private/);
    assert.throws(() => statSync(join(shared, 'tasks.sqlite')), /ENOENT/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
