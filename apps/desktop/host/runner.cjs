const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const vscode = require('vscode');
const hostStartedAt = process.hrtime.bigint();
function trace(phase, state, details = {}) {
  const entry = { phase, state, pid: process.pid,
    elapsedMs: Number(process.hrtime.bigint() - hostStartedAt) / 1e6, at: new Date().toISOString(), ...details };
  console.log('CODOVYN HOST PHASE', JSON.stringify(entry));
  if (process.env.CODOVYN_HOST_TRACE) fs.appendFileSync(process.env.CODOVYN_HOST_TRACE, `${JSON.stringify(entry)}\n`);
}
async function step(phase, action) {
  const startedAt = process.hrtime.bigint();
  trace(phase, 'pending');
  try {
    const result = await action();
    trace(phase, 'complete', { durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6 });
    return result;
  } catch (error) {
    trace(phase, 'failed', { durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      errorName: error?.name || 'Error', errorCode: error?.code || null });
    throw error;
  }
}
exports.run = async () => {
  trace('runner-entry', 'complete');
  assert.match(vscode.env.appName, /CODOVYN/);
  assert.equal(vscode.workspace.getConfiguration('workbench').get('secondarySideBar.defaultVisibility'), 'hidden', 'new workspaces keep the unused auxiliary pane hidden');
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const extension = vscode.extensions.getExtension('codovyn-local.codovyn');
  assert.ok(extension, 'packaged agent integration discovered');
  await step('agent-activation', () => extension.activate());
  const desktop = vscode.extensions.getExtension('codovyn-local.codovyn-desktop');
  assert.ok(desktop, 'desktop integration discovered');
  await step('desktop-activation', () => desktop.activate());
  if (process.env.CODOVYN_HOST_SEARCH_READY_GATE === '1') {
    await step('workspace-file-readiness', () => vscode.workspace.fs.stat(vscode.Uri.file(path.join(folder, 'desktop-smoke.txt'))));
  }
  let fileSearchDurationMs = null;
  const fileSearch = async () => {
    const include = process.env.CODOVYN_HOST_SEARCH_GLOB || '**/desktop-smoke.txt';
    const exclude = '**/node_modules/**';
    const source = new vscode.CancellationTokenSource();
    const startedAt = process.hrtime.bigint();
    const timeoutMs = 60000;
    let heartbeat;
    let timer;
    let searchPromise;
    trace('workspace-search-request', 'started', { include, exclude, maxResults: 10,
      workspaceFolderCount: vscode.workspace.workspaceFolders?.length || 0, trusted: vscode.workspace.isTrusted });
    try {
      searchPromise = vscode.workspace.findFiles(include, exclude, 10, source.token);
      trace('workspace-search-request', 'returned', { promiseLike: !!searchPromise && typeof searchPromise.then === 'function' });
      searchPromise.then(matches => trace('workspace-search-response', 'delivered', {
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6, matchCount: matches.length,
      }), error => trace('workspace-search-response', 'rejected', {
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
        errorName: error?.name || 'Error', errorCode: error?.code || null,
      }));
      heartbeat = setInterval(() => trace('extension-host-heartbeat', 'event-loop-responsive', {
        pendingOperation: 'workspace.findFiles', elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      }), 10000);
      const deadline = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
          trace('workspace-search-deadline', 'expired', { durationMs, cancellationRequested: true });
          reject(new Error(`workspace.findFiles did not settle within ${timeoutMs} ms`));
          source.cancel();
          trace('workspace-search-cancellation', 'requested', { durationMs });
        }, timeoutMs);
      });
      const matches = await Promise.race([searchPromise, deadline]);
      fileSearchDurationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      return matches;
    } finally {
      clearTimeout(timer);
      clearInterval(heartbeat);
      source.dispose();
    }
  };
  const matches = await step('workspace-search', fileSearch);
  assert.equal(matches.length, 1, 'native workspace file search locates the project file');
  const file = vscode.Uri.file(path.join(folder, 'desktop-smoke.txt'));
  const document = await step('open-document', () => vscode.workspace.openTextDocument(file));
  await step('show-editor', () => vscode.window.showTextDocument(document));
  const edit = new vscode.WorkspaceEdit();
  edit.insert(file, new vscode.Position(0, 0), 'Edited by CODOVYN Desktop\n');
  assert.equal(await step('apply-edit', () => vscode.workspace.applyEdit(edit)), true);
  assert.equal(await step('save-document', () => document.save()), true);
  assert.match(fs.readFileSync(file.fsPath, 'utf8'), /Edited by CODOVYN Desktop/);
  const saved=document.getText(),editor=vscode.window.activeTextEditor;
  const editorCommand=async(command,expected)=>{await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');await new Promise((resolve,reject)=>{let settled=false;const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);listener.dispose();error?reject(error):resolve();};const listener=vscode.workspace.onDidChangeTextDocument(event=>{if(event.document===document&&document.getText()===expected)finish();});const timer=setTimeout(()=>finish(new Error(command+' did not produce the expected document state')),5000);vscode.commands.executeCommand(command).then(()=>{if(document.getText()===expected)finish();},finish);});};
  assert.equal(editor.document,document);
  await step('editor-unsaved-edit',()=>editor.edit(builder=>builder.insert(document.positionAt(saved.length),'Unsaved undo witness\n')));
  assert.equal(document.isDirty,true);assert.equal(fs.readFileSync(file.fsPath,'utf8'),saved,'Unsaved text must not mutate disk');
  await step('editor-undo',()=>editorCommand('undo',saved));assert.equal(document.getText(),saved);
  await step('editor-redo',()=>editorCommand('redo',saved+'Unsaved undo witness\n'));assert.match(document.getText(),/Unsaved undo witness/);
  await editorCommand('undo',saved);assert.equal(document.getText(),saved);await document.save();
  const second=vscode.Uri.file(path.join(folder,'nested folder','second file.txt'));await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(second.fsPath)));await vscode.workspace.fs.writeFile(second,Buffer.from('Second native tab\n'));
  await vscode.window.showTextDocument(document,{preview:false});await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(second),{preview:false});
  const tabs=vscode.window.tabGroups.all.flatMap(group=>group.tabs).map(tab=>tab.input?.uri?.fsPath);assert.ok(tabs.includes(file.fsPath)&&tabs.includes(second.fsPath),'Both real editor tabs remain open');
  await step('explorer-view',()=>vscode.commands.executeCommand('workbench.view.explorer'));await step('git-view',()=>vscode.commands.executeCommand('workbench.view.scm'));
  if(process.env.CODOVYN_HOST_JAVA_VALIDATION==='1'){const java=await step('java-open-editor',()=>vscode.workspace.openTextDocument(vscode.Uri.file(path.join(folder,'src/main/java/dev/codovyn/Calculator.java'))));await vscode.window.showTextDocument(java);assert.equal(java.languageId,'java');assert.match(java.getText(),/class Calculator/);}
  const panel = await step('agent-panel', () => vscode.commands.executeCommand('codovyn.open'));
  assert.match(panel.webview.html, /Task activity/);
  assert.match(panel.webview.html, /routing-form\.cjs/, 'catalogue validator is loaded by the real agent webview');
  assert.equal(await step('agent-panel', () => vscode.commands.executeCommand('codovyn.open')), panel, 'reopening reveals the existing agent workspace');
  const inspectionHold = process.env.CODOVYN_HOST_INSPECTION_HOLD_MS;
  if (inspectionHold !== undefined) {
    const duration = Number(inspectionHold);
    assert.ok(Number.isSafeInteger(duration) && duration > 0 && duration <= 30000, 'inspection hold must be between 1 and 30000 ms');
    trace('inspection-hold', 'pending');
    await new Promise(resolve => setTimeout(resolve, duration));
    trace('inspection-hold', 'complete');
  }
  const node = path.resolve(extension.extensionPath, extension.packageJSON.codovynBundledRuntime);
  assert.match(execFileSync(node, ['--version'], { encoding: 'utf8' }), /^v26\./);
  const routeData = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'codovyn-native-route-'));
  try {
    const policy = { mode: 'balanced', models: [{ id: 'native-fixture', provider: 'codex', model: 'fixture',
      capabilities: ['streaming', 'tools'], reasoning: [], quality: 70, reliability: 0.8,
      availability: 'unknown', price: null }], allowUnknownAvailability: true };
    const cli = path.join(extension.extensionPath, 'apps/cli/src/index.js');
    const output = await step('bundled-cli-route', () => execFileSync(node, [cli, 'route', folder, 'Explain the fixture'], {
      encoding: 'utf8', cwd: folder, timeout: 10000,
      env: { ...process.env, CODOVYN_EVENT_STREAM: '1', CODOVYN_ROUTING_POLICY: JSON.stringify(policy), CODOVYN_DATA_DIR: routeData },
    }));
    const routing = JSON.parse(output).routing;
    assert.equal(routing?.selected?.id, 'native-fixture', `bundled CLI executes from the installed app path: ${output.slice(0, 500)}`);
  } finally { fs.rmSync(routeData, { recursive: true, force: true }); }
  assert.match(execFileSync('git', ['status', '--porcelain'], { cwd: folder, encoding: 'utf8' }), /desktop-smoke.txt/);
  trace('terminal', 'pending');
  const terminal = vscode.window.createTerminal({ name: 'CODOVYN smoke' });
  terminal.show();
  terminal.sendText('node -p "process.execPath" > terminal-smoke.txt');
  const end = Date.now() + 20000;
  while ((!fs.existsSync(path.join(folder, 'terminal-smoke.txt')) || !fs.readFileSync(path.join(folder, 'terminal-smoke.txt'), 'utf8').trim()) && Date.now() < end) await new Promise(r => setTimeout(r, 100));
  assert.equal(fs.readFileSync(path.join(folder, 'terminal-smoke.txt'), 'utf8').trim(), node);
  trace('terminal', 'complete');
  let javaValidation=null;
  if(process.env.CODOVYN_HOST_JAVA_VALIDATION==='1'){
    trace('java-terminal-tests','pending');
    terminal.sendText('/opt/homebrew/bin/mvn -B -ntp -o test > java-maven-output.txt 2>&1; codovyn_maven_status=$?; node -e \'require("fs").writeFileSync("java-test-result.json",JSON.stringify({exitCode:Number(process.argv[1])}))\' "$codovyn_maven_status"');
    const deadline=Date.now()+60000;const resultPath=path.join(folder,'java-test-result.json');while(!fs.existsSync(resultPath)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
    assert.ok(fs.existsSync(resultPath),'Integrated terminal completed bounded Maven verification');javaValidation=JSON.parse(fs.readFileSync(resultPath,'utf8'));assert.equal(javaValidation.exitCode,0,'Trusted disposable Java fixture passes independent Maven tests');
    const report=fs.readFileSync(path.join(folder,'target/surefire-reports/TEST-dev.codovyn.CalculatorTest.xml'),'utf8');assert.match(report,/tests="3"/);assert.match(report,/failures="0"/);assert.match(report,/errors="0"/);javaValidation={...javaValidation,tests:3,javaEditor:true};trace('java-terminal-tests','complete');
  }
  terminal.dispose(); panel.dispose();
  const report = { app: vscode.env.appName, version: vscode.version, edit: true, undoRedo:true, unsavedDiskIsolation:true, multipleTabs:true, explorerAndGitViews:true, fileSearch: true, fileSearchDurationMs,
    fileSearchPattern: process.env.CODOVYN_HOST_SEARCH_GLOB || '**/desktop-smoke.txt', git: true, terminal: true, bundledNode: true,...(javaValidation?{javaValidation}: {}) };
  fs.writeFileSync(path.join(folder, 'host-result.json'), JSON.stringify(report, null, 2));
  console.log('CODOVYN DESKTOP HOST PASSED', report);
};
