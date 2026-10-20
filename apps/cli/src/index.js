#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { AgentRegistry, AgentFailure } from '../../../packages/agent-core/src/index.js';
import { TaskStore } from '../../../packages/storage/src/index.js';
import { TaskEngine } from '../../../packages/task-engine/src/index.js';
import { commitStaged, createBranch, fetchRemote, pullFastForward, pushCurrentBranch, repositoryDiff, repositorySnapshot, stagePaths } from '../../../packages/git-engine/src/index.js';
import { createClaudeAdapter, createCodexAdapter } from '../../../packages/agent-adapters/src/index.js';
import { createIssue, issueDetails, listIssues, listPullRequests, pullRequestDiff } from '../../../packages/github-integration/src/index.js';

const usage = `Usage:
  codovyn demo <repository> <request>
  codovyn codex <repository> <request>
  codovyn claude <repository> <request>
  codovyn auto <repository> <request>
  codovyn tasks [repository]
  codovyn history <task-id> [repository]
  codovyn task-delete <task-id> [repository] [--yes]
  codovyn task-prune <repository> <before-ISO-time> [--yes]
  codovyn diff <repository> [--staged]
  codovyn status <repository>
  codovyn stage <repository> <path> [more paths]
  codovyn commit <repository> <message>
  codovyn branch <repository> <new-name>
  codovyn fetch <repository> [remote]
  codovyn pull <repository> [remote]
  codovyn push <repository> [remote]
  codovyn issues <owner/repo>
  codovyn issue <owner/repo> <number>
  codovyn prs <owner/repo>
  codovyn pr-diff <owner/repo> <number>
  codovyn issue-create <owner/repo> <title> <body-file> [labels]

The demo simulates a quota handoff and makes no code changes.
The Codex and Claude commands run installed CLIs in read-only modes.
Auto tries Codex first, then Claude after a confirmed eligible failure.`;

async function confirmDeletion() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await prompt.question('Type delete to confirm: ')).trim() === 'delete'; }
  finally { prompt.close(); }
}

export async function main(args = process.argv.slice(2), output = console, signal,
  github = { createIssue, issueDetails, listIssues, listPullRequests, pullRequestDiff },
  adapters = { createCodexAdapter, createClaudeAdapter }) {
  const [mode, value, ...rest] = args;
  if (!['demo', 'codex', 'claude', 'auto', 'tasks', 'history', 'task-delete', 'task-prune', 'diff', 'status', 'stage', 'commit', 'branch', 'fetch', 'pull', 'push', 'issues', 'issue', 'prs', 'pr-diff', 'issue-create'].includes(mode)) { output.error(usage); return 2; }
  const stream = process.env.CODOVYN_EVENT_STREAM === '1';
  if (mode === 'issue') {
    if (!value || rest.length !== 1 || !/^[1-9]\d*$/.test(rest[0])) { output.error(usage); return 2; }
    const issue = await github.issueDetails(value, Number(rest[0]));
    output.log(JSON.stringify(stream ? { type: 'result', issue } : issue, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'pr-diff') {
    if (!value || rest.length !== 1 || !/^[1-9]\d*$/.test(rest[0])) { output.error(usage); return 2; }
    const patch = await github.pullRequestDiff(value, Number(rest[0]));
    output.log(stream ? JSON.stringify({ type: 'result', patch }) : patch);
    return 0;
  }
  if (mode === 'issue-create') {
    const [title, bodyFile, ...labels] = rest;
    if (!value || !title || !bodyFile || labels.length > 10) { output.error(usage); return 2; }
    const file = await stat(bodyFile);
    if (!file.isFile() || file.size > 65_536) throw new Error('Issue body file must be a regular file up to 65536 bytes');
    const created = await github.createIssue(value, { title, body: await readFile(bodyFile, 'utf8'), labels });
    output.log(JSON.stringify(stream ? { type: 'result', created } : created, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'issues' || mode === 'prs') {
    if (!value || rest.length) { output.error(usage); return 2; }
    const items = mode === 'issues' ? await github.listIssues(value) : await github.listPullRequests(value);
    output.log(JSON.stringify(stream ? { type: 'result', items } : items, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'diff') {
    if (!value || rest.some((argument) => argument !== '--staged')) { output.error(usage); return 2; }
    const diff = await repositoryDiff(value, { staged: rest.includes('--staged') });
    output.log(stream ? JSON.stringify({ type: 'result', diff }) : diff);
    return 0;
  }
  if (mode === 'status') {
    if (!value || rest.length) { output.error(usage); return 2; }
    const snapshot = await repositorySnapshot(value);
    output.log(JSON.stringify(stream ? { type: 'result', snapshot } : snapshot, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'stage' || mode === 'commit') {
    if (!value || !rest.length) { output.error(usage); return 2; }
    const snapshot = mode === 'stage' ? await stagePaths(value, rest) : await commitStaged(value, rest.join(' '));
    output.log(JSON.stringify(stream ? { type: 'result', snapshot } : snapshot, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'branch') {
    if (!value || rest.length !== 1) { output.error(usage); return 2; }
    const snapshot = await createBranch(value, rest[0]);
    output.log(JSON.stringify(stream ? { type: 'result', snapshot } : snapshot, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'pull') {
    if (!value || rest.length > 1) { output.error(usage); return 2; }
    const snapshot = await pullFastForward(value, rest[0] || 'origin');
    output.log(JSON.stringify(stream ? { type: 'result', snapshot } : snapshot, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'fetch' || mode === 'push') {
    if (!value || rest.length > 1) { output.error(usage); return 2; }
    const result = mode === 'fetch' ? await fetchRemote(value, rest[0] || 'origin')
      : await pushCurrentBranch(value, rest[0] || 'origin');
    output.log(JSON.stringify(stream ? { type: 'result', [mode === 'fetch' ? 'fetched' : 'pushed']: result } : result,
      null, stream ? 0 : 2));
    return 0;
  }
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
    if (mode === 'task-prune') {
      const confirmed = rest.at(-1) === '--yes';
      const argumentsWithoutFlag = confirmed ? rest.slice(0, -1) : rest;
      if (!value || argumentsWithoutFlag.length !== 1) { output.error(usage); return 2; }
      const repositoryRoot = (await repositorySnapshot(value)).root;
      const options = { repositoryRoot, before: argumentsWithoutFlag[0] };
      const candidateIds = store.prunable(options);
      output.error(`Delete ${candidateIds.length} finished tasks updated before ${options.before} from ${repositoryRoot}`);
      if (!candidateIds.length) {
        output.log(JSON.stringify(stream ? { type: 'result', deletedTaskIds: [] } : { deletedTaskIds: [] }));
        return 0;
      }
      if (!confirmed && !await confirmDeletion()) { output.error('Retention cancelled; pass --yes for non-interactive use'); return 2; }
      const deletedTaskIds = store.prune(options);
      output.log(JSON.stringify(stream ? { type: 'result', deletedTaskIds } : { deletedTaskIds }, null, stream ? 0 : 2));
      return 0;
    }
    if (mode === 'history' || mode === 'task-delete') {
      const confirmed = mode === 'task-delete' && rest.at(-1) === '--yes';
      const argumentsWithoutFlag = confirmed ? rest.slice(0, -1) : rest;
      if (!value || argumentsWithoutFlag.length > 1) { output.error(usage); return 2; }
      const task = store.get(value);
      if (!task) { output.error(`Unknown task: ${value}`); return 1; }
      if (argumentsWithoutFlag[0] && task.repositoryRoot !== (await repositorySnapshot(argumentsWithoutFlag[0])).root) {
        output.error('Task belongs to a different repository');
        return 1;
      }
      if (mode === 'task-delete') {
        output.error(`Delete task ${task.id} (${task.status}) and its event history from ${task.repositoryRoot || 'unscoped storage'}`);
        if (!confirmed && !await confirmDeletion()) { output.error('Deletion cancelled; pass --yes for non-interactive use'); return 2; }
        store.delete(value);
        output.log(JSON.stringify(stream ? { type: 'result', deleted: true, taskId: value } : { deleted: true, taskId: value }));
        return 0;
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
      primaryAgent = mode === 'claude' ? 'claude' : 'codex';
      if (mode !== 'claude') registry.register(adapters.createCodexAdapter({ cwd: repository }));
      if (mode !== 'codex') registry.register(adapters.createClaudeAdapter({ cwd: repository }));
      if (mode === 'auto') fallbackAgents = ['claude'];
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
