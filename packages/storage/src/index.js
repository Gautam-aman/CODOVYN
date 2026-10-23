import { microUsd, budgetScope } from './budget.js';
import { chmodSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const taskIdPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const validId = (id) => {
  if (typeof id !== 'string' || !taskIdPattern.test(id)) throw new TypeError('Invalid task id');
  return id;
};

/** Durable task journal with token-fenced execution ownership across connections. */
export class TaskStore {
  #db;

  constructor(filename) {
    if (filename !== ':memory:') {
      const directory = dirname(filename);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (process.platform !== 'win32' && (statSync(directory).mode & 0o077)) {
        throw new Error('Task database directory must be private (mode 0700)');
      }
    }
    this.#db = new DatabaseSync(filename);
    if (filename !== ':memory:' && process.platform !== 'win32') chmodSync(filename, 0o600);
    this.#db.exec('PRAGMA journal_mode = WAL');
    this.#db.exec('PRAGMA foreign_keys = ON');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        request TEXT NOT NULL,
        repository_root TEXT,
        primary_agent TEXT NOT NULL,
        fallback_agents TEXT NOT NULL,
        active_agent TEXT,
        status TEXT NOT NULL,
        step INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id),
        kind TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS routing_reservations (
        task_id TEXT PRIMARY KEY,
        session TEXT NOT NULL,
        month TEXT NOT NULL,
        amount_microusd INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS reservations_by_session ON routing_reservations(session);
      CREATE INDEX IF NOT EXISTS reservations_by_month ON routing_reservations(month);
      CREATE TABLE IF NOT EXISTS execution_leases (
        task_id TEXT PRIMARY KEY REFERENCES tasks(id),
        token TEXT NOT NULL,
        owner TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        released_at TEXT
      );
      CREATE TABLE IF NOT EXISTS queued_tasks (
        id TEXT PRIMARY KEY,
        repository_root TEXT NOT NULL,
        request TEXT NOT NULL,
        configuration TEXT NOT NULL,
        baseline_fingerprint TEXT NOT NULL,
        position INTEGER NOT NULL,
        status TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS queued_tasks_order ON queued_tasks(repository_root, status, position);
      CREATE TABLE IF NOT EXISTS task_queue_settings (
        repository_root TEXT PRIMARY KEY,
        paused INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS events_by_task ON events(task_id, seq);
    `);
    if (!this.#db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'repository_root')) {
      this.#db.exec('ALTER TABLE tasks ADD COLUMN repository_root TEXT');
    }
    if (!this.#db.prepare('PRAGMA table_info(queued_tasks)').all().some(column => column.name === 'policy_snapshot')) {
      this.#db.exec('ALTER TABLE queued_tasks ADD COLUMN policy_snapshot TEXT');
    }
  }

  create({ id, request, repositoryRoot = null, primaryAgent, fallbackAgents = [] }) {
    validId(id);
    if (typeof request !== 'string' || !request.trim()) throw new TypeError('Task request is required');
    if (typeof primaryAgent !== 'string' || !primaryAgent) throw new TypeError('Primary agent is required');
    if (repositoryRoot !== null && (typeof repositoryRoot !== 'string' || !repositoryRoot)) throw new TypeError('Invalid repository root');
    if (!Array.isArray(fallbackAgents) || fallbackAgents.some((value) => typeof value !== 'string')) throw new TypeError('Invalid fallback agents');
    const now = new Date().toISOString();
    this.#db.prepare('INSERT INTO tasks (id, request, repository_root, primary_agent, fallback_agents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, request, repositoryRoot, primaryAgent, JSON.stringify(fallbackAgents), 'pending', now, now);
    return this.get(id);
  }

  get(id) {
    const row = this.#db.prepare('SELECT * FROM tasks WHERE id = ?').get(validId(id));
    return row ? { id: row.id, request: row.request, repositoryRoot: row.repository_root, primaryAgent: row.primary_agent,
      fallbackAgents: JSON.parse(row.fallback_agents), activeAgent: row.active_agent,
      status: row.status, step: row.step, createdAt: row.created_at, updatedAt: row.updated_at } : undefined;
  }

  update(id, { status, activeAgent, step }) {
    if (!['pending', 'running', 'interrupted', 'completed', 'failed', 'cancelled'].includes(status)) throw new TypeError('Invalid task status');
    if (activeAgent !== null && typeof activeAgent !== 'string') throw new TypeError('Invalid active agent');
    if (!Number.isSafeInteger(step) || step < 0) throw new TypeError('Invalid step');
    const result = this.#db.prepare('UPDATE tasks SET status = ?, active_agent = ?, step = ?, updated_at = ? WHERE id = ?')
      .run(status, activeAgent, step, new Date().toISOString(), validId(id));
    if (result.changes !== 1) throw new Error(`Unknown task: ${id}`);
    return this.get(id);
  }

  append(id, kind, data = {}) {
    if (!this.get(id)) throw new Error(`Unknown task: ${id}`);
    if (typeof kind !== 'string' || !/^[a-z][a-z-]*$/.test(kind)) throw new TypeError('Invalid event kind');
    const result = this.#db.prepare('INSERT INTO events (task_id, kind, data, created_at) VALUES (?, ?, ?, ?)')
      .run(id, kind, JSON.stringify(data), new Date().toISOString());
    return Number(result.lastInsertRowid);
  }

  events(id) {
    return this.#db.prepare('SELECT seq, kind, data, created_at FROM events WHERE task_id = ? ORDER BY seq')
      .all(validId(id)).map((row) => ({ seq: row.seq, kind: row.kind, data: JSON.parse(row.data), createdAt: row.created_at }));
  }

  list({ limit = 25, repositoryRoot } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Limit must be between 1 and 100');
    if (repositoryRoot !== undefined && (typeof repositoryRoot !== 'string' || !repositoryRoot)) throw new TypeError('Invalid repository root');
    const statement = repositoryRoot === undefined
      ? this.#db.prepare('SELECT id FROM tasks ORDER BY updated_at DESC, id DESC LIMIT ?')
      : this.#db.prepare('SELECT id FROM tasks WHERE repository_root = ? ORDER BY updated_at DESC, id DESC LIMIT ?');
    const rows = repositoryRoot === undefined ? statement.all(limit) : statement.all(repositoryRoot, limit);
    return rows.map(({ id }) => this.get(id));
  }

  /** Atomic ownership: elapsed time never grants another executor access. */
  claimExecution(id, { token, pid, host, kind = 'execution' }) {
    validId(id);
    if (typeof token !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(token) ||
        !['execution','recovery'].includes(kind) || !Number.isSafeInteger(pid) || pid < 1 || typeof host !== 'string' || !host || host.length > 256) {
      throw new TypeError('Invalid execution owner');
    }
    if (!this.get(id)) throw new Error('Unknown task');
    const result = this.#db.prepare(`INSERT INTO execution_leases VALUES (?, ?, ?, ?, NULL)
      ON CONFLICT(task_id) DO UPDATE SET token=excluded.token, owner=excluded.owner,
      acquired_at=excluded.acquired_at, released_at=NULL WHERE execution_leases.released_at IS NOT NULL`)
      .run(id, token, JSON.stringify({ pid, host, kind }), new Date().toISOString());
    if (result.changes !== 1) throw new Error('Task has an unreconciled execution owner');
    return this.executionLease(id);
  }

  executionLease(id) {
    const row = this.#db.prepare('SELECT * FROM execution_leases WHERE task_id = ?').get(validId(id));
    return row ? { token: row.token, owner: JSON.parse(row.owner), acquiredAt: row.acquired_at,
      releasedAt: row.released_at } : null;
  }

  releaseExecution(id, token) {
    const result = this.#db.prepare(`UPDATE execution_leases SET released_at = ?
      WHERE task_id = ? AND token = ? AND released_at IS NULL`)
      .run(new Date().toISOString(), validId(id), token);
    if (result.changes !== 1) throw new Error('Execution ownership changed');
  }

  routeBudgetTotals(session, now = new Date()) {
    const scope=budgetScope(session,now);
    const totals=column=>{
      const row=this.#db.prepare(`SELECT COALESCE(SUM(amount_microusd),0) AS amount,
        COUNT(*)-COUNT(amount_microusd) AS unknown FROM routing_reservations WHERE ${column}=?`).get(scope[column]);
      if(!Number.isSafeInteger(row.amount)||!Number.isSafeInteger(row.unknown))throw new Error('Budget ledger exceeds safe accounting bounds');
      return {estimatedUsd:row.amount/1000000,unknownRequests:row.unknown};
    };
    return {session:totals('session'),month:totals('month'),monthUtc:scope.month};
  }

  /** Serialize admission across connections. Never automatically refund a cancelled/crashed request. */
  reserveRouteBudget(id, {session, estimatedUsd, budget = {}, now = new Date()}) {
    validId(id);const scope=budgetScope(session,now);
    const amount=estimatedUsd===null?null:microUsd(estimatedUsd);
    const keys=['taskUsd','sessionUsd','monthUsd','sessionSpentUsd','monthSpentUsd'];
    if(!budget||typeof budget!=='object'||Array.isArray(budget)||Object.keys(budget).some(key=>!keys.includes(key)))throw new TypeError('Invalid reservation budget');
    for(const value of Object.values(budget))if(value!==null&&value!==undefined)microUsd(value);
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      if(this.get(id)?.status!=='pending')throw new Error('Budget reservation requires a pending task');
      if(this.#db.prepare('SELECT 1 FROM routing_reservations WHERE task_id=?').get(id))throw new Error('Task budget already reserved');
      const totals=this.routeBudgetTotals(session,now);
      for(const [limitKey,spentKey,window] of [['taskUsd',null,null],['sessionUsd','sessionSpentUsd','session'],['monthUsd','monthSpentUsd','month']]) {
        const limit=budget[limitKey];if(limit===undefined||limit===null)continue;
        const spent=spentKey?budget[spentKey]:0;
        if(amount===null||spent===undefined||spent===null||(window&&totals[window].unknownRequests))throw new Error(`Budget unobservable: ${limitKey}`);
        const used=window?microUsd(totals[window].estimatedUsd):0;
        if(amount+used+microUsd(spent)>microUsd(limit,Math.floor))throw new Error(`Budget reservation exceeded: ${limitKey}`);
      }
      this.#db.prepare('INSERT INTO routing_reservations VALUES (?,?,?,?,?)')
        .run(id,scope.session,scope.month,amount,now.toISOString());
      this.#db.exec('COMMIT');return this.routeBudgetTotals(session,now);
    } catch(error){this.#db.exec('ROLLBACK');throw error;}
  }

  hasRouteBudget(id) {
    return !!this.#db.prepare('SELECT 1 FROM routing_reservations WHERE task_id=?').get(validId(id));
  }

  voidUnstartedRoute(id) {
    validId(id);this.#db.exec('BEGIN IMMEDIATE');
    try {
      if(this.get(id)?.status!=='pending'||this.executionLease(id)||this.events(id).some(event=>['agent-started','provider-starting'].includes(event.kind))) {
        throw new Error('Cannot refund a request that may have started');
      }
      this.#db.prepare('DELETE FROM routing_reservations WHERE task_id=?').run(id);
      this.append(id,'budget-voided',{reason:'Preparation failed before any execution owner or provider launch'});
      this.update(id,{status:'failed',activeAgent:null,step:0});this.#db.exec('COMMIT');
    }catch(error){this.#db.exec('ROLLBACK');throw error;}
  }

  providerStatus(agent, repositoryRoot) {
    const row=this.#db.prepare(`SELECT events.kind,events.created_at,events.seq FROM events
      JOIN tasks ON tasks.id=events.task_id WHERE tasks.repository_root=?
      AND events.kind IN ('agent-failed','task-completed') AND json_extract(events.data,'$.agent')=?
      ORDER BY events.seq DESC LIMIT 1`).get(repositoryRoot,agent);
    return row?.kind==='task-completed'?{agent,source:'successful-task',observedAt:row.created_at,seq:row.seq}:null;
  }

  listInterrupted() {
    return this.#db.prepare("SELECT id FROM tasks WHERE status IN ('running', 'interrupted') ORDER BY updated_at")
      .all().map(({ id }) => this.get(id));
  }

  /** Persist a task for explicit, serial dispatch after its repository baseline is revalidated. */
  enqueueTask({ id, repositoryRoot, request, configuration, baselineFingerprint, policySnapshot = null }) {
    validId(id);
    if (typeof repositoryRoot !== 'string' || !repositoryRoot || repositoryRoot.length > 4096) throw new TypeError('Invalid queue repository');
    if (typeof request !== 'string' || !request.trim() || request.length > 10000) throw new TypeError('Invalid queued request');
    if (typeof baselineFingerprint !== 'string' || !/^[a-f0-9]{7,128}$/i.test(baselineFingerprint)) throw new TypeError('Invalid repository baseline fingerprint');
    if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw new TypeError('Invalid queued task configuration');
    const serialized = JSON.stringify(configuration);
    if (serialized.length > 32768) throw new TypeError('Queued task configuration exceeds the size limit');
    const policies = JSON.stringify(policySnapshot);
    if (policies.length > 70000) throw new TypeError('Queued policy snapshot exceeds the size limit');
    const now = new Date().toISOString();
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.getQueuedTask(id);
      if (existing) {
        if (existing.repositoryRoot !== repositoryRoot || existing.request !== request ||
          JSON.stringify(existing.configuration) !== serialized || JSON.stringify(existing.policySnapshot) !== policies) throw new Error('Queue request identity conflicts with an accepted task');
        this.#db.exec('COMMIT'); return existing;
      }
      if (this.#db.prepare("SELECT COUNT(*) AS count FROM queued_tasks WHERE repository_root = ? AND status IN ('queued','starting','running','blocked','interrupted')").get(repositoryRoot).count >= 100) throw new Error('Project queue limit reached');
      const position = this.#db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM queued_tasks WHERE repository_root = ? AND status = 'queued'").get(repositoryRoot).next;
      this.#db.prepare('INSERT INTO queued_tasks (id, repository_root, request, configuration, baseline_fingerprint, position, status, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
        .run(id, repositoryRoot, request, serialized, baselineFingerprint, position, 'queued', now, now);
      this.#db.prepare('UPDATE queued_tasks SET policy_snapshot = ? WHERE id = ?').run(policies, id);
      this.#db.exec('COMMIT');
      return this.getQueuedTask(id);
    } catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }

  getQueuedTask(id) {
    const row = this.#db.prepare('SELECT * FROM queued_tasks WHERE id = ?').get(validId(id));
    return row && { id: row.id, repositoryRoot: row.repository_root, request: row.request,
      configuration: JSON.parse(row.configuration), baselineFingerprint: row.baseline_fingerprint,
      policySnapshot: row.policy_snapshot ? JSON.parse(row.policy_snapshot) : null,
      position: row.position, status: row.status, schemaVersion: row.schema_version, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  listQueuedTasks(repositoryRoot) {
    if (typeof repositoryRoot !== 'string' || !repositoryRoot) throw new TypeError('Repository root is required');
    const paused = !!this.#db.prepare('SELECT paused FROM task_queue_settings WHERE repository_root = ?').get(repositoryRoot)?.paused;
    const tasks = this.#db.prepare("SELECT id FROM queued_tasks WHERE repository_root = ? ORDER BY CASE WHEN status IN ('queued','starting','running','blocked','interrupted') THEN 0 ELSE 1 END, position, created_at, id LIMIT 125").all(repositoryRoot)
      .map(({ id }) => this.getQueuedTask(id));
    return { paused, tasks };
  }

  setTaskQueuePaused(repositoryRoot, paused) {
    if (typeof repositoryRoot !== 'string' || !repositoryRoot || typeof paused !== 'boolean') throw new TypeError('Invalid queue pause setting');
    this.#db.prepare(`INSERT INTO task_queue_settings (repository_root, paused) VALUES (?, ?)
      ON CONFLICT(repository_root) DO UPDATE SET paused = excluded.paused`).run(repositoryRoot, paused ? 1 : 0);
    return this.listQueuedTasks(repositoryRoot);
  }

  removeQueuedTask(id) {
    validId(id);
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.#db.prepare("SELECT repository_root, status FROM queued_tasks WHERE id = ?").get(id);
      if (!row) { this.#db.exec('COMMIT'); return false; }
      if (row.status !== 'queued' && row.status !== 'blocked') throw new Error('Only undispatched queued tasks can be removed');
      this.#db.prepare('DELETE FROM queued_tasks WHERE id = ?').run(id);
      const rows = this.#db.prepare("SELECT id FROM queued_tasks WHERE repository_root = ? AND status = 'queued' ORDER BY position, created_at, id").all(row.repository_root);
      rows.forEach(({ id: taskId }, position) => this.#db.prepare('UPDATE queued_tasks SET position = ?, updated_at = ? WHERE id = ?').run(position, new Date().toISOString(), taskId));
      this.#db.exec('COMMIT');
      return true;
    } catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }

  cancelQueuedTask(id) {
    validId(id);
    const result = this.#db.prepare("UPDATE queued_tasks SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN ('queued', 'blocked')")
      .run(new Date().toISOString(), id);
    return result.changes === 1 ? this.getQueuedTask(id) : false;
  }

  reorderQueuedTask(id, position) {
    validId(id);
    if (!Number.isSafeInteger(position) || position < 0) throw new TypeError('Queue position must be a non-negative integer');
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const task = this.#db.prepare("SELECT repository_root FROM queued_tasks WHERE id = ? AND status = 'queued'").get(id);
      if (!task) throw new Error('Only queued tasks can be reordered');
      const rows = this.#db.prepare("SELECT id FROM queued_tasks WHERE repository_root = ? AND status = 'queued' ORDER BY position, created_at, id").all(task.repository_root);
      const current = rows.findIndex(row => row.id === id);
      rows.splice(current, 1);
      rows.splice(Math.min(position, rows.length), 0, { id });
      const update = this.#db.prepare('UPDATE queued_tasks SET position = ?, updated_at = ? WHERE id = ?');
      rows.forEach((row, index) => update.run(index, new Date().toISOString(), row.id));
      this.#db.exec('COMMIT');
      return this.getQueuedTask(id);
    } catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }

  /** Claiming is always explicit. A stale baseline, pause, or same-repo executor prevents dispatch. */
  claimQueuedTask(id, currentFingerprint) {
    validId(id);
    if (typeof currentFingerprint !== 'string' || !/^[a-f0-9]{7,128}$/i.test(currentFingerprint)) throw new TypeError('Invalid current repository fingerprint');
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const task = this.getQueuedTask(id);
      if (!task || task.status !== 'queued') throw new Error('Queued task is no longer dispatchable');
      if (this.#db.prepare('SELECT paused FROM task_queue_settings WHERE repository_root = ? AND paused = 1').get(task.repositoryRoot)) throw new Error('Task queue is paused');
      if (task.baselineFingerprint !== currentFingerprint) throw new Error('Repository baseline changed; queued task requires review');
      const first = this.#db.prepare("SELECT id FROM queued_tasks WHERE repository_root = ? AND status = 'queued' ORDER BY position, created_at, id LIMIT 1").get(task.repositoryRoot);
      if (first?.id !== id) throw new Error('Reorder the queue before dispatching a later task');
      if (this.#db.prepare("SELECT 1 FROM queued_tasks WHERE repository_root = ? AND status IN ('starting', 'running', 'interrupted', 'blocked') LIMIT 1").get(task.repositoryRoot)) throw new Error('Another queued task requires reconciliation for this repository');
      if (this.#db.prepare("SELECT 1 FROM tasks WHERE repository_root = ? AND (status IN ('pending','running') OR EXISTS (SELECT 1 FROM execution_leases WHERE task_id = tasks.id AND released_at IS NULL)) LIMIT 1").get(task.repositoryRoot)) throw new Error('Reconcile active repository tasks before queue dispatch');
      const drafts = this.#db.prepare('SELECT id FROM tasks WHERE repository_root = ?').all(task.repositoryRoot);
      if (drafts.some(task => this.hasOpenDraft(task.id))) throw new Error('Review or discard pending drafts before queue dispatch');
      const result = this.#db.prepare("UPDATE queued_tasks SET status = 'starting', updated_at = ? WHERE id = ? AND status = 'queued'").run(new Date().toISOString(), id);
      if (result.changes !== 1) throw new Error('Queued task claim raced with another dispatcher');
      this.#db.exec('COMMIT');
      return this.getQueuedTask(id);
    } catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }

  updateQueuedTask(id, status) {
    validId(id);
    const transitions = { starting: ['running', 'blocked', 'interrupted', 'failed', 'cancelled'], running: ['completed', 'blocked', 'interrupted', 'failed', 'cancelled'] };
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.getQueuedTask(id);
      if (!current || !transitions[current.status]?.includes(status)) throw new Error('Invalid queued task state transition');
      this.#db.prepare('UPDATE queued_tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
      this.#db.exec('COMMIT');
      return this.getQueuedTask(id);
    } catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }

  hasOpenDraft(id) {
    return !!this.#db.prepare(`SELECT 1 FROM events AS draft
      WHERE draft.task_id = ? AND draft.kind = 'draft-created'
      AND NOT EXISTS (SELECT 1 FROM events AS resolved
        WHERE resolved.task_id = draft.task_id AND resolved.seq > draft.seq
        AND resolved.kind IN ('draft-accepted', 'draft-rejected')) LIMIT 1`).get(validId(id));
  }

  delete(id) {
    validId(id);
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const task = this.get(id);
      if (!task) { this.#db.exec('COMMIT'); return false; }
      if (task.status === 'running') throw new Error('Cannot delete a running task');
      if (this.executionLease(id)?.releasedAt === null) throw new Error('Cannot delete an owned task');
      if (this.hasOpenDraft(id)) throw new Error('Apply or discard the open edit draft before deleting its task history');
      this.#db.prepare('DELETE FROM events WHERE task_id = ?').run(id);
      this.#db.prepare('DELETE FROM execution_leases WHERE task_id = ?').run(id);
      this.#db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      this.#db.exec('COMMIT');
      return true;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  prunable({ before, repositoryRoot, limit = 100 }) {
    if (typeof before !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(before) || !Number.isFinite(Date.parse(before))) {
      throw new TypeError('Invalid retention cutoff');
    }
    if (typeof repositoryRoot !== 'string' || !repositoryRoot) throw new TypeError('Repository root is required');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('Limit must be between 1 and 1000');
    const cutoff = new Date(before).toISOString();
    return this.#db.prepare(`SELECT id FROM tasks WHERE repository_root = ? AND updated_at < ?
      AND status IN ('completed', 'failed', 'cancelled')
      AND NOT EXISTS (SELECT 1 FROM execution_leases WHERE task_id = tasks.id AND released_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM events AS draft WHERE draft.task_id = tasks.id
        AND draft.kind = 'draft-created' AND NOT EXISTS (
          SELECT 1 FROM events AS resolved WHERE resolved.task_id = tasks.id
          AND resolved.seq > draft.seq AND resolved.kind IN ('draft-accepted', 'draft-rejected')))
      ORDER BY updated_at, id LIMIT ?`)
      .all(repositoryRoot, cutoff, limit).map(({ id }) => id);
  }

  prune(options) {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const ids = this.prunable(options);
      const deleteEvents = this.#db.prepare('DELETE FROM events WHERE task_id = ?');
      const deleteTask = this.#db.prepare('DELETE FROM tasks WHERE id = ?');
      for (const id of ids) {
        deleteEvents.run(id);
        this.#db.prepare('DELETE FROM execution_leases WHERE task_id = ?').run(id);
        deleteTask.run(id);
      }
      this.#db.exec('COMMIT');
      return ids;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  close() { this.#db.close(); }
}
