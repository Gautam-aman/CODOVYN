const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const vscode = require('vscode');

function trace(state, data = {}) {
  const entry = { phase: process.env.CODOVYN_NATIVE_CHAT_PHASE || 'chat', state,
    pid: process.pid, monotonicNs: process.hrtime.bigint().toString(), at: new Date().toISOString(), ...data };
  console.log('CODOVYN NATIVE CHAT', JSON.stringify(entry));
  if (process.env.CODOVYN_HOST_TRACE) fs.appendFileSync(process.env.CODOVYN_HOST_TRACE, `${JSON.stringify(entry)}\n`);
}

function withDeadline(promise, milliseconds, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

async function seedOrVerifyJournal(folder) {
  const dataDirectory = process.env.CODOVYN_NATIVE_CHAT_DATA_DIR;
  assert.ok(dataDirectory, 'The Chat test requires an isolated application-owned journal directory.');
  const { TaskStore } = await import(pathToFileURL(path.resolve(__dirname, '../../../packages/storage/src/index.js')).href);
  const store = new TaskStore(path.join(dataDirectory, 'tasks.sqlite'));
  try {
    const existing = store.get('native-chat-journal');
    if (!existing) {
      store.create({ id: 'native-chat-journal', request: 'Persisted native journal request', repositoryRoot: fs.realpathSync(folder),
        primaryAgent: 'codex', fallbackAgents: [] });
      store.append('native-chat-journal', 'agent-started', { agent: 'codex' });
      store.append('native-chat-journal', 'agent-event', { agent: 'codex', event: {
        type: 'text', text: 'Persisted agent response from SQLite.' } });
      store.append('native-chat-journal', 'agent-event', { agent: 'codex', event: {
        type: 'tool-start', actionId: 'native-read-1', action: 'read_file' } });
      store.append('native-chat-journal', 'agent-event', { agent: 'codex', event: {
        type: 'tool-complete', actionId: 'native-read-1', action: 'read_file' } });
      store.append('native-chat-journal', 'task-completed', { agent: 'codex' });
      store.update('native-chat-journal', { status: 'completed', activeAgent: 'codex', step: 1 });
    } else {
      assert.equal(existing.request, 'Persisted native journal request');
      assert.equal(existing.status, 'completed');
    }
    assert.ok(store.events('native-chat-journal').some(event => event.kind === 'agent-event' && event.data.event.text === 'Persisted agent response from SQLite.'));
    // A persisted review fixture uses the real packet engine and SQLite, without inference.
    if(!store.get('native-contextflow-task')) {
      const {repositorySnapshot}=await import(pathToFileURL(path.resolve(__dirname,'../../../packages/git-engine/src/index.js')).href);
      const {prepareContextFlow}=await import(pathToFileURL(path.resolve(__dirname,'../../../packages/task-engine/src/contextflow.js')).href);
      const snapshot=await repositorySnapshot(folder);
      store.create({id:'native-contextflow-task',request:'Explain the native fixture project in chat-smoke.txt',repositoryRoot:snapshot.root,primaryAgent:'codex',fallbackAgents:[]});
      store.append('native-contextflow-task','task-configuration',{provider:'codex',modelId:null,permission:'read',routingMode:'manual',reasoning:'high',intent:'ask'});
      store.claimExecution('native-contextflow-task',{token:'native-contextflow-lease-token',pid:process.pid,host:require('node:os').hostname()});
      store.append('native-contextflow-task','agent-started',{agent:'codex',repository:snapshot});
      store.append('native-contextflow-task','agent-failed',{agent:'codex',kind:'quota'});
      store.append('native-contextflow-task','checkpoint',{repository:snapshot});
      store.update('native-contextflow-task',{status:'interrupted',activeAgent:'codex',step:0});
      store.releaseExecution('native-contextflow-task','native-contextflow-lease-token');
      await prepareContextFlow({store,taskId:'native-contextflow-task',dataDirectory,configuration:{provider:'opencode',modelId:null,permission:'read',routingMode:'manual',reasoning:null,intent:'ask'},destinationModel:'fixture/native-model',binding:'native-review-fixture-only'});
    }
    trace('journal-ready', { taskId: 'native-chat-journal', phase: process.env.CODOVYN_NATIVE_CHAT_PHASE });
  } finally { store.close(); }
}

exports.run = async () => {
  trace('runner-entry');
  assert.match(vscode.env.appName, /CODOVYN/);
  assert.equal(process.env.CODOVYN_NATIVE_CHAT_TEST, '1', 'Native Chat test mode must be explicitly enabled for this host.');
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(folder, 'Native Chat test has an isolated project workspace.');
  await seedOrVerifyJournal(folder);

  const extension = vscode.extensions.getExtension('codovyn-local.codovyn');
  assert.ok(extension, 'Packaged CODOVYN extension is installed in the standalone app.');
  await extension.activate();
  trace('agent-activation-complete');
  const panel = await vscode.commands.executeCommand('codovyn.open');
  assert.ok(panel?.webview?.postMessage && panel.webview.onDidReceiveMessage, 'The actual CODOVYN webview panel opened.');
  assert.match(panel.webview.html, /native-chat-harness\.js/, 'The isolated native test loaded the Chat inspection script.');

  const token = randomBytes(16).toString('hex');
  let readyResolve;
  let harnessResolve;
  let resultResolve;
  let resultReject;
  let readySeen = false;
  let harnessSeen = false;
  const webviewReady = new Promise(resolve => { readyResolve = resolve; });
  const harnessReady = new Promise(resolve => { harnessResolve = resolve; });
  const result = new Promise((resolve, reject) => { resultResolve = resolve; resultReject = reject; });
  const resultTimer = setTimeout(() => resultReject(new Error('Native Chat transcript verification exceeded 45 seconds.')), 45000);
  const listener = panel.webview.onDidReceiveMessage(message => {
    if (message?.type === 'ready' && !readySeen) { readySeen = true; readyResolve(); }
    if (message?.type === 'codovyn-native-chat-test-ready' && !harnessSeen) { harnessSeen = true; harnessResolve(); }
    if (message?.type === 'codovyn-native-chat-test-progress' && message.token === token) trace('webview-progress', { stage: message.stage });
    if (message?.type === 'codovyn-native-chat-test-result' && message.token === token) resultResolve(message.report);
  });
  try {
    await withDeadline(webviewReady, 20000, 'CODOVYN Chat webview did not report ready within 20 seconds.');
    await withDeadline(harnessReady, 20000, 'Native Chat harness script did not initialize within 20 seconds.');
    const posted = await panel.webview.postMessage({ type: 'codovyn-native-chat-test', token, phase: process.env.CODOVYN_NATIVE_CHAT_PHASE });
    assert.equal(posted, true, 'The trusted extension host delivered the native Chat test request to its webview.');
    trace('webview-test-requested');
    const report = await result;
    assert.equal(report?.passed, true, `Native Chat checks failed: ${report?.error || 'unknown failure'}`);
    for (const name of ['contextFlowNarrowAndFocus', 'providerSegmentPresentation', 'contextFlowReview', 'openCodeModelAndVariant', 'queueManagement', 'compactComposer', 'composerControls', 'submissionAcknowledgement', 'submittedPrompt', 'streamingOrderAndTextSafety', 'navigationAndActivitySeparation',
      'completionState', 'scrollFollowAndJump', 'sqliteJournalRestoration', 'interruptionState']) {
      assert.equal(report.checks?.[name], true, `Native Chat check did not pass: ${name}`);
    }
    assert.ok(report.checks.transcriptMessages.some(message => message.includes('Persisted agent response from SQLite.')));
    const output = process.env.CODOVYN_NATIVE_CHAT_REPORT;
    assert.ok(output, 'Native Chat report path is required.');
    fs.writeFileSync(output, JSON.stringify({ app: vscode.env.appName, version: vscode.version, ...report }, null, 2));
    const screenshot = process.env.CODOVYN_NATIVE_CHAT_SCREENSHOT;
    if (screenshot && process.platform === 'darwin') {
      const {captureDesktopWindow}=await import(pathToFileURL(path.resolve(__dirname,'../../../scripts/lib/desktop-capture.js')).href);
      fs.writeFileSync(screenshot,await captureDesktopWindow(Number(process.env.CODOVYN_NATIVE_CHAT_DEBUG_PORT)));
      trace('native-window-screenshot-captured', { screenshot });
    }
    trace('all-chat-assertions-passed', { report: output });
  } finally {
    clearTimeout(resultTimer);
    listener.dispose();
  }
  await vscode.commands.executeCommand('workbench.action.quit');
};
