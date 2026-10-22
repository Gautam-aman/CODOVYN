const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
exports.activate = async function (context) {
  const phase = process.env.CODOVYN_RESTORE_PHASE;
  const reportPath = process.env.CODOVYN_RESTORE_REPORT;
  if (!['write', 'read'].includes(phase) || !reportPath) return;
  const trace = (operation, state) => {
    const entry = { phase, operation, state, pid: process.pid, at: new Date().toISOString() };
    console.log('CODOVYN RESTORATION PHASE', JSON.stringify(entry));
    if (process.env.CODOVYN_HOST_TRACE) fs.appendFileSync(process.env.CODOVYN_HOST_TRACE, `${JSON.stringify(entry)}\n`);
  };
  const step = async (operation, action) => {
    trace(operation, 'pending');
    try { const value = await action(); trace(operation, 'complete'); return value; }
    catch (error) { trace(operation, 'failed'); throw error; }
  };
  trace('activation', 'complete');
  try {
    if (phase === 'write') {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) throw new Error('Write phase: no initial workspace');
      await new Promise(resolve => setTimeout(resolve, 1000));
      const uri = vscode.Uri.joinPath(folder.uri, 'restore.txt');
      const document = await step('open-document', () => vscode.workspace.openTextDocument(uri));
      await step('show-editor', () => vscode.window.showTextDocument(document));
      await step('close-other-editors', () => vscode.commands.executeCommand('workbench.action.closeOtherEditors'));
      await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'CODOVYN Warm Paper', vscode.ConfigurationTarget.Global);
      await vscode.workspace.getConfiguration('window').update('restoreWindows', 'all', vscode.ConfigurationTarget.Global);
      await context.globalState.update('checkpoint', { root: folder.uri.fsPath, file: uri.fsPath });
      fs.writeFileSync(reportPath, JSON.stringify({ phase, root: folder.uri.fsPath, file: uri.fsPath }));
    } else {
      const checkpoint = context.globalState.get('checkpoint');
      if (!checkpoint) throw new Error('Read phase: extension global state was not restored');
      if (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath !== checkpoint.root) throw new Error('Read phase: workspace was not restored');
      const deadline = Date.now() + 15000;
      while (vscode.window.activeTextEditor?.document.uri.fsPath !== checkpoint.file && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (vscode.window.activeTextEditor?.document.uri.fsPath !== checkpoint.file) throw new Error('Read phase: editor was not restored');
      const theme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
      if (theme !== 'CODOVYN Warm Paper') throw new Error('Read phase: theme was not restored');
      fs.writeFileSync(reportPath, JSON.stringify({ phase, workspace: true, editor: true, theme, localState: true }));
    }
  } catch (error) { fs.writeFileSync(reportPath, JSON.stringify({ phase, error: error.message })); }
  finally {
    // Exercise the normal native shutdown path rather than killing the process.
    await step('native-quit', () => vscode.commands.executeCommand('workbench.action.quit'));
  }
};
