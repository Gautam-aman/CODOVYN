const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const vscode = require('vscode');
function trace(phase, state) {
  const entry = { phase, state, pid: process.pid, at: new Date().toISOString() };
  console.log('CODOVYN HOST PHASE', JSON.stringify(entry));
  if (process.env.CODOVYN_HOST_TRACE) fs.appendFileSync(process.env.CODOVYN_HOST_TRACE, `${JSON.stringify(entry)}\n`);
}
async function step(phase, action) {
  trace(phase, 'pending');
  try { const result = await action(); trace(phase, 'complete'); return result; }
  catch (error) { trace(phase, 'failed'); throw error; }
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
  const matches = await step('workspace-search', () => vscode.workspace.findFiles('**/desktop-smoke.txt', '**/node_modules/**', 10));
  assert.equal(matches.length, 1, 'native workspace file search locates the project file');
  const file = vscode.Uri.file(path.join(folder, 'desktop-smoke.txt'));
  const document = await step('open-document', () => vscode.workspace.openTextDocument(file));
  await step('show-editor', () => vscode.window.showTextDocument(document));
  const edit = new vscode.WorkspaceEdit();
  edit.insert(file, new vscode.Position(0, 0), 'Edited by CODOVYN Desktop\n');
  assert.equal(await step('apply-edit', () => vscode.workspace.applyEdit(edit)), true);
  assert.equal(await step('save-document', () => document.save()), true);
  assert.match(fs.readFileSync(file.fsPath, 'utf8'), /Edited by CODOVYN Desktop/);
  const panel = await step('agent-panel', () => vscode.commands.executeCommand('codovyn.open'));
  assert.match(panel.webview.html, /Task activity/);
  assert.equal(await step('agent-panel', () => vscode.commands.executeCommand('codovyn.open')), panel, 'reopening reveals the existing agent workspace');
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
  terminal.dispose(); panel.dispose();
  const report = { app: vscode.env.appName, version: vscode.version, edit: true, fileSearch: true, git: true, terminal: true, bundledNode: true };
  fs.writeFileSync(path.join(folder, 'host-result.json'), JSON.stringify(report, null, 2));
  console.log('CODOVYN DESKTOP HOST PASSED', report);
};
