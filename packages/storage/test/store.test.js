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

test('deletes a finished task and its event history durably', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-delete-'));
  const filename = join(directory, 'tasks.sqlite');
  try {
    const first = new TaskStore(filename);
    first.create({ id: 'old', request: 'Done', primaryAgent: 'alpha' });
    first.append('old', 'checkpoint', { private: 'history' });
    first.create({ id: 'keep', request: 'Keep', primaryAgent: 'alpha' });
    assert.equal(first.delete('old'), true);
    assert.equal(first.delete('old'), false);
    assert.equal(first.get('old'), undefined);
    assert.deepEqual(first.events('old'), []);
    assert.ok(first.get('keep'));
    first.close();
    const reopened = new TaskStore(filename);
    assert.equal(reopened.get('old'), undefined);
    assert.deepEqual(reopened.events('old'), []);
    reopened.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('refuses to delete a running task', () => {
  const store = new TaskStore(':memory:');
  store.create({ id: 'live', request: 'Work', primaryAgent: 'alpha' });
  store.update('live', { status: 'running', activeAgent: 'alpha', step: 0 });
  assert.throws(() => store.delete('live'), /Cannot delete a running task/);
  assert.ok(store.get('live'));
  store.close();
});

test('open edit drafts retain their task history until explicitly resolved', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-draft-retention-'));
  const filename = join(directory, 'tasks.sqlite');
  let store;
  try {
    store = new TaskStore(filename);
    for (const id of ['accept', 'reject']) {
      store.create({ id, request: 'Edit', repositoryRoot: '/repo', primaryAgent: 'codex' });
      store.append(id, 'draft-created', { baseCommit: 'abc' });
      store.update(id, { status: 'completed', activeAgent: 'codex', step: 1 });
    }
    store.close();
    store = new TaskStore(filename);
    const cutoff = { repositoryRoot: '/repo', before: new Date(Date.now() + 60_000).toISOString() };
    for (const id of ['accept', 'reject']) {
      assert.equal(store.hasOpenDraft(id), true);
      assert.throws(() => store.delete(id), /Apply or discard the open edit draft/);
      assert.equal(store.events(id)[0].kind, 'draft-created');
    }
    assert.deepEqual(store.prunable(cutoff), []);
    assert.deepEqual(store.prune(cutoff), []);
    store.append('accept', 'draft-accepted');
    store.append('reject', 'draft-rejected');
    assert.equal(store.hasOpenDraft('accept'), false);
    assert.equal(store.hasOpenDraft('reject'), false);
    assert.equal(store.delete('accept'), true);
    assert.deepEqual(store.prune(cutoff), ['reject']);
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('prunes only bounded finished tasks in the selected repository', () => {
  const store = new TaskStore(':memory:');
  for (const [id, root, status] of [
    ['done-a', '/a', 'completed'], ['done-b', '/a', 'cancelled'],
    ['unfinished', '/a', 'interrupted'], ['other-repo', '/b', 'completed'],
  ]) {
    store.create({ id, request: id, repositoryRoot: root, primaryAgent: 'alpha' });
    store.update(id, { status, activeAgent: 'alpha', step: 0 });
    store.append(id, 'checkpoint', { id });
  }
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.equal(store.prunable({ before: future, repositoryRoot: '/a' }).length, 2);
  assert.equal(store.prune({ before: future, repositoryRoot: '/a', limit: 1 }).length, 1);
  assert.equal(store.prune({ before: future, repositoryRoot: '/a' }).length, 1);
  assert.ok(store.get('unfinished'));
  assert.ok(store.get('other-repo'));
  assert.deepEqual(store.prune({ before: future, repositoryRoot: '/a' }), []);
  assert.throws(() => store.prune({ before: 'tomorrow', repositoryRoot: '/a' }), /Invalid retention cutoff/);
  assert.throws(() => store.prune({ before: future, repositoryRoot: '/a', limit: 1001 }), /Limit must be/);
  store.close();
});

test('persists queued tasks and requires an explicit claim against the original repository baseline', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-queue-'));
  const filename = join(directory, 'tasks.sqlite');
  let store;
  try {
    store = new TaskStore(filename);
    const config = { provider: 'codex', modelId: null, permission: 'read', routingMode: 'manual' };
    store.enqueueTask({ id: 'queue-a', repositoryRoot: '/repo', request: 'Inspect the project', configuration: config, baselineFingerprint: 'abc1234' });
    store.enqueueTask({ id: 'queue-b', repositoryRoot: '/repo', request: 'Add tests', configuration: config, baselineFingerprint: 'abc1234' });
    assert.deepEqual(store.listQueuedTasks('/repo').tasks.map(task => task.id), ['queue-a', 'queue-b']);
    assert.equal(store.getQueuedTask('queue-a').schemaVersion, 1);
    store.close();
    store = new TaskStore(filename);
    assert.equal(store.getQueuedTask('queue-a').configuration.permission, 'read');
    assert.throws(() => store.claimQueuedTask('queue-a', 'abc1235'), /baseline changed/);
    store.setTaskQueuePaused('/repo', true);
    assert.throws(() => store.claimQueuedTask('queue-a', 'abc1234'), /paused/);
    store.setTaskQueuePaused('/repo', false);
    const claimed = store.claimQueuedTask('queue-a', 'abc1234');
    assert.equal(claimed.status, 'starting');
    assert.throws(() => store.claimQueuedTask('queue-b', 'abc1234'), /requires reconciliation/);
    assert.throws(() => store.removeQueuedTask('queue-a'), /Only undispatched/);
    store.updateQueuedTask('queue-a', 'running');
    store.updateQueuedTask('queue-a', 'completed');
    assert.equal(store.claimQueuedTask('queue-b', 'abc1234').status, 'starting');
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('queued task reorder and removal are atomic and scoped to one repository', () => {
  const store = new TaskStore(':memory:');
  const enqueue = (id, repositoryRoot = '/repo') => store.enqueueTask({ id, repositoryRoot,
    request: `Task ${id}`, configuration: { provider: 'auto' }, baselineFingerprint: '9876543' });
  enqueue('first'); enqueue('second'); enqueue('third'); enqueue('other', '/other');
  store.reorderQueuedTask('third', 0);
  assert.deepEqual(store.listQueuedTasks('/repo').tasks.map(task => task.id), ['third', 'first', 'second']);
  assert.equal(store.removeQueuedTask('first'), true);
  assert.deepEqual(store.listQueuedTasks('/repo').tasks.map(task => task.id), ['third', 'second']);
  assert.deepEqual(store.listQueuedTasks('/other').tasks.map(task => task.id), ['other']);
  assert.throws(() => store.enqueueTask({ id: 'bad', repositoryRoot: '/repo', request: 'x', configuration: {}, baselineFingerprint: 'not-a-hash' }), /fingerprint/);
  assert.throws(() => store.enqueueTask({ id: 'bad-config', repositoryRoot: '/repo', request: 'x', configuration: null, baselineFingerprint: '9876543' }), /configuration/);
  assert.equal(store.cancelQueuedTask('second').status, 'cancelled');
  assert.equal(store.cancelQueuedTask('second'), false);
  store.close();
});

test('a claimed queue record remains blocked after reopening instead of being replayed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-queue-restart-'));
  const filename = join(directory, 'tasks.sqlite');
  let store;
  try {
    store = new TaskStore(filename);
    store.enqueueTask({ id: 'interrupted-queue', repositoryRoot: '/repo', request: 'Write a test',
      configuration: { provider: 'codex', permission: 'read-write' }, baselineFingerprint: 'abcdef0' });
    store.claimQueuedTask('interrupted-queue', 'abcdef0');
    store.close();
    store = new TaskStore(filename);
    assert.equal(store.getQueuedTask('interrupted-queue').status, 'starting');
    assert.throws(() => store.claimQueuedTask('interrupted-queue', 'abcdef0'), /no longer dispatchable/);
    assert.equal(store.updateQueuedTask('interrupted-queue', 'interrupted').status, 'interrupted');
    assert.throws(() => store.updateQueuedTask('interrupted-queue', 'starting'), /Invalid queued task state transition/);
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('queue admission is idempotent and ownership gates protect dispatch across connections', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-queue-fence-'));
  const filename = join(directory, 'tasks.sqlite'); const a = new TaskStore(filename); const b = new TaskStore(filename);
  try {
    const input = { id: 'same-request', repositoryRoot: '/repo', request: 'Inspect', configuration: { provider: 'codex' }, baselineFingerprint: 'abcdef0', policySnapshot: { version: 1 } };
    a.enqueueTask(input); b.enqueueTask(input);
    assert.equal(a.listQueuedTasks('/repo').tasks.length, 1);
    assert.throws(() => b.enqueueTask({ ...input, request: 'Different request' }), /identity conflicts/);
    a.create({ id: 'active', request: 'Existing task', repositoryRoot: '/repo', primaryAgent: 'codex' });
    assert.throws(() => b.claimQueuedTask(input.id, 'abcdef0'), /Reconcile active/);
    a.update('active', { status: 'completed', activeAgent: 'codex', step: 1 });
    a.append('active', 'draft-created');
    assert.throws(() => b.claimQueuedTask(input.id, 'abcdef0'), /pending drafts/);
    a.append('active', 'draft-rejected');
    a.claimQueuedTask(input.id, 'abcdef0');
    assert.throws(() => b.claimQueuedTask(input.id, 'abcdef0'), /no longer dispatchable/);
  } finally { a.close(); b.close(); rmSync(directory, { recursive: true, force: true }); }
});
