const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
exports.activate = async function (context) {
  const phase = process.env.CODOVYN_RESTORE_PHASE;
  const reportPath = process.env.CODOVYN_RESTORE_REPORT;
  if (!['write', 'read'].includes(phase) || !reportPath) return;
  try {
    if (phase === 'write') {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) throw new Error('Write phase: no initial workspace');
      await new Promise(resolve => setTimeout(resolve, 1000));
      const uri = vscode.Uri.joinPath(folder.uri, 'restore.txt');
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('workbench.action.closeOtherEditors');
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
    await vscode.commands.executeCommand('workbench.action.quit');
  }
};
