const vscode = require('vscode');
const path = require('node:path');
exports.activate = function (context) {
  // Terminals and supported CLI wrappers can use the application's bundled Node/npm.
  const runtime = path.resolve(context.extensionPath, '../../../runtime/bin');
  context.environmentVariableCollection.prepend('PATH', `${runtime}${path.delimiter}`);
  const show = () => {
    const panel = vscode.window.createWebviewPanel('codovyn.welcome', 'Welcome to CODOVYN', vscode.ViewColumn.One, { enableScripts: true });
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-welcome'"><style>
    body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);max-width:700px;margin:8vh auto;padding:24px}h1{font-size:42px;letter-spacing:2px}p{line-height:1.7;color:var(--vscode-descriptionForeground)}button{display:block;margin:12px 0;padding:12px 20px;border:1px solid var(--vscode-button-border,transparent);border-radius:5px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);font:inherit;cursor:pointer}button:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}</style></head><body>
    <h1>CODOVYN</h1><h2>One IDE. Every Agent. Endless Flow.</h2><p>Open a project, connect an authorized coding agent, and review its changes before applying them. Your projects and task history stay local.</p>
    <button data-action="folder">Open a folder</button><button data-action="clone">Clone a Git repository</button><button data-action="agents">Open CODOVYN Chat</button><button data-action="agent-setup">Set up a coding agent</button><button data-action="settings">Configure CODOVYN</button>
    <p>Development alpha. Agent CLIs require their own installation and authorization. Live cross-provider failover is not yet verified.</p>
    <script nonce="welcome">const api=acquireVsCodeApi();document.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>api.postMessage({action:button.dataset.action})));</script></body></html>`;
    const actions = { folder: 'workbench.action.files.openFolder', clone: 'git.clone', agents: 'codovyn.openChat', 'agent-setup': 'codovyn.openAgentSettings', settings: 'workbench.action.openSettings' };
    panel.onDidDispose(() => subscription.dispose());
    const subscription = panel.webview.onDidReceiveMessage(async (message) => {
      if (!message || !Object.hasOwn(actions, message.action)) return;
      try { await vscode.commands.executeCommand(actions[message.action], ...(message.action === 'settings' ? ['codovyn'] : [])); }
      catch (error) { vscode.window.showErrorMessage(`CODOVYN: ${error.message}`); }
    });
  };
  context.subscriptions.push(vscode.commands.registerCommand('codovyn.desktop.welcome', show));
  if (!context.globalState.get('welcomed')) {
    // Start new profiles without an empty auxiliary pane; preserve established layouts.
    void vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar').then(show, show);
    void context.globalState.update('welcomed', true);
  }
};
