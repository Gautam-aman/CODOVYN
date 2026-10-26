const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { lstatSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { defaultPolicy, validateAgentPolicy } = require('../../packages/agent-core/src/policy.cjs');
const { validateTaskConfiguration, resolveTaskMode, validateComposerPreferences } = require('./task-config.cjs');
const { themes, validTheme, themeStyles } = require('./themes.cjs');
const routingModule = import('../../packages/agent-router/src/index.js');

function routingSnapshot(value) {
  const serialized = JSON.stringify(value);
  if (!serialized || serialized.length > 65536) throw new TypeError('Routing settings exceed the local size limit');
  return JSON.parse(serialized);
}

function runtimePath(api, context) {
  const configured = api.workspace.getConfiguration('codovyn').get('nodePath', 'node');
  const bundled = context.extension?.packageJSON?.codovynBundledRuntime;
  return configured === 'node' && bundled ? resolve(context.extensionPath, bundled) : configured;
}

function providerEnvironment(api) {
  const command = api.workspace.getConfiguration('codovyn').get('geminiCliPath', '');
  const openCode = api.workspace.getConfiguration('codovyn').get('opencodeCliPath', '');
  return { ...process.env, ...(openCode ? { CODOVYN_OPENCODE_COMMAND: openCode } : {}), ...(command ? { CODOVYN_GEMINI_COMMAND: command } : {}) };
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
      return [{ type: 'agent', text: `${entry.data.agent}: selected model ${entry.data.event.model || 'unknown'}${entry.data.event.reasoning ? ' · variant/effort '+entry.data.event.reasoning : ''}` }];
    }
    if (entry.kind === 'agent-event' && entry.data.event.type === 'permission') return [{type:'checkpoint',text:`Provider permission: ${entry.data.event.status} (${entry.data.event.action})`}];
    if (entry.kind === 'task-configuration') return [{ type: 'checkpoint', text: `Reasoning effort: ${entry.data.reasoning || 'Auto / provider default'} · requested task setting` }];
    if (entry.kind === 'contextflow-segment-started') return [{type:'segment',provider:'OpenCode',text:'OpenCode started a new authorized ContextFlow session'}];
    if (entry.kind.startsWith('contextflow-')) return [{type:'checkpoint',text:`ContextFlow: ${entry.kind.slice(12)}${entry.data.bytes ? ' · '+entry.data.bytes+' bytes; tokens and cost unknown' : ''}`}];
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
      if (message.type === 'event') options.onEvent(message.event, message.taskId);
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
      let panelReady = false;
      let pendingPanelSection = null;
      const openWorkspace = () => {
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
        const nativeChatTestScript = process.env.CODOVYN_NATIVE_CHAT_TEST === '1'
          ? `<script nonce="${nonce}" src="${media('native-chat-harness.js')}"></script>` : '';
        const nativeRoutingTestScript = process.env.CODOVYN_NATIVE_ROUTING_TEST === '1'
          ? `<script nonce="${nonce}">window.addEventListener('message',event=>{if(window.__codovynNativeFixtureOnly===true && event.data?.__codovynFixture!==true)event.stopImmediatePropagation();},true);</script>` : '';
        panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${media('workspace.css')}"><style nonce="${nonce}">${themeStyles()}</style><title>CODOVYN</title></head><body data-codovyn-theme="${selectedTheme}"><main><header><div class="mark">C</div><div><h1>CODOVYN</h1><p>One IDE. Every Agent. Endless Flow.</p></div></header><section class="composer"><label class="legacy-agent-label" for="agent">Legacy agent mode</label><select class="legacy-agent-select" id="agent" aria-hidden="true" tabindex="-1"><option value="demo">Demo handoff</option><option value="codex">Codex CLI · read only</option><option value="claude">Claude Code · read only</option><option value="auto">Codex → Claude · automatic</option></select><label for="request">What would you like to work on?</label><textarea id="request" rows="5" maxlength="10000" placeholder="Describe a task in this repository"></textarea><div class="task-controls" aria-label="Task configuration"><label for="task-provider">Provider</label><select id="task-provider" aria-label="Provider"><option value="auto">Auto</option><option value="configured">Configured agents</option><option value="codex">Codex CLI</option><option value="gemini">Gemini CLI</option><option value="claude">Claude Code</option><option value="opencode">OpenCode</option></select><label for="task-model">Model</label><select id="task-model" aria-label="Model"><option value="">Provider default / routing policy</option></select><label for="task-permission">Permissions</label><select id="task-permission" aria-label="Task permissions"><option value="read">Read only</option><option value="write" disabled>Write only — unsupported safely</option><option value="read-write">Read + Write draft</option></select><label for="task-routing">Routing</label><select id="task-routing" aria-label="Routing strategy"><option value="manual">Provider default</option><option value="auto">Auto</option><option value="economy">Economy</option><option value="balanced">Balanced</option><option value="performance">Performance</option><option value="custom">Custom model</option></select><label for="task-reasoning">Reasoning</label><select id="task-reasoning" aria-label="Reasoning effort"><option value="">Provider default</option></select></div><p id="permission-help" class="control-help">Read + Write uses an isolated draft. Changes require review before application.</p><div class="actions"><button id="run" type="button">Start task</button><button id="cancel" type="button" disabled>Cancel</button></div></section><section class="activity"><div class="section-head"><h2>Task activity</h2><span id="status" role="status" aria-live="polite">Ready</span></div><ol id="timeline" aria-label="Agent activity"></ol><p id="empty">Task steps and agent handoffs will appear here.</p></section><section class="recent"><div class="section-head"><h2>Recent tasks</h2><button id="refresh" type="button">Refresh</button></div><ul id="tasks" aria-label="Recent repository tasks"></ul></section><section class="diff"><div class="section-head"><h2>Repository diff</h2><div class="diff-actions"><button id="working-diff" type="button">Working tree</button><button id="staged-diff" type="button">Staged</button></div></div><pre id="diff-output" tabindex="0" aria-label="Git diff">Choose a diff to review.</pre></section><footer>Local task history stays on this device.</footer></main><script nonce="${nonce}" src="${media('routing-form.cjs')}"></script><script nonce="${nonce}" src="${media('composer.js')}"></script>${nativeChatTestScript}${nativeRoutingTestScript}<script nonce="${nonce}" src="${media('workspace.js')}"></script></body></html>`;
        let active = null;
        let starting = false;
        let queueBusy = false;
        const seenRequestIds = new Set();
        let draftBusy = false;
        let disposed = false;
        const diagnosticChildren=new Set();
        const trackDiagnostic=child=>{diagnosticChildren.add(child);child.once?.('close',()=>diagnosticChildren.delete(child));};
        const stopDiagnostics=()=>{for(const child of diagnosticChildren)child.kill('SIGTERM');};
        let reviewedDraft = null;
        let recoveryInspection = null;
        let contextFlowPreview = null;
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
          try {
            const policy = folder ? routingSnapshot(api.workspace.getConfiguration('codovyn', folder.uri).get('routingPolicy', {})) : {};
            panel.webview.postMessage({ type: 'routing-policy', policy, text });
          } catch {
            panel.webview.postMessage({ type: 'routing-policy-error', text: 'Saved routing settings could not be read. Check their JSON value and size.' });
          }
        };
        const inspectAgents = async () => {
          const folder = folderForTask();
          if (!folder || !api.workspace.isTrusted || active || starting || draftBusy) { panel.webview.postMessage({ type: 'agent-diagnostics-error', text: 'Open and trust a project, then wait for the current operation before inspecting agents.' }); return; }
          panel.webview.postMessage({ type: 'agent-diagnostics-loading' });
          try {
            const result = await runner(runtimePath(api, context), [join(context.extensionPath, 'apps', 'cli', 'src', 'index.js'), 'agents', folder.uri.fsPath], {
              cwd: folder.uri.fsPath, env: { ...providerEnvironment(api), CODOVYN_EVENT_STREAM: '1' }, onChild: trackDiagnostic, onEvent: () => {},
            });
            if (!disposed && folderForTask() === folder) panel.webview.postMessage({ type: 'agent-diagnostics', agents: result.agents || [] });
          } catch { panel.webview.postMessage({ type: 'agent-diagnostics-error', text: 'Could not inspect agent CLIs. Check the local runtime and CLI installation.' }); }
        };
        const inspectReasoning = async () => {
          const folder = folderForTask();
          if (!folder || !api.workspace.isTrusted) return;
          try {
            const result = await runner(runtimePath(api, context), [join(context.extensionPath, 'apps', 'cli', 'src', 'index.js'), 'reasoning', folder.uri.fsPath], { cwd: folder.uri.fsPath, env: { ...providerEnvironment(api), CODOVYN_EVENT_STREAM: '1' }, onChild: trackDiagnostic, onEvent: () => {} });
            if (!disposed && folderForTask() === folder) panel.webview.postMessage({ type: 'reasoning-capabilities', metadata: result.reasoning });
          } catch { if (!disposed && folderForTask() === folder) panel.webview.postMessage({ type: 'reasoning-capabilities', metadata: { models: [], defaultModel: null }, text: 'Codex effort metadata unavailable. Use Auto or inspect your Codex installation.' }); }
        };
        const providerCache = new Map();
        const providerPending = new Map();
        const inspectProvider = async (provider, modelId, refresh = false) => {
          const folder = folderForTask();
          if (!folder || !api.workspace.isTrusted || active || starting || draftBusy || !['codex','opencode'].includes(provider)) return;
          if (modelId !== undefined && (typeof modelId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(modelId))) return;
          const key = JSON.stringify([folder.uri.fsPath,provider,modelId,providerEnvironment(api).CODOVYN_OPENCODE_COMMAND]);
          if (providerPending.has(key) || providerPending.size >= 2) return;
          const cached = providerCache.get(key);
          if (provider!=='opencode' && !refresh && cached && Date.now()-cached.at < 300000) { panel.webview.postMessage({type:'provider-models',provider,metadata:cached.metadata}); return; }
          providerPending.set(key,true);
          panel.webview.postMessage({type:'provider-models-loading',provider});
          try {
            const result = await runner(runtimePath(api,context),[join(context.extensionPath,'apps','cli','src','index.js'),'provider-models',folder.uri.fsPath,provider,...(modelId?[modelId]:[])],{
              cwd:folder.uri.fsPath,env:{...providerEnvironment(api),CODOVYN_DATA_DIR:taskDataDirectory,CODOVYN_EVENT_STREAM:'1'},onChild:trackDiagnostic,onEvent:()=>{},
            });
            if (disposed || folderForTask()!==folder) return;
            providerCache.set(key,{at:Date.now(),metadata:result.metadata}); if(providerCache.size>64)providerCache.delete(providerCache.keys().next().value);
            panel.webview.postMessage({type:'provider-models',provider,metadata:result.metadata});
          } catch { if (!disposed && folderForTask()===folder) panel.webview.postMessage({type:'provider-models',provider,metadata:{models:[],defaultModel:null},text:'Model discovery failed. Check the installed CLI/version and provider setup. No inference was started.'}); }
          finally { providerPending.delete(key); }
        };
        const sendProjects = () => panel.webview.postMessage({ type: 'projects', selectedRoot,
          projects: (api.workspace.workspaceFolders || []).map((folder) => ({
            root: folder.uri.fsPath, name: folder.name || folder.uri.fsPath.split(/[\\/]/).at(-1),
          })) });
        const folderListener = api.workspace.onDidChangeWorkspaceFolders?.(() => {
          stopDiagnostics();
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
        panel.onDidDispose?.(() => { if (currentPanel === panel) { currentPanel = null; panelReady = false; } disposed = true; active?.kill('SIGTERM'); stopDiagnostics(); folderListener?.dispose(); });
        const taskDataDirectory = dataDirectory(context.globalStorageUri.fsPath);
        const refreshTasks = async () => {
          const folder = folderForTask();
          if (!folder) { panel.webview.postMessage({ type: 'tasks', tasks: [] }); return; }
          const nodePath = runtimePath(api, context);
          const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
          try {
            const result = await runner(nodePath, [script, 'tasks', folder.uri.fsPath], {
              cwd: folder.uri.fsPath,
              env: { ...providerEnvironment(api), CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1' },
              onChild: () => {}, onEvent: () => {},
            });
            panel.webview.postMessage({ type: 'tasks', tasks: result.tasks || [] });
          } catch { panel.webview.postMessage({ type: 'tasks-error', text: 'Could not load task history.' }); }
        };
        const queueCommand = async (command, args = [], env = {}) => {
          const folder = folderForTask();
          if (!folder || disposed || !api.workspace.isTrusted) throw new Error('Open and trust a Git project to manage its queue.');
          return runner(runtimePath(api, context), [join(context.extensionPath, 'apps', 'cli', 'src', 'index.js'), command, ...args], {
            cwd: folder.uri.fsPath, env: { ...providerEnvironment(api), CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1', ...env }, onChild: () => {}, onEvent: () => {},
          });
        };
        const composerPreferencesKey = () => `codovyn.composer:${folderForTask()?.uri.fsPath || ''}`;
        const sendComposerPreferences = () => {
          try { const saved = context.globalState?.get(composerPreferencesKey()); if (saved) panel.webview.postMessage({ type: 'composer-preferences', preferences: validateComposerPreferences(saved) }); }
          catch { /* Invalid old preferences never authorize a task. */ }
        };
        let queueRefreshVersion = 0;
        const refreshQueue = async () => {
          const version = ++queueRefreshVersion;
          if (!folderForTask() || !api.workspace.isTrusted) { panel.webview.postMessage({ type: 'queue-state', tasks: [], paused: true }); return; }
          try { const result = await queueCommand('queue-list', [folderForTask().uri.fsPath]); if (version === queueRefreshVersion) panel.webview.postMessage({ type: 'queue-state', tasks: result.tasks || [], paused: result.paused === true }); }
          catch { panel.webview.postMessage({ type: 'queue-error', text: 'Could not load this project’s task queue.' }); }
        };
        const contextFlowCommand = (command, args, folder, executing=false, activity=[]) => runner(runtimePath(api, context),
          [join(context.extensionPath, 'apps', 'cli', 'src', 'index.js'), command, ...args], {
            cwd: folder.uri.fsPath, env: { ...providerEnvironment(api), CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM:'1' },
            onChild: child => { if(executing) active=child; else trackDiagnostic(child); },
            onEvent: event => { const entries=timeline([event]); activity.push(...entries); if(entries.length)panel.webview.postMessage({type:'progress',entries}); }
          });
        const sendContextFlow = transfer => { contextFlowPreview=transfer; panel.webview.postMessage({type:'contextflow-state',transfer}); };
        const handleMessage = async (message, ownedQueue = null) => {
          if (!message || typeof message !== 'object') return;
          if (message.type === 'cancel') { active?.kill('SIGTERM'); return; }
          if (['contextflow-read','contextflow-prepare','contextflow-run','contextflow-reject'].includes(message.type)) {
            const folder=folderForTask();
            if(!folder||!api.workspace.isTrusted||active||starting||draftBusy||queueBusy||disposed)return;
            if(typeof message.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(message.id))return;
            draftBusy=true;panel.webview.postMessage({type:'contextflow-busy',busy:true});
            try {
              if(message.type==='contextflow-read') {
                const result=await contextFlowCommand('contextflow-read',[message.id,folder.uri.fsPath],folder);
                if(folderForTask()===folder&&!disposed)sendContextFlow(result.transfer);
              } else if(message.type==='contextflow-prepare') {
                const configuration=validateTaskConfiguration(message.configuration);
                if(configuration.provider!=='opencode')throw new Error('Select OpenCode as the continuation recipient.');
                const result=await contextFlowCommand('contextflow-prepare',[message.id,folder.uri.fsPath,JSON.stringify(configuration),'--manual'],folder);
                if(folderForTask()===folder&&!disposed)sendContextFlow(result.transfer);
              } else {
                const preview=contextFlowPreview;
                if(!preview||preview.id!==message.id||preview.status!=='prepared')throw new Error('Read the prepared ContextFlow review first.');
                const current=(await contextFlowCommand('contextflow-read',[preview.taskId,folder.uri.fsPath],folder)).transfer;
                if(current?.id!==preview.id||current.hash!==preview.hash||current.status!=='prepared')throw new Error('ContextFlow changed. Prepare a fresh review.');
                if(message.type==='contextflow-reject') {
                  sendContextFlow((await contextFlowCommand('contextflow-reject',[preview.id,folder.uri.fsPath,'--yes'],folder)).transfer);
                } else {
                  const approved=await api.window.showWarningMessage(
                    `Continue with OpenCode (${preview.packet.handoff.model})? This sends the displayed ContextFlow packet (${preview.packet.context.files.length} source excerpts, ${preview.metrics?.utf8Bytes ?? 'unknown'} bytes), objective, repository metadata and action summaries to the selected provider. Permission: ${preview.configuration.permission}. Usage and cost are unknown. This starts one new session; completed actions must not be replayed.`,
                    {modal:true},'Authorize OpenCode');
                  if(approved!=='Authorize OpenCode'||disposed||folderForTask()!==folder||!api.workspace.isTrusted||contextFlowPreview!==preview)return;
                  panel.webview.postMessage({type:'running',taskId:preview.taskId,continuation:true});
                  const activity=[];
                  const result=await contextFlowCommand('contextflow-run',[preview.id,folder.uri.fsPath,preview.hash,'--yes'],folder,true,activity);
                  panel.webview.postMessage({type:'result',...result,timeline:activity});
                  sendContextFlow((await contextFlowCommand('contextflow-read',[preview.taskId,folder.uri.fsPath],folder)).transfer);
                }
              }
            } catch { panel.webview.postMessage({type:'error',text:'ContextFlow stopped. Inspect the task history before retrying; no ambiguous action will be replayed.'}); panel.webview.postMessage({type:'contextflow-error',text:'ContextFlow could not proceed. Confirm the task is stopped, inspect unresolved actions, reconcile draft changes, and refresh OpenCode model discovery. No new approval was granted by this error.'}); }
            finally {active=null;draftBusy=false;if(!disposed){panel.webview.postMessage({type:'contextflow-busy',busy:false});await refreshTasks();await refreshQueue();}}
            return;
          }
          if (message.type === 'ready') {
            sendProjects(); sendAppearance(); sendAgentPolicy(); sendRoutingPolicy(); sendComposerPreferences(); await refreshTasks(); await refreshQueue();
            if (!disposed && currentPanel === panel) {
              panelReady = true;
              if (pendingPanelSection) {
                panel.webview.postMessage({ type: 'focus-section', section: pendingPanelSection });
                pendingPanelSection = null;
              }
            }
            return;
          }
          if (message.type === 'composer-preferences-save' && folderForTask() && !disposed) {
            try { await context.globalState?.update(composerPreferencesKey(), validateComposerPreferences(message.preferences)); }
            catch { panel.webview.postMessage({ type: 'composer-preferences-error', text: 'Could not save composer preferences. Current task permissions are unchanged.' }); }
            return;
          }
          if (message.type === 'queue-list') { await refreshQueue(); return; }
          if (message.type === 'queue-add') {
            if (queueBusy) { panel.webview.postMessage({ type: 'queue-error', text: 'A queue update is finishing. Your draft is retained; try again when it completes.' }); return; }
            const folder = folderForTask();
            if (!folder || !api.workspace.isTrusted || disposed || queueBusy || typeof message.request !== 'string' || !message.request.trim() || message.request.length > 10000 ||
              typeof message.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(message.requestId)) {
              panel.webview.postMessage({ type: 'queue-error', text: 'Open a trusted project and enter a request before queueing.' }); return;
            }
            queueBusy = true;
            try {
              const configuration = validateTaskConfiguration(message.taskConfiguration);
              const result = await queueCommand('queue-add', [folder.uri.fsPath, message.request.trim(), JSON.stringify(configuration)], { CODOVYN_QUEUE_REQUEST_ID: message.requestId, CODOVYN_QUEUE_POLICY_SNAPSHOT: JSON.stringify({ agentPolicy: loadAgentPolicy(), routingPolicy: routingSnapshot(api.workspace.getConfiguration('codovyn', folder.uri).get('routingPolicy', {})) }) });
              await refreshQueue();
              queueBusy = false;
              panel.webview.postMessage({ type: 'queue-accepted', requestId: message.requestId, taskId: result.task.id });
            } catch (error) { panel.webview.postMessage({ type: 'queue-error', text: error instanceof TypeError ? `Task configuration needs correction: ${error.message}` : 'The task could not be queued. Your draft is retained; check the project and task configuration.' }); }
            finally { queueBusy = false; }
            return;
          }
          if (['queue-pause', 'queue-resume', 'queue-cancel', 'queue-reorder', 'queue-start'].includes(message.type)) {
            const folder = folderForTask();
            if (!folder || !api.workspace.isTrusted || disposed || queueBusy) return;
            if (message.type === 'queue-start' && (active || starting || draftBusy)) { panel.webview.postMessage({ type: 'queue-error', text: 'Wait for the active task and draft review before dispatching another task.' }); return; }
            queueBusy = true;
            try {
              if (['queue-pause', 'queue-resume'].includes(message.type)) await queueCommand(message.type, [folder.uri.fsPath]);
              else {
                if (typeof message.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(message.id)) throw new Error('Invalid queued task');
                if (message.type === 'queue-start') {
                  const queue = await queueCommand('queue-list', [folder.uri.fsPath]);
                  const task = queue.tasks?.find(task => task.id === message.id && task.status === 'queued');
                  if (!task || queue.paused) throw new Error('Task is unavailable or the queue is paused');
                  const configuration = validateTaskConfiguration(task.configuration);
                  const currentPolicies = { agentPolicy: loadAgentPolicy(), routingPolicy: routingSnapshot(api.workspace.getConfiguration('codovyn', folder.uri).get('routingPolicy', {})) };
                  if (!task.policySnapshot || JSON.stringify(task.policySnapshot) !== JSON.stringify(currentPolicies)) throw new Error('Queued provider policy changed; cancel and enqueue again with fresh consent.');
                  const consent = await api.window.showWarningMessage('Run this queued task?', { modal: true, detail: `${task.request.slice(0, 500)}\nProvider: ${configuration.provider}. Permission: ${configuration.permission}. Model and write approvals will be checked again. Repository changes block dispatch.` }, 'Review and run');
                  if (consent !== 'Review and run' || disposed || folderForTask() !== folder) return;
                  await queueCommand('queue-claim', [task.id, folder.uri.fsPath]);
                  await queueCommand('queue-update', [task.id, 'running', folder.uri.fsPath]);
                  const requestId = randomBytes(16).toString('hex');
                  panel.webview.postMessage({ type: 'queue-dispatch', requestId, request: task.request });
                  const dispatch = { id: task.id, baselineFingerprint: task.baselineFingerprint, outcome: 'blocked' };
                  await handleMessage({ type: 'run', requestId, request: task.request, taskConfiguration: configuration }, dispatch);
                  await queueCommand('queue-update', [task.id, dispatch.outcome, folder.uri.fsPath]);
                } else if (message.type === 'queue-reorder') {
                  if (!Number.isSafeInteger(message.position) || message.position < 0 || message.position > 999) throw new Error('Invalid position');
                  await queueCommand('queue-reorder', [message.id, String(message.position), folder.uri.fsPath]);
                } else await queueCommand('queue-cancel', [message.id, folder.uri.fsPath]);
              }
            } catch { panel.webview.postMessage({ type: 'queue-error', text: 'Queue action stopped. A changed repository, pending draft, unresolved execution, or changed policy requires review. No ambiguous operation was replayed.' }); }
            finally { queueBusy = false; await refreshQueue(); }
            return;
          }
          if (message.type === 'theme-select' && validTheme(message.id) && !disposed) {
            try {
              await context.globalState?.update('codovyn.panelTheme', message.id);
              selectedTheme = message.id;
              sendAppearance('Theme saved on this device.');
            } catch { sendAppearance('Could not save the theme. Your previous selection is retained.'); }
            return;
          }
          if (['codex-sign-in','codex-validate-ask','codex-cancel'].includes(message.type)) { const commands={'codex-sign-in':'codovyn.codexSignIn','codex-validate-ask':'codovyn.codexValidateAsk','codex-cancel':'codovyn.codexCancel'}; await api.commands.executeCommand(commands[message.type]); return; }
          if (message.type === 'gemini-setup') {
            await api.env.openExternal(api.Uri.parse('https://geminicli.com/docs/get-started/authentication/'));
            return;
          }
          if (message.type === 'gemini-path-settings') {
            await api.commands.executeCommand('workbench.action.openSettings', 'codovyn.geminiCliPath');
            return;
          }
          if (message.type === 'provider-models') { await inspectProvider(message.provider,message.modelId,message.refresh===true); return; }
          if (message.type === 'provider-configure' && message.provider === 'opencode') { await api.commands.executeCommand('workbench.action.openSettings','codovyn.opencodeCliPath'); return; }
          if (message.type === 'provider-help' && ['codex','gemini','claude'].includes(message.provider)) {
            const help={codex:'https://developers.openai.com/codex/auth/',gemini:'https://geminicli.com/docs/get-started/authentication/',claude:'https://code.claude.com/docs/en/authentication'};
            await api.env.openExternal(api.Uri.parse(help[message.provider]));return;
          }
          if (message.type === 'provider-setup' && message.provider === 'opencode') {
            const folder=folderForTask(); if (!folder || !api.workspace.isTrusted || active || starting || draftBusy) return;
            const approval=await api.window.showWarningMessage('Open official OpenCode authentication in CODOVYN’s isolated provider context?',{modal:true,detail:'Your global OpenCode configuration and credentials are not imported. Complete the CLI authentication yourself; no key is sent to Chat.'},'Open provider setup');
            if(approval!=='Open provider setup')return;
            try {
              const result=await runner(runtimePath(api,context),[join(context.extensionPath,'apps','cli','src','index.js'),'provider-context',folder.uri.fsPath,'opencode'],{cwd:folder.uri.fsPath,env:{...providerEnvironment(api),CODOVYN_DATA_DIR:taskDataDirectory,CODOVYN_EVENT_STREAM:'1'},onChild:()=>{},onEvent:()=>{}});
              const terminal=api.window.createTerminal({name:'CODOVYN · OpenCode setup',cwd:result.context.stateDirectory,env:result.context.environment,strictEnv:true});
              terminal.show(); const quoted="'"+result.context.command.split("'").join("'\"'\"'")+"'"; terminal.sendText(quoted+' auth login --standalone');
            } catch {panel.webview.postMessage({type:'agent-diagnostics-error',text:'Could not open OpenCode setup. Inspect the executable path and supported version.'});}
            return;
          }
          if (message.type === 'reasoning-capabilities') { await inspectReasoning(); return; }
          if (message.type === 'agent-diagnostics') { await inspectAgents(); return; }
          if (message.type === 'agent-policy-save' && !active && !starting && !draftBusy && !queueBusy && !disposed && folderForTask()) {
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
          if (message.type === 'routing-policy-preview') {
            const folder = folderForTask();
            if (!folder || !api.workspace.isTrusted || active || starting || draftBusy || disposed ||
              typeof message.request !== 'string' || !message.request.trim() || message.request.length > 10000) {
              panel.webview.postMessage({ type: 'routing-policy-error', text: 'Open and trust a project, enter a task, then wait for the current operation before previewing routing.' });
              return;
            }
            try {
              const { validateRouting } = await routingModule;
              const policy = validateRouting(routingSnapshot(api.workspace.getConfiguration('codovyn', folder.uri).get('routingPolicy', {})));
              const result = await runner(runtimePath(api, context), [join(context.extensionPath, 'apps', 'cli', 'src', 'index.js'),
                'route', folder.uri.fsPath, message.request.trim()], {
                cwd: folder.uri.fsPath,
                env: { ...providerEnvironment(api), CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_SESSION_ID: routingSession,
                  CODOVYN_EVENT_STREAM: '1', CODOVYN_ROUTING_POLICY: JSON.stringify(policy) },
                onChild: () => {}, onEvent: () => {},
              });
              if (!disposed && folderForTask() === folder) panel.webview.postMessage({ type: 'routing-policy-preview-result', routing: result.routing });
            } catch {
              panel.webview.postMessage({ type: 'routing-policy-error', text: 'Could not preview the saved policy. Check its entries and local budget settings.' });
            }
            return;
          }
          if (message.type === 'tasks') { await refreshTasks(); return; }
          if (message.type === 'project-select' && !active && !starting && !draftBusy && !queueBusy && typeof message.root === 'string') {
            if (!api.workspace.workspaceFolders?.some((folder) => folder.uri.fsPath === message.root)) return;
            stopDiagnostics();
            selectedRoot = message.root;
            sendAgentPolicy();
            sendRoutingPolicy(); sendComposerPreferences();
            reviewedDraft = null;
            sendProjects();
            panel.webview.postMessage({ type: 'project-selected' });
            await refreshTasks();
            return;
          }
          if (['draft-continue', 'draft-reconcile', 'draft-abandon', 'draft-inspect', 'draft-review', 'draft-accept', 'draft-reject'].includes(message.type) && !active && !starting && !draftBusy && !queueBusy && !disposed &&
            typeof message.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(message.id)) {
            const folder = folderForTask();
            if (!folder) { panel.webview.postMessage({ type: 'diff-error', text: 'Open a Git repository folder first.' }); return; }
            const nodePath = runtimePath(api, context);
            const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
            const env = { ...providerEnvironment(api), CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1' };
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
                if(message.type==='draft-continue'){panel.webview.postMessage({type:'result',...result,timeline:activity});recoveryInspection=null;await refreshTasks();return;}
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
          if(message.type==='resume-task'&&!active&&!starting&&!draftBusy&&!queueBusy&&!disposed&&typeof message.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(message.id)) {
            const folder=folderForTask();if(!folder||!api.workspace.isTrusted)return;
            const command=runtimePath(api,context),script=join(context.extensionPath,'apps','cli','src','index.js');
            const options={cwd:folder.uri.fsPath,env:{...providerEnvironment(api),CODOVYN_DATA_DIR:taskDataDirectory,CODOVYN_EVENT_STREAM:'1'},onChild:()=>{},onEvent:()=>{}};
            draftBusy=true;panel.webview.postMessage({type:'draft-busy'});
            try {
              const history=await runner(command,[script,'history',message.id,folder.uri.fsPath],options);
              if(history.task?.status!=='interrupted'||history.events?.some(event=>['draft-created','routing-decision'].includes(event.kind)))throw new Error('Use draft recovery or a new routing admission for this task.');
              const providers=[history.task.primaryAgent,...history.task.fallbackAgents].join(', ');
              const approval=await api.window.showWarningMessage('Resume the interrupted read-only task?',{modal:true,detail:`Configured providers: ${providers}. This may send the original request and verified context to those providers. Unsafe action history or unverifiable processes will block resumption.`},'Resume read task');
              if(approval!=='Resume read task'||disposed||folderForTask()!==folder)return;
              panel.webview.postMessage({type:'running'});
              const result=await runner(command,[script,'resume',message.id,folder.uri.fsPath,'--yes'],{...options,onChild:child=>{active=child;},onEvent:event=>panel.webview.postMessage({type:'progress',entries:timeline([event])})});
              panel.webview.postMessage({type:'result',...result,timeline:activity});await refreshTasks();
            } catch {panel.webview.postMessage({type:'error',text:'The task could not resume safely. Inspect recovery state and use draft reconciliation when writes or unknown processes are present.'});}
            finally {active=null;draftBusy=false;if(!disposed)panel.webview.postMessage({type:'draft-idle'});}
            return;
          }
          if (message.type === 'delete-task' && !active && !starting && !draftBusy && !queueBusy && typeof message.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(message.id)) {
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
                env: { ...providerEnvironment(api), CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1' },
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
                env: { ...providerEnvironment(api), CODOVYN_EVENT_STREAM: '1' }, onChild: () => {}, onEvent: () => {} });
              panel.webview.postMessage({ type: 'diff', text: result.diff || '' });
            } catch { panel.webview.postMessage({ type: 'diff-error', text: 'Could not load this diff.' }); }
            return;
          }
          if (message.type === 'history' && !active && !starting && !draftBusy && !queueBusy && typeof message.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(message.id)) {
            const folder = folderForTask();
            if (!folder) return;
            const nodePath = runtimePath(api, context);
            const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
            try {
              const result = await runner(nodePath, [script, 'history', message.id, folder.uri.fsPath], {
                cwd: folder.uri.fsPath,
                env: { ...providerEnvironment(api), CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1' },
                onChild: () => {}, onEvent: () => {},
              });
              const events = result.events || [];
              if(contextFlowPreview?.taskId!==message.id)contextFlowPreview=null;
              panel.webview.postMessage({ type: 'history', request: result.task.request, status: result.task.status,
                taskId: message.id, draftReviewAvailable: events.some((entry) => entry.kind === 'draft-created') &&
                  !events.some((entry) => ['draft-accepted', 'draft-rejected'].includes(entry.kind)),
                timeline: timeline(events) });
            } catch (error) { panel.webview.postMessage({ type: 'error', text: error.message }); }
            return;
          }
          if (message.type !== 'run' || active || starting || draftBusy || disposed || (queueBusy && !ownedQueue)) return;
          if (message.requestId !== undefined && (typeof message.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(message.requestId))) {
            panel.webview.postMessage({ type: 'error', text: 'Invalid task submission identifier. Your prompt was retained.' });
            return;
          }
          if (message.requestId && seenRequestIds.has(message.requestId)) return;
          let runMode = message.mode;
          let taskConfiguration = null;
          if (message.taskConfiguration !== undefined) {
            try {
              taskConfiguration = validateTaskConfiguration(message.taskConfiguration);
              runMode = resolveTaskMode(taskConfiguration);
            } catch {
              panel.webview.postMessage({ type: 'error', text: 'The selected provider, model, permission or routing configuration is invalid. Your prompt was retained.' });
              return;
            }
          }
          if (!['opencode','opencode-edit','routed','routed-edit','configured', 'configured-edit', 'demo', 'codex', 'claude', 'gemini', 'auto-gemini', 'auto', 'codex-edit', 'claude-edit', 'gemini-edit', 'auto-gemini-edit', 'auto-edit'].includes(runMode) || typeof message.request !== 'string') return;
          const request = message.request.trim();
          if (!request || request.length > 10000) return;
          const folder = folderForTask();
          if (!folder) { panel.webview.postMessage({ type: 'error', text: 'Open a Git repository folder first.' }); return; }
          if (runMode !== 'demo' && !api.workspace.isTrusted) {
            panel.webview.postMessage({ type: 'error', text: 'Trust this workspace before using an AI agent.' }); return;
          }
          const taskPolicy = loadAgentPolicy();
          starting = true;
          if (message.requestId) {
            seenRequestIds.add(message.requestId);
            if (seenRequestIds.size > 256) seenRequestIds.delete(seenRequestIds.values().next().value);
          }
          panel.webview.postMessage({ type: 'starting' });
          const editMode = ['opencode-edit','routed-edit','configured-edit', 'codex-edit', 'claude-edit', 'gemini-edit', 'auto-gemini-edit', 'auto-edit'].includes(runMode);
          let taskRouting;
          let routeSummary='';
          if (['routed','routed-edit'].includes(runMode)) {
            try {
              taskRouting=routingSnapshot(api.workspace.getConfiguration('codovyn',folder.uri).get('routingPolicy',{}));
              if (!taskRouting || typeof taskRouting!=='object' || Array.isArray(taskRouting)) throw new Error('Configure a routing policy first.');
              if (taskConfiguration) {
                if (taskConfiguration.provider === 'configured') throw new Error('Configured agent selection cannot be routed as a catalogue model.');
                if (taskConfiguration.provider !== 'auto' && !taskConfiguration.modelId) throw new Error('A direct provider without a model must use its documented CLI default.');
                const selectedModel = taskConfiguration.modelId && taskRouting.models.find((entry) => entry.id === taskConfiguration.modelId);
                if (taskConfiguration.modelId && (!selectedModel ||
                  (taskConfiguration.provider !== 'auto' && selectedModel.provider !== taskConfiguration.provider))) {
                  throw new Error('The selected model is not in the project catalogue for this provider.');
                }
                if (taskConfiguration.modelId) {
                  taskRouting.mode = 'custom';
                  taskRouting.customModel = taskConfiguration.modelId;
                  if (taskConfiguration.reasoning && !selectedModel.reasoning.includes(taskConfiguration.reasoning)) {
                    throw new Error('The selected model does not support this reasoning setting.');
                  }
                  taskRouting.reasoning = taskConfiguration.reasoning || undefined;
                } else {
                  taskRouting.mode = taskConfiguration.routingMode;
                  delete taskRouting.customModel;
                }
              }
              if (editMode) taskRouting.requiredCapabilities=[...new Set([...(taskRouting.requiredCapabilities||[]),'writes'])];
              const serialized=JSON.stringify(taskRouting);
              if(serialized.length>65536)throw new Error('Routing settings exceed the local size limit.');
              const preview=await runner(runtimePath(api,context),[join(context.extensionPath,'apps','cli','src','index.js'),'route',folder.uri.fsPath,request],{
                cwd:folder.uri.fsPath,env:{...providerEnvironment(api),CODOVYN_DATA_DIR:taskDataDirectory,CODOVYN_SESSION_ID:routingSession,CODOVYN_EVENT_STREAM:'1',CODOVYN_ROUTING_POLICY:serialized},onChild:()=>{},onEvent:()=>{}});
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
            const agentName = runMode==='opencode-edit'?'OpenCode':runMode==='routed-edit'?'the selected model':runMode === 'configured-edit' ? [taskPolicy.primary, ...(taskPolicy.automatic ? taskPolicy.fallbacks : [])].join(' and ') : runMode === 'gemini-edit' ? 'Gemini CLI' : runMode === 'auto-gemini-edit' ? 'Codex and Gemini CLI' : runMode === 'claude-edit' ? 'Claude Code' : runMode === 'auto-edit' ? 'Codex and Claude Code' : 'Codex';
            const detail = runMode==='opencode-edit'?'OpenCode may request scoped edits inside an isolated worktree. Shell commands, nested agents and external tools are blocked. Authentication uses a separate provider context; review the patch before application.':runMode==='routed-edit'?`${routeSummary} Only this provider receives the task. Codex may execute local draft commands; Gemini uses restricted file tools. Review is required before applying edits.`:runMode === 'configured-edit'
              ? 'The configured providers may receive this task and repository context. Codex may run local draft commands; Gemini and Claude use restricted file tools. Automatic handoff stops after write-capable actions. You will review the patch before applying it.'
              : runMode === 'gemini-edit'
              ? 'Gemini may edit files inside a separate Git worktree using restricted file tools. Shell commands are unavailable. You will review a patch before changes reach the open repository.'
              : runMode === 'auto-gemini-edit'
                ? 'This task may send its request and context to Codex and Gemini. Codex may run draft commands; Gemini uses restricted file tools. Automatic handoff stops after write-capable actions. Review is required before applying changes.'
              : runMode === 'claude-edit'
              ? 'Claude Code may edit files inside a separate Git worktree. Shell commands are unavailable in this mode. You will review a patch before changes reach the open repository.'
              : runMode === 'auto-edit'
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
          const nodePath = runtimePath(api, context);
          const script = join(context.extensionPath, 'apps', 'cli', 'src', 'index.js');
          const activity = [];
          let taskAccepted = false;
          try {
            const result = await runner(nodePath, [script, runMode, folder.uri.fsPath, request,
              ...(editMode ? ['--allow-writes'] : [])], {
              cwd: folder.uri.fsPath,
              env: { ...providerEnvironment(api), CODOVYN_DATA_DIR: taskDataDirectory, CODOVYN_EVENT_STREAM: '1', CODOVYN_AGENT_POLICY: JSON.stringify(taskPolicy), ...(taskConfiguration ? { CODOVYN_TASK_CONFIGURATION: JSON.stringify(taskConfiguration) } : {}), ...(ownedQueue ? { CODOVYN_TASK_ID: ownedQueue.id, CODOVYN_EXPECTED_BASELINE: ownedQueue.baselineFingerprint } : {}), ...(taskRouting?{CODOVYN_ROUTING_POLICY:JSON.stringify(taskRouting),CODOVYN_SESSION_ID:routingSession}:{}) },
              onChild: (child) => { active = child; },
              onEvent: (event, taskId) => {
                if (!taskAccepted && event.kind === 'execution-owned') {
                  taskAccepted = true;
                  panel.webview.postMessage({ type: 'accepted', requestId: message.requestId, taskId });
                  panel.webview.postMessage({ type: 'running', taskId });
                }
                const entries = timeline([event]);
                activity.push(...entries);
                if (entries.length) panel.webview.postMessage({ type: 'progress', entries });
              },
            });
            if (!taskAccepted) {
              if (!result.taskId || result.budgetRejected || (result.routing && !result.routing.selected)) throw new Error('Task admission was refused. Your draft is retained. Review routing and budget settings.');
              taskAccepted = true;
              panel.webview.postMessage({ type: 'accepted', requestId: message.requestId, taskId: result.taskId });
              panel.webview.postMessage({ type: 'running', taskId: result.taskId });
            }
            if (ownedQueue) ownedQueue.outcome = ['completed', 'failed', 'cancelled', 'interrupted'].includes(result.status) ? result.status : 'blocked';
            panel.webview.postMessage({ type: 'result', status: result.status, taskId: result.taskId,
              activeAgent: result.activeAgent, draftReviewAvailable: !!result.draftReviewAvailable,
              timeline: result.budgetRejected ? [{type:'error',text:'Local budget reservation was refused. Another task may have reserved the remaining estimate, or earlier charges are unknown. No provider started.'}] : result.routing&&!result.routing.selected ? [{type:'error',text:'No eligible routing candidate. Review the decision and budget rejection reasons.'}] : result.events ? timeline(result.events) : activity });
            if(result.routing)panel.webview.postMessage({type:'routing-preview',routing:result.routing});
            await refreshTasks();
            if(taskPolicy.prepareOpenCode===true&&result.status==='interrupted'&&!disposed&&folderForTask()===folder) {
              // Discovery and preparation only: execution always requires a later native approval.
              active=null;draftBusy=true;
              try {
                const configuration=validateTaskConfiguration({provider:'opencode',modelId:null,permission:editMode?'read-write':'read',routingMode:'manual',reasoning:null,intent:taskConfiguration?.intent|| (editMode?'agent':'ask')});
                const prepared=await contextFlowCommand('contextflow-prepare',[result.taskId,folder.uri.fsPath,JSON.stringify(configuration),'--eligible'],folder);
                sendContextFlow(prepared.transfer);
              } catch { panel.webview.postMessage({type:'contextflow-error',text:'Automatic preparation stopped at a safety or provider-readiness gate. Inspect the interrupted task and prepare manually after reconciliation.'}); }
              finally {draftBusy=false;}
            }
          } catch (error) { panel.webview.postMessage({ type: 'error', text: error.message }); }
          finally { active = null; starting = false; }
        };
        panel.webview.onDidReceiveMessage(message => handleMessage(message));
        return panel;
      };
      const command = api.commands.registerCommand('codovyn.open', openWorkspace);
      const openSection = section => {
        if (!currentPanel) {
          pendingPanelSection = section;
          openWorkspace();
          return;
        }
        currentPanel.reveal?.();
        if (panelReady) currentPanel.webview.postMessage({ type: 'focus-section', section });
        else pendingPanelSection = section;
      };
      const sectionCommands = [
        ['codovyn.openChat', 'chat'],
        ['codovyn.openActivity', 'activity'],
        ['codovyn.openRecentTasks', 'tasks'],
        ['codovyn.openAgentSettings', 'agents'],
        ['codovyn.openRoutingSettings', 'routing'],
        ['codovyn.openRepositoryDiff', 'diff'],
      ].map(([id, section]) => api.commands.registerCommand(id, () => openSection(section)));
      context.subscriptions.push(command, ...sectionCommands);
      return require('./codex-session.cjs').registerCodexSession(api,context,{runtimePath,dataDirectory,ensureChat:()=>openSection('chat'),present:message=>currentPanel?.webview.postMessage(message)});
    },
  };
}

let activeCodexSession;
function activate(context) { activeCodexSession=createExtension(require('vscode')).activate(context); }
async function deactivate(){await activeCodexSession?.dispose();activeCodexSession=null;}
module.exports = { runtimePath, activate, deactivate, createExtension, dataDirectory, runCli, timeline };
