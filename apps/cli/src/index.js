#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AgentRegistry, AgentFailure } from '../../../packages/agent-core/src/index.js';
import { TaskStore } from '../../../packages/storage/src/index.js';
import { TaskEngine } from '../../../packages/task-engine/src/index.js';
import { repositorySnapshot } from '../../../packages/git-engine/src/index.js';
import { createCodexAdapter } from '../../../packages/agent-adapters/src/index.js';

const usage = `Usage:
  codovyn demo <repository> <request>
  codovyn codex <repository> <request>
  codovyn tasks [repository]
  codovyn history <task-id> [repository]

The demo simulates a quota handoff and makes no code changes.
The Codex command runs the installed CLI in read-only mode.`;

export async function main(args = process.argv.slice(2), output = console, signal) {
  const [mode, value, ...rest] = args;
  if (!['demo', 'codex', 'tasks', 'history'].includes(mode)) { output.error(usage); return 2; }
  const stream = process.env.CODOVYN_EVENT_STREAM === '1';
  const dataDirectory = process.env.CODOVYN_DATA_DIR || join(homedir(), '.codovyn');
  const store = new TaskStore(join(dataDirectory, 'tasks.sqlite'));
  try {
    if (mode === 'tasks') {
      const repositoryRoot = value ? (await repositorySnapshot(value)).root : undefined;
      const tasks = store.list({ repositoryRoot }).map(({ id, request, status, activeAgent, updatedAt }) =>
        ({ id, request, status, activeAgent, updatedAt }));
      output.log(JSON.stringify(stream ? { type: 'result', tasks } : tasks, null, stream ? 0 : 2));
      return 0;
    }
    if (mode === 'history') {
      if (!value) { output.error(usage); return 2; }
      const task = store.get(value);
      if (!task) { output.error(`Unknown task: ${value}`); return 1; }
      if (rest[0] && task.repositoryRoot !== (await repositorySnapshot(rest[0])).root) {
        output.error('Task belongs to a different repository');
        return 1;
      }
      output.log(JSON.stringify(stream ? { type: 'result', task, events: store.events(value) }
        : { task, events: store.events(value) }, null, stream ? 0 : 2));
      return 0;
    }
    const request = rest.join(' ').trim();
    if (!value || !request) { output.error(usage); return 2; }
    const repository = (await repositorySnapshot(value)).root;
    const registry = new AgentRegistry();
    let primaryAgent;
    let fallbackAgents = [];
    if (mode === 'demo') {
      primaryAgent = 'simulated-primary';
      fallbackAgents = ['simulated-backup'];
      registry.register({ id: primaryAgent, capabilities: { writes: false }, availability: async () => 'available',
        async *run() { yield { type: 'text', text: 'Starting simulated task' }; throw new AgentFailure('quota', 'Simulated quota event'); } });
      registry.register({ id: 'simulated-backup', capabilities: { writes: false }, availability: async () => 'available',
        async *run({ handoff }) { yield { type: 'completed', text: `Simulated continuation: ${handoff.request}` }; } });
    } else {
      primaryAgent = 'codex';
      registry.register(createCodexAdapter({ cwd: repository }));
    }
    const id = randomUUID();
    store.create({ id, request, repositoryRoot: repository, primaryAgent, fallbackAgents });
    const engine = new TaskEngine({ store, registry, snapshot: () => repositorySnapshot(repository),
      onEvent: stream ? (event) => output.log(JSON.stringify({ type: 'event', event })) : undefined });
    const task = await engine.run(id, { signal });
    const result = { taskId: id, status: task.status, activeAgent: task.activeAgent,
      ...(stream ? {} : { events: store.events(id) }) };
    output.log(JSON.stringify(stream ? { type: 'result', ...result } : result, null, stream ? 0 : 2));
    return task.status === 'completed' ? 0 : 1;
  } finally { store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  process.on('SIGTERM', () => controller.abort());
  process.on('SIGINT', () => controller.abort());
  main(process.argv.slice(2), console, controller.signal).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
