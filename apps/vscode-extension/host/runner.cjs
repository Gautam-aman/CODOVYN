const assert = require('node:assert/strict');
const vscode = require('vscode');

exports.run = async function run() {
  const extension = vscode.extensions.getExtension('codovyn-local.codovyn');
  assert.ok(extension, 'CODOVYN must be discovered by the extension host');
  await extension.activate();
  assert.equal(extension.isActive, true);

  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder?.uri.fsPath, 'Open a repository folder for the host test');

  const panel = await vscode.commands.executeCommand('codovyn.open');
  assert.ok(panel?.webview, 'The command must open a webview panel');
  assert.match(panel.webview.html, /Task activity/);
  assert.match(panel.webview.html, /workspace\.js/);
  panel.dispose();
  console.log(`CODOVYN extension host passed on VS Code ${vscode.version}`);

  if (process.env.CODOVYN_HOST_TEST_MARKER) {
    require('node:fs').writeFileSync(process.env.CODOVYN_HOST_TEST_MARKER,
      JSON.stringify({ version: vscode.version, extension: extension.id, folder: folder.uri.fsPath }));
  }
};
