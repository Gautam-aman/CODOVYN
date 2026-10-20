const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { lstatSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { StringDecoder } = require('node:string_decoder');

function dataDirectory(globalStoragePath) {
  const privatePath = join(globalStoragePath, 'private');
  try {
    const legacyDatabase = lstatSync(join(globalStoragePath, 'tasks.sqlite'));
    const directory = statSync(globalStoragePath);
    if (legacyDatabase.isFile() && (process.platform === 'win32' || !(directory.mode & 0o077))) {
      return globalStoragePath;
    }
  } catch { /* A new installation has no legacy database. */ }
  return privatePath;
}

function timeline(events) {
  return events.flatMap((entry) => {
    if (entry.kind === 'agent-event' && ['text', 'completed'].includes(entry.data.event.type) && entry.data.event.text) {
      return [{ type: 'message', text: entry.data.event.text }];
    }
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
    let buffer = '';
    let totalBytes = 0;
    let result = null;
    let failed = false;
    const decoder = new StringDecoder('utf8');
    const consume = (line) => {
      if (!line) return;
      const message = JSON.parse(line);
      if (message.type === 'event') options.onEvent(message.event);
      if (message.type === 'result') result = message;
    };
    child.stdout.on('data', (chunk) => {
      if (failed) return;
      totalBytes += chunk.length;
      if (totalBytes > 10 * 1024 * 1024) { failed = true; child.kill(); reject(new Error('Task output exceeded the display limit')); return; }
      buffer += decoder.write(chunk);
      try {
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          consume(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
        }
      } catch { failed = true; child.kill(); reject(new Error('Task emitted invalid progress data')); }
    });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) => {
      if (failed) return;
      try { consume((buffer + decoder.end()).trim()); }
      catch { return reject(new Error('Task emitted invalid progress data')); }
      if (result) resolve(result);
      else reject(new Error(`Task process exited without a result (status ${code})`));
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
        panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${media('workspace.css')}"><title>CODOVYN</title></head><body><main><header><div class="mark">C</div><div><h1>CODOVYN</h1><p>One IDE. Every Agent. Endless Flow.</p></div></header><section class="composer"><label for="agent">Agent</label><select id="agent"><option value="demo">Demo handoff</option><option value="codex">Codex CLI · read only</option><option value="claude">Claude Code · read only</option><option value="auto">Codex → Claude · automatic</option></select><label for="request">What would you like to work on?</label><textarea id="request" rows="5" maxlength="10000" placeholder="Describe a task in this repository"></textarea><div class="actions"><button id="run" type="button">Start task</button><button id="cancel" type="button" disabled>Cancel</button></div></section><section class="activity"><div class="section-head"><h2>Task activity</h2><span id="status" role="status" aria-live="polite">Ready</span></div><ol id="timeline" aria-label="Agent activity"></ol><p id="empty">Task steps and agent handoffs will appear here.</p></section><section class="recent"><div class="section-head"><h2>Recent tasks</h2><button id="refresh" type="button">Refresh</button></div><ul id="tasks" aria-label="Recent repository tasks"></ul></section><section class="diff"><div class="section-head"><h2>Repository diff</h2><div class="diff-actions"><button id="working-diff" type="button">Working tree</button><button id="staged-diff" type="button">Staged</button></div></div><pre id="diff-output" tabindex="0" aria-label="Git diff">Choose a diff to review.</pre></section><footer>Local task history stays on this device.</footer></main><script nonce="${nonce}" src="${media('workspace.js')}"></script></body></html>`;
        let active = null;
        const taskDataDirectory = dataDirectory(context.globalStorageUri.fsPath);
        const refreshTasks = async () => {
          const folder = api.workspace.workspaceFolders?.[0];
          if (!folder) { panel.webview.postMessage({ type: 'tasks', tasks: [] }); return; }
          const nodePath = api.workspace.getConfiguration('codovyn').get('nodePath', 'node');
          const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
          try {
            const result = await runner(nodePath, [script, 'tasks', folder.uri.fsPath], {
              cwd: folder.uri.fsPath,
              env: { ...process.env, CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1' },
              onChild: () => {}, onEvent: () => {},
            });
            panel.webview.postMessage({ type: 'tasks', tasks: result.tasks || [] });
          } catch { panel.webview.postMessage({ type: 'tasks-error', text: 'Could not load task history.' }); }
        };
        panel.webview.onDidReceiveMessage(async (message) => {
          if (!message || typeof message !== 'object') return;
          if (message.type === 'cancel') { active?.kill('SIGTERM'); return; }
          if (message.type === 'ready' || message.type === 'tasks') { await refreshTasks(); return; }
          if (message.type === 'diff' && typeof message.staged === 'boolean') {
            const folder = api.workspace.workspaceFolders?.[0];
            if (!folder) { panel.webview.postMessage({ type: 'diff-error', text: 'Open a Git repository folder first.' }); return; }
            const nodePath = api.workspace.getConfiguration('codovyn').get('nodePath', 'node');
            const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
            try {
              const args = [script, 'diff', folder.uri.fsPath, ...(message.staged ? ['--staged'] : [])];
              const result = await runner(nodePath, args, { cwd: folder.uri.fsPath,
                env: { ...process.env, CODOVYN_EVENT_STREAM: '1' }, onChild: () => {}, onEvent: () => {} });
              panel.webview.postMessage({ type: 'diff', text: result.diff || '' });
            } catch { panel.webview.postMessage({ type: 'diff-error', text: 'Could not load this diff.' }); }
            return;
          }
          if (message.type === 'history' && !active && typeof message.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(message.id)) {
            const folder = api.workspace.workspaceFolders?.[0];
            if (!folder) return;
            const nodePath = api.workspace.getConfiguration('codovyn').get('nodePath', 'node');
            const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
            try {
              const result = await runner(nodePath, [script, 'history', message.id, folder.uri.fsPath], {
                cwd: folder.uri.fsPath,
                env: { ...process.env, CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1' },
                onChild: () => {}, onEvent: () => {},
              });
              panel.webview.postMessage({ type: 'history', request: result.task.request, status: result.task.status,
                timeline: timeline(result.events || []) });
            } catch (error) { panel.webview.postMessage({ type: 'error', text: error.message }); }
            return;
          }
          if (message.type !== 'run' || active) return;
          if (!['demo', 'codex', 'claude', 'auto'].includes(message.mode) || typeof message.request !== 'string') return;
          const request = message.request.trim();
          if (!request || request.length > 10000) return;
          const folder = api.workspace.workspaceFolders?.[0];
          if (!folder) { panel.webview.postMessage({ type: 'error', text: 'Open a Git repository folder first.' }); return; }
          if (message.mode !== 'demo' && !api.workspace.isTrusted) {
            panel.webview.postMessage({ type: 'error', text: 'Trust this workspace before using an AI agent.' }); return;
          }
          panel.webview.postMessage({ type: 'running' });
          const nodePath = api.workspace.getConfiguration('codovyn').get('nodePath', 'node');
          const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
          const activity = [];
          try {
            const result = await runner(nodePath, [script, message.mode, folder.uri.fsPath, request], {
              cwd: folder.uri.fsPath,
              env: { ...process.env, CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1' },
              onChild: (child) => { active = child; },
              onEvent: (event) => {
                const entries = timeline([event]);
                activity.push(...entries);
                if (entries.length) panel.webview.postMessage({ type: 'progress', entries });
              },
            });
            panel.webview.postMessage({ type: 'result', status: result.status, taskId: result.taskId,
              activeAgent: result.activeAgent, timeline: result.events ? timeline(result.events) : activity });
            await refreshTasks();
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
module.exports = { activate, createExtension, dataDirectory, runCli, timeline };
