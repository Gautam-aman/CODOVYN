import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createExtension, dataDirectory, runCli } = require('../extension.cjs');

test('extension keeps a private legacy journal visible and isolates new storage', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-extension-'));
  try {
    assert.equal(dataDirectory(directory), join(directory, 'private'));
    writeFileSync(join(directory, 'tasks.sqlite'), 'legacy');
    assert.equal(dataDirectory(directory), directory);
    if (process.platform !== 'win32') {
      chmodSync(directory, 0o755);
      assert.equal(dataDirectory(directory), join(directory, 'private'));
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('extension starts a repository task and exposes a safe handoff timeline', async () => {
  let command;
  let messageHandler;
  let approveDeletion = false;
  let deletionCalls = 0;
  const sent = [];
  const panel = { webview: {
    cspSource: 'vscode-resource:',
    asWebviewUri: (value) => value,
    onDidReceiveMessage: (handler) => { messageHandler = handler; },
    postMessage: (message) => { sent.push(message); },
  } };
  const api = {
    commands: { registerCommand: (_id, handler) => { command = handler; return { dispose() {} }; } },
    window: { createWebviewPanel: () => panel,
      showWarningMessage: async () => approveDeletion ? 'Delete task' : undefined },
    ViewColumn: { Beside: 2 },
    Uri: { joinPath: (_root, ...parts) => parts.join('/') },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/project' } }], isTrusted: true,
      getConfiguration: () => ({ get: () => 'node' }),
    },
  };
  const context = { extensionUri: 'root', extensionPath: '/extension', globalStorageUri: { fsPath: '/data' }, subscriptions: [] };
  const runner = async (executable, args, options) => {
    assert.equal(executable, 'node');
    if (args[1] === 'tasks') return { tasks: [{ id: 'task-1', request: 'Inspect', status: 'completed' }] };
    if (args[1] === 'diff') return { diff: 'diff --git a/file b/file\n+changed' };
    if (args[1] === 'task-delete') {
      assert.deepEqual(args.slice(2), ['task-1', '/project', '--yes']);
      deletionCalls++;
      return { deleted: true, taskId: 'task-1' };
    }
    if (args[1] === 'history') {
      assert.equal(args[3], '/project');
      return { task: { request: 'Inspect', status: 'completed', repositoryRoot: '/project' }, events: [
      { kind: 'handoff', data: { from: 'primary', to: 'backup' } },
      ] };
    }
    assert.equal(args[1], 'demo');
    assert.equal(args[2], '/project');
    assert.equal(args[3], 'Inspect');
    assert.equal(options.env.CODOVYN_DATA_DIR, join('/data', 'private'));
    return { status: 'completed', taskId: 'task-1', activeAgent: 'backup', events: [
      { kind: 'handoff', data: { from: 'primary', to: 'backup' } },
      { kind: 'checkpoint', data: { repository: { root: '/private/project' } } },
      { kind: 'agent-event', data: { event: { type: 'text', text: 'Done' } } },
      { kind: 'agent-event', data: { event: { type: 'completed', text: 'Final answer' } } },
    ] };
  };
  createExtension(api, runner).activate(context);
  assert.equal(context.subscriptions.length, 1);
  command();
  assert.match(panel.webview.html, /Content-Security-Policy/);
  assert.match(panel.webview.html, /Claude Code/);
  assert.match(panel.webview.html, /Codex → Claude/);
  await messageHandler({ type: 'run', mode: 'demo', request: 'Inspect' });
  const result = sent.find((message) => message.type === 'result');
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.timeline.map((item) => item.text),
    ['Switched from primary to backup', 'Saved a task checkpoint', 'Done', 'Final answer']);
  assert.ok(!JSON.stringify(result).includes('/private/project'));
  assert.equal(sent.at(-1).type, 'tasks');
  await messageHandler({ type: 'history', id: 'task-1' });
  assert.equal(sent.at(-1).type, 'history');
  assert.equal(sent.at(-1).request, 'Inspect');
  await messageHandler({ type: 'diff', staged: false });
  assert.match(sent.at(-1).text, /\+changed/);
  await messageHandler({ type: 'delete-task', id: '../unsafe' });
  await messageHandler({ type: 'delete-task', id: 'task-1' });
  assert.equal(deletionCalls, 0);
  approveDeletion = true;
  await messageHandler({ type: 'delete-task', id: 'task-1' });
  assert.equal(deletionCalls, 1);
  assert.ok(sent.some((message) => message.type === 'task-deleted' && message.id === 'task-1'));
  assert.equal(sent.at(-1).type, 'tasks');
});

test('extension blocks provider execution in an untrusted workspace', async () => {
  let command;
  let handler;
  const sent = [];
  const api = {
    commands: { registerCommand: (_id, callback) => { command = callback; return { dispose() {} }; } },
    window: { createWebviewPanel: () => ({ webview: { cspSource: 'x', asWebviewUri: (x) => x,
      onDidReceiveMessage: (callback) => { handler = callback; }, postMessage: (message) => sent.push(message) } }) },
    ViewColumn: { Beside: 2 }, Uri: { joinPath: (_root, ...parts) => parts.join('/') },
    workspace: { workspaceFolders: [{ uri: { fsPath: '/project' } }], isTrusted: false },
  };
  createExtension(api, () => { throw new Error('Must not run'); }).activate({
    extensionUri: 'root', globalStorageUri: { fsPath: '/data' }, subscriptions: [],
  });
  command();
  for (const mode of ['codex', 'claude', 'auto']) {
    await handler({ type: 'run', mode, request: 'Inspect' });
    assert.match(sent.at(-1).text, /Trust this workspace/);
  }
});

test('extension scopes tasks and runs to the selected workspace folder', async () => {
  let open;
  let handler;
  const sent = [];
  const calls = [];
  const api = {
    commands: { registerCommand: (_id, callback) => { open = callback; return { dispose() {} }; } },
    window: { createWebviewPanel: () => ({ webview: { cspSource: 'x', asWebviewUri: (uri) => uri,
      onDidReceiveMessage: (callback) => { handler = callback; }, postMessage: (message) => sent.push(message) } }) },
    ViewColumn: { Beside: 2 }, Uri: { joinPath: (_root, ...parts) => parts.join('/') },
    workspace: { workspaceFolders: [
      { name: 'First', uri: { fsPath: '/first' } }, { name: 'Second', uri: { fsPath: '/second' } },
    ], isTrusted: true, getConfiguration: () => ({ get: () => 'node' }) },
  };
  const runner = async (_node, args, options) => {
    calls.push(args);
    if (args[1] === 'tasks') return { tasks: [] };
    if (args[1] === 'demo') {
      options.onChild({ kill() {} });
      return { taskId: 'second-task', status: 'completed', activeAgent: 'backup', events: [] };
    }
    assert.fail(`Unexpected command ${args[1]}`);
  };
  createExtension(api, runner).activate({ extensionUri: 'root', extensionPath: '/extension',
    globalStorageUri: { fsPath: '/data' }, subscriptions: [] });
  open();
  await handler({ type: 'ready' });
  assert.deepEqual(sent.find((message) => message.type === 'projects').projects.map((entry) => entry.name), ['First', 'Second']);
  await handler({ type: 'project-select', root: '/outside' });
  assert.equal(calls.at(-1)[2], '/first');
  await handler({ type: 'project-select', root: '/second' });
  assert.equal(calls.at(-1)[2], '/second');
  await handler({ type: 'run', mode: 'demo', request: 'Inspect second repository' });
  assert.deepEqual(calls.find((args) => args[1] === 'demo').slice(2), ['/second', 'Inspect second repository']);
});

test('extension process bridge forwards JSONL progress before the final result', async () => {
  const progress = [];
  const script = `console.log(JSON.stringify({type:'event',event:{kind:'handoff',data:{from:'a',to:'b'}}})); console.log(JSON.stringify({type:'result',status:'completed',taskId:'one'}));`;
  const result = await runCli(process.execPath, ['-e', script], {
    cwd: process.cwd(), env: process.env, onChild: () => {}, onEvent: (event) => progress.push(event.kind),
  });
  assert.deepEqual(progress, ['handoff']);
  assert.equal(result.status, 'completed');
});

test('extension bridge displays a safe CLI preflight error', async () => {
  const script = `console.log(JSON.stringify({type:'error',message:'Commit or remove working-tree changes before starting an edit draft'})); process.exitCode=1;`;
  await assert.rejects(runCli(process.execPath, ['-e', script], {
    cwd: process.cwd(), env: process.env, onChild: () => {}, onEvent: () => {},
  }), /Commit or remove working-tree changes/);
});

test('extension requires edit approval and applies only the last reviewed draft hash', async () => {
  let open;
  let handler;
  let approve = false;
  const calls = [];
  const sent = [];
  const panel = { webview: { cspSource: 'x', asWebviewUri: (uri) => uri,
    onDidReceiveMessage: (callback) => { handler = callback; }, postMessage: (message) => sent.push(message) } };
  const api = {
    commands: { registerCommand: (_id, callback) => { open = callback; return { dispose() {} }; } },
    window: { createWebviewPanel: () => panel,
      showWarningMessage: async (_text, _options, action) => approve ? action : undefined },
    ViewColumn: { Beside: 2 }, Uri: { joinPath: (_root, ...parts) => parts.join('/') },
    workspace: { workspaceFolders: [{ uri: { fsPath: '/project' } }], isTrusted: true,
      getConfiguration: () => ({ get: () => 'node' }) },
  };
  const hash = 'a'.repeat(64);
  const runner = async (_node, args, options) => {
    calls.push(args);
    switch (args[1]) {
      case 'tasks': return { tasks: [] };
      case 'codex-edit':
        assert.deepEqual(args.slice(2), ['/project', 'Make a small change', '--allow-writes']);
        options.onChild({ kill() {} });
        options.onEvent({ kind: 'agent-event', data: { event: { type: 'tool-start', action: 'file_change' } } });
        return { taskId: 'edit-1', status: 'completed', activeAgent: 'codex', draftReviewAvailable: true };
      case 'draft-review': return { patch: 'diff --git a/file b/file', patchHash: hash, changedPaths: ['file'] };
      case 'draft-accept':
        assert.deepEqual(args.slice(2), ['edit-1', '/project', hash, '--yes']);
        return { taskId: 'edit-1' };
      default: assert.fail(`Unexpected command: ${args[1]}`);
    }
  };
  createExtension(api, runner).activate({ extensionUri: 'root', extensionPath: '/extension',
    globalStorageUri: { fsPath: '/data' }, subscriptions: [] });
  open();
  for (const mode of ['codex-edit', 'claude-edit', 'auto-edit']) {
    await handler({ type: 'run', mode, request: 'Make a small change' });
  }
  assert.equal(calls.length, 0);
  approve = true;
  await handler({ type: 'run', mode: 'codex-edit', request: 'Make a small change' });
  assert.ok(sent.some((message) => message.type === 'progress' && message.entries[0].text === 'Editing draft files…'));
  assert.ok(sent.some((message) => message.type === 'result' && message.draftReviewAvailable));
  await handler({ type: 'draft-accept', id: 'edit-1' });
  assert.equal(calls.filter((args) => args[1] === 'draft-accept').length, 0);
  await handler({ type: 'draft-review', id: 'edit-1' });
  assert.equal(sent.at(-1).type, 'draft-review');
  await handler({ type: 'draft-accept', id: 'edit-1' });
  assert.equal(calls.filter((args) => args[1] === 'draft-accept').length, 1);
  assert.ok(sent.some((message) => message.type === 'draft-accepted'));
});

test('concurrent edit requests cannot start twice while permission is pending', async () => {
  let open;
  let handler;
  let resolveApproval;
  let starts = 0;
  const sent = [];
  const panel = { webview: { cspSource: 'x', asWebviewUri: (uri) => uri,
    onDidReceiveMessage: (callback) => { handler = callback; }, postMessage: (message) => sent.push(message) } };
  const api = {
    commands: { registerCommand: (_id, callback) => { open = callback; return { dispose() {} }; } },
    window: { createWebviewPanel: () => panel,
      showWarningMessage: () => new Promise((resolve) => { resolveApproval = resolve; }) },
    ViewColumn: { Beside: 2 }, Uri: { joinPath: (_root, ...parts) => parts.join('/') },
    workspace: { workspaceFolders: [{ uri: { fsPath: '/project' } }], isTrusted: true,
      getConfiguration: () => ({ get: () => 'node' }) },
  };
  createExtension(api, async (_node, args, options) => {
    if (args[1] === 'tasks') return { tasks: [] };
    starts++;
    options.onChild({ kill() {} });
    return { taskId: 'one', status: 'completed', activeAgent: 'codex', events: [] };
  }).activate({ extensionUri: 'root', extensionPath: '/extension',
    globalStorageUri: { fsPath: '/data' }, subscriptions: [] });
  open();
  const first = handler({ type: 'run', mode: 'codex-edit', request: 'Edit file' });
  const second = handler({ type: 'run', mode: 'codex-edit', request: 'Edit file again' });
  await second;
  assert.equal(starts, 0);
  assert.equal(sent.filter((message) => message.type === 'approval-pending').length, 1);
  resolveApproval('Allow draft edits');
  await first;
  assert.equal(starts, 1);
});
