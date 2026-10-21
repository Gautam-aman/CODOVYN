import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRegistry, AgentFailure } from '../../agent-core/src/index.js';
import { TaskStore } from '../../storage/src/index.js';
import { TaskEngine } from '../src/index.js';

const agent = (id, run) => ({ id, capabilities: { resume: true, tools: true }, availability: async () => 'available', run });
const setup = () => {
  const store = new TaskStore(':memory:');
  store.create({ id: 'task', request: 'Repair tests', primaryAgent: 'primary', fallbackAgents: ['backup'] });
  // These historical-state fixtures explicitly represent completed process cleanup.
  store.claimExecution('task',{token:'fixture-owner-123456',pid:process.pid,host:'fixture'});
  store.releaseExecution('task','fixture-owner-123456');
  const registry = new AgentRegistry();
  return { store, registry, engine: new TaskEngine({ store, registry, snapshot: async () => ({ branch: 'feature', commit: 'abc' }) }) };
};

test('confirmed quota failure checkpoints then hands off to ordered backup', async () => {
  const { store, registry, engine } = setup();
  registry.register(agent('primary', async function* () { yield { type: 'text', text: 'started' }; throw new AgentFailure('quota', 'limit'); }));
  registry.register(agent('backup', async function* ({ handoff }) {
    assert.equal(handoff.request, 'Repair tests');
    assert.equal(handoff.snapshot.branch, 'feature');
    assert.ok(handoff.history.some((entry) => entry.kind === 'checkpoint'));
    yield { type: 'completed', text: 'fixed' };
  }));
  const result = await engine.run('task');
  assert.equal(result.status, 'completed');
  assert.equal(result.activeAgent, 'backup');
  assert.deepEqual(store.events('task').filter((e) => ['checkpoint', 'handoff'].includes(e.kind)).map((e) => e.kind), ['checkpoint', 'handoff']);
  store.close();
});

test('agent exception messages are not persisted or passed to the next agent', async () => {
  const { store, registry, engine } = setup();
  const secret = 'provider-token-should-not-appear';
  registry.register(agent('primary', async function* () { throw new AgentFailure('quota', secret); }));
  registry.register(agent('backup', async function* ({ handoff }) {
    assert.ok(!JSON.stringify(handoff.history).includes(secret));
    yield { type: 'completed' };
  }));
  assert.equal((await engine.run('task')).status, 'completed');
  assert.ok(!JSON.stringify(store.events('task')).includes(secret));
  store.close();
});

test('repository changes during an unreported agent attempt stop automatic handoff', async () => {
  const store = new TaskStore(':memory:');
  store.create({ id: 'task', request: 'Inspect', primaryAgent: 'primary', fallbackAgents: ['backup'] });
  const registry = new AgentRegistry();
  let backupCalls = 0;
  registry.register(agent('primary', async function* () { throw new AgentFailure('quota', 'limit'); }));
  registry.register(agent('backup', async function* () { backupCalls++; yield { type: 'completed' }; }));
  let snapshots = 0;
  const engine = new TaskEngine({ store, registry, snapshot: async () => ({ root: '/repo', branch: 'main',
    commit: 'abc', dirty: ++snapshots > 1, changedPaths: snapshots > 1 ? ['changed.txt'] : [] }) });
  assert.equal((await engine.run('task')).status, 'interrupted');
  assert.equal(backupCalls, 0);
  assert.ok(store.events('task').some((event) => event.kind === 'repository-changed'));
  store.close();
});

test('same-path content changes also stop automatic handoff', async () => {
  const store = new TaskStore(':memory:');
  store.create({ id: 'task', request: 'Inspect', primaryAgent: 'primary', fallbackAgents: ['backup'] });
  const registry = new AgentRegistry();
  let backupCalls = 0;
  registry.register(agent('primary', async function* () { throw new AgentFailure('quota', 'limit'); }));
  registry.register(agent('backup', async function* () { backupCalls++; yield { type: 'completed' }; }));
  let snapshots = 0;
  const engine = new TaskEngine({ store, registry, snapshot: async () => ({ root: '/repo', branch: 'main',
    commit: 'abc', dirty: true, changedPaths: ['file.txt'], workingTreeHash: String(++snapshots) }) });
  assert.equal((await engine.run('task')).status, 'interrupted');
  assert.equal(backupCalls, 0);
  store.close();
});

test('repository changes after checkpoint but before backup starts stop handoff', async () => {
  const store = new TaskStore(':memory:');
  store.create({ id: 'task', request: 'Inspect', primaryAgent: 'primary', fallbackAgents: ['backup'] });
  const registry = new AgentRegistry();
  let backupCalls = 0;
  registry.register(agent('primary', async function* () { throw new AgentFailure('quota', 'limit'); }));
  registry.register(agent('backup', async function* () { backupCalls++; yield { type: 'completed' }; }));
  let snapshots = 0;
  const engine = new TaskEngine({ store, registry, snapshot: async () => ({ root: '/repo', branch: 'main',
    commit: 'abc', dirty: true, changedPaths: ['file.txt'], workingTreeHash: ++snapshots < 3 ? 'before' : 'after' }) });
  assert.equal((await engine.run('task')).status, 'interrupted');
  assert.equal(backupCalls, 0);
  assert.equal(store.events('task').filter((event) => event.kind === 'repository-changed').length, 1);
  store.close();
});

test('unavailable primary is checkpointed before the backup starts', async () => {
  const { store, registry, engine } = setup();
  registry.register({ id: 'primary', capabilities: {}, availability: async () => { throw new Error('CLI missing'); },
    async *run() { throw new Error('Must not run'); } });
  registry.register(agent('backup', async function* ({ handoff }) {
    assert.ok(handoff.history.some((entry) => entry.kind === 'checkpoint'));
    yield { type: 'completed' };
  }));
  assert.equal((await engine.run('task')).activeAgent, 'backup');
  assert.deepEqual(store.events('task').filter((entry) => ['agent-unavailable', 'checkpoint', 'handoff'].includes(entry.kind))
    .map((entry) => entry.kind), ['agent-unavailable', 'checkpoint', 'handoff']);
  store.close();
});

test('does not repeat an unfinished tool action on fallback', async () => {
  const { store, registry, engine } = setup();
  let backupCalls = 0;
  registry.register(agent('primary', async function* () { yield { type: 'tool-start', actionId: 'write-1' }; throw new AgentFailure('quota', 'limit'); }));
  registry.register(agent('backup', async function* () { backupCalls++; yield { type: 'completed' }; }));
  assert.equal((await engine.run('task')).status, 'interrupted');
  assert.equal(backupCalls, 0);
  assert.equal(store.events('task').find((e) => e.kind === 'checkpoint').data.pendingTool, 'write-1');
  await assert.rejects(engine.run('task'), /unresolved tool action: write-1/);
  store.close();
});

test('does not repeat a completed tool action after a quota failure', async () => {
  const { store, registry, engine } = setup();
  let backupCalls = 0;
  registry.register(agent('primary', async function* () {
    yield { type: 'tool-start', actionId: 'issue-create-1' };
    yield { type: 'tool-complete', actionId: 'issue-create-1' };
    throw new AgentFailure('quota', 'limit');
  }));
  registry.register(agent('backup', async function* () { backupCalls++; yield { type: 'completed' }; }));
  assert.equal((await engine.run('task')).status, 'interrupted');
  assert.equal(backupCalls, 0);
  await assert.rejects(engine.run('task'), /requires reconciliation/);
  store.close();
});

test('a verified read-only tool may be retried by the fallback after a quota event', async () => {
  const { store, registry, engine } = setup();
  registry.register(agent('primary', async function* () {
    yield { type: 'tool-start', actionId: 'read-1', action: 'Read', safeToRetry: true };
    throw new AgentFailure('quota', 'limit');
  }));
  registry.register(agent('backup', async function* ({ handoff }) {
    assert.equal(handoff.history.find((e) => e.kind === 'checkpoint').data.pendingTool, 'read-1');
    yield { type: 'completed' };
  }));
  assert.equal((await engine.run('task')).activeAgent, 'backup');
  store.close();
});

test('parallel read actions can complete out of order without blocking a handoff', async () => {
  const { store, registry, engine } = setup();
  registry.register(agent('primary', async function* () {
    yield { type: 'tool-start', actionId: 'read-1', action: 'Read', safeToRetry: true };
    yield { type: 'tool-start', actionId: 'grep-2', action: 'Grep', safeToRetry: true };
    yield { type: 'tool-complete', actionId: 'grep-2' };
    yield { type: 'tool-complete', actionId: 'read-1' };
    throw new AgentFailure('quota', 'limit');
  }));
  registry.register(agent('backup', async function* () { yield { type: 'completed' }; }));
  assert.equal((await engine.run('task')).activeAgent, 'backup');
  assert.equal(store.events('task').find((e) => e.kind === 'checkpoint').data.pendingTool, null);
  store.close();
});

test('restart retries only verified read actions and refuses mixed write history', async () => {
  const { store, registry } = setup();
  store.update('task', { status: 'running', activeAgent: 'primary', step: 0 });
  store.append('task', 'agent-started', { agent: 'primary', repository: {} });
  store.append('task', 'agent-event', { agent: 'primary', event: {
    type: 'tool-start', actionId: 'read-1', action: 'Read', safeToRetry: true } });
  let calls = 0;
  registry.register(agent('primary', async function* () { calls++; yield { type: 'completed' }; }));
  const restarted = new TaskEngine({ store, registry });
  assert.equal((await restarted.run('task')).status, 'completed');
  assert.equal(calls, 1);
  store.close();

  const unsafe = setup();
  unsafe.store.update('task', { status: 'running', activeAgent: 'primary', step: 0 });
  unsafe.store.append('task', 'agent-started', { agent: 'primary', repository: {} });
  unsafe.store.append('task', 'agent-event', { agent: 'primary', event: {
    type: 'tool-start', actionId: 'read-1', action: 'Read', safeToRetry: true } });
  unsafe.store.append('task', 'agent-event', { agent: 'primary', event: {
    type: 'tool-start', actionId: 'write-2', action: 'Write' } });
  await assert.rejects(new TaskEngine({ store: unsafe.store, registry: unsafe.registry }).run('task'), /unresolved tool action: write-2/);
  unsafe.store.close();
});

test('interrupted read-only work cannot restart after the checkpointed repository changes', async () => {
  const { store, registry } = setup();
  store.update('task', { status: 'interrupted', activeAgent: 'primary', step: 0 });
  store.append('task', 'agent-started', { agent: 'primary', repository: { workingTreeHash: 'before' } });
  store.append('task', 'agent-event', { agent: 'primary', event: {
    type: 'tool-start', actionId: 'read-1', action: 'Read', safeToRetry: true } });
  store.append('task', 'checkpoint', { failedAgent: 'primary', repository: { workingTreeHash: 'before' } });
  let calls = 0;
  registry.register(agent('primary', async function* () { calls++; yield { type: 'completed' }; }));
  const restarted = new TaskEngine({ store, registry, snapshot: async () => ({ workingTreeHash: 'after' }) });
  assert.equal((await restarted.run('task')).status, 'interrupted');
  assert.equal(calls, 0);
  assert.ok(store.events('task').some((entry) => entry.kind === 'recovery-verification-failed'));
  store.close();
});

test('recovers a running task after a process restart when no tool is pending', async () => {
  const { store, registry } = setup();
  store.update('task', { status: 'running', activeAgent: 'primary', step: 0 });
  store.append('task', 'agent-started', { agent: 'primary', repository: {} });
  store.append('task', 'agent-event', { agent: 'primary', event: { type: 'text', text: 'partial' } });
  registry.register(agent('primary', async function* ({ handoff }) {
    assert.ok(handoff.history.some((entry) => entry.kind === 'process-recovered'));
    yield { type: 'completed', text: 'resumed' };
  }));
  registry.register(agent('backup', async function* () { yield { type: 'completed' }; }));
  const restarted = new TaskEngine({ store, registry });
  assert.equal((await restarted.run('task')).status, 'completed');
  store.close();
});

test('restart refuses a task when its repository changed after agent start', async () => {
  const { store, registry } = setup();
  store.update('task', { status: 'running', activeAgent: 'primary', step: 0 });
  store.append('task', 'agent-started', { agent: 'primary', repository: { root: '/repo', workingTreeHash: 'before' } });
  let agentCalls = 0;
  registry.register(agent('primary', async function* () { agentCalls++; yield { type: 'completed' }; }));
  registry.register(agent('backup', async function* () { agentCalls++; yield { type: 'completed' }; }));
  let workingTreeHash = 'after';
  const restarted = new TaskEngine({ store, registry, snapshot: async () => ({ root: '/repo', workingTreeHash }) });
  assert.equal((await restarted.run('task')).status, 'interrupted');
  assert.equal((await restarted.run('task')).status, 'interrupted');
  assert.equal(agentCalls, 0);
  assert.ok(store.events('task').some((entry) => entry.kind === 'recovery-verification-failed'));
  workingTreeHash = 'before';
  assert.equal((await restarted.run('task')).status, 'completed');
  assert.equal(agentCalls, 1);
  store.close();
});

test('restart refuses a legacy running task without a recorded baseline', async () => {
  const { store, registry } = setup();
  store.update('task', { status: 'running', activeAgent: 'primary', step: 0 });
  registry.register(agent('primary', async function* () { throw new Error('Must not run'); }));
  const restarted = new TaskEngine({ store, registry });
  assert.equal((await restarted.run('task')).status, 'interrupted');
  store.close();
});

test('authentication failures stop automatic switching', async () => {
  const { store, registry, engine } = setup();
  let backupCalls = 0;
  registry.register(agent('primary', async function* () { throw new AgentFailure('authentication', 'login required'); }));
  registry.register(agent('backup', async function* () { backupCalls++; yield { type: 'completed' }; }));
  assert.equal((await engine.run('task')).status, 'interrupted');
  assert.equal(backupCalls, 0);
  store.close();
});

test('cancellation records a terminal state and never starts a fallback', async () => {
  const { store, registry, engine } = setup();
  const controller = new AbortController();
  registry.register(agent('primary', async function* () {
    yield { type: 'text', text: 'started' };
    controller.abort();
    yield { type: 'text', text: 'ignored' };
  }));
  registry.register(agent('backup', async function* () { throw new Error('Must not run'); }));
  const result = await engine.run('task', { signal: controller.signal });
  assert.equal(result.status, 'cancelled');
  assert.equal(store.events('task').at(-1).kind, 'task-cancelled');
  store.close();
});

test('emits progress only after the corresponding event is durable', async () => {
  const { store, registry } = setup();
  const notified = [];
  const engine = new TaskEngine({ store, registry, onEvent: (event) => {
    assert.equal(store.events('task').at(-1).seq, event.seq);
    notified.push(event.kind);
    throw new Error('Renderer disconnected');
  } });
  registry.register(agent('primary', async function* () { yield { type: 'completed', text: 'done' }; }));
  registry.register(agent('backup', async function* () { yield { type: 'completed' }; }));
  assert.equal((await engine.run('task')).status, 'completed');
  assert.deepEqual(notified, ['execution-owned', 'agent-started', 'handoff-prepared', 'agent-event', 'task-completed']);
  store.close();
});

test('failed repository verification interrupts the task without switching agents', async () => {
  const { store, registry } = setup();
  let backupCalls = 0;
  registry.register(agent('primary', async function* () { yield { type: 'completed' }; }));
  registry.register(agent('backup', async function* () { backupCalls++; yield { type: 'completed' }; }));
  const engine = new TaskEngine({ store, registry, snapshot: async () => { throw new Error('Git unavailable'); } });
  assert.equal((await engine.run('task')).status, 'interrupted');
  assert.equal(backupCalls, 0);
  assert.equal(store.events('task').find((entry) => entry.kind === 'checkpoint').data.repository.verified, false);
  store.close();
});


test('portable context is durable before any provider receives the request', async () => {
  const {store,registry,engine}=setup();
  registry.register(agent('primary',async function*(){
    const entry=store.events('task').findLast(e=>e.kind==='handoff-prepared');
    assert.equal(entry.data.packet.request,'Repair tests');
    assert.equal(entry.data.packet.schemaVersion,1);
    assert.equal(entry.data.packet.repository.commit,'abc');
    yield {type:'completed'};
  }));
  assert.equal((await engine.run('task')).status,'completed');store.close();
});
