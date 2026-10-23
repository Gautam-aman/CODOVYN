import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { restorationDecision } from './restoration.js';
import { recoveryFingerprint } from './recovery.js';
import { createHandoffPacket } from '../../agent-core/src/handoff.js';
import { AgentFailure } from '../../agent-core/src/index.js';

function repositoryChanged(before, after) {
  return ['root', 'branch', 'commit', 'dirty', 'workingTreeHash'].some((field) => before?.[field] !== after?.[field]) ||
    JSON.stringify(before?.changedPaths ?? []) !== JSON.stringify(after?.changedPaths ?? []);
}

function pendingToolIds(tools) {
  const ids = [...tools.keys()];
  return ids.length === 1 ? ids[0] : ids.length ? ids : null;
}

/** Executes a stored task, saving every observable event before advancing. */
export class TaskEngine {
  #running = new Set();

  constructor({ registry, store, snapshot = async () => ({}), onEvent = () => {}, restoration = {enabled:false}, now = () => Date.now() }) {
    this.registry = registry;
    this.store = store;
    this.snapshot = snapshot;
    this.onEvent = onEvent;
    this.restoration=restoration;this.now=now;
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

  async run(id, options = {}) {
    const previousTask=this.store.get(id);
    if(this.store.events(id).some(event=>event.kind==='routing-decision')&&!this.store.hasRouteBudget(id))throw new Error('Routed task requires an active budget reservation');
    if (previousTask && previousTask.status !== 'pending' && !this.store.executionLease(id)?.releasedAt) {
      throw new Error('Task requires verified process reconciliation before execution');
    }
    const token = randomUUID();
    this.store.claimExecution(id, { token, pid: process.pid, host: hostname() });
    const start = this.#record(id, 'execution-owned', { token });
    try { return await this.#runOwned(id, options); }
    finally {
      const events = this.store.events(id).filter(event => event.seq > start);
      const process = events.findLast(event => ['provider-starting', 'provider-spawned', 'provider-stopped'].includes(event.kind));
      // Failed cleanup or a registration gap must retain ownership for reconciliation.
      if (!process || process.kind === 'provider-stopped') this.store.releaseExecution(id, token);
    }
  }

  async #runOwned(id, { signal, continuation } = {}) {
    if (this.#running.has(id)) throw new Error(`Task already running: ${id}`);
    const task = this.store.get(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    if (!['pending', 'running', 'interrupted'].includes(task.status)) throw new Error(`Cannot run task in ${task.status} state`);
    let approvedRepository;
    if (continuation) {
      const records=this.store.events(id);
      const reconciled=records.findLast(event=>event.kind==='draft-reconciled');
      if(records.findLast(event=>event.kind==='continuation-approved')?.seq>=(reconciled?.seq??0))throw new Error('Reconcile again before another continuation');
      if (task.status!=='interrupted' || reconciled?.data.decision!=='preserve' ||
          reconciled.data.fingerprint!==continuation.fingerprint || typeof continuation.agent!=='string') throw new Error('Explicit reconciled continuation is required');
      if(this.registry.require(continuation.agent).capabilities.shell!==false)throw new Error('Recovered continuation requires a file-only adapter; command replay is not authorized');
      approvedRepository=await this.snapshot();
      if (recoveryFingerprint(approvedRepository)!==continuation.fingerprint) throw new Error('Draft changed since reconciliation');
      this.#record(id,'continuation-approved',{agent:continuation.agent,fingerprint:continuation.fingerprint,
        policy:'Inspect current files; never replay unresolved writes or commands. Outcomes remain unknown.'});
    }
    if (task.status !== 'pending' && !continuation) {
      const history = this.store.events(id);
      if (task.status === 'interrupted') {
        const checkpoint = history.findLast((entry) => entry.kind === 'checkpoint');
        if (checkpoint?.data.repository && checkpoint.data.repository.verified !== false) {
          let current;
          try { current = await this.snapshot(); }
          catch { /* A failed verification must not restart an agent. */ }
          if (!current || repositoryChanged(checkpoint.data.repository, current)) {
            this.#record(id, 'recovery-verification-failed', { agent: task.activeAgent });
            return task;
          }
        }
      }
      if (task.status === 'interrupted' && history.some((entry) =>
        ['repository-changed', 'recovery-verification-failed'].includes(entry.kind))) {
        const started = history.findLast((entry) => entry.kind === 'agent-started');
        let current;
        try { current = await this.snapshot(); }
        catch { /* An unreadable repository cannot be reconciled. */ }
        if (!started?.data.repository || !current || repositoryChanged(started.data.repository, current)) return task;
      }
      const pendingTools = new Map();
      let usedUnsafeTool = false;
      for (const entry of history) {
        if (entry.kind !== 'agent-event') continue;
        const event = entry.data.event;
        if (event.type === 'tool-start') {
          pendingTools.set(event.actionId, event.safeToRetry === true);
          if (event.safeToRetry !== true) usedUnsafeTool = true;
        }
        if (event.type === 'tool-complete') pendingTools.delete(event.actionId);
      }
      if (usedUnsafeTool) {
        if (task.status === 'running') this.store.update(id, { status: 'interrupted', activeAgent: task.activeAgent, step: task.step });
        const unsafePending = [...pendingTools].find(([, safe]) => !safe)?.[0];
        throw new Error(unsafePending ? `Task has unresolved tool action: ${unsafePending}` : 'Task used tools and requires reconciliation before retry');
      }
      if (task.status === 'running') {
        const started = history.findLast((entry) => entry.kind === 'agent-started');
        let current;
        try { current = await this.snapshot(); }
        catch { /* A failed verification must not restart an agent. */ }
        if (!started?.data.repository || !current || repositoryChanged(started.data.repository, current)) {
          this.#record(id, 'recovery-verification-failed', { agent: task.activeAgent });
          return this.store.update(id, { status: 'interrupted', activeAgent: task.activeAgent, step: task.step });
        }
        this.#record(id, 'process-recovered', { agent: task.activeAgent });
        this.store.update(id, { status: 'interrupted', activeAgent: task.activeAgent, step: task.step });
      }
    }
    this.#running.add(id);
    try { return await this.#run(task, signal, { agent:continuation?.agent, repository:approvedRepository }); }
    finally { this.#running.delete(id); }
  }

  async #run(task, signal, continuation = {}) {
    let candidates = continuation.agent ? [continuation.agent] : [...new Set([task.activeAgent || task.primaryAgent, ...task.fallbackAgents])];
    let previous = null;
    let expectedSnapshot = continuation.repository || null;
    if(!continuation.agent && task.activeAgent && task.activeAgent!==task.primaryAgent && this.restoration.enabled) {
      const history=this.store.events(task.id),checkpoint=history.findLast(event=>event.kind==='checkpoint');
      const failure=history.findLast(event=>event.kind==='agent-failed'&&event.data.agent===task.primaryAgent);
      const switched=history.findLast(event=>event.kind==='handoff');
      let current;try {current=await this.snapshot();}catch { /* No verified boundary. */ }
      const pending=createHandoffPacket({request:task.request,history}).actions.some(action=>action.state==='unresolved');
      const evidence=this.store.providerStatus(task.primaryAgent,task.repositoryRoot);
      const safe=!pending&&!!current&&!!checkpoint?.data.repository&&!checkpoint.data.pendingTool&&
        !history.some(event=>event.kind==='agent-event'&&event.data.event.type==='tool-start'&&event.data.event.safeToRetry!==true)&&
        !repositoryChanged(checkpoint.data.repository,current);
      const decision=restorationDecision({...this.restoration,primary:task.primaryAgent,current:task.activeAgent,safe,
        evidence:evidence&&evidence.seq>(failure?.seq??Infinity)?evidence:null,failedAt:failure?.createdAt,switchedAt:switched?.createdAt,now:this.now()});
      this.#record(task.id,'restoration-decision',decision);
      if(decision.restore) {candidates=[task.primaryAgent,...candidates.filter(id=>id!==task.primaryAgent)];expectedSnapshot=current;
        this.#record(task.id,'primary-restored',{from:task.activeAgent,to:task.primaryAgent,reason:decision.reason});}
    }
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
      const pendingTools = new Map();
      let usedUnsafeTool = false;
      let completed = false;
      let baseline;
      try {
        baseline = await this.snapshot();
        if (expectedSnapshot && repositoryChanged(expectedSnapshot, baseline)) {
          this.#record(task.id, 'repository-changed', { agent: id });
          return this.store.update(task.id, { status: 'interrupted', activeAgent: previous, step: task.step });
        }
        if (previous) this.#record(task.id, 'handoff', { from: previous, to: id });
        this.#record(task.id, 'agent-started', { agent: id, repository: baseline });
        const planning = this.store.events(task.id).findLast(event => event.kind === 'task-configuration')?.data.intent === 'plan';
        const handoff = { request: planning ? `${task.request}\n\nCODOVYN task mode: Plan. Produce an implementation plan and verification steps only. Do not modify files or execute write-capable actions.` : task.request, step: task.step, history: this.store.events(task.id), snapshot: baseline };
        this.#record(task.id, 'handoff-prepared', { agent: id, packet: createHandoffPacket(handoff) });
        for await (const event of agent.run({ taskId: task.id, handoff, signal, execution: {
          starting: () => this.#record(task.id, 'provider-starting', { agent: id }),
          spawned: ({ pid, group }) => {
            if (!Number.isSafeInteger(pid) || pid < 1 || typeof group !== 'boolean') throw new Error('Invalid provider process');
            this.#record(task.id, 'provider-spawned', { agent: id, pid, group });
          },
          stopped: () => this.#record(task.id, 'provider-stopped', { agent: id }),
        } })) {
          if (signal?.aborted) return this.#cancel(task, id);
          if (!event || typeof event.type !== 'string') throw new Error('Malformed agent event');
          if (event.type === 'tool-start') {
            if (typeof event.actionId !== 'string' || !event.actionId) throw new Error('Tool action requires an id');
            if (pendingTools.has(event.actionId)) throw new Error('Duplicate tool action id');
            pendingTools.set(event.actionId, event.safeToRetry === true);
            if (event.safeToRetry !== true) usedUnsafeTool = true;
          } else if (event.type === 'tool-complete') {
            if (!pendingTools.has(event.actionId)) throw new Error('Tool completion does not match an active action');
            pendingTools.delete(event.actionId);
          } else if (event.type === 'completed') {
            if (pendingTools.size) throw new Error('Cannot complete with a pending tool action');
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
        expectedSnapshot = await this.#checkpoint(task, id, pendingToolIds(pendingTools), usedUnsafeTool, baseline);
        if (!expectedSnapshot || usedUnsafeTool || !['quota', 'temporary'].includes(kind)) {
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
