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
  const sent = [];
  const panel = { webview: {
    cspSource: 'vscode-resource:',
    asWebviewUri: (value) => value,
    onDidReceiveMessage: (handler) => { messageHandler = handler; },
    postMessage: (message) => { sent.push(message); },
  } };
  const api = {
    commands: { registerCommand: (_id, handler) => { command = handler; return { dispose() {} }; } },
    window: { createWebviewPanel: () => panel },
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
  assert.deepEqual(result.timeline.map((item) => item.text), ['Switched from primary to backup', 'Done', 'Final answer']);
  assert.ok(!JSON.stringify(result).includes('/private/project'));
  assert.equal(sent.at(-1).type, 'tasks');
  await messageHandler({ type: 'history', id: 'task-1' });
  assert.equal(sent.at(-1).type, 'history');
  assert.equal(sent.at(-1).request, 'Inspect');
  await messageHandler({ type: 'diff', staged: false });
  assert.match(sent.at(-1).text, /\+changed/);
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

test('extension process bridge forwards JSONL progress before the final result', async () => {
  const progress = [];
  const script = `console.log(JSON.stringify({type:'event',event:{kind:'handoff',data:{from:'a',to:'b'}}})); console.log(JSON.stringify({type:'result',status:'completed',taskId:'one'}));`;
  const result = await runCli(process.execPath, ['-e', script], {
    cwd: process.cwd(), env: process.env, onChild: () => {}, onEvent: (event) => progress.push(event.kind),
  });
  assert.deepEqual(progress, ['handoff']);
  assert.equal(result.status, 'completed');
});
