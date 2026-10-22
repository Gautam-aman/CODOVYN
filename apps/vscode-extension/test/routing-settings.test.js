import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { createExtension } = createRequire(import.meta.url)('../extension.cjs');
const model = { id: 'local-choice', provider: 'codex', model: 'explicit-model', capabilities: ['streaming', 'tools'],
  reasoning: [], quality: 70, reliability: 0.8, availability: 'unknown', price: null };

test('routing settings are validated, saved per trusted project, and restored on project selection', async () => {
  let open, receive;
  const sent = [];
  const settings = new Map();
  const calls = [];
  const folders = ['/a', '/b'].map(root => ({ name: root.slice(1), uri: { fsPath: root } }));
  const api = {
    ConfigurationTarget: { WorkspaceFolder: 5 }, ViewColumn: { Beside: 2 },
    Uri: { joinPath: (_, ...parts) => parts.join('/') },
    commands: { registerCommand: (_, handler) => { open = handler; return { dispose() {} }; } },
    window: { createWebviewPanel: () => ({ webview: { cspSource: 'x', asWebviewUri: x => x,
      onDidReceiveMessage: handler => { receive = handler; }, postMessage: value => sent.push(value) } }) },
    workspace: { isTrusted: true, workspaceFolders: folders, getConfiguration: (_, uri) => ({
      get: (key, fallback) => key === 'routingPolicy' ? settings.get(uri?.fsPath) ?? fallback : 'node',
      update: async (key, value, target, resource) => {
        assert.equal(key, 'routingPolicy'); assert.equal(target, 5); assert.equal(resource, uri);
        settings.set(uri.fsPath, value);
      },
    }) },
  };
  createExtension(api, async (_, args, options) => {
    calls.push({ args, options });
    return args.includes('route') ? { routing: { selected: null, considered: [], explanation: 'No eligible model' } } : { tasks: [] };
  }).activate({ extensionUri: 'root', extensionPath: '/extension',
    globalStorageUri: { fsPath: '/data' }, subscriptions: [] });
  open(); await receive({ type: 'ready' });
  const policy = { mode: 'balanced', models: [model], allowUnknownAvailability: true };
  await receive({ type: 'routing-policy-save', policy });
  assert.deepEqual(settings.get('/a'), policy);
  await receive({ type: 'routing-policy-preview', request: 'Explain the code' });
  assert.equal(calls.find(call => call.args.includes('route')).options.env.CODOVYN_ROUTING_POLICY,
    JSON.stringify(policy));
  assert.equal(sent.at(-1).type, 'routing-policy-preview-result');
  assert.equal(calls.filter(call => call.args.includes('routed')).length, 0);
  await receive({ type: 'routing-policy-save', policy: { ...policy, secret: 'injected' } });
  assert.deepEqual(settings.get('/a'), policy);
  assert.equal(sent.at(-1).type, 'routing-policy-error');
  await receive({ type: 'project-select', root: '/b' });
  assert.deepEqual(sent.findLast(entry => entry.type === 'routing-policy').policy, {});
  await receive({ type: 'project-select', root: '/a' });
  assert.deepEqual(sent.findLast(entry => entry.type === 'routing-policy').policy, policy);
  api.workspace.isTrusted = false;
  await receive({ type: 'routing-policy-save', policy: { ...policy, mode: 'performance' } });
  assert.deepEqual(settings.get('/a'), policy);
});
