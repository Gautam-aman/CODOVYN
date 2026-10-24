import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createContextFlow,contextFlowAccounting,validateContextFlow,digest } from '../../agent-core/src/contextflow.js';
import { createHandoffPacket } from '../../agent-core/src/handoff.js';
import { executionRecovery,recoveryFingerprint } from './recovery.js';
import { repositorySnapshot } from '../../git-engine/src/index.js';
import { validateDraftWorkspace } from '../../git-engine/src/draft-workspace.js';
import { selectContextFiles } from './contextflow-files.js';
export function contextFlowReason(task,events,manual=false) {
 if(task.activeAgent!=='codex'&&task.primaryAgent!=='codex')throw new Error('Initial ContextFlow supports Codex to OpenCode only');
 if(task.activeAgent&&task.activeAgent!=='codex')throw new Error('This task is no longer at a Codex boundary');
 if(manual)return 'user-requested-switch';
 const failure=events.findLast(event=>['agent-failed','agent-unavailable'].includes(event.kind)&&event.data.agent==='codex');
 if(failure?.kind==='agent-unavailable')return 'unavailable';
 if(failure&&['quota','authentication','temporary'].includes(failure.data.kind))return failure.data.kind;
 throw new Error('No confirmed eligible interruption; unknown failures require explicit manual review');
}
export async function contextFlowWorkspace(store,task,dataDirectory) {
 const events=store.events(task.id);
 if(events.some(e=>e.kind==='routing-decision'))throw new Error('Routed tasks require new budget admission before ContextFlow');
 const draft=events.find(e=>e.kind==='draft-created')?.data;
 if(draft){if(events.some(e=>['draft-accepted','draft-rejected'].includes(e.kind)))throw new Error('Draft is already resolved');
  const workspace=await validateDraftWorkspace(task.repositoryRoot,join(dataDirectory,'drafts'),task.id,draft.baseCommit);
  const original=await repositorySnapshot(task.repositoryRoot);if(original.dirty||original.commit!==draft.baseCommit)throw new Error('Original repository changed; reconcile it before transfer');
  return {cwd:workspace.path,draft,original};
 }
 return {cwd:task.repositoryRoot,draft:null,original:await repositorySnapshot(task.repositoryRoot)};
}
export async function prepareContextFlow({store,taskId,dataDirectory,configuration,binding,destinationModel='unknown',manual=false,now=Date.now()}) {
 const task=store.get(taskId);if(!task||!['interrupted','cancelled'].includes(task.status))throw new Error('Stop the task and wait for confirmed cleanup before preparing ContextFlow');
 const safety=executionRecovery(store,taskId);if(!safety.safe)throw new Error('ContextFlow ownership blocked: '+safety.reason);
 const events=store.events(taskId),originalConfiguration=events.findLast(e=>e.kind==='task-configuration')?.data;
 if(!originalConfiguration)throw new Error('Legacy task has no verified permission snapshot; start a separately approved task');
 if(configuration.provider!=='opencode'||(originalConfiguration.permission==='read'&&configuration.permission!=='read'))throw new Error('ContextFlow cannot increase approved permissions');
 const reason=contextFlowReason(task,events,manual),workspace=await contextFlowWorkspace(store,task,dataDirectory);
 const snapshot=await repositorySnapshot(workspace.cwd),fingerprint=recoveryFingerprint(snapshot),originalFingerprint=recoveryFingerprint(workspace.original);
 const legacy=createHandoffPacket({request:task.request,history:events,snapshot});
 if(legacy.actions.some(action=>action.state==='unresolved'))throw new Error('Unresolved actions block ContextFlow; inspect and reconcile without replay');
 if(workspace.draft&&(snapshot.dirty||legacy.actions.some(action=>!action.safeToRetry))){
  const reconciled=events.findLast(e=>e.kind==='draft-reconciled');const started=events.findLast(e=>e.kind==='agent-started');
  if(reconciled?.data.decision!=='preserve'||reconciled.data.fingerprint!==fingerprint||reconciled.seq<=(started?.seq||0))throw new Error('Preserve and reconcile the current draft before sharing modifications');
 }
 if(!workspace.draft){const baseline=events.findLast(e=>e.kind==='checkpoint')?.data.repository||events.findLast(e=>e.kind==='agent-started')?.data.repository;
  if(baseline&&recoveryFingerprint(baseline)!==fingerprint)throw new Error('Repository changed since the interrupted read task');}
 const files=await selectContextFiles(workspace.cwd,task.request,snapshot.changedPaths,{draft:!!workspace.draft});
 if(recoveryFingerprint(await repositorySnapshot(workspace.cwd))!==fingerprint||recoveryFingerprint(await repositorySnapshot(task.repositoryRoot))!==originalFingerprint)throw new Error('Repository changed while ContextFlow was being prepared');
 const packet=createContextFlow({task,snapshot,fingerprint,originalFingerprint,history:events,files,reason,destinationModel,
  requirements:[`Task mode: ${configuration.intent || (configuration.permission==='read'?'ask':'agent')}; Plan and Ask remain read-only.`, `Permission: ${configuration.permission}; shell, external directories, MCP and subagents denied.`,'Changes remain drafts until explicit review and application.']});
 const lease=store.executionLease(taskId);if(!lease.releasedAt)store.releaseExecution(taskId,lease.token);
 const transfer=store.prepareContextFlow({id:randomUUID(),taskId,packet,configuration,binding,now});
 return {...transfer,metrics:contextFlowAccounting(packet)};
}
export async function verifyContextFlow({store,transferId,hash,dataDirectory,binding,now=Date.now()}) {
 const transfer=store.contextFlowTransfer(transferId);if(!transfer||transfer.status!=='prepared'||transfer.hash!==hash||transfer.expiresAt<=now)throw new Error('ContextFlow approval is expired, changed or consumed');
 const invalidate=reason=>{store.invalidateContextFlow(transferId,reason);throw new Error('ContextFlow '+reason+'; fingerprint or recipient changed, prepare fresh review');};
 if(transfer.binding!==binding)invalidate('destination-changed');
 validateContextFlow(transfer.packet);const task=store.get(transfer.taskId);
 if(!executionRecovery(store,task.id).safe)throw new Error('ContextFlow process ownership is unresolved');
 const workspace=await contextFlowWorkspace(store,task,dataDirectory);
 const snapshot=await repositorySnapshot(workspace.cwd);
 if(recoveryFingerprint(snapshot)!==transfer.packet.repository.fingerprint||recoveryFingerprint(workspace.original)!==transfer.packet.repository.originalFingerprint)invalidate('repository-changed');
 const files=await selectContextFiles(workspace.cwd,task.request,snapshot.changedPaths,{draft:!!workspace.draft});
 for(const file of transfer.packet.context.files)if(!files.some(actual=>actual.path===file.path&&actual.sha256===file.sha256))invalidate('source-changed');
 return {transfer,task,workspace};
}
export const contextFlowBinding = value => digest(JSON.stringify(value));
