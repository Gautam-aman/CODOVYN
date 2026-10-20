import { chmodSync, mkdirSync } from 'node:fs';
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
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.#db = new DatabaseSync(filename);
    if (filename !== ':memory:' && process.platform !== 'win32') chmodSync(filename, 0o600);
    this.#db.exec('PRAGMA journal_mode = WAL');
    this.#db.exec('PRAGMA foreign_keys = ON');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        request TEXT NOT NULL,
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
      CREATE INDEX IF NOT EXISTS events_by_task ON events(task_id, seq);
    `);
  }

  create({ id, request, primaryAgent, fallbackAgents = [] }) {
    validId(id);
    if (typeof request !== 'string' || !request.trim()) throw new TypeError('Task request is required');
    if (typeof primaryAgent !== 'string' || !primaryAgent) throw new TypeError('Primary agent is required');
    if (!Array.isArray(fallbackAgents) || fallbackAgents.some((value) => typeof value !== 'string')) throw new TypeError('Invalid fallback agents');
    const now = new Date().toISOString();
    this.#db.prepare('INSERT INTO tasks (id, request, primary_agent, fallback_agents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, request, primaryAgent, JSON.stringify(fallbackAgents), 'pending', now, now);
    return this.get(id);
  }

  get(id) {
    const row = this.#db.prepare('SELECT * FROM tasks WHERE id = ?').get(validId(id));
    return row ? { id: row.id, request: row.request, primaryAgent: row.primary_agent,
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

  listInterrupted() {
    return this.#db.prepare("SELECT id FROM tasks WHERE status IN ('running', 'interrupted') ORDER BY updated_at")
      .all().map(({ id }) => this.get(id));
  }

  close() { this.#db.close(); }
}
