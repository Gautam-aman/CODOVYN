import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

if (process.platform !== 'darwin') throw new Error('The routing UI smoke test requires the standalone macOS desktop build.');
const root = resolve(import.meta.dirname, '..');
const app = process.env.CODOVYN_DESKTOP_APP ? resolve(process.env.CODOVYN_DESKTOP_APP) : join(root, 'dist/desktop/CODOVYN.app');
const temporary = await mkdtemp(join(tmpdir(), 'codovyn-routing-ui-'));
const workspaceFile = join(temporary, 'workspace-path');
const port = 9400 + Math.floor(Math.random() * 500);
const child = spawn(process.execPath, [join(root, 'scripts/run-desktop-host.js')], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, CODOVYN_DESKTOP_APP: app, CODOVYN_HOST_DEBUG_PORT: String(port),
    CODOVYN_HOST_INSPECTION_HOLD_MS: '20000', CODOVYN_HOST_WORKSPACE_FILE: workspaceFile },
});
const childExited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  output += chunk.toString();
  if (output.length > 2_000_000) output = output.slice(-1_000_000);
});
let socket;
let frontSocket;
let sequence = 0;
let contextId;
const contexts = [];
const pending = new Map();
try {
  const deadline = Date.now() + 100_000;
  let target, mainTarget;
  while (Date.now() < deadline && (!target || !mainTarget)) {
    if (child.exitCode !== null) throw new Error(`Native host exited before inspection (${child.exitCode}).`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(500) });
      const targets = await response.json();
      target = targets.find(item => item.type === 'iframe' && item.url.startsWith('vscode-webview:') &&
        item.url.includes('extensionId=codovyn-local.codovyn'));
      mainTarget = targets.find(item => item.type === 'page' && item.title.includes('Extension Development Host'));
    } catch { /* Wait for the isolated native host to activate its real webview. */ }
    if (!target) await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.ok(target, `CODOVYN webview did not appear. Host output:\n${output}`);
  assert.ok(mainTarget, `Native host page did not appear. Host output:\n${output}`);
  frontSocket = new WebSocket(mainTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out connecting to native host page.')), 3000);
    frontSocket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    frontSocket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Could not connect to native host page.')); }, { once: true });
  });
  await new Promise((resolve, reject) => {
    const id = 1, timer = setTimeout(() => reject(new Error('Native window activation timed out.')), 2500);
    frontSocket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timer);
      message.error ? reject(new Error(message.error.message)) : resolve();
    });
    frontSocket.send(JSON.stringify({ id, method: 'Page.bringToFront' }));
  });
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out connecting to the CODOVYN webview.')), 3000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Could not connect to the CODOVYN webview.')); }, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.executionContextCreated') contexts.push(message.params.context);
    if (message.method === 'Runtime.executionContextDestroyed') {
      const index = contexts.findIndex(context => context.id === message.params.executionContextId);
      if (index >= 0) contexts.splice(index, 1);
      if (contextId === message.params.executionContextId) contextId = undefined;
    }
    const waiter = pending.get(message.id);
    if (waiter) { pending.delete(message.id); message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result); }
  });
  const send = async (method, params = {}) => {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out.`)); }, 2500);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };
  await send('Runtime.enable');
  const evaluate = async expression => {
    const run = async selectedContext => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true,
        ...(selectedContext === undefined ? {} : { contextId: selectedContext }) });
      if (result.exceptionDetails) return undefined;
      return result.result?.value;
    };
    if (contextId !== undefined) return run(contextId);
    for (const context of [...contexts]) {
      const containsCatalogue = await send('Runtime.evaluate', { expression: "!!document.querySelector('.routing-settings')",
        returnByValue: true, contextId: context.id }).catch(() => null);
      if (containsCatalogue?.result?.value) { contextId = context.id; return run(contextId); }
    }
    return undefined;
  };
  const waitFor = async (expression, message) => {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`${message} target=${target.url}; document=${JSON.stringify(await evaluate("({ title: document.title, ready: document.readyState, body: document.body?.innerText?.slice(0, 2000), html: document.documentElement?.innerHTML?.slice(0, 1000) })"))}`);
  };
  const click = label => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(label)}); if (!button) return false; button.click(); return true; })()`);
  await waitFor("!!document.querySelector('.routing-settings')", 'Routing catalogue did not render.');
  const added = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Add model'); button.click(); return { count: document.querySelectorAll('.routing-model').length, active: document.activeElement?.outerHTML?.slice(0, 160) }; })()`);
  assert.equal(added.count, 1);
  const fields = { 'Catalogue ID': 'phase6-fixture', 'Provider model identifier': 'fixture-model',
    'User policy quality score (0–100)': '70', 'User policy reliability score (0–1)': '0.8',
    'Capabilities (comma-separated: streaming, tools, writes)': 'streaming, tools' };
  for (const [label, value] of Object.entries(fields)) {
    await evaluate(`(() => { const input = document.querySelector('[aria-label=${JSON.stringify(label)}]'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  }
  await evaluate("document.querySelector('.routing-model select').value = 'codex'; document.querySelector('.routing-model select').dispatchEvent(new Event('change', { bubbles: true }));");
  await click('Save routing policy');
  await waitFor("!!document.querySelector('.routing-settings [role=status]')?.textContent.trim() && !document.querySelector('.routing-settings [role=status]')?.textContent.includes('Validating routing settings')", 'Catalogue save did not resolve.');
  const saveStatus = await evaluate("document.querySelector('.routing-settings [role=status]')?.textContent");
  assert.match(saveStatus, /Routing policy saved/, `Valid catalogue save failed: ${saveStatus}`);
  const workspace = (await readFile(workspaceFile, 'utf8')).trim();
  const savedSettings = JSON.parse(await readFile(join(workspace, '.vscode/settings.json'), 'utf8'));
  assert.equal(savedSettings['codovyn.routingPolicy'].models[0].id, 'phase6-fixture', 'Valid catalogue persists in the opened workspace.');

  await evaluate("document.querySelector('[aria-label=\"Catalogue ID\"]').value = 'unsaved-change'; document.querySelector('[aria-label=\"Catalogue ID\"]').dispatchEvent(new Event('input', { bubbles: true }));");
  await click('Discard unsaved edits');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Catalogue ID\"]').value"), 'phase6-fixture', 'Discard restores the last saved catalogue.');
  await click('Add model');
  await click('Discard unsaved edits');
  assert.equal(await evaluate("document.querySelectorAll('.routing-model').length"), 1, 'Discard removes unsaved catalogue rows.');

  await evaluate("document.querySelector('[aria-label=\"Catalogue ID\"]').value = ''; document.querySelector('[aria-label=\"Catalogue ID\"]').dispatchEvent(new Event('input', { bubbles: true }));");
  await click('Save routing policy');
  const invalid = await evaluate("(() => { const input = document.querySelector('[aria-label=\"Catalogue ID\"]'); const id = input.getAttribute('aria-describedby'); return { invalid: input.getAttribute('aria-invalid'), described: !!id && !!document.getElementById(id), focused: document.activeElement === input, error: document.querySelector('[role=alert]')?.textContent }; })()");
  const { focused: focusVerifiedByNativeHarness, ...validation } = invalid;
  assert.deepEqual(validation, { invalid: 'true', described: true,
    error: 'Use 1–128 letters, numbers, dots, underscores, slashes or hyphens; start with a letter or number.' });
  await click('Discard unsaved edits');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Catalogue ID\"]').value"), 'phase6-fixture');
  console.log('Verified native routing form: valid workspace save, discard restoration, and associated validation error.',
    `DOM focus observability: ${focusVerifiedByNativeHarness ? 'yes' : 'unavailable in the isolated webview harness'}.`);
  let exitTimer;
  const exit = await Promise.race([childExited, new Promise((_, reject) => {
    exitTimer = setTimeout(() => reject(new Error('Native host did not finish its bounded lifecycle after routing verification.')), 60_000);
  })]);
  clearTimeout(exitTimer);
  assert.equal(exit.code, 0, `Native host exited ${exit.code} (${exit.signal}).`);
} catch (error) {
  console.error(`Routing UI verification failed. Host output:\n${output}`);
  throw error;
} finally {
  socket?.close();
  frontSocket?.close();
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
  if (child.exitCode === null) child.kill('SIGKILL');
  if (child.exitCode === 0) await rm(temporary, { recursive: true, force: true });
  else console.error(`Preserved routing UI diagnostics at ${temporary}`);
}
if (child.exitCode !== 0) throw new Error(`Native host returned ${child.exitCode}; see lifecycle diagnostics.`);
