import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createExtension } = createRequire(import.meta.url)('../extension.cjs');

test('composer favorites and validated selection persist in host storage and are scoped to the selected project', async () => {
  let open, handler; const sent = []; const state = new Map();
  const api = {
    commands: { registerCommand: (id, cb) => { if (id === 'codovyn.open') open = cb; return { dispose() {} }; } },
    Uri: { joinPath: (_, ...parts) => parts.join('/') }, ViewColumn: { Beside: 2 },
    workspace: { isTrusted: true, workspaceFolders: [{ uri: { fsPath: '/a' } }, { uri: { fsPath: '/b' } }], getConfiguration: () => ({ get: key => key === 'routingPolicy' ? {} : 'node' }) },
    window: { createWebviewPanel: () => ({ webview: { cspSource: 'x', asWebviewUri: x => x, onDidReceiveMessage: cb => { handler = cb; }, postMessage: message => sent.push(message) } }) },
  };
  const context = { globalState: { get: (key, fallback) => state.get(key) || fallback, update: async (key, value) => state.set(key, value) }, extensionUri: 'root', extensionPath: '/extension', globalStorageUri: { fsPath: '/data' }, subscriptions: [] };
  const preferences = { version: 1, selection: { provider: 'codex', modelId: null, permission: 'read', routingMode: 'manual', reasoning: null, intent: 'ask' }, favorites: ['default:codex'], recent: ['auto'] };
  createExtension(api, async () => ({ tasks: [], paused: false })).activate(context); open();
  await handler({ type: 'composer-preferences-save', preferences });
  await handler({ type: 'ready' });
  assert.deepEqual(sent.findLast(message => message.type === 'composer-preferences').preferences, preferences);
  sent.length = 0; await handler({ type: 'project-select', root: '/b' });
  assert.equal(sent.some(message => message.type === 'composer-preferences'), false);
  await handler({ type: 'project-select', root: '/a' });
  assert.deepEqual(sent.findLast(message => message.type === 'composer-preferences').preferences.favorites, ['default:codex']);
  await handler({ type: 'composer-preferences-save', preferences: { ...preferences, selection: { ...preferences.selection, permission: 'read-write' } } });
  assert.ok(sent.some(message => message.type === 'composer-preferences-error'));
});
