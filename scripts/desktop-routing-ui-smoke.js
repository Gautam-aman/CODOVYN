import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  // Let the native harness reach its own 120s deadline first so a host stall
  // retains a timeout phase instead of being mislabeled as external cancel.
  const deadline = Date.now() + 130_000;
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
  const connectWebview = async () => {
    const attachDeadline = Date.now() + 15_000;
    let lastError = 'No matching CODOVYN webview target.';
    while (Date.now() < attachDeadline) {
      let candidate;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(500) });
        const targets = await response.json();
        target = targets.find(item => item.type === 'iframe' && item.url.startsWith('vscode-webview:') &&
          item.url.includes('extensionId=codovyn-local.codovyn'));
        if (!target) throw new Error('CODOVYN webview target is temporarily unavailable.');
        candidate = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Webview socket attach exceeded 1200 ms.')), 1200);
          candidate.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
          candidate.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Webview target closed during attach.')); }, { once: true });
          candidate.addEventListener('close', () => { clearTimeout(timer); reject(new Error('Webview target closed during attach.')); }, { once: true });
        });
        return candidate;
      } catch (error) {
        lastError = error.message;
        candidate?.close();
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    throw new Error(`Could not attach to the CODOVYN webview within 15 seconds: ${lastError}`);
  };
  socket = await connectWebview();
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
  const captureApplication = () => new Promise((resolve, reject) => {
    const id = 2;
    const timer = setTimeout(() => { frontSocket.removeEventListener('message', receive); reject(new Error('Application screenshot timed out.')); }, 3000);
    const receive = event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timer);
      frontSocket.removeEventListener('message', receive);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    };
    frontSocket.addEventListener('message', receive);
    frontSocket.send(JSON.stringify({ id, method: 'Page.captureScreenshot', params: { format: 'png', captureBeyondViewport: false } }));
  });
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
    throw new Error(`${message} target=${target.url}; contexts=${JSON.stringify(contexts.map(({ id, name, origin, auxData }) => ({ id, name, origin, frameId: auxData?.frameId })))}; document=${JSON.stringify(await evaluate("({ title: document.title, ready: document.readyState, body: document.body?.innerText?.slice(0, 2000), html: document.documentElement?.innerHTML?.slice(0, 1000) })"))}`);
  };
  const click = label => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(label)}); if (!button) return false; button.click(); return true; })()`);
  const selectTab = view => evaluate(`document.querySelector('[data-workspace-view=${JSON.stringify(view)}]').click()`);
  await waitFor("!!document.querySelector('.routing-settings')", 'Routing catalogue did not render.');
  const tabs = await evaluate("[...document.querySelectorAll('[role=tab]')].map(tab => ({ label: tab.textContent, selected: tab.getAttribute('aria-selected'), tabIndex: tab.tabIndex, panel: tab.getAttribute('aria-controls') }))");
  assert.deepEqual(tabs.map(tab => tab.label), ['Chat', 'Activity', 'History', 'Changes', 'Settings'],
    'The workspace exposes five discoverable destinations.');
  const tabBounds = await evaluate("(() => { const list = document.querySelector('[role=tablist]').getBoundingClientRect(); return { list: { left: list.left, right: list.right }, tabs: [...document.querySelectorAll('[role=tab]')].map(tab => { const rect = tab.getBoundingClientRect(); return { label: tab.textContent.trim(), left: rect.left, right: rect.right, width: rect.width, scrollWidth: tab.scrollWidth, clientWidth: tab.clientWidth }; }) }; })()");
  assert.ok(tabBounds.tabs.every(tab => tab.width > 0 && tab.left >= tabBounds.list.left - 1 && tab.right <= tabBounds.list.right + 1 && tab.scrollWidth <= tab.clientWidth + 1),
    `All five destinations fit without clipping in the native sidebar: ${JSON.stringify(tabBounds)}`);
  assert.equal(tabs.filter(tab => tab.selected === 'true' && tab.tabIndex === 0).length, 1,
    'Exactly one workspace destination is selected and in the tab order.');
  await evaluate("document.querySelector('[data-workspace-view=activity]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))");
  assert.equal(await evaluate("document.querySelector('[data-workspace-view=history]').getAttribute('aria-selected')"), 'true',
    'ArrowRight advances the roving workspace tabs.');
  await evaluate("document.querySelector('[data-workspace-view=history]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))");
  assert.equal(await evaluate("document.querySelector('[data-workspace-view=chat]').getAttribute('aria-selected')"), 'true',
    'Home returns focus navigation to Chat.');
  await evaluate("document.querySelector('[data-workspace-view=chat]').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))");
  assert.equal(await evaluate("document.querySelector('[data-workspace-view=settings]').getAttribute('aria-selected')"), 'true',
    'End moves to Settings.');
  assert.equal(await evaluate("vscode.getState()?.activeWorkspaceView"), 'settings',
    'The selected destination is persisted through the host-supported webview state API.');
  const tabVisibility = await evaluate("[...document.querySelectorAll('[role=tabpanel]')].map(panel => ({ id: panel.id, hidden: panel.hidden, labelled: panel.getAttribute('aria-labelledby') }))");
  assert.equal(tabVisibility.filter(panel => !panel.hidden).length, 1,
    'Switching destinations leaves one visible panel and keeps every panel labelled.');
  await selectTab('chat');
  for (const [section, selector] of [['agents', '.agent-settings'], ['routing', '.routing-settings']]) {
    await evaluate(`window.dispatchEvent(new MessageEvent('message', { data: { type: 'focus-section', section: ${JSON.stringify(section)} } }))`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).open`), true,
      `The ${section} command expands its destination in the real webview.`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).open = false`);
  }
  const added = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Add model'); button.click(); return { count: document.querySelectorAll('.routing-model').length, active: document.activeElement?.outerHTML?.slice(0, 160) }; })()`);
  assert.equal(added.count, 1);
  const fields = { 'Catalogue ID': 'phase6-fixture', 'Provider model identifier': 'fixture-model',
    'User policy quality score (0–100)': '70', 'User policy reliability score (0–1)': '0.8',
    'Capabilities (comma-separated: streaming, tools, writes)': 'streaming, tools' };
  for (const [label, value] of Object.entries(fields)) {
    await evaluate(`(() => { const input = document.querySelector('[aria-label=${JSON.stringify(label)}]'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  }
  await evaluate("document.querySelector('.routing-model select').value = 'codex'; document.querySelector('.routing-model select').dispatchEvent(new Event('change', { bubbles: true }));");
  await selectTab('history');
  await selectTab('settings');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Catalogue ID\"]').value"), 'phase6-fixture',
    'Navigating away from Settings and back preserves an in-progress catalogue form.');
  await click('Save routing policy');
  await waitFor("!!document.querySelector('.routing-settings [role=status]')?.textContent.trim() && !document.querySelector('.routing-settings [role=status]')?.textContent.includes('Validating routing settings')", 'Catalogue save did not resolve.');
  const saveStatus = await evaluate("document.querySelector('.routing-settings [role=status]')?.textContent");
  assert.match(saveStatus, /Routing policy saved/, `Valid catalogue save failed: ${saveStatus}`);
  const workspace = (await readFile(workspaceFile, 'utf8')).trim();
  const savedSettings = JSON.parse(await readFile(join(workspace, '.vscode/settings.json'), 'utf8'));
  assert.equal(savedSettings['codovyn.routingPolicy'].models[0].id, 'phase6-fixture', 'Valid catalogue persists in the opened workspace.');

  await evaluate("document.querySelector('[aria-label=\"Catalogue ID\"]').value = 'unsaved-before-project-change'; document.querySelector('[aria-label=\"Catalogue ID\"]').dispatchEvent(new Event('input', { bubbles: true }));");
  const projectSwitch = await evaluate(`(() => { const select = document.querySelector('#project'); const option = document.createElement('option'); option.value = '/codovyn-unavailable-project-fixture'; option.textContent = 'Unavailable project fixture'; select.append(option); select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); return { selected: select.value, status: document.querySelector('.routing-settings [role=status]').textContent, id: document.querySelector('[aria-label="Catalogue ID"]').value }; })()`);
  assert.deepEqual(projectSwitch, { selected: workspace, status: 'Save or discard unsaved routing edits before switching projects.', id: 'unsaved-before-project-change' },
    'An attempted project switch preserves unsaved catalogue edits.');
  await click('Discard unsaved edits');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Catalogue ID\"]').value"), 'phase6-fixture');

  await click('Remove model');
  assert.equal(await evaluate("document.querySelectorAll('.routing-model').length"), 0, 'Removing a model removes the unsaved row.');
  await click('Discard unsaved edits');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Catalogue ID\"]').value"), 'phase6-fixture', 'Discard restores a removed saved model.');
  assert.equal(JSON.parse(await readFile(join(workspace, '.vscode/settings.json'), 'utf8'))['codovyn.routingPolicy'].models[0].id,
    'phase6-fixture', 'Discard does not alter the persisted project setting.');
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
  await evaluate("window.dispatchEvent(new MessageEvent('message', { data: { type: 'running' } }))");
  const runningBeforeSwitch = await evaluate("({ status: document.querySelector('#status').textContent, cancelDisabled: document.querySelector('#cancel').disabled })");
  await selectTab('history');
  const runningAfterSwitch = await evaluate("({ status: document.querySelector('#status').textContent, cancelDisabled: document.querySelector('#cancel').disabled })");
  assert.deepEqual(runningAfterSwitch, runningBeforeSwitch,
    'Changing workspace views preserves the active task status and cancellation control.');
  await selectTab('activity');
  await evaluate("document.querySelector('#timeline').scrollTop = document.querySelector('#timeline').scrollHeight");
  await evaluate("window.dispatchEvent(new MessageEvent('message', { data: { type: 'progress', entries: Array.from({ length: 48 }, (_, index) => ({ type: 'tool', text: `Fixture activity ${index}` })) } }))");
  await new Promise(resolve => setTimeout(resolve, 100));
  const followed = await evaluate("({ bottom: document.querySelector('#timeline').scrollHeight - document.querySelector('#timeline').scrollTop - document.querySelector('#timeline').clientHeight <= 5, hidden: document.querySelector('.jump-to-latest').hidden, count: document.querySelectorAll('#timeline > li').length, scrollTop: document.querySelector('#timeline').scrollTop, clientHeight: document.querySelector('#timeline').clientHeight, scrollHeight: document.querySelector('#timeline').scrollHeight })");
  assert.equal(followed.bottom, true, `Streaming updates keep a user at the latest activity when already following: ${JSON.stringify(followed)}`);
  assert.equal(followed.hidden, true, 'Jump control stays hidden while following the latest activity.');
  assert.equal(followed.count, 48, 'Activity rows are appended as a single batch.');
  await evaluate("document.querySelector('#timeline').scrollTop = 0");
  await evaluate("window.dispatchEvent(new MessageEvent('message', { data: { type: 'progress', entries: [{ type: 'tool', text: 'New activity while reading older entries' }] } }))");
  const paused = await evaluate("({ top: document.querySelector('#timeline').scrollTop < 5, visible: !document.querySelector('.jump-to-latest').hidden, label: document.querySelector('.jump-to-latest').getAttribute('aria-label') })");
  assert.equal(paused.top, true, 'New events do not pull a reader away from older activity.');
  assert.equal(paused.visible, true, 'New activity exposes the jump-to-latest action.');
  assert.equal(paused.label, 'Jump to the latest task activity', 'Jump control has an accessible name.');
  await click('Jump to latest activity');
  await waitFor("document.querySelector('#timeline').scrollHeight - document.querySelector('#timeline').scrollTop - document.querySelector('#timeline').clientHeight <= 5",
    'Jump control did not scroll to the newest event.');
  await selectTab('history');
  await evaluate("window.dispatchEvent(new MessageEvent('message', { data: { type: 'tasks', tasks: [ { id: 'fixture-complete-1', request: 'Refactor Java parser', status: 'completed' }, { id: 'fixture-complete-2', request: 'Document routing policy', status: 'completed' }, { id: 'fixture-interrupted', request: 'Recover parser task', status: 'interrupted' } ] } }))");
  const allTasks = await evaluate("document.querySelectorAll('#tasks button.task').length");
  assert.equal(allTasks, 3, 'Task history renders the supplied recent journal entries.');
  const interruptedRow = await evaluate("(() => { const row = document.querySelectorAll('#tasks > li')[2]; const task = row.querySelector('.task').getBoundingClientRect(); const resume = [...row.querySelectorAll('button')].find(button => button.textContent.includes('Resume safe read task')).getBoundingClientRect(); return { row: row.getBoundingClientRect().width, task: task.width, resume: resume.width }; })()");
  assert.ok(interruptedRow.task > interruptedRow.row * 0.75 && interruptedRow.resume < interruptedRow.row * 0.6,
    `Long recovery controls must not crush task titles: ${JSON.stringify(interruptedRow)}`);
  await evaluate("document.querySelector('#task-search').value = 'PARSER'; document.querySelector('#task-search').dispatchEvent(new Event('input', { bubbles: true }))");
  assert.equal(await evaluate("document.querySelectorAll('#tasks button.task').length"), 2, 'Task search is case-insensitive and filters prompt text.');
  await evaluate("document.querySelector('#task-status-filter').value = 'interrupted'; document.querySelector('#task-status-filter').dispatchEvent(new Event('change', { bubbles: true }))");
  assert.equal(await evaluate("document.querySelectorAll('#tasks button.task').length"), 1, 'Status filtering composes with search.');
  await evaluate("document.querySelector('#task-search').value = 'no-match'; document.querySelector('#task-search').dispatchEvent(new Event('input', { bubbles: true }))");
  assert.equal(await evaluate("document.querySelector('#tasks').textContent"), 'No recent tasks match this search and status filter.', 'Empty filtered results explain the current state.');
  await evaluate("document.querySelector('#task-search').value = ''; document.querySelector('#task-search').dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#task-status-filter').value = 'all'; document.querySelector('#task-status-filter').dispatchEvent(new Event('change', { bubbles: true }))");
  if (process.env.CODOVYN_CAPTURE_DIR) {
    await evaluate("window.dispatchEvent(new MessageEvent('message', { data: { type: 'result', status: 'completed', taskId: 'fixture-task', timeline: [] } }))");
    await selectTab('history');
    await evaluate("document.querySelector('.recent').scrollIntoView({ block: 'start', behavior: 'instant' })");
    const capture = await captureApplication();
    const captureDirectory = resolve(process.env.CODOVYN_CAPTURE_DIR);
    await mkdir(captureDirectory, { recursive: true });
    await writeFile(join(captureDirectory, 'desktop-phase8-workspace-navigation.png'), Buffer.from(capture.data, 'base64'));
  }
  console.log('Verified native routing form: valid workspace save, discard restoration, and associated validation error.',
    `DOM focus observability: ${focusVerifiedByNativeHarness ? 'yes' : 'unavailable in the isolated webview harness'}. Task timeline follow and local recent-task filters also passed.`);
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
