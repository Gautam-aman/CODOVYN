const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { join } = require('node:path');

function timeline(events) {
  return events.flatMap((entry) => {
    if (entry.kind === 'agent-event' && entry.data.event.type === 'text') return [{ type: 'message', text: entry.data.event.text }];
    if (entry.kind === 'agent-started') return [{ type: 'agent', text: `Started ${entry.data.agent}` }];
    if (entry.kind === 'handoff') return [{ type: 'handoff', text: `Switched from ${entry.data.from} to ${entry.data.to}` }];
    if (entry.kind === 'agent-failed') return [{ type: 'error', text: `${entry.data.agent}: ${entry.data.kind}` }];
    if (entry.kind === 'task-completed') return [{ type: 'complete', text: `Completed with ${entry.data.agent}` }];
    if (entry.kind === 'task-cancelled') return [{ type: 'error', text: 'Task cancelled' }];
    return [];
  });
}

function runCli(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    options.onChild(child);
    let stdout = '';
    let oversized = false;
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 10 * 1024 * 1024) { oversized = true; child.kill(); }
    });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) => {
      if (oversized) return reject(new Error('Task output exceeded the display limit'));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error(`Task process exited without a result (status ${code})`)); }
    });
  });
}

function createExtension(api, runner = runCli) {
  return {
    activate(context) {
      const command = api.commands.registerCommand('codovyn.open', () => {
        const panel = api.window.createWebviewPanel('codovyn.task', 'CODOVYN', api.ViewColumn.Beside, {
          enableScripts: true,
          localResourceRoots: [api.Uri.joinPath(context.extensionUri, 'apps', 'vscode-extension', 'media')],
        });
        const nonce = randomBytes(16).toString('base64');
        const media = (...segments) => panel.webview.asWebviewUri(api.Uri.joinPath(context.extensionUri, 'apps', 'vscode-extension', 'media', ...segments));
        panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${media('workspace.css')}"><title>CODOVYN</title></head><body><main><header><div class="mark">C</div><div><h1>CODOVYN</h1><p>One IDE. Every Agent. Endless Flow.</p></div></header><section class="composer"><label for="agent">Agent</label><select id="agent"><option value="demo">Demo handoff</option><option value="codex">Codex CLI · read only</option></select><label for="request">What would you like to work on?</label><textarea id="request" rows="5" maxlength="10000" placeholder="Describe a task in this repository"></textarea><div class="actions"><button id="run" type="button">Start task</button><button id="cancel" type="button" disabled>Cancel</button></div></section><section class="activity"><div class="section-head"><h2>Task activity</h2><span id="status" role="status" aria-live="polite">Ready</span></div><ol id="timeline" aria-label="Agent activity"></ol><p id="empty">Task steps and agent handoffs will appear here.</p></section><footer>Local task history stays on this device.</footer></main><script nonce="${nonce}" src="${media('workspace.js')}"></script></body></html>`;
        let active = null;
        panel.webview.onDidReceiveMessage(async (message) => {
          if (!message || typeof message !== 'object') return;
          if (message.type === 'cancel') { active?.kill('SIGTERM'); return; }
          if (message.type !== 'run' || active) return;
          if (!['demo', 'codex'].includes(message.mode) || typeof message.request !== 'string') return;
          const request = message.request.trim();
          if (!request || request.length > 10000) return;
          const folder = api.workspace.workspaceFolders?.[0];
          if (!folder) { panel.webview.postMessage({ type: 'error', text: 'Open a Git repository folder first.' }); return; }
          if (message.mode === 'codex' && !api.workspace.isTrusted) {
            panel.webview.postMessage({ type: 'error', text: 'Trust this workspace before using Codex.' }); return;
          }
          panel.webview.postMessage({ type: 'running' });
          const nodePath = api.workspace.getConfiguration('codovyn').get('nodePath', 'node');
          const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
          try {
            const result = await runner(nodePath, [script, message.mode, folder.uri.fsPath, request], {
              cwd: folder.uri.fsPath,
              env: { ...process.env, CODOVYN_DATA_DIR: context.globalStorageUri.fsPath },
              onChild: (child) => { active = child; },
            });
            panel.webview.postMessage({ type: 'result', status: result.status, taskId: result.taskId,
              activeAgent: result.activeAgent, timeline: timeline(result.events || []) });
          } catch (error) { panel.webview.postMessage({ type: 'error', text: error.message }); }
          finally { active = null; }
        });
        return panel;
      });
      context.subscriptions.push(command);
    },
  };
}

function activate(context) { createExtension(require('vscode')).activate(context); }
module.exports = { activate, createExtension, timeline };
