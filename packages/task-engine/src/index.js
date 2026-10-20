import { AgentFailure } from '../../agent-core/src/index.js';

function repositoryChanged(before, after) {
  return ['root', 'branch', 'commit', 'dirty', 'workingTreeHash'].some((field) => before?.[field] !== after?.[field]) ||
    JSON.stringify(before?.changedPaths ?? []) !== JSON.stringify(after?.changedPaths ?? []);
}

/** Executes a stored task, saving every observable event before advancing. */
export class TaskEngine {
  #running = new Set();

  constructor({ registry, store, snapshot = async () => ({}), onEvent = () => {} }) {
    this.registry = registry;
    this.store = store;
    this.snapshot = snapshot;
    this.onEvent = onEvent;
  }

  #record(taskId, kind, data = {}) {
    const seq = this.store.append(taskId, kind, data);
    try { this.onEvent({ seq, kind, data }); }
    catch { /* Rendering must never change task execution after persistence. */ }
    return seq;
  }

  async #checkpoint(task, agent, pendingTool, usedTool, baseline) {
    let repository;
    let verified = true;
    try { repository = await this.snapshot(); }
    catch {
      repository = { verified: false };
      verified = false;
      this.#record(task.id, 'snapshot-failed', { agent });
    }
    this.#record(task.id, 'checkpoint', { failedAgent: agent, step: task.step, pendingTool, usedTool, repository });
    if (verified && baseline && repositoryChanged(baseline, repository)) {
      this.#record(task.id, 'repository-changed', { agent });
      return null;
    }
    return verified ? repository : null;
  }

  async run(id, { signal } = {}) {
    if (this.#running.has(id)) throw new Error(`Task already running: ${id}`);
    const task = this.store.get(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    if (!['pending', 'running', 'interrupted'].includes(task.status)) throw new Error(`Cannot run task in ${task.status} state`);
    if (task.status !== 'pending') {
      const history = this.store.events(id);
      let pendingTool = null;
      let usedTool = false;
      for (const entry of history) {
        if (entry.kind !== 'agent-event') continue;
        if (entry.data.event.type === 'tool-start') { pendingTool = entry.data.event.actionId; usedTool = true; }
        if (entry.data.event.type === 'tool-complete' && entry.data.event.actionId === pendingTool) pendingTool = null;
      }
      if (usedTool) {
        if (task.status === 'running') this.store.update(id, { status: 'interrupted', activeAgent: task.activeAgent, step: task.step });
        throw new Error(pendingTool ? `Task has unresolved tool action: ${pendingTool}` : 'Task used tools and requires reconciliation before retry');
      }
      if (task.status === 'running') {
        this.#record(id, 'process-recovered', { agent: task.activeAgent });
        this.store.update(id, { status: 'interrupted', activeAgent: task.activeAgent, step: task.step });
      }
    }
    this.#running.add(id);
    try { return await this.#run(task, signal); }
    finally { this.#running.delete(id); }
  }

  async #run(task, signal) {
    const candidates = [...new Set([task.activeAgent || task.primaryAgent, ...task.fallbackAgents])];
    let previous = null;
    let expectedSnapshot = null;
    for (const id of candidates) {
      if (signal?.aborted) return this.#cancel(task, id);
      const agent = this.registry.require(id);
      let availability;
      try { availability = await agent.availability(); }
      catch { availability = 'unavailable'; }
      if (availability !== 'available') {
        this.#record(task.id, 'agent-unavailable', { agent: id, availability });
        expectedSnapshot = await this.#checkpoint(task, id, null, false);
        if (!expectedSnapshot) {
          return this.store.update(task.id, { status: 'interrupted', activeAgent: id, step: task.step });
        }
        previous = id;
        continue;
      }
      task = this.store.update(task.id, { status: 'running', activeAgent: id, step: task.step });
      let pendingTool = null;
      let usedTool = false;
      let completed = false;
      let baseline;
      try {
        baseline = await this.snapshot();
        if (expectedSnapshot && repositoryChanged(expectedSnapshot, baseline)) {
          this.#record(task.id, 'repository-changed', { agent: id });
          return this.store.update(task.id, { status: 'interrupted', activeAgent: previous, step: task.step });
        }
        if (previous) this.#record(task.id, 'handoff', { from: previous, to: id });
        this.#record(task.id, 'agent-started', { agent: id });
        const handoff = { request: task.request, step: task.step, history: this.store.events(task.id), snapshot: baseline };
        for await (const event of agent.run({ taskId: task.id, handoff, signal })) {
          if (signal?.aborted) return this.#cancel(task, id);
          if (!event || typeof event.type !== 'string') throw new Error('Malformed agent event');
          if (event.type === 'tool-start') {
            if (pendingTool) throw new Error('Concurrent tool actions are not supported');
            if (typeof event.actionId !== 'string' || !event.actionId) throw new Error('Tool action requires an id');
            pendingTool = event.actionId;
            usedTool = true;
          } else if (event.type === 'tool-complete') {
            if (event.actionId !== pendingTool) throw new Error('Tool completion does not match active action');
            pendingTool = null;
          } else if (event.type === 'completed') {
            if (pendingTool) throw new Error('Cannot complete with a pending tool action');
            completed = true;
          }
          this.#record(task.id, 'agent-event', { agent: id, event });
          if (completed) break;
        }
        if (!completed) throw new AgentFailure('temporary', 'Agent stream ended without completion');
        task = this.store.update(task.id, { status: 'completed', activeAgent: id, step: task.step + 1 });
        this.#record(task.id, 'task-completed', { agent: id });
        return task;
      } catch (error) {
        if (signal?.aborted) return this.#cancel(task, id);
        const kind = error instanceof AgentFailure ? error.kind : 'fatal';
        this.#record(task.id, 'agent-failed', { agent: id, kind });
        expectedSnapshot = await this.#checkpoint(task, id, pendingTool, usedTool, baseline);
        if (!expectedSnapshot || usedTool || !['quota', 'temporary'].includes(kind)) {
          return this.store.update(task.id, { status: 'interrupted', activeAgent: id, step: task.step });
        }
        previous = id;
      }
    }
    this.#record(task.id, 'fallback-exhausted');
    return this.store.update(task.id, { status: 'interrupted', activeAgent: previous, step: task.step });
  }

  #cancel(task, agent) {
    this.#record(task.id, 'task-cancelled', { agent });
    return this.store.update(task.id, { status: 'cancelled', activeAgent: agent, step: task.step });
  }
}
