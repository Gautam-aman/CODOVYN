import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRegistry, AgentFailure } from '../../agent-core/src/index.js';
import { TaskStore } from '../../storage/src/index.js';
import { TaskEngine } from '../src/index.js';

const agent = (id, run) => ({ id, capabilities: { resume: true, tools: true }, availability: async () => 'available', run });
const setup = () => {
  const store = new TaskStore(':memory:');
  store.create({ id: 'task', request: 'Repair tests', primaryAgent: 'primary', fallbackAgents: ['backup'] });
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

test('recovers a running task after a process restart when no tool is pending', async () => {
  const { store, registry } = setup();
  store.update('task', { status: 'running', activeAgent: 'primary', step: 0 });
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
  assert.deepEqual(notified, ['agent-started', 'agent-event', 'task-completed']);
  store.close();
});
