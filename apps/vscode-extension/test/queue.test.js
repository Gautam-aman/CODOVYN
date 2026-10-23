import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { main } from '../../cli/src/index.js';
import { TaskStore } from '../../../packages/storage/src/index.js';
const { createExtension } = createRequire(import.meta.url)('../extension.cjs');

test('host queue persists, revalidates, and dispatches through the existing engine with one durable task identity', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-host-queue-'));
  const repository = join(directory, 'repo'); let handler, open; const sent = []; let runs = 0; let routingPolicy = {};
  try {
    execFileSync('git', ['init', '-q', repository]); writeFileSync(join(repository, 'file.txt'), 'baseline');
    execFileSync('git', ['-C', repository, 'add', '.']);
    execFileSync('git', ['-C', repository, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline']);
    const root = resolve(repository);
    const api = {
      commands: { registerCommand: (id, cb) => { if (id === 'codovyn.open') open = cb; return { dispose() {} }; } },
      Uri: { joinPath: (_, ...parts) => parts.join('/') }, ViewColumn: { Beside: 2 },
      workspace: { isTrusted: true, workspaceFolders: [{ uri: { fsPath: root } }], getConfiguration: () => ({ get: key => key === 'routingPolicy' ? routingPolicy : 'node' }) },
      window: { showWarningMessage: async (_, __, choice) => choice, createWebviewPanel: () => ({ webview: {
        cspSource: 'x', asWebviewUri: x => x, onDidReceiveMessage: cb => { handler = cb; }, postMessage: message => sent.push(message),
      } }) },
    };
    const adapter = { id: 'codex', capabilities: { tools: true, streaming: true, writes: false }, availability: async () => 'available',
      async *run({ handoff }) { runs++; assert.match(handoff.request, /CODOVYN task mode: Plan/); yield { type: 'text', text: 'A fixture plan' }; yield { type: 'completed' }; } };
    const runner = async (_, args, options) => {
      const saved = {};
      for (const [key, value] of Object.entries(options.env)) { saved[key] = process.env[key]; process.env[key] = value; }
      let result;
      try {
        await main(args.slice(1), { log: line => { const data = JSON.parse(line); if (data.type === 'event') options.onEvent(data.event, data.taskId); if (data.type === 'result') result = data; }, error: () => {} }, undefined, undefined, { createCodexAdapter: () => adapter });
        return result;
      } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
    };
    createExtension(api, runner).activate({ extensionUri: 'root', extensionPath: resolve('.'), globalStorageUri: { fsPath: join(directory, 'data') }, subscriptions: [] }); open();
    const requestId = 'queued-host-request-123456';
    const configuration = { provider: 'codex', modelId: null, permission: 'read', routingMode: 'manual', reasoning: null, intent: 'plan' };
    await handler({ type: 'queue-add', requestId, request: 'Plan a test', taskConfiguration: configuration });
    await handler({ type: 'queue-add', requestId, request: 'Plan a test', taskConfiguration: configuration });
    const queue = sent.findLast(message => message.type === 'queue-state'); assert.equal(queue.tasks.length, 1);
    assert.equal(queue.tasks[0].id, requestId); assert.equal(runs, 0);
    await handler({ type: 'queue-start', id: requestId });
    assert.equal(runs, 1); assert.ok(sent.some(message => message.type === 'accepted' && message.taskId === requestId));
    assert.equal(sent.findLast(message => message.type === 'queue-state').tasks[0].status, 'completed');
    await handler({ type: 'queue-start', id: requestId }); assert.equal(runs, 1);
    await handler({ type: 'queue-add', requestId: 'changed-policy-request-123', request: 'Do not silently change policy', taskConfiguration: configuration });
    routingPolicy = { mode: 'economy' };
    await handler({ type: 'queue-start', id: 'changed-policy-request-123' });
    assert.equal(runs, 1, 'Changing the queued policy must not invoke another provider');
    assert.equal(sent.findLast(message => message.type === 'queue-state').tasks.find(task => task.id === 'changed-policy-request-123').status, 'queued');
    const db = new TaskStore(join(directory, 'data', 'private', 'tasks.sqlite'));
    assert.equal(db.get(requestId).request, 'Plan a test');
    assert.equal(db.events(requestId).find(event => event.kind === 'task-configuration').data.intent, 'plan'); db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
