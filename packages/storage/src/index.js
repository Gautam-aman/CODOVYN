import { chmodSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const taskIdPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const validId = (id) => {
  if (typeof id !== 'string' || !taskIdPattern.test(id)) throw new TypeError('Invalid task id');
  return id;
};

/** Durable task records and an ordered event trail. One process owns each database. */
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
      CREATE TABLE IF NOT EXISTS execution_leases (
        task_id TEXT PRIMARY KEY REFERENCES tasks(id),
        token TEXT NOT NULL,
        owner TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        released_at TEXT
      );
      CREATE INDEX IF NOT EXISTS events_by_task ON events(task_id, seq);
    `);
    if (!this.#db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'repository_root')) {
      this.#db.exec('ALTER TABLE tasks ADD COLUMN repository_root TEXT');
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
  claimExecution(id, { token, pid, host }) {
    validId(id);
    if (typeof token !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(token) ||
        !Number.isSafeInteger(pid) || pid < 1 || typeof host !== 'string' || !host || host.length > 256) {
      throw new TypeError('Invalid execution owner');
    }
    if (!this.get(id)) throw new Error('Unknown task');
    const result = this.#db.prepare(`INSERT INTO execution_leases VALUES (?, ?, ?, ?, NULL)
      ON CONFLICT(task_id) DO UPDATE SET token=excluded.token, owner=excluded.owner,
      acquired_at=excluded.acquired_at, released_at=NULL WHERE execution_leases.released_at IS NOT NULL`)
      .run(id, token, JSON.stringify({ pid, host }), new Date().toISOString());
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
