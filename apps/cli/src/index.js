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
import { createDraftWorkspace, reviewDraftWorkspace, acceptDraftWorkspace, rejectDraftWorkspace } from '../../../packages/git-engine/src/draft-workspace.js';
import { createIssue, createPullRequest, issueDetails, listIssues, listPullRequests, listWorkflowRuns, previewPullRequest, pullRequestDetails, pullRequestDiff } from '../../../packages/github-integration/src/index.js';

const usage = `Usage:
  codovyn demo <repository> <request>
  codovyn codex <repository> <request>
  codovyn claude <repository> <request>
  codovyn auto <repository> <request>
  codovyn codex-edit <repository> <request> --allow-writes
  codovyn claude-edit <repository> <request> --allow-writes
  codovyn auto-edit <repository> <request> --allow-writes
  codovyn draft-review <task-id> <repository>
  codovyn draft-accept <task-id> <repository> <patch-hash> --yes
  codovyn draft-reject <task-id> <repository> --yes
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
  codovyn pr <owner/repo> <number>
  codovyn pr-diff <owner/repo> <number>
  codovyn pr-preview <owner/repo> <base> <head>
  codovyn pr-create <owner/repo> <base> <head> <title> <body-file>
  codovyn runs <owner/repo> [branch]
  codovyn issue-create <owner/repo> <title> <body-file> [labels]

The demo simulates a quota handoff and makes no code changes.
Codex editing runs in an isolated worktree and requires explicit write permission.
The Codex and Claude commands without -edit run installed CLIs in read-only modes.
Auto tries Codex first, then Claude after a confirmed eligible failure.`;

async function confirmAction(word) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await prompt.question(`Type ${word} to confirm: `)).trim() === word; }
  finally { prompt.close(); }
}

export async function main(args = process.argv.slice(2), output = console, signal,
  github = { createIssue, createPullRequest, issueDetails, listIssues, listPullRequests, listWorkflowRuns, previewPullRequest, pullRequestDetails, pullRequestDiff },
  adapters = { createCodexAdapter, createClaudeAdapter }, confirm = confirmAction) {
  const [mode, value, ...rest] = args;
  if (!['demo', 'codex', 'claude', 'auto', 'codex-edit', 'claude-edit', 'auto-edit', 'draft-review', 'draft-accept', 'draft-reject', 'tasks', 'history', 'task-delete', 'task-prune', 'diff', 'status', 'stage', 'commit', 'branch', 'fetch', 'pull', 'push', 'issues', 'issue', 'prs', 'pr', 'pr-diff', 'pr-preview', 'pr-create', 'runs', 'issue-create'].includes(mode)) { output.error(usage); return 2; }
  const stream = process.env.CODOVYN_EVENT_STREAM === '1';
  if (mode === 'issue') {
    if (!value || rest.length !== 1 || !/^[1-9]\d*$/.test(rest[0])) { output.error(usage); return 2; }
    const issue = await github.issueDetails(value, Number(rest[0]));
    output.log(JSON.stringify(stream ? { type: 'result', issue } : issue, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'pr') {
    if (!value || rest.length !== 1 || !/^[1-9]\d*$/.test(rest[0])) { output.error(usage); return 2; }
    const pullRequest = await github.pullRequestDetails(value, Number(rest[0]));
    output.log(JSON.stringify(stream ? { type: 'result', pullRequest } : pullRequest, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'runs') {
    if (!value || rest.length > 1) { output.error(usage); return 2; }
    const runs = await github.listWorkflowRuns(value, { branch: rest[0] });
    output.log(JSON.stringify(stream ? { type: 'result', runs } : runs, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'pr-diff') {
    if (!value || rest.length !== 1 || !/^[1-9]\d*$/.test(rest[0])) { output.error(usage); return 2; }
    const patch = await github.pullRequestDiff(value, Number(rest[0]));
    output.log(stream ? JSON.stringify({ type: 'result', patch }) : patch);
    return 0;
  }
  if (mode === 'pr-preview') {
    if (!value || rest.length !== 2) { output.error(usage); return 2; }
    const preview = await github.previewPullRequest(value, { base: rest[0], head: rest[1] });
    output.log(JSON.stringify(stream ? { type: 'result', preview } : preview, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'pr-create') {
    const [base, head, title, bodyFile] = rest;
    if (!value || rest.length !== 4) { output.error(usage); return 2; }
    const file = await stat(bodyFile);
    if (!file.isFile() || file.size > 65_536) throw new Error('PR body file must be a regular file up to 65536 bytes');
    const body = await readFile(bodyFile, 'utf8');
    const result = await github.createPullRequest(value, { base, head, title, body }, { approve: async (preview) => {
      output.error(`Repository: ${preview.repository}\nBase: ${preview.base}\nHead: ${preview.head}\nTitle: ${preview.title}\nDraft: ${preview.draft}\n\n${preview.body}\n\n${preview.diff}`);
      return confirm('create');
    } });
    output.log(JSON.stringify(stream ? { type: 'result', ...result } : result, null, stream ? 0 : 2));
    return result.approved ? 0 : 1;
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
    if (['draft-review', 'draft-accept', 'draft-reject'].includes(mode)) {
      const [repositoryPath, patchHash, confirmation] = rest;
      if (!value || !repositoryPath ||
        (mode === 'draft-review' && rest.length !== 1) ||
        (mode === 'draft-accept' && (rest.length !== 3 || confirmation !== '--yes')) ||
        (mode === 'draft-reject' && (rest.length !== 2 || patchHash !== '--yes'))) {
        output.error(usage); return 2;
      }
      const task = store.get(value);
      if (!task || task.repositoryRoot !== (await repositorySnapshot(repositoryPath)).root) {
        output.error('Unknown draft in this repository'); return 1;
      }
      const events = store.events(value);
      const draft = events.find((entry) => entry.kind === 'draft-created')?.data;
      if (!draft || events.some((entry) => ['draft-accepted', 'draft-rejected'].includes(entry.kind))) {
        output.error('This task has no open edit draft'); return 1;
      }
      if (task.status === 'running') { output.error('A running draft cannot be reviewed or changed'); return 1; }
      const directory = join(dataDirectory, 'drafts');
      if (mode === 'draft-review') {
        const review = await reviewDraftWorkspace(task.repositoryRoot, directory, task.id, draft.baseCommit);
        output.log(JSON.stringify(stream ? { type: 'result', ...review, taskId: task.id } : review, null, stream ? 0 : 2));
        return 0;
      }
      if (mode === 'draft-accept') {
        const accepted = await acceptDraftWorkspace(task.repositoryRoot, directory, task.id, draft.baseCommit, patchHash);
        store.append(task.id, 'draft-accepted', { changedPaths: accepted.changedPaths });
        output.log(JSON.stringify(stream ? { type: 'result', ...accepted, taskId: task.id } : accepted, null, stream ? 0 : 2));
        return 0;
      }
      await rejectDraftWorkspace(task.repositoryRoot, directory, task.id, draft.baseCommit);
      store.append(task.id, 'draft-rejected');
      output.log(JSON.stringify(stream ? { type: 'result', rejected: true, taskId: task.id } : { rejected: true }, null, stream ? 0 : 2));
      return 0;
    }
    if (mode === 'tasks') {
      const repositoryRoot = value ? (await repositorySnapshot(value)).root : undefined;
      const tasks = store.list({ repositoryRoot }).map(({ id, request, status, activeAgent, updatedAt }) =>
        ({ id, request, status, activeAgent, updatedAt, draftReviewAvailable: store.hasOpenDraft(id) }));
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
      if (!confirmed && !await confirm('delete')) { output.error('Retention cancelled; pass --yes for non-interactive use'); return 2; }
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
        if (!confirmed && !await confirm('delete')) { output.error('Deletion cancelled; pass --yes for non-interactive use'); return 2; }
        store.delete(value);
        output.log(JSON.stringify(stream ? { type: 'result', deleted: true, taskId: value } : { deleted: true, taskId: value }));
        return 0;
      }
      output.log(JSON.stringify(stream ? { type: 'result', task, events: store.events(value) }
        : { task, events: store.events(value) }, null, stream ? 0 : 2));
      return 0;
    }
    const editMode = ['codex-edit', 'claude-edit', 'auto-edit'].includes(mode);
    const allowWrites = editMode && rest.at(-1) === '--allow-writes';
    const request = (allowWrites ? rest.slice(0, -1) : rest).join(' ').trim();
    if (editMode && !allowWrites) { output.error(`${mode} requires --allow-writes`); return 2; }
    if (!value || !request) { output.error(usage); return 2; }
    const repository = (await repositorySnapshot(value)).root;
    const registry = new AgentRegistry();
    let primaryAgent;
    let fallbackAgents = [];
    const id = randomUUID();
    let draft;
    if (editMode) draft = await createDraftWorkspace(repository, join(dataDirectory, 'drafts'), id);
    if (mode === 'demo') {
      primaryAgent = 'simulated-primary';
      fallbackAgents = ['simulated-backup'];
      registry.register({ id: primaryAgent, capabilities: { writes: false }, availability: async () => 'available',
        async *run() { yield { type: 'text', text: 'Starting simulated task' }; throw new AgentFailure('quota', 'Simulated quota event'); } });
      registry.register({ id: 'simulated-backup', capabilities: { writes: false }, availability: async () => 'available',
        async *run({ handoff }) { yield { type: 'completed', text: `Simulated continuation: ${handoff.request}` }; } });
    } else {
      primaryAgent = ['claude', 'claude-edit'].includes(mode) ? 'claude' : 'codex';
      if (!['claude', 'claude-edit'].includes(mode)) {
        registry.register(adapters.createCodexAdapter({ cwd: draft?.path || repository, write: !!draft }));
      }
      if (['claude', 'claude-edit', 'auto', 'auto-edit'].includes(mode)) {
        registry.register(adapters.createClaudeAdapter({ cwd: draft?.path || repository, write: !!draft }));
      }
      if (mode === 'auto' || mode === 'auto-edit') fallbackAgents = ['claude'];
    }
    store.create({ id, request, repositoryRoot: repository, primaryAgent, fallbackAgents });
    if (draft) store.append(id, 'draft-created', { baseCommit: draft.baseCommit, branch: draft.branch });
    const engine = new TaskEngine({ store, registry, snapshot: () => repositorySnapshot(draft?.path || repository),
      onEvent: stream ? (event) => output.log(JSON.stringify({ type: 'event', event })) : undefined });
    const task = await engine.run(id, { signal });
    const result = { taskId: id, status: task.status, activeAgent: task.activeAgent, draftReviewAvailable: !!draft,
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
    if (process.env.CODOVYN_EVENT_STREAM === '1') {
      const message = error.message === 'Commit or remove working-tree changes before starting an edit draft'
        ? error.message : 'The local task command failed. Check Git and the selected agent CLI, then retry.';
      console.log(JSON.stringify({ type: 'error', message }));
    }
    console.error(error.message);
    process.exitCode = 1;
  });
}
