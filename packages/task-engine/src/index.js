import { AgentFailure } from '../../agent-core/src/index.js';

/** Executes a stored task, saving every observable event before advancing. */
export class TaskEngine {
  #running = new Set();

  constructor({ registry, store, snapshot = async () => ({}) }) {
    this.registry = registry;
    this.store = store;
    this.snapshot = snapshot;
  }

  async run(id, { signal } = {}) {
    if (this.#running.has(id)) throw new Error(`Task already running: ${id}`);
    const task = this.store.get(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    if (!['pending', 'running', 'interrupted'].includes(task.status)) throw new Error(`Cannot run task in ${task.status} state`);
    if (task.status !== 'pending') {
      const history = this.store.events(id);
      let pendingTool = null;
      for (const entry of history) {
        if (entry.kind !== 'agent-event') continue;
        if (entry.data.event.type === 'tool-start') pendingTool = entry.data.event.actionId;
        if (entry.data.event.type === 'tool-complete' && entry.data.event.actionId === pendingTool) pendingTool = null;
      }
      if (pendingTool) {
        if (task.status === 'running') this.store.update(id, { status: 'interrupted', activeAgent: task.activeAgent, step: task.step });
        throw new Error(`Task has unresolved tool action: ${pendingTool}`);
      }
      if (task.status === 'running') {
        this.store.append(id, 'process-recovered', { agent: task.activeAgent });
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
    for (const id of candidates) {
      if (signal?.aborted) return this.#cancel(task, id);
      const agent = this.registry.require(id);
      const availability = await agent.availability();
      if (availability !== 'available') {
        this.store.append(task.id, 'agent-unavailable', { agent: id, availability });
        previous = id;
        continue;
      }
      if (previous) this.store.append(task.id, 'handoff', { from: previous, to: id });
      task = this.store.update(task.id, { status: 'running', activeAgent: id, step: task.step });
      this.store.append(task.id, 'agent-started', { agent: id });
      let pendingTool = null;
      let completed = false;
      try {
        const handoff = { request: task.request, step: task.step, history: this.store.events(task.id), snapshot: await this.snapshot() };
        for await (const event of agent.run({ taskId: task.id, handoff, signal })) {
          if (signal?.aborted) return this.#cancel(task, id);
          if (!event || typeof event.type !== 'string') throw new Error('Malformed agent event');
          if (event.type === 'tool-start') {
            if (pendingTool) throw new Error('Concurrent tool actions are not supported');
            if (typeof event.actionId !== 'string' || !event.actionId) throw new Error('Tool action requires an id');
            pendingTool = event.actionId;
          } else if (event.type === 'tool-complete') {
            if (event.actionId !== pendingTool) throw new Error('Tool completion does not match active action');
            pendingTool = null;
          } else if (event.type === 'completed') {
            if (pendingTool) throw new Error('Cannot complete with a pending tool action');
            completed = true;
          }
          this.store.append(task.id, 'agent-event', { agent: id, event });
          if (completed) break;
        }
        if (!completed) throw new AgentFailure('temporary', 'Agent stream ended without completion');
        task = this.store.update(task.id, { status: 'completed', activeAgent: id, step: task.step + 1 });
        this.store.append(task.id, 'task-completed', { agent: id });
        return task;
      } catch (error) {
        if (signal?.aborted) return this.#cancel(task, id);
        const kind = error instanceof AgentFailure ? error.kind : 'fatal';
        this.store.append(task.id, 'agent-failed', { agent: id, kind, message: error.message });
        const checkpoint = { failedAgent: id, step: task.step, pendingTool, repository: await this.snapshot() };
        this.store.append(task.id, 'checkpoint', checkpoint);
        if (pendingTool || !['quota', 'temporary'].includes(kind)) {
          return this.store.update(task.id, { status: 'interrupted', activeAgent: id, step: task.step });
        }
        previous = id;
      }
    }
    this.store.append(task.id, 'fallback-exhausted');
    return this.store.update(task.id, { status: 'interrupted', activeAgent: previous, step: task.step });
  }

  #cancel(task, agent) {
    this.store.append(task.id, 'task-cancelled', { agent });
    return this.store.update(task.id, { status: 'cancelled', activeAgent: agent, step: task.step });
  }
}
