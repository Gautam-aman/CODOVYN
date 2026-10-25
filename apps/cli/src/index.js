#!/usr/bin/env node
import {inspectDraftWriteLocks} from '../../../packages/task-engine/src/recovery.js';
import { contextFlowUsage } from '../../../packages/agent-core/src/contextflow-usage.js';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { routeModel, validateRouting } from '../../../packages/agent-router/src/index.js';
import { AgentRegistry, AgentFailure } from '../../../packages/agent-core/src/index.js';
import { TaskStore } from '../../../packages/storage/src/index.js';
import { createHandoffPacket } from '../../../packages/agent-core/src/handoff.js';
import agentPolicy from '../../../packages/agent-core/src/policy.cjs';
import { executionRecovery, recoveryFingerprint, reconcileDraft } from '../../../packages/task-engine/src/recovery.js';
import { prepareContextFlow, verifyContextFlow, contextFlowBinding } from '../../../packages/task-engine/src/contextflow.js';
import { contextFlowAccounting } from '../../../packages/agent-core/src/contextflow.js';
import { TaskEngine } from '../../../packages/task-engine/src/index.js';
import { commitStaged, createBranch, fetchRemote, pullFastForward, pushCurrentBranch, repositoryDiff, repositorySnapshot, stagePaths } from '../../../packages/git-engine/src/index.js';
import { createClaudeAdapter, createCodexAdapter, createGeminiAdapter } from '../../../packages/agent-adapters/src/index.js';
import { validateDraftWorkspace, createDraftWorkspace, reviewDraftWorkspace, acceptDraftWorkspace, rejectDraftWorkspace } from '../../../packages/git-engine/src/draft-workspace.js';
import { openCodeBoundary } from '../../../packages/agent-adapters/src/opencode-sandbox.js';
import { discoverProvider, openCodeStateDirectory } from '../../../packages/agent-adapters/src/discovery.js';
import { createOpenCodeAdapter, inspectOpenCodeInstallation, resolveOpenCodeCommand, openCodeProviderStatus } from '../../../packages/agent-adapters/src/opencode.js';
import { inspectCodexReasoning } from '../../../packages/agent-adapters/src/codex-models.js';
import taskConfigurationSchema from '../../../apps/vscode-extension/task-config.cjs';
import { createIssue, createPullRequest, issueDetails, listIssues, listPullRequests, listWorkflowRuns, previewPullRequest, pullRequestDetails, pullRequestDiff } from '../../../packages/github-integration/src/index.js';

const usage = `Usage:
  codovyn contextflow-read <task-id> <repository>
  codovyn contextflow-prepare <task-id> <repository> <destination-configuration-json> --manual
  codovyn contextflow-run <transfer-id> <repository> <reviewed-hash> --yes
  codovyn contextflow-reject <transfer-id> <repository> --yes
  codovyn resume <task-id> <repository> --yes (read-only tasks)
  codovyn route <repository> <request> (preview only)
  codovyn routed <repository> <request>
  codovyn routed-edit <repository> <request> --allow-writes
  codovyn agents <directory>
  codovyn configured <repository> <request>
  codovyn configured-edit <repository> <request> --allow-writes
  codovyn demo <repository> <request>
  codovyn codex <repository> <request>
  codovyn claude <repository> <request>
  codovyn gemini <repository> <request>
  codovyn auto-gemini <repository> <request>
  codovyn auto-gemini-edit <repository> <request> --allow-writes
  codovyn gemini-edit <repository> <request> --allow-writes
  codovyn auto <repository> <request>
  codovyn codex-edit <repository> <request> --allow-writes
  codovyn claude-edit <repository> <request> --allow-writes
  codovyn auto-edit <repository> <request> --allow-writes
  codovyn draft-continue <task-id> <repository> <fingerprint> <agent> --yes
  codovyn draft-reconcile <task-id> <repository> <fingerprint> --yes
  codovyn draft-abandon <task-id> <repository> <fingerprint> --yes
  codovyn draft-inspect <task-id> <repository>
  codovyn draft-review <task-id> <repository>
  codovyn draft-accept <task-id> <repository> <patch-hash> --yes
  codovyn draft-reject <task-id> <repository> --yes
  codovyn tasks [repository]
  codovyn queue-add <repository> <request> <task-configuration-json>
  codovyn queue-list <repository>
  codovyn queue-cancel <queued-id> <repository>
  codovyn queue-remove <queued-id> <repository>
  codovyn queue-reorder <queued-id> <position> <repository>
  codovyn queue-pause|queue-resume <repository>
  codovyn queue-claim <queued-id> <repository>
  codovyn queue-update <queued-id> <status> <repository>
  codovyn history <task-id> [repository]
  codovyn task-delete <task-id> [repository] [--yes]
  codovyn task-prune <repository> <before-ISO-time> [--yes]
  codovyn diff <repository> [--staged]
  codovyn status <repository>
  codovyn stage <repository> <path> [more paths]
  codovyn commit <repository> <message>
  codovyn branch <repository> <new-name>
  codovyn fetch <repository> [remote]
  codovyn pull <repository> [remote]
  codovyn push <repository> [remote]
  codovyn issues <owner/repo>
  codovyn issue <owner/repo> <number>
  codovyn prs <owner/repo>
  codovyn pr <owner/repo> <number>
  codovyn pr-diff <owner/repo> <number>
  codovyn pr-preview <owner/repo> <base> <head>
  codovyn pr-create <owner/repo> <base> <head> <title> <body-file>
  codovyn runs <owner/repo> [branch]
  codovyn issue-create <owner/repo> <title> <body-file> [labels]

The demo simulates a quota handoff and makes no code changes.
Codex editing runs in an isolated worktree and requires explicit write permission.
The Codex and Claude commands without -edit run installed CLIs in read-only modes.
Auto tries Codex first, then Claude after a confirmed eligible failure.
Auto-gemini explicitly authorizes Codex-to-Gemini fallback. Gemini shell execution is disabled.`;

async function confirmAction(word) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await prompt.question(`Type ${word} to confirm: `)).trim() === word; }
  finally { prompt.close(); }
}

function configuredGeminiCommand() {
  const command = process.env.CODOVYN_GEMINI_COMMAND;
  if (!command) return undefined;
  try {
    if (command.length > 4096 || !isAbsolute(command)) throw new Error('not absolute');
    const resolved = realpathSync(command);
    if (!statSync(resolved).isFile()) throw new Error('not a file');
    accessSync(resolved, constants.X_OK);
    return resolved;
  } catch {
    throw new TypeError('Configured Gemini CLI path must be an absolute executable file');
  }
}

export async function main(args = process.argv.slice(2), output = console, signal,
  github = { createIssue, createPullRequest, issueDetails, listIssues, listPullRequests, listWorkflowRuns, previewPullRequest, pullRequestDetails, pullRequestDiff },
  adapters = { createCodexAdapter, createClaudeAdapter, createGeminiAdapter }, confirm = confirmAction) {
  const [mode, value, ...rest] = args;
  if (!['contextflow-prepare','contextflow-read','contextflow-run','contextflow-reject','provider-models', 'provider-context', 'opencode', 'opencode-edit', 'reasoning', 'resume', 'route', 'routed', 'routed-edit', 'agents', 'configured', 'configured-edit', 'demo', 'codex', 'claude', 'gemini', 'auto-gemini', 'auto', 'codex-edit', 'claude-edit', 'gemini-edit', 'auto-gemini-edit', 'auto-edit', 'draft-continue', 'draft-reconcile', 'draft-abandon', 'draft-inspect', 'draft-review', 'draft-accept', 'draft-reject', 'tasks', 'history', 'task-delete', 'task-prune', 'queue-add', 'queue-list', 'queue-cancel', 'queue-remove', 'queue-reorder', 'queue-pause', 'queue-resume', 'queue-claim', 'queue-update', 'diff', 'status', 'stage', 'commit', 'branch', 'fetch', 'pull', 'push', 'issues', 'issue', 'prs', 'pr', 'pr-diff', 'pr-preview', 'pr-create', 'runs', 'issue-create'].includes(mode)) { output.error(usage); return 2; }
  const stream = process.env.CODOVYN_EVENT_STREAM === '1';
  const geminiAdapter = options => {
    const command = configuredGeminiCommand();
    return adapters.createGeminiAdapter({ ...options, ...(command ? { command } : {}) });
  };
  const dataDirectory = process.env.CODOVYN_DATA_DIR || join(homedir(), '.codovyn');
  const routingSession=process.env.CODOVYN_SESSION_ID||'cli-default';
  if ((process.env.CODOVYN_TASK_CONFIGURATION?.length || 0) > 32768 || (process.env.CODOVYN_QUEUE_POLICY_SNAPSHOT?.length || 0) > 70000) throw new TypeError('Task policy exceeds the local size limit');
  const taskConfiguration = process.env.CODOVYN_TASK_CONFIGURATION
    ? taskConfigurationSchema.validateTaskConfiguration(JSON.parse(process.env.CODOVYN_TASK_CONFIGURATION)) : null;
  if (taskConfiguration && taskConfigurationSchema.resolveTaskMode(taskConfiguration) !== mode) throw new TypeError('Task mode differs from the approved configuration');
  let providerSelection;
  if (taskConfiguration?.provider === 'opencode' || taskConfiguration?.modelSource === 'discovered') {
    const catalogue=await (adapters.discoverProvider || discoverProvider)(taskConfiguration.provider,{cwd:value,dataDirectory,modelId:taskConfiguration.modelId,signal});
    if(catalogue.executionSupported===false)throw new AgentFailure('fatal','OpenCode metadata is verified only; task execution remains blocked by security policy');
    const selected=catalogue.models.find(entry=>taskConfiguration.modelId ? entry.id===taskConfiguration.modelId : entry.model===catalogue.defaultModel);
    if (!selected) throw new TypeError('Selected provider model is unavailable in the current catalogue');
    if (taskConfiguration.reasoning && !selected.reasoning.includes(taskConfiguration.reasoning)) throw new TypeError('Selected provider variant or reasoning setting is unsupported');
    providerSelection={model:taskConfiguration.modelId?selected.model:undefined,reasoning:taskConfiguration.reasoning||undefined};
  }
  if (taskConfiguration?.provider === 'codex' && !taskConfiguration.modelId && taskConfiguration.reasoning) {
    const metadata = await (adapters.inspectCodexReasoning || inspectCodexReasoning)({ cwd: value });
    const selected = metadata.models.find(entry => entry.model === metadata.defaultModel);
    if (!selected?.reasoning.includes(taskConfiguration.reasoning)) throw new TypeError('The current Codex default model does not advertise this reasoning effort. Refresh the Effort menu.');
  }
  let routing, routingBudget;
  if (['route','routed','routed-edit'].includes(mode)) {
    const json=process.env.CODOVYN_ROUTING_POLICY||'';
    if(json.length>65536)throw new TypeError('Routing policy exceeds size limit');
    const input=validateRouting(JSON.parse(json));
    routingBudget=input.budget||{};
    const ledger=new TaskStore(join(dataDirectory,'tasks.sqlite'));let totals;
    try{totals=ledger.routeBudgetTotals(routingSession);}finally{ledger.close();}
    const budget={...routingBudget};
    for(const [key,window] of [['sessionSpentUsd','session'],['monthSpentUsd','month']]) {
      if(typeof budget[key]==='number')budget[key]=totals[window].unknownRequests?null:budget[key]+totals[window].estimatedUsd;
    }
    const request=(mode==='routed-edit'&&rest.at(-1)==='--allow-writes'?rest.slice(0,-1):rest).join(' ');
    routing=routeModel(request,{...input,budget,requiredCapabilities:[...new Set([...(input.requiredCapabilities||[]),'streaming','tools',...(mode==='routed-edit'?['writes']:[])])]});
    routing.localReservations=totals;
    if(routing.selected && (routing.selected.provider==='claude'||(routing.selected.reasoning&&routing.selected.provider!=='codex'))) {
      routing.considered.find(candidate=>candidate.id===routing.selected.id).reasons.push('unsupported-cli-model-or-reasoning-selector');
      routing.explanation='Selected adapter cannot apply this model/reasoning selection';routing.selected=null;
    }
    if(mode==='route') {output.log(JSON.stringify(stream?{type:'result',routing}:routing));return 0;}
  }
  let policy;
  if (mode === 'configured' || mode === 'configured-edit') {
    const json = process.env.CODOVYN_AGENT_POLICY || '';
    if (json.length > 4096) throw new TypeError('Agent policy exceeds size limit');
    policy = agentPolicy.validateAgentPolicy(JSON.parse(json));
  }
  if (mode === 'provider-context') {
    if(!value||rest.length!==1||rest[0]!=='opencode')throw new TypeError('Unsupported provider context');
    const installation=await inspectOpenCodeInstallation();
    const stateDirectory=openCodeStateDirectory(dataDirectory,value);
    const context={...installation,stateDirectory,environment:openCodeBoundary({cwd:value,stateDirectory,command:installation.command}).env};
    output.log(JSON.stringify(stream?{type:'result',context}:{context}));return 0;
  }
  if (mode === 'provider-models') {
    if(!value||rest.length<1||rest.length>2||!['codex','opencode'].includes(rest[0]))throw new TypeError('Unsupported provider catalogue');
    const metadata=await discoverProvider(rest[0],{cwd:value,dataDirectory,modelId:rest[1],signal});
    output.log(JSON.stringify(stream?{type:'result',metadata}:{metadata}));return 0;
  }
  if (mode === 'reasoning') {
    if (!value || rest.length) { output.error(usage); return 2; }
    const reasoning = await inspectCodexReasoning({ cwd: value });
    output.log(JSON.stringify(stream ? { type: 'result', reasoning } : { reasoning })); return 0;
  }
  if (mode === 'agents') {
    if (!value || rest.length) { output.error(usage); return 2; }
    const factories = { codex: adapters.createCodexAdapter, gemini: geminiAdapter, claude: adapters.createClaudeAdapter };
    const agents = await Promise.all(Object.entries(factories).map(async ([id, factory]) => {
      try {
        const adapter = factory({ cwd: value });
        const detected = await adapter.availability() === 'available';
        return { id, installation: detected ? 'detected' : 'not-detected-or-unsupported', authentication: 'unknown',
          availability: 'unknown', capabilities: adapter.capabilities,
          ...(adapter.executionSupported===false?{executionSupported:false,diagnostic:adapter.diagnostic}:{}) };
      } catch (error) {
        return { id, installation: 'configuration-error', authentication: 'unknown', availability: 'unknown',
          diagnostic: error?.message === 'Configured Gemini CLI path must be an absolute executable file'
            ? error.message : 'CLI inspection failed.' };
      }
    }));
    try { const installation=await inspectOpenCodeInstallation(); agents.push({id:'opencode',installation:installation.compatible?'detected':'unsupported-version',version:installation.version,command:installation.command,binarySha256:installation.binarySha256,...openCodeProviderStatus(installation,value),capabilities:{streaming:true,tools:true,writes:process.platform==='darwin',shell:false}}); } catch { agents.push({id:'opencode',installation:'not-detected-or-unsupported',authentication:'unknown',availability:'unknown',capabilities:{},diagnostic:'Install OpenCode 2.1.2 or configure its absolute executable path.'}); }
    output.log(JSON.stringify(stream ? { type: 'result', agents } : { agents })); return 0;
  }
  if (mode === 'issue') {
    if (!value || rest.length !== 1 || !/^[1-9]\d*$/.test(rest[0])) { output.error(usage); return 2; }
    const issue = await github.issueDetails(value, Number(rest[0]));
    output.log(JSON.stringify(stream ? { type: 'result', issue } : issue, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'pr') {
    if (!value || rest.length !== 1 || !/^[1-9]\d*$/.test(rest[0])) { output.error(usage); return 2; }
    const pullRequest = await github.pullRequestDetails(value, Number(rest[0]));
    output.log(JSON.stringify(stream ? { type: 'result', pullRequest } : pullRequest, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'runs') {
    if (!value || rest.length > 1) { output.error(usage); return 2; }
    const runs = await github.listWorkflowRuns(value, { branch: rest[0] });
    output.log(JSON.stringify(stream ? { type: 'result', runs } : runs, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'pr-diff') {
    if (!value || rest.length !== 1 || !/^[1-9]\d*$/.test(rest[0])) { output.error(usage); return 2; }
    const patch = await github.pullRequestDiff(value, Number(rest[0]));
    output.log(stream ? JSON.stringify({ type: 'result', patch }) : patch);
    return 0;
  }
  if (mode === 'pr-preview') {
    if (!value || rest.length !== 2) { output.error(usage); return 2; }
    const preview = await github.previewPullRequest(value, { base: rest[0], head: rest[1] });
    output.log(JSON.stringify(stream ? { type: 'result', preview } : preview, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'pr-create') {
    const [base, head, title, bodyFile] = rest;
    if (!value || rest.length !== 4) { output.error(usage); return 2; }
    const file = await stat(bodyFile);
    if (!file.isFile() || file.size > 65_536) throw new Error('PR body file must be a regular file up to 65536 bytes');
    const body = await readFile(bodyFile, 'utf8');
    const result = await github.createPullRequest(value, { base, head, title, body }, { approve: async (preview) => {
      output.error(`Repository: ${preview.repository}\nBase: ${preview.base}\nHead: ${preview.head}\nTitle: ${preview.title}\nDraft: ${preview.draft}\n\n${preview.body}\n\n${preview.diff}`);
      return confirm('create');
    } });
    output.log(JSON.stringify(stream ? { type: 'result', ...result } : result, null, stream ? 0 : 2));
    return result.approved ? 0 : 1;
  }
  if (mode === 'issue-create') {
    const [title, bodyFile, ...labels] = rest;
    if (!value || !title || !bodyFile || labels.length > 10) { output.error(usage); return 2; }
    const file = await stat(bodyFile);
    if (!file.isFile() || file.size > 65_536) throw new Error('Issue body file must be a regular file up to 65536 bytes');
    const created = await github.createIssue(value, { title, body: await readFile(bodyFile, 'utf8'), labels });
    output.log(JSON.stringify(stream ? { type: 'result', created } : created, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'issues' || mode === 'prs') {
    if (!value || rest.length) { output.error(usage); return 2; }
    const items = mode === 'issues' ? await github.listIssues(value) : await github.listPullRequests(value);
    output.log(JSON.stringify(stream ? { type: 'result', items } : items, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'diff') {
    if (!value || rest.some((argument) => argument !== '--staged')) { output.error(usage); return 2; }
    const diff = await repositoryDiff(value, { staged: rest.includes('--staged') });
    output.log(stream ? JSON.stringify({ type: 'result', diff }) : diff);
    return 0;
  }
  if (mode === 'status') {
    if (!value || rest.length) { output.error(usage); return 2; }
    const snapshot = await repositorySnapshot(value);
    output.log(JSON.stringify(stream ? { type: 'result', snapshot } : snapshot, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'stage' || mode === 'commit') {
    if (!value || !rest.length) { output.error(usage); return 2; }
    const snapshot = mode === 'stage' ? await stagePaths(value, rest) : await commitStaged(value, rest.join(' '));
    output.log(JSON.stringify(stream ? { type: 'result', snapshot } : snapshot, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'branch') {
    if (!value || rest.length !== 1) { output.error(usage); return 2; }
    const snapshot = await createBranch(value, rest[0]);
    output.log(JSON.stringify(stream ? { type: 'result', snapshot } : snapshot, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'pull') {
    if (!value || rest.length > 1) { output.error(usage); return 2; }
    const snapshot = await pullFastForward(value, rest[0] || 'origin');
    output.log(JSON.stringify(stream ? { type: 'result', snapshot } : snapshot, null, stream ? 0 : 2));
    return 0;
  }
  if (mode === 'fetch' || mode === 'push') {
    if (!value || rest.length > 1) { output.error(usage); return 2; }
    const result = mode === 'fetch' ? await fetchRemote(value, rest[0] || 'origin')
      : await pushCurrentBranch(value, rest[0] || 'origin');
    output.log(JSON.stringify(stream ? { type: 'result', [mode === 'fetch' ? 'fetched' : 'pushed']: result } : result,
      null, stream ? 0 : 2));
    return 0;
  }
  const store = new TaskStore(join(dataDirectory, 'tasks.sqlite'));
  try {
    if(mode.startsWith('contextflow-')) {
      if(!['contextflow-prepare','contextflow-read','contextflow-run','contextflow-reject'].includes(mode))throw new TypeError('Unknown ContextFlow operation');
      if(!value||!rest[0])throw new TypeError('ContextFlow requires a task/transfer and repository');
      const repository=(await repositorySnapshot(rest[0])).root;
      const emit=transfer=>output.log(JSON.stringify(stream?{type:'result',transfer}:{transfer}));
      const lookupTask=()=>{const task=store.get(value);if(!task||task.repositoryRoot!==repository)throw new Error('Task belongs to a different repository');return task;};
      const destination=async configuration=>{
        configuration=taskConfigurationSchema.validateTaskConfiguration(configuration);
        if(configuration.provider!=='opencode')throw new TypeError('ContextFlow destination must be OpenCode');
        const metadata=await(adapters.discoverProvider||discoverProvider)('opencode',{cwd:repository,dataDirectory,modelId:configuration.modelId,signal});
        const selected=metadata.models.find(entry=>configuration.modelId?entry.id===configuration.modelId:entry.model===metadata.defaultModel);
        if(!selected||configuration.reasoning&&!selected.reasoning.includes(configuration.reasoning))throw new Error('Destination model or variant is not currently advertised');
        return {configuration,executionSupported:metadata.executionSupported,model:selected.model,command:metadata.command,reasoning:configuration.reasoning||undefined,
          binding:contextFlowBinding({configuration,model:selected.model,command:metadata.command||'',version:metadata.version||'',binarySha256:metadata.binarySha256||'',brokerImplementation:metadata.inspection?.implementationSha256||'',readerSource:metadata.inspection?.readerSourceSha256||'',clientSource:metadata.inspection?.clientSourceSha256||'',repositoryIdentity:metadata.repositoryIdentity?.id||'',repositoryState:metadata.repositoryIdentity?.fingerprint||'',configuredCommand:process.env.CODOVYN_OPENCODE_COMMAND||''})};
      };
      if(mode==='contextflow-prepare') {
        lookupTask();if(rest.length!==3||!['--manual','--eligible'].includes(rest[2])||rest[1].length>4096)throw new TypeError('Invalid ContextFlow preparation');
        const selection=await destination(JSON.parse(rest[1]));
        emit(await prepareContextFlow({store,taskId:value,dataDirectory,configuration:selection.configuration,binding:selection.binding,destinationModel:selection.model,manual:rest[2]==='--manual'}));return 0;
      }
      if(mode==='contextflow-read') {lookupTask();if(rest.length!==1)throw new TypeError('Invalid ContextFlow inspection');const transfer=store.latestContextFlow(value);emit(transfer?{...transfer,metrics:{...contextFlowAccounting(transfer.packet),providerUsage:contextFlowUsage(store.events(transfer.taskId))}}:null);return 0;}
      const transfer=store.contextFlowTransfer(value);if(!transfer||store.get(transfer.taskId)?.repositoryRoot!==repository)throw new Error('Transfer belongs to a different repository');
      if(mode==='contextflow-reject'){if(rest.length!==2||rest[1]!=='--yes')throw new Error('Explicit rejection required');emit(store.rejectContextFlow(value));return 0;}
      if(rest.length!==3||rest[1]!==transfer.hash||rest[2]!=='--yes')throw new Error('Explicit recipient and context approval required');
      if(transfer.status!=='prepared'||transfer.expiresAt<=Date.now())throw new Error('ContextFlow approval is expired or consumed');
      const selection=await destination(transfer.configuration);
      const verified=await verifyContextFlow({store,transferId:value,hash:rest[1],dataDirectory,binding:selection.binding});
      if(selection.executionSupported===false)throw new Error('OpenCode metadata-only compatibility does not authorize ContextFlow execution');
      const registry=new AgentRegistry();registry.register((adapters.createOpenCodeAdapter||createOpenCodeAdapter)({cwd:verified.workspace.cwd,stateDirectory:openCodeStateDirectory(dataDirectory,repository),command:selection.command,model:selection.model,reasoning:selection.reasoning,write:selection.configuration.permission==='read-write'}));
      const snapshot=async()=>{if(recoveryFingerprint(await repositorySnapshot(repository))!==transfer.packet.repository.originalFingerprint)throw new Error('Original repository changed after handoff approval');return repositorySnapshot(verified.workspace.cwd);};
      const engine=new TaskEngine({store,registry,snapshot,onEvent:stream?event=>output.log(JSON.stringify({type:'event',taskId:verified.task.id,event})):undefined});
      const task=await engine.run(verified.task.id,{signal,contextFlow:{id:value,hash:transfer.hash}});
      output.log(JSON.stringify({...(stream?{type:'result'}:{}),taskId:task.id,status:task.status,activeAgent:task.activeAgent,draftReviewAvailable:!!verified.workspace.draft}));return task.status==='completed'?0:1;
    }
    if (mode.startsWith('queue-')) {
      const emit = value => output.log(JSON.stringify(stream ? { type: 'result', ...value } : value, null, stream ? 0 : 2));
      if (mode === 'queue-add') {
        if (!value || rest.length !== 2 || rest[0].length > 10000 || rest[1].length > 32768) { output.error(usage); return 2; }
        const configuration = taskConfigurationSchema.validateTaskConfiguration(JSON.parse(rest[1]));
        const snapshot = await repositorySnapshot(value);
        const task = store.enqueueTask({ id: process.env.CODOVYN_QUEUE_REQUEST_ID || randomUUID(), repositoryRoot: snapshot.root, request: rest[0], configuration,
          baselineFingerprint: recoveryFingerprint(snapshot), policySnapshot: process.env.CODOVYN_QUEUE_POLICY_SNAPSHOT ? JSON.parse(process.env.CODOVYN_QUEUE_POLICY_SNAPSHOT) : null });
        emit({ task }); return 0;
      }
      if (mode === 'queue-list') {
        if (!value || rest.length) { output.error(usage); return 2; }
        const repositoryRoot = (await repositorySnapshot(value)).root;
        emit({ ...store.listQueuedTasks(repositoryRoot), repositoryRoot }); return 0;
      }
      if (mode === 'queue-pause' || mode === 'queue-resume') {
        if (!value || rest.length) { output.error(usage); return 2; }
        const repositoryRoot = (await repositorySnapshot(value)).root;
        emit({ ...store.setTaskQueuePaused(repositoryRoot, mode === 'queue-pause'), repositoryRoot }); return 0;
      }
      if (mode === 'queue-cancel' || mode === 'queue-remove' || mode === 'queue-claim' || mode === 'queue-update' || mode === 'queue-reorder') {
        const expected = ['queue-reorder', 'queue-update'].includes(mode) ? 2 : 1;
        if (!value || rest.length !== expected) { output.error(usage); return 2; }
        const task = store.getQueuedTask(value);
        if (!task) { output.error(`Unknown queued task: ${value}`); return 1; }
        if (task.repositoryRoot !== (await repositorySnapshot(rest.at(-1))).root) {
          output.error('Queued task belongs to a different repository'); return 1;
        }
        if (mode === 'queue-cancel') { emit({ task: store.cancelQueuedTask(value) }); return 0; }
        if (mode === 'queue-remove') { emit({ removed: store.removeQueuedTask(value) }); return 0; }
        if (mode === 'queue-reorder') {
          if (!/^(?:0|[1-9]\d*)$/.test(rest[0])) { output.error(usage); return 2; }
          emit({ task: store.reorderQueuedTask(value, Number(rest[0])) }); return 0;
        }
        if (mode === 'queue-update') {
          if (!['running','completed','blocked','interrupted','failed','cancelled'].includes(rest[0])) { output.error(usage); return 2; }
          emit({ task: store.updateQueuedTask(value, rest[0]) }); return 0;
        }
        const snapshot = await repositorySnapshot(rest[0]);
        emit({ task: store.claimQueuedTask(value, recoveryFingerprint(snapshot)) }); return 0;
      }
    }
    if(mode==='resume') {
      if(!value||rest.length!==2||rest[1]!=='--yes'){output.error(usage);return 2;}
      const task=store.get(value);const repository=(await repositorySnapshot(rest[0])).root;
      if(!task||task.repositoryRoot!==repository||task.status!=='interrupted')throw new Error('No interrupted task in this repository');
      const events=store.events(task.id);
      if(events.some(event=>['draft-created','routing-decision'].includes(event.kind)))throw new Error('Use explicit draft recovery or a new budget admission for this task');
      const saved=events.findLast(event=>event.kind==='agent-policy')?.data;
      const policy=saved?agentPolicy.validateAgentPolicy(saved):null;
      const factories={codex:adapters.createCodexAdapter,gemini:geminiAdapter,claude:adapters.createClaudeAdapter};
      const registry=new AgentRegistry();
      for(const provider of new Set([task.primaryAgent,task.activeAgent,...task.fallbackAgents].filter(Boolean))) {
        if(!agentPolicy.providers.includes(provider))throw new Error('Unsupported recovery provider');
        registry.register(factories[provider]({cwd:repository,write:false,...(provider==='gemini'&&policy?.geminiModel?{model:policy.geminiModel}:{})}));
      }
      const engine=new TaskEngine({store,registry,snapshot:()=>repositorySnapshot(repository),restoration:{enabled:policy?.restorePrimary===true},
        onEvent:stream?event=>output.log(JSON.stringify({type:'event',taskId:task.id,event})):undefined});
      const resumed=await engine.run(task.id,{signal});const result={taskId:task.id,status:resumed.status,activeAgent:resumed.activeAgent,...(stream?{}:{events:store.events(task.id)})};
      output.log(JSON.stringify(stream?{type:'result',...result}:result));return resumed.status==='completed'?0:1;
    }
    if (['draft-continue', 'draft-reconcile', 'draft-abandon', 'draft-inspect', 'draft-review', 'draft-accept', 'draft-reject'].includes(mode)) {
      const [repositoryPath, patchHash, confirmation] = rest;
      if (!value || !repositoryPath ||
        (['draft-review', 'draft-inspect'].includes(mode) && rest.length !== 1) ||
        (['draft-reconcile', 'draft-abandon', 'draft-accept'].includes(mode) && (rest.length !== 3 || confirmation !== '--yes')) ||
        (mode === 'draft-continue' && (rest.length!==4 || rest[3]!=='--yes' || !agentPolicy.providers.includes(confirmation))) ||
        (mode === 'draft-reject' && (rest.length !== 2 || patchHash !== '--yes'))) {
        output.error(usage); return 2;
      }
      const task = store.get(value);
      if (!task || task.repositoryRoot !== (await repositorySnapshot(repositoryPath)).root) {
        output.error('Unknown draft in this repository'); return 1;
      }
      const events = store.events(value);
      const draft = events.find((entry) => entry.kind === 'draft-created')?.data;
      if (!draft || events.some((entry) => ['draft-accepted', 'draft-rejected'].includes(entry.kind))) {
        output.error('This task has no open edit draft'); return 1;
      }
      if (task.status === 'running' && !['draft-inspect','draft-reconcile','draft-abandon'].includes(mode)) { output.error('A running draft cannot be reviewed or changed'); return 1; }
      if (['draft-review','draft-accept','draft-reject'].includes(mode) &&
          (store.executionLease(task.id)?.releasedAt === null ||
          (!store.executionLease(task.id) && task.status === 'interrupted'))) {
        output.error('Reconcile provider ownership before reviewing or changing this draft');return 1;
      }
      const directory = join(dataDirectory, 'drafts');
      if (mode === 'draft-inspect') {
        // Validate ownership/base commit using the existing worktree review guard.
        await validateDraftWorkspace(task.repositoryRoot, directory, task.id, draft.baseCommit);
        const snapshot = await repositorySnapshot(join(directory, task.id));
        const packet = createHandoffPacket({ request: task.request, snapshot, history: events, step: task.step });
        const inspection = { taskId: task.id, status: task.status, repository: packet.repository,
          actions: packet.actions, automaticContinuation: false, processState: executionRecovery(store,task.id).reason,
          recoverySafe: ['running','interrupted','cancelled'].includes(task.status)&&executionRecovery(store,task.id,{draftLocks:await inspectDraftWriteLocks(store,task.id)}).safe, fingerprint: recoveryFingerprint(snapshot),
          continuationReady: task.status==='interrupted' && events.findLast(event=>event.kind==='draft-reconciled')?.data.fingerprint===recoveryFingerprint(snapshot) &&
            events.findLast(event=>event.kind==='draft-reconciled')?.data.decision==='preserve' &&
            (events.findLast(event=>event.kind==='continuation-approved')?.seq??0)<(events.findLast(event=>event.kind==='draft-reconciled')?.seq??0),
          guidance: executionRecovery(store,task.id).safe ? 'Process cleanup or absence verified. Tool outcomes remain unknown. Confirm preservation for review; continuation requires separate explicit approval.' : 'Recovery is blocked while process ownership is unknown or a provider group may remain alive. No action has been replayed. Preserve files and inspect processes externally.' };
        output.log(JSON.stringify(stream ? { type: 'result', inspection } : inspection, null, stream ? 0 : 2));
        return 0;
      }
      if (mode==='draft-continue') {
        await validateDraftWorkspace(task.repositoryRoot,directory,task.id,draft.baseCommit);
        if(events.some(event=>event.kind==='routing-decision'))throw new Error('Routed tasks require a new budget admission before continuation');
        const provider=confirmation;
        const factories={codex:adapters.createCodexAdapter,claude:adapters.createClaudeAdapter,gemini:geminiAdapter};
        const registry=new AgentRegistry();registry.register(factories[provider]({cwd:join(directory,task.id),write:true}));
        const engine=new TaskEngine({store,registry,snapshot:()=>repositorySnapshot(join(directory,task.id)),
          onEvent:stream?event=>output.log(JSON.stringify({type:'event',event})):undefined});
        const continued=await engine.run(task.id,{signal,continuation:{agent:provider,fingerprint:patchHash}});
        const result={taskId:task.id,status:continued.status,activeAgent:continued.activeAgent,draftReviewAvailable:true,...(stream?{}:{events:store.events(task.id)})};
        output.log(JSON.stringify(stream?{type:'result',...result}:result));return continued.status==='completed'?0:1;
      }
      if (['draft-reconcile','draft-abandon'].includes(mode)) {
        await validateDraftWorkspace(task.repositoryRoot,directory,task.id,draft.baseCommit);
        const recovered=await reconcileDraft({store,id:task.id, snapshot:()=>repositorySnapshot(join(directory,task.id)),
          expectedFingerprint:patchHash,decision:mode==='draft-abandon'?'abandon':'preserve',confirm:confirmation==='--yes'});
        output.log(JSON.stringify(stream?{type:'result',recovered}:{recovered},null,stream?0:2));return 0;
      }
      if (mode === 'draft-review') {
        const review = await reviewDraftWorkspace(task.repositoryRoot, directory, task.id, draft.baseCommit);
        output.log(JSON.stringify(stream ? { type: 'result', ...review, taskId: task.id } : review, null, stream ? 0 : 2));
        return 0;
      }
      if (mode === 'draft-accept') {
        const accepted = await acceptDraftWorkspace(task.repositoryRoot, directory, task.id, draft.baseCommit, patchHash);
        store.append(task.id, 'draft-accepted', { changedPaths: accepted.changedPaths });
        output.log(JSON.stringify(stream ? { type: 'result', ...accepted, taskId: task.id } : accepted, null, stream ? 0 : 2));
        return 0;
      }
      await rejectDraftWorkspace(task.repositoryRoot, directory, task.id, draft.baseCommit);
      store.append(task.id, 'draft-rejected');
      output.log(JSON.stringify(stream ? { type: 'result', rejected: true, taskId: task.id } : { rejected: true }, null, stream ? 0 : 2));
      return 0;
    }
    if (mode === 'tasks') {
      const repositoryRoot = value ? (await repositorySnapshot(value)).root : undefined;
      const tasks = store.list({ repositoryRoot }).map(({ id, request, status, activeAgent, updatedAt }) =>
        ({ id, request, status, activeAgent, updatedAt, draftReviewAvailable: store.hasOpenDraft(id) }));
      output.log(JSON.stringify(stream ? { type: 'result', tasks } : tasks, null, stream ? 0 : 2));
      return 0;
    }
    if (mode === 'task-prune') {
      const confirmed = rest.at(-1) === '--yes';
      const argumentsWithoutFlag = confirmed ? rest.slice(0, -1) : rest;
      if (!value || argumentsWithoutFlag.length !== 1) { output.error(usage); return 2; }
      const repositoryRoot = (await repositorySnapshot(value)).root;
      const options = { repositoryRoot, before: argumentsWithoutFlag[0] };
      const candidateIds = store.prunable(options);
      output.error(`Delete ${candidateIds.length} finished tasks updated before ${options.before} from ${repositoryRoot}`);
      if (!candidateIds.length) {
        output.log(JSON.stringify(stream ? { type: 'result', deletedTaskIds: [] } : { deletedTaskIds: [] }));
        return 0;
      }
      if (!confirmed && !await confirm('delete')) { output.error('Retention cancelled; pass --yes for non-interactive use'); return 2; }
      const deletedTaskIds = store.prune(options);
      output.log(JSON.stringify(stream ? { type: 'result', deletedTaskIds } : { deletedTaskIds }, null, stream ? 0 : 2));
      return 0;
    }
    if (mode === 'history' || mode === 'task-delete') {
      const confirmed = mode === 'task-delete' && rest.at(-1) === '--yes';
      const argumentsWithoutFlag = confirmed ? rest.slice(0, -1) : rest;
      if (!value || argumentsWithoutFlag.length > 1) { output.error(usage); return 2; }
      const task = store.get(value);
      if (!task) { output.error(`Unknown task: ${value}`); return 1; }
      if (argumentsWithoutFlag[0] && task.repositoryRoot !== (await repositorySnapshot(argumentsWithoutFlag[0])).root) {
        output.error('Task belongs to a different repository');
        return 1;
      }
      if (mode === 'task-delete') {
        output.error(`Delete task ${task.id} (${task.status}) and its event history from ${task.repositoryRoot || 'unscoped storage'}`);
        if (!confirmed && !await confirm('delete')) { output.error('Deletion cancelled; pass --yes for non-interactive use'); return 2; }
        store.delete(value);
        output.log(JSON.stringify(stream ? { type: 'result', deleted: true, taskId: value } : { deleted: true, taskId: value }));
        return 0;
      }
      output.log(JSON.stringify(stream ? { type: 'result', task, events: store.events(value) }
        : { task, events: store.events(value) }, null, stream ? 0 : 2));
      return 0;
    }
    const editMode = ['opencode-edit','routed-edit', 'configured-edit', 'codex-edit', 'claude-edit', 'gemini-edit', 'auto-gemini-edit', 'auto-edit'].includes(mode);
    const allowWrites = editMode && rest.at(-1) === '--allow-writes';
    const request = (allowWrites ? rest.slice(0, -1) : rest).join(' ').trim();
    if (editMode && !allowWrites) { output.error(`${mode} requires --allow-writes`); return 2; }
    if (!value || !request) { output.error(usage); return 2; }
    const dispatchSnapshot = await repositorySnapshot(value);
    const repository = dispatchSnapshot.root;
    if (process.env.CODOVYN_EXPECTED_BASELINE && recoveryFingerprint(dispatchSnapshot) !== process.env.CODOVYN_EXPECTED_BASELINE) throw new Error('Queued repository baseline changed before provider dispatch');
    if (routing && !routing.selected) {
      const id=randomUUID();store.create({id,request,repositoryRoot:repository,primaryAgent:'unselected'});
      store.append(id,'routing-decision',routing);store.update(id,{status:'failed',activeAgent:null,step:0});
      output.log(JSON.stringify(stream?{type:'result',taskId:id,status:'failed',routing}:{taskId:id,status:'failed',routing}));return 1;
    }
    const registry = new AgentRegistry();
    let primaryAgent;
    let fallbackAgents = [];
    const id = process.env.CODOVYN_TASK_ID || randomUUID();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new TypeError('Invalid accepted task identity');
    if(routing) {
      store.create({id,request,repositoryRoot:repository,primaryAgent:routing.selected.provider,fallbackAgents:[]});
      store.append(id,'routing-decision',routing);
      try {
        const totals=store.reserveRouteBudget(id,{session:routingSession,estimatedUsd:routing.selected.estimatedUsd,budget:routingBudget});
        store.append(id,'budget-reserved',{estimatedUsd:routing.selected.estimatedUsd,totals,hardSpendingGuarantee:false});
      }catch {
        store.append(id,'budget-admission-rejected',{reason:'Local budget changed, has unknown charges, or exceeds safe accounting limits'});
        store.update(id,{status:'failed',activeAgent:null,step:0});
        output.log(JSON.stringify({...(stream?{type:'result'}:{}),taskId:id,status:'failed',routing,budgetRejected:true}));return 1;
      }
    }
    let draft;
    try {
    if (editMode) {draft = await createDraftWorkspace(repository, join(dataDirectory, 'drafts'), id);
      if(routing)store.append(id,'draft-created',{baseCommit:draft.baseCommit,branch:draft.branch});
    }
    if (mode === 'demo') {
      primaryAgent = 'simulated-primary';
      fallbackAgents = ['simulated-backup'];
      registry.register({ id: primaryAgent, capabilities: { writes: false }, availability: async () => 'available',
        async *run() { yield { type: 'text', text: 'Starting simulated task' }; throw new AgentFailure('quota', 'Simulated quota event'); } });
      registry.register({ id: 'simulated-backup', capabilities: { writes: false }, availability: async () => 'available',
        async *run({ handoff }) { yield { type: 'completed', text: `Simulated continuation: ${handoff.request}` }; } });
    } else {
      primaryAgent = mode.startsWith('opencode') ? 'opencode' : mode.startsWith('claude') ? 'claude' : mode.startsWith('gemini') ? 'gemini' : 'codex';
      if (mode === 'auto' || mode === 'auto-edit') fallbackAgents = ['claude'];
      if (mode === 'auto-gemini' || mode === 'auto-gemini-edit') fallbackAgents = ['gemini'];
      if(routing)primaryAgent=routing.selected.provider;
      if (policy) {
        const candidates = agentPolicy.policyCandidates(policy);
        primaryAgent = candidates[0]; fallbackAgents = candidates.slice(1);
      }
      const factories = { opencode: options => (adapters.createOpenCodeAdapter || createOpenCodeAdapter)({...options,stateDirectory:openCodeStateDirectory(dataDirectory,repository),command:process.env.CODOVYN_OPENCODE_COMMAND}), codex: adapters.createCodexAdapter, claude: adapters.createClaudeAdapter, gemini: geminiAdapter };
      for (const provider of [primaryAgent, ...fallbackAgents]) {
        registry.register(factories[provider]({ cwd: draft?.path || repository, write: !!draft, ...(providerSelection||{}), ...(routing?{model:routing.selected.model,...(routing.selected.reasoning?{reasoning:routing.selected.reasoning}:{})}:{}), ...(provider === 'codex' && !routing && taskConfiguration?.reasoning ? { reasoning: taskConfiguration.reasoning } : {}), ...(provider === 'gemini' && policy?.geminiModel ? { model: policy.geminiModel } : {}) }));
      }
    }
    }catch(error){if(routing)store.voidUnstartedRoute(id);throw error;}
    if(!routing)store.create({ id, request, repositoryRoot: repository, primaryAgent, fallbackAgents });
    if (taskConfiguration) store.append(id, 'task-configuration', taskConfiguration);
    if (policy) store.append(id, 'agent-policy', policy);
    if (draft&&!routing) store.append(id, 'draft-created', { baseCommit: draft.baseCommit, branch: draft.branch });
    const engine = new TaskEngine({ store, registry, restoration:{enabled:policy?.restorePrimary===true}, snapshot: () => repositorySnapshot(draft?.path || repository),
      onEvent: stream ? (event) => output.log(JSON.stringify({ type: 'event', taskId: id, event })) : undefined });
    const task = await engine.run(id, { signal });
    const result = { taskId: id, status: task.status, activeAgent: task.activeAgent, draftReviewAvailable: !!draft,
      ...(stream ? {} : { events: store.events(id) }) };
    output.log(JSON.stringify(stream ? { type: 'result', ...result } : result, null, stream ? 0 : 2));
    return task.status === 'completed' ? 0 : 1;
  } finally { store.close(); }
}

const entryPath = process.argv[1];
if (entryPath && (import.meta.url === pathToFileURL(entryPath).href ||
  import.meta.url === pathToFileURL(realpathSync(entryPath)).href)) {
  const controller = new AbortController();
  process.on('SIGTERM', () => controller.abort());
  process.on('SIGINT', () => controller.abort());
  main(process.argv.slice(2), console, controller.signal).then((code) => { process.exitCode = code; }).catch((error) => {
    if (process.env.CODOVYN_EVENT_STREAM === '1') {
      const message = error.message === 'Commit or remove working-tree changes before starting an edit draft'
        ? error.message : 'The local task command failed. Check Git and the selected agent CLI, then retry.';
      console.log(JSON.stringify({ type: 'error', message }));
    }
    console.error(error.message);
    process.exitCode = 1;
  });
}
