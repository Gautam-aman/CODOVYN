const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { lstatSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { defaultPolicy, validateAgentPolicy } = require('../../packages/agent-core/src/policy.cjs');
const { themes, validTheme, themeStyles } = require('./themes.cjs');
const routingModule = import('../../packages/agent-router/src/index.js');

function runtimePath(api, context) {
  const configured = api.workspace.getConfiguration('codovyn').get('nodePath', 'node');
  const bundled = context.extension?.packageJSON?.codovynBundledRuntime;
  return configured === 'node' && bundled ? resolve(context.extensionPath, bundled) : configured;
}

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
    if (entry.kind === 'agent-event' && entry.data.event.type === 'session') {
      return [{ type: 'agent', text: `${entry.data.agent}: selected model ${entry.data.event.model}` }];
    }
    if (entry.kind === 'agent-started') return [{ type: 'agent', text: `Started ${entry.data.agent}` }];
    if (entry.kind === 'agent-event' && entry.data.event.type === 'tool-start') {
      return [{ type: 'tool', text: ['file_change', 'replace', 'write_file', 'Edit', 'Write'].includes(entry.data.event.action) ? 'Editing draft files…' : entry.data.event.action === 'command_execution' ? 'Running a workspace command…' : `Using agent tool: ${entry.data.event.action}` }];
    }
    if (entry.kind === 'agent-event' && entry.data.event.type === 'tool-complete') {
      return [{ type: 'tool', text: ['file_change', 'replace', 'write_file', 'Edit', 'Write'].includes(entry.data.event.action) ? 'Draft file change finished' : entry.data.event.action === 'command_execution' ? 'Workspace command finished' : `Agent tool finished: ${entry.data.event.action}` }];
    }
    if (entry.kind === 'draft-created') return [{ type: 'checkpoint', text: 'Created an isolated edit draft' }];
    if (entry.kind === 'draft-accepted') return [{ type: 'complete', text: 'Applied the reviewed draft to the repository' }];
    if (entry.kind === 'draft-rejected') return [{ type: 'checkpoint', text: 'Discarded the edit draft' }];
    if(entry.kind==='restoration-decision')return [{type:'checkpoint',text:`Primary restoration: ${entry.data.reason}`}];
    if(entry.kind==='primary-restored')return [{type:'handoff',text:`Selected preferred ${entry.data.to} at a verified boundary`}];
    if(entry.kind==='budget-reserved')return [{type:'checkpoint',text:`Reserved local estimate: USD ${entry.data.estimatedUsd??'unknown'}; actual charges remain unknown`}];
    if (entry.kind === 'routing-decision') return [{type:'agent',text:`Routing: ${entry.data.explanation} · cost ${entry.data.selected?.estimatedUsd??'unknown'} · estimate only`}];
    if (entry.kind === 'draft-reconciled') return [{type:'checkpoint',text:`Recovery: ${entry.data.decision}; ambiguous actions were not replayed`}];
    if (entry.kind === 'checkpoint') return [{ type: 'checkpoint', text: 'Saved a task checkpoint' }];
    if (entry.kind === 'handoff-prepared') return [{ type: 'checkpoint', text: `Prepared verified context with ${entry.data.packet.actions.length} recorded action(s)` }];
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
    let publicError = null;
    let failed = false;
    const decoder = new StringDecoder('utf8');
    const consume = (line) => {
      if (!line) return;
      const message = JSON.parse(line);
      if (message.type === 'event') options.onEvent(message.event);
      if (message.type === 'result') result = message;
      if (message.type === 'error' && typeof message.message === 'string') publicError = message.message.slice(0, 500);
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
      else reject(new Error(publicError || `Task process exited without a result (status ${code})`));
    });
  });
}

function createExtension(api, runner = runCli) {
  return {
    activate(context) {
      let currentPanel = null;
      const command = api.commands.registerCommand('codovyn.open', () => {
        if (currentPanel) { currentPanel.reveal?.(); return currentPanel; }
        const panel = api.window.createWebviewPanel('codovyn.task', 'CODOVYN', api.ViewColumn.Beside, {
          enableScripts: true,
          localResourceRoots: [api.Uri.joinPath(context.extensionUri, 'apps', 'vscode-extension', 'media')],
        });
        currentPanel = panel;
        const nonce = randomBytes(16).toString('base64');
        const routingSession=randomBytes(16).toString('hex');
        const savedTheme = context.globalState?.get('codovyn.panelTheme', 'inherit');
        let selectedTheme = validTheme(savedTheme) ? savedTheme : 'inherit';
        const media = (...segments) => panel.webview.asWebviewUri(api.Uri.joinPath(context.extensionUri, 'apps', 'vscode-extension', 'media', ...segments));
        panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${media('workspace.css')}"><style nonce="${nonce}">${themeStyles()}</style><title>CODOVYN</title></head><body data-codovyn-theme="${selectedTheme}"><main><header><div class="mark">C</div><div><h1>CODOVYN</h1><p>One IDE. Every Agent. Endless Flow.</p></div></header><section class="composer"><label for="agent">Agent</label><select id="agent"><option value="demo">Demo handoff</option><option value="codex">Codex CLI · read only</option><option value="claude">Claude Code · read only</option><option value="auto">Codex → Claude · automatic</option></select><label for="request">What would you like to work on?</label><textarea id="request" rows="5" maxlength="10000" placeholder="Describe a task in this repository"></textarea><div class="actions"><button id="run" type="button">Start task</button><button id="cancel" type="button" disabled>Cancel</button></div></section><section class="activity"><div class="section-head"><h2>Task activity</h2><span id="status" role="status" aria-live="polite">Ready</span></div><ol id="timeline" aria-label="Agent activity"></ol><p id="empty">Task steps and agent handoffs will appear here.</p></section><section class="recent"><div class="section-head"><h2>Recent tasks</h2><button id="refresh" type="button">Refresh</button></div><ul id="tasks" aria-label="Recent repository tasks"></ul></section><section class="diff"><div class="section-head"><h2>Repository diff</h2><div class="diff-actions"><button id="working-diff" type="button">Working tree</button><button id="staged-diff" type="button">Staged</button></div></div><pre id="diff-output" tabindex="0" aria-label="Git diff">Choose a diff to review.</pre></section><footer>Local task history stays on this device.</footer></main><script nonce="${nonce}" src="${media('workspace.js')}"></script></body></html>`;
        let active = null;
        let starting = false;
        let draftBusy = false;
        let disposed = false;
        let reviewedDraft = null;
        let recoveryInspection = null;
        let selectedRoot = api.workspace.workspaceFolders?.[0]?.uri.fsPath || null;
        const sendAppearance = (text = '') => panel.webview.postMessage({ type: 'appearance', selectedTheme,
          themes: themes.map(({ id, name, kind }) => ({ id, name, kind })), text });
        const folderForTask = () => api.workspace.workspaceFolders?.find((folder) => folder.uri.fsPath === selectedRoot) || null;
        const policyKey = () => `codovyn.agentPolicy.${selectedRoot}`;
        const loadAgentPolicy = () => {
          try { return validateAgentPolicy(context.globalState?.get(policyKey(), defaultPolicy) || defaultPolicy); }
          catch { return validateAgentPolicy(defaultPolicy); }
        };
        const sendAgentPolicy = (text = '') => panel.webview.postMessage({ type: 'agent-policy', policy: loadAgentPolicy(), text });
        const sendRoutingPolicy = (text = '') => {
          const folder = folderForTask();
          const policy = folder ? api.workspace.getConfiguration('codovyn', folder.uri).get('routingPolicy', {}) : {};
          panel.webview.postMessage({ type: 'routing-policy', policy, text });
        };
        const inspectAgents = async () => {
          const folder = folderForTask();
          if (!folder || !api.workspace.isTrusted || active || starting || draftBusy) { panel.webview.postMessage({ type: 'agent-diagnostics-error', text: 'Open and trust a project, then wait for the current operation before inspecting agents.' }); return; }
          panel.webview.postMessage({ type: 'agent-diagnostics-loading' });
          try {
            const result = await runner(runtimePath(api, context), [join(context.extensionPath, 'apps', 'cli', 'src', 'index.js'), 'agents', folder.uri.fsPath], {
              cwd: folder.uri.fsPath, env: { ...process.env, CODOVYN_EVENT_STREAM: '1' }, onChild: () => {}, onEvent: () => {},
            });
            if (!disposed && folderForTask() === folder) panel.webview.postMessage({ type: 'agent-diagnostics', agents: result.agents || [] });
          } catch { panel.webview.postMessage({ type: 'agent-diagnostics-error', text: 'Could not inspect agent CLIs. Check the local runtime and CLI installation.' }); }
        };
        const sendProjects = () => panel.webview.postMessage({ type: 'projects', selectedRoot,
          projects: (api.workspace.workspaceFolders || []).map((folder) => ({
            root: folder.uri.fsPath, name: folder.name || folder.uri.fsPath.split(/[\\/]/).at(-1),
          })) });
        const folderListener = api.workspace.onDidChangeWorkspaceFolders?.(() => {
          if (!folderForTask()) {
            active?.kill('SIGTERM');
            selectedRoot = api.workspace.workspaceFolders?.[0]?.uri.fsPath || null;
            reviewedDraft = null;
            panel.webview.postMessage({ type: 'project-selected' });
          }
          sendProjects();
          sendAgentPolicy();
          sendRoutingPolicy();
          refreshTasks();
        });
        panel.onDidDispose?.(() => { if (currentPanel === panel) currentPanel = null; disposed = true; active?.kill('SIGTERM'); folderListener?.dispose(); });
        const taskDataDirectory = dataDirectory(context.globalStorageUri.fsPath);
        const refreshTasks = async () => {
          const folder = folderForTask();
          if (!folder) { panel.webview.postMessage({ type: 'tasks', tasks: [] }); return; }
          const nodePath = runtimePath(api, context);
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
          if (message.type === 'ready') { sendProjects(); sendAppearance(); sendAgentPolicy(); sendRoutingPolicy(); await refreshTasks(); return; }
          if (message.type === 'theme-select' && validTheme(message.id) && !disposed) {
            try {
              await context.globalState?.update('codovyn.panelTheme', message.id);
              selectedTheme = message.id;
              sendAppearance('Theme saved on this device.');
            } catch { sendAppearance('Could not save the theme. Your previous selection is retained.'); }
            return;
          }
          if (message.type === 'gemini-setup') {
            await api.env.openExternal(api.Uri.parse('https://geminicli.com/docs/get-started/authentication/'));
            return;
          }
          if (message.type === 'agent-diagnostics') { await inspectAgents(); return; }
          if (message.type === 'agent-policy-save' && !active && !starting && !draftBusy && !disposed && folderForTask()) {
            try {
              const policy = validateAgentPolicy(message.policy);
              await context.globalState?.update(policyKey(), policy);
              sendAgentPolicy('Agent preferences saved locally for this project.');
            } catch { sendAgentPolicy('Invalid preferences or storage error. Previous settings retained.'); }
            return;
          }
          if (message.type === 'routing-policy-save') {
            const folder = folderForTask();
            if (!folder || !api.workspace.isTrusted || active || starting || draftBusy || disposed) {
              panel.webview.postMessage({ type: 'routing-policy-error', text: 'Open and trust a project, then wait for the current operation before saving routing settings.' });
              return;
            }
            try {
              const { validateRouting } = await routingModule;
              const policy = validateRouting(message.policy);
              await api.workspace.getConfiguration('codovyn', folder.uri).update('routingPolicy', policy,
                api.ConfigurationTarget.WorkspaceFolder, folder.uri);
              if (!disposed && folderForTask() === folder) sendRoutingPolicy('Routing policy saved for this project. Costs and availability remain user-supplied estimates.');
            } catch {
              panel.webview.postMessage({ type: 'routing-policy-error', text: 'Invalid routing policy or settings write failed. Previous settings retained.' });
            }
            return;
          }
          if (message.type === 'tasks') { await refreshTasks(); return; }
          if (message.type === 'project-select' && !active && !starting && !draftBusy && typeof message.root === 'string') {
            if (!api.workspace.workspaceFolders?.some((folder) => folder.uri.fsPath === message.root)) return;
            selectedRoot = message.root;
            sendAgentPolicy();
            sendRoutingPolicy();
            reviewedDraft = null;
            sendProjects();
            panel.webview.postMessage({ type: 'project-selected' });
            await refreshTasks();
            return;
          }
          if (['draft-continue', 'draft-reconcile', 'draft-abandon', 'draft-inspect', 'draft-review', 'draft-accept', 'draft-reject'].includes(message.type) && !active && !starting && !draftBusy && !disposed &&
            typeof message.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(message.id)) {
            const folder = folderForTask();
            if (!folder) { panel.webview.postMessage({ type: 'diff-error', text: 'Open a Git repository folder first.' }); return; }
            const nodePath = runtimePath(api, context);
            const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
            const env = { ...process.env, CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1' };
            draftBusy = true;
            panel.webview.postMessage({ type: 'draft-busy' });
            try {
              if (['draft-continue','draft-reconcile','draft-abandon'].includes(message.type)) {
                const inspection=recoveryInspection;
                if (!api.workspace.isTrusted || !inspection || inspection.taskId!==message.id || !inspection.recoverySafe) return;
                const provider=loadAgentPolicy().primary;
                if(message.type==='draft-continue'&&!inspection.continuationReady)return;
                if(message.type==='draft-continue'&&provider==='codex'){panel.webview.postMessage({type:'diff-error',text:'Recovered continuation requires a file-only agent. Select Gemini or Claude as project primary, then inspect again. Codex command-enabled recovery remains blocked.'});return;}
                const label=message.type==='draft-continue'?`Continue with ${provider}`:message.type==='draft-abandon'?'Abandon execution':'Preserve for review';
                const approval=await api.window.showWarningMessage(`${label}?`,{modal:true,
                  detail:message.type==='draft-continue'?'This sends the original task and verified draft context to the selected provider with write permission. Inspect ambiguous command effects first. Only this provider starts; failed continuation requires fresh reconciliation. No action log is replayed.':'No action will be replayed. Ambiguous tool outcomes remain unknown. Draft files are preserved for patch review; no provider will start.'},label);
                if (approval!==label || disposed || folderForTask()!==folder || recoveryInspection!==inspection) return;
                if(message.type==='draft-continue')panel.webview.postMessage({type:'running'});
                const result=await runner(nodePath,[script,message.type,message.id,folder.uri.fsPath,inspection.fingerprint,...(message.type==='draft-continue'?[provider]:[]),'--yes'],{
                  cwd:folder.uri.fsPath,env,onChild:child=>{active=child;},onEvent:event=>panel.webview.postMessage({type:'progress',entries:timeline([event])})});
                active=null;
                if(message.type==='draft-continue'){panel.webview.postMessage({type:'result',...result});recoveryInspection=null;await refreshTasks();return;}
                recoveryInspection=null;reviewedDraft=null;
                panel.webview.postMessage({type:'draft-reconciled',taskId:message.id});
                await refreshTasks();return;
              }
              if (message.type === 'draft-inspect') {
                reviewedDraft = null;
                const result = await runner(nodePath, [script, 'draft-inspect', message.id, folder.uri.fsPath], {
                  cwd: folder.uri.fsPath, env, onChild: () => {}, onEvent: () => {},
                });
                recoveryInspection=result.inspection;
                panel.webview.postMessage({ type: 'recovery-inspection', inspection: result.inspection });
                return;
              }
              if (message.type === 'draft-review') {
                reviewedDraft = null;
                const review = await runner(nodePath, [script, 'draft-review', message.id, folder.uri.fsPath], {
                  cwd: folder.uri.fsPath, env, onChild: () => {}, onEvent: () => {},
                });
                reviewedDraft = { id: message.id, hash: review.patchHash, paths: review.changedPaths || [] };
                panel.webview.postMessage({ type: 'draft-review', taskId: message.id,
                  patch: review.patch || '', patchHash: review.patchHash, changedPaths: reviewedDraft.paths });
                return;
              }
              if (!reviewedDraft || reviewedDraft.id !== message.id) return;
              const review = reviewedDraft;
              if (message.type === 'draft-accept' && review.hash) {
                const approval = await api.window.showWarningMessage(
                  `Apply the reviewed changes to ${review.paths.length} repository file(s)?`,
                  { modal: true, detail: 'CODOVYN will apply only the patch shown in the draft review. The repository must still match its original clean state.' },
                  'Apply reviewed patch');
                if (approval !== 'Apply reviewed patch' || disposed || folderForTask() !== folder || reviewedDraft !== review) return;
                await runner(nodePath, [script, 'draft-accept', message.id, folder.uri.fsPath, review.hash, '--yes'], {
                  cwd: folder.uri.fsPath, env, onChild: () => {}, onEvent: () => {},
                });
                reviewedDraft = null;
                panel.webview.postMessage({ type: 'draft-accepted', taskId: message.id });
              } else if (message.type === 'draft-reject') {
                const approval = await api.window.showWarningMessage('Discard this isolated edit draft?',
                  { modal: true, detail: 'The draft changes and ignored build outputs in its worktree will be deleted.' }, 'Discard draft');
                if (approval !== 'Discard draft' || disposed || folderForTask() !== folder || reviewedDraft !== review) return;
                await runner(nodePath, [script, 'draft-reject', message.id, folder.uri.fsPath, '--yes'], {
                  cwd: folder.uri.fsPath, env, onChild: () => {}, onEvent: () => {},
                });
                reviewedDraft = null;
                panel.webview.postMessage({ type: 'draft-rejected', taskId: message.id });
              }
              await refreshTasks();
            } catch (error) { panel.webview.postMessage({ type: message.type==='draft-continue'?'error':'diff-error', text: error.message }); }
            finally { active=null; draftBusy = false; if (!disposed) panel.webview.postMessage({ type: 'draft-idle' }); }
            return;
          }
          if(message.type==='resume-task'&&!active&&!starting&&!draftBusy&&!disposed&&typeof message.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(message.id)) {
            const folder=folderForTask();if(!folder||!api.workspace.isTrusted)return;
            const command=runtimePath(api,context),script=join(context.extensionPath,'apps','cli','src','index.js');
            const options={cwd:folder.uri.fsPath,env:{...process.env,CODOVYN_DATA_DIR:taskDataDirectory,CODOVYN_EVENT_STREAM:'1'},onChild:()=>{},onEvent:()=>{}};
            draftBusy=true;panel.webview.postMessage({type:'draft-busy'});
            try {
              const history=await runner(command,[script,'history',message.id,folder.uri.fsPath],options);
              if(history.task?.status!=='interrupted'||history.events?.some(event=>['draft-created','routing-decision'].includes(event.kind)))throw new Error('Use draft recovery or a new routing admission for this task.');
              const providers=[history.task.primaryAgent,...history.task.fallbackAgents].join(', ');
              const approval=await api.window.showWarningMessage('Resume the interrupted read-only task?',{modal:true,detail:`Configured providers: ${providers}. This may send the original request and verified context to those providers. Unsafe action history or unverifiable processes will block resumption.`},'Resume read task');
              if(approval!=='Resume read task'||disposed||folderForTask()!==folder)return;
              panel.webview.postMessage({type:'running'});
              const result=await runner(command,[script,'resume',message.id,folder.uri.fsPath,'--yes'],{...options,onChild:child=>{active=child;},onEvent:event=>panel.webview.postMessage({type:'progress',entries:timeline([event])})});
              panel.webview.postMessage({type:'result',...result});await refreshTasks();
            } catch {panel.webview.postMessage({type:'error',text:'The task could not resume safely. Inspect recovery state and use draft reconciliation when writes or unknown processes are present.'});}
            finally {active=null;draftBusy=false;if(!disposed)panel.webview.postMessage({type:'draft-idle'});}
            return;
          }
          if (message.type === 'delete-task' && !active && !starting && !draftBusy && typeof message.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(message.id)) {
            const folder = folderForTask();
            if (!folder) return;
            draftBusy = true;
            panel.webview.postMessage({ type: 'draft-busy' });
            try {
              const approval = await api.window.showWarningMessage('Delete this CODOVYN task and its saved event history?',
                { modal: true }, 'Delete task');
              if (approval !== 'Delete task' || disposed || folderForTask() !== folder) return;
              const nodePath = runtimePath(api, context);
              const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
              await runner(nodePath, [script, 'task-delete', message.id, folder.uri.fsPath, '--yes'], {
                cwd: folder.uri.fsPath,
                env: { ...process.env, CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1' },
                onChild: () => {}, onEvent: () => {},
              });
              panel.webview.postMessage({ type: 'task-deleted', id: message.id });
              await refreshTasks();
            } catch { panel.webview.postMessage({ type: 'tasks-error', text: 'Could not delete this task.' }); }
            finally { draftBusy = false; if (!disposed) panel.webview.postMessage({ type: 'draft-idle' }); }
            return;
          }
          if (message.type === 'diff' && !draftBusy && typeof message.staged === 'boolean') {
            const folder = folderForTask();
            if (!folder) { panel.webview.postMessage({ type: 'diff-error', text: 'Open a Git repository folder first.' }); return; }
            const nodePath = runtimePath(api, context);
            const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
            try {
              const args = [script, 'diff', folder.uri.fsPath, ...(message.staged ? ['--staged'] : [])];
              const result = await runner(nodePath, args, { cwd: folder.uri.fsPath,
                env: { ...process.env, CODOVYN_EVENT_STREAM: '1' }, onChild: () => {}, onEvent: () => {} });
              panel.webview.postMessage({ type: 'diff', text: result.diff || '' });
            } catch { panel.webview.postMessage({ type: 'diff-error', text: 'Could not load this diff.' }); }
            return;
          }
          if (message.type === 'history' && !active && !starting && !draftBusy && typeof message.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(message.id)) {
            const folder = folderForTask();
            if (!folder) return;
            const nodePath = runtimePath(api, context);
            const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
            try {
              const result = await runner(nodePath, [script, 'history', message.id, folder.uri.fsPath], {
                cwd: folder.uri.fsPath,
                env: { ...process.env, CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1' },
                onChild: () => {}, onEvent: () => {},
              });
              const events = result.events || [];
              panel.webview.postMessage({ type: 'history', request: result.task.request, status: result.task.status,
                taskId: message.id, draftReviewAvailable: events.some((entry) => entry.kind === 'draft-created') &&
                  !events.some((entry) => ['draft-accepted', 'draft-rejected'].includes(entry.kind)),
                timeline: timeline(events) });
            } catch (error) { panel.webview.postMessage({ type: 'error', text: error.message }); }
            return;
          }
          if (message.type !== 'run' || active || starting || draftBusy || disposed) return;
          if (!['routed','routed-edit','configured', 'configured-edit', 'demo', 'codex', 'claude', 'gemini', 'auto-gemini', 'auto', 'codex-edit', 'claude-edit', 'gemini-edit', 'auto-gemini-edit', 'auto-edit'].includes(message.mode) || typeof message.request !== 'string') return;
          const request = message.request.trim();
          if (!request || request.length > 10000) return;
          const folder = folderForTask();
          if (!folder) { panel.webview.postMessage({ type: 'error', text: 'Open a Git repository folder first.' }); return; }
          if (message.mode !== 'demo' && !api.workspace.isTrusted) {
            panel.webview.postMessage({ type: 'error', text: 'Trust this workspace before using an AI agent.' }); return;
          }
          const taskPolicy = loadAgentPolicy();
          starting = true;
          const editMode = ['routed-edit','configured-edit', 'codex-edit', 'claude-edit', 'gemini-edit', 'auto-gemini-edit', 'auto-edit'].includes(message.mode);
          let taskRouting;
          let routeSummary='';
          if (['routed','routed-edit'].includes(message.mode)) {
            try {
              taskRouting=structuredClone(api.workspace.getConfiguration('codovyn',folder.uri).get('routingPolicy',{}));
              if (!taskRouting || typeof taskRouting!=='object' || Array.isArray(taskRouting)) throw new Error('Configure codovyn.routingPolicy in Settings JSON first.');
              if (editMode) taskRouting.requiredCapabilities=[...new Set([...(taskRouting.requiredCapabilities||[]),'writes'])];
              const serialized=JSON.stringify(taskRouting);
              if(serialized.length>65536)throw new Error('Routing settings exceed the local size limit.');
              const preview=await runner(runtimePath(api,context),[join(context.extensionPath,'apps','cli','src','index.js'),'route',folder.uri.fsPath,request],{
                cwd:folder.uri.fsPath,env:{...process.env,CODOVYN_DATA_DIR:taskDataDirectory,CODOVYN_SESSION_ID:routingSession,CODOVYN_EVENT_STREAM:'1',CODOVYN_ROUTING_POLICY:serialized},onChild:()=>{},onEvent:()=>{}});
              panel.webview.postMessage({type:'routing-preview',routing:preview.routing});
              if (!preview.routing?.selected) throw new Error('No eligible model. Check capabilities, reasoning, availability and estimated budget settings.');
              const choice=preview.routing.selected;
              routeSummary=`${choice.provider} / ${choice.model}. Estimated task cost: ${choice.estimatedUsd===null?'unknown':`USD ${choice.estimatedUsd}`}. Admission estimate only; spending is not capped by the CLI.`;
              if (!editMode) {
                const approval=await api.window.showWarningMessage('Send this task to the selected model?',{modal:true,detail:routeSummary},'Use selected model');
                if(approval!=='Use selected model'||disposed||folderForTask()!==folder){starting=false;panel.webview.postMessage({type:'approval-dismissed'});return;}
              }
            } catch {starting=false;panel.webview.postMessage({type:'error',text:'Routing could not authorize a model. Configure codovyn.routingPolicy in Settings JSON and review availability, capabilities and budgets.'});return;}
          }
          if (editMode) {
            panel.webview.postMessage({ type: 'approval-pending' });
            const agentName = message.mode==='routed-edit'?'the selected model':message.mode === 'configured-edit' ? [taskPolicy.primary, ...(taskPolicy.automatic ? taskPolicy.fallbacks : [])].join(' and ') : message.mode === 'gemini-edit' ? 'Gemini CLI' : message.mode === 'auto-gemini-edit' ? 'Codex and Gemini CLI' : message.mode === 'claude-edit' ? 'Claude Code' : message.mode === 'auto-edit' ? 'Codex and Claude Code' : 'Codex';
            const detail = message.mode==='routed-edit'?`${routeSummary} Only this provider receives the task. Codex may execute local draft commands; Gemini uses restricted file tools. Review is required before applying edits.`:message.mode === 'configured-edit'
              ? 'The configured providers may receive this task and repository context. Codex may run local draft commands; Gemini and Claude use restricted file tools. Automatic handoff stops after write-capable actions. You will review the patch before applying it.'
              : message.mode === 'gemini-edit'
              ? 'Gemini may edit files inside a separate Git worktree using restricted file tools. Shell commands are unavailable. You will review a patch before changes reach the open repository.'
              : message.mode === 'auto-gemini-edit'
                ? 'This task may send its request and context to Codex and Gemini. Codex may run draft commands; Gemini uses restricted file tools. Automatic handoff stops after write-capable actions. Review is required before applying changes.'
              : message.mode === 'claude-edit'
              ? 'Claude Code may edit files inside a separate Git worktree. Shell commands are unavailable in this mode. You will review a patch before changes reach the open repository.'
              : message.mode === 'auto-edit'
                ? 'Codex may edit files and run local commands inside a separate Git worktree. Claude Code may continue an automatic handoff before a tool action. You will review a patch before changes reach the open repository.'
                : 'Codex may edit files and run local commands inside a separate Git worktree. You will review a patch before changes reach the open repository.';
            let approval;
            try {
              approval = await api.window.showWarningMessage(`Allow ${agentName} to edit an isolated draft for this task?`,
                { modal: true, detail: `${detail} A clean committed repository is required.` },
                'Allow draft edits');
            } catch {
              starting = false;
              if (!disposed) panel.webview.postMessage({ type: 'approval-dismissed' });
              return;
            }
            if (approval !== 'Allow draft edits' || disposed || folderForTask() !== folder) {
              starting = false;
              if (!disposed) panel.webview.postMessage({ type: 'approval-dismissed' });
              return;
            }
          }
          reviewedDraft = null;
          panel.webview.postMessage({ type: 'running' });
          const nodePath = runtimePath(api, context);
          const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
          const activity = [];
          try {
            const result = await runner(nodePath, [script, message.mode, folder.uri.fsPath, request,
              ...(editMode ? ['--allow-writes'] : [])], {
              cwd: folder.uri.fsPath,
              env: { ...process.env, CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1', CODOVYN_AGENT_POLICY: JSON.stringify(taskPolicy), ...(taskRouting?{CODOVYN_ROUTING_POLICY:JSON.stringify(taskRouting),CODOVYN_SESSION_ID:routingSession}:{}) },
              onChild: (child) => { active = child; },
              onEvent: (event) => {
                const entries = timeline([event]);
                activity.push(...entries);
                if (entries.length) panel.webview.postMessage({ type: 'progress', entries });
              },
            });
            panel.webview.postMessage({ type: 'result', status: result.status, taskId: result.taskId,
              activeAgent: result.activeAgent, draftReviewAvailable: !!result.draftReviewAvailable,
              timeline: result.budgetRejected ? [{type:'error',text:'Local budget reservation was refused. Another task may have reserved the remaining estimate, or earlier charges are unknown. No provider started.'}] : result.routing&&!result.routing.selected ? [{type:'error',text:'No eligible routing candidate. Review the decision and budget rejection reasons.'}] : result.events ? timeline(result.events) : activity });
            if(result.routing)panel.webview.postMessage({type:'routing-preview',routing:result.routing});
            await refreshTasks();
          } catch (error) { panel.webview.postMessage({ type: 'error', text: error.message }); }
          finally { active = null; starting = false; }
        });
        return panel;
      });
      context.subscriptions.push(command);
    },
  };
}

function activate(context) { createExtension(require('vscode')).activate(context); }
module.exports = { runtimePath, activate, createExtension, dataDirectory, runCli, timeline };
