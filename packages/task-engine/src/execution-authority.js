import {randomUUID,createHash} from 'node:crypto';
import {hostname} from 'node:os';
import {ChildProcess} from 'node:child_process';
import {isManagedAgentProcess,disposeManagedAgentProcess} from '../../agent-adapters/src/process.js';
import{openSync,closeSync,fstatSync,lstatSync,constants}from'node:fs';
const issued=new WeakSet(),boundProcesses=new WeakSet();
const digest=value=>createHash('sha256').update(JSON.stringify(value??null)).digest('hex');
export const isTaskExecutionAuthority=value=>issued.has(value);

/** Trusted TaskEngine seam. No serialized token or task ID is a capability.
 * File access consumers must additionally bind repository/executable identity.
 * Issuance grants no direct OS permissions and no provider inference. */
export function createTaskExecutionAuthority({store,taskId,provider,token,workspace,filesystemIdentity,configuration,contextFlow=false,signal,ttlMs=120000,onWriteEvent=()=>{}}) {
 if(!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>120000)throw new Error('Invalid execution authority lifetime');
 const segment=randomUUID(),policy=structuredClone(configuration),policyHash=digest(policy),expiresAt=Date.now()+ttlMs;
 const controller=new AbortController();let child=null,binding=null,active=true,timer,rootPin=null,repositoryId=null,inferenceConsent=null;
 const id=info=>`${info.dev}:${info.ino}`;
 if(filesystemIdentity&&process.platform!=='win32')try{rootPin=openSync(workspace,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);if(id(fstatSync(rootPin,{bigint:true}))!==filesystemIdentity)throw new Error('Task workspace identity changed before authority issuance');}catch(error){if(rootPin!==null)closeSync(rootPin);throw error;}
 const revoke=()=>{active=false;clearTimeout(timer);controller.abort();signal?.removeEventListener('abort',revoke);child?.removeListener('exit',revoke);child?.removeListener('error',revoke);if(rootPin!==null){closeSync(rootPin);rootPin=null;}};
 signal?.addEventListener('abort',revoke,{once:true});if(signal?.aborted)revoke();
 const current=()=>{
  const lease=store.executionLease(taskId),task=store.get(taskId);
  if(!active||signal?.aborted||Date.now()>=expiresAt||!lease||lease.releasedAt!==null||lease.token!==token||lease.owner.pid!==process.pid||lease.owner.host!==hostname()||task?.status!=='running'||task.activeAgent!==provider){revoke();throw new Error('Task execution authority expired or revoked');}
  if(inferenceConsent)try{store.verifyCampaignConsent(inferenceConsent.id,inferenceConsent.selection);}catch(error){revoke();throw error;}
  if(rootPin!==null)try{const actual=lstatSync(workspace,{bigint:true});if(!actual.isDirectory()||id(actual)!==filesystemIdentity||id(fstatSync(rootPin,{bigint:true}))!==filesystemIdentity)throw new Error('Changed root');}catch{revoke();throw new Error('Task workspace filesystem identity changed');}
  if(!policy||policy.provider!==provider||!['read','read-write'].includes(policy.permission)||!['ask','plan','agent'].includes(policy.intent)||policy.permission==='read-write'&&policy.intent!=='agent')throw new Error('Task lacks an immutable supported permission policy');
  // A ContextFlow segment has its own approved destination policy. Ordinary
  // configuration changes must not mutate an already accepted segment.
  const events=store.events(taskId),transfer=events.findLast(e=>e.kind==='contextflow-segment-started');
  const actual=contextFlow?transfer?.data.configuration:events.findLast(e=>e.kind==='task-configuration')?.data;
  if(digest(actual)!==policyHash){revoke();throw new Error('Accepted task configuration changed');}
  if(policy.permission==='read-write'&&(!events.some(e=>e.kind==='draft-created')||workspace===task.repositoryRoot))throw new Error('Write authority requires an approved isolated draft');
  return true;
 };
 if(active){timer=setTimeout(revoke,ttlMs);timer.unref();}
 const authority=Object.freeze({taskId,segment,provider,workspace,configurationDigest:policyHash,permission:policy?.permission,intent:policy?.intent,expiresAt,signal:controller.signal,
  get hasWrites(){return store.draftWrites(taskId).some(w=>w.segment===segment);},
  reserveInference({consentId,requestId,selection}){current();const actual=authority.verify();if(selection.provider!==provider||selection.mode!==policy.intent||selection.configurationDigest!==policyHash||selection.executableSha256!==actual.sha256||selection.repositoryRoot!==store.get(taskId).repositoryRoot)throw new Error('Campaign does not match the bound task/process policy');const result=store.reserveCampaignRequest({consentId,requestId,taskId,token,segment,selection});inferenceConsent={id:consentId,requestId,selection:structuredClone(selection)};return result;},
  consumeInferenceTool(){current();if(!inferenceConsent)return null;return store.reserveCampaignToolCall({requestId:inferenceConsent.requestId,selection:inferenceConsent.selection,token,segment});},
  transitionInference({requestId,state,selection}){if(state==='submitting')current();return store.transitionCampaignRequest({requestId,token,segment,state,selection});},
  ownPrivateProcess(pid){current();if(!child||!Number.isSafeInteger(pid)||pid<1)throw new Error('Invalid private process ownership');store.append(taskId,'execution-child-owned',{segment,provider,pid,parent:child.pid,group:true});},
  privateProcessStopped(pid){store.append(taskId,'execution-child-stopped',{segment,pid});},
  draft(){current();const draft=store.events(taskId).findLast(e=>e.kind==='draft-created')?.data;if(policy.permission!=='read-write'||policy.intent!=='agent'||!draft?.baseCommit||workspace===store.get(taskId).repositoryRoot)throw new Error('Approved isolated draft required');return {original:store.get(taskId).repositoryRoot,baseCommit:draft.baseCommit};},
  beginWrite(metadata){current();authority.verify();authority.draft();if(!repositoryId||metadata.repositoryIdentity!==repositoryId)throw new Error('Draft write repository is not bound');const result=store.prepareDraftWrite({id:randomUUID(),taskId,token,segment,...metadata,configurationDigest:policyHash});onWriteEvent(result);return result.id;},
  finishWrite(id,state){if(['published','aborted'].includes(state))current();const result=store.finishDraftWrite(taskId,id,token,segment,state);if(result.event)onWriteEvent(result);if(['uncertain','conflict'].includes(state))revoke();},
  writeProcess(id,pid){current();if(!Number.isSafeInteger(pid)||pid<1||!store.unresolvedDraftWrites(taskId).some(w=>w.id===id&&w.segment===segment))throw new Error('Unknown owned write process');store.append(taskId,'draft-write-process',{id,segment,pid,group:true});},
  writeStopped(id,pid){store.append(taskId,'draft-write-process-stopped',{id,segment,pid});},
  bindProcess(process,identity){
   current();if(binding||child||boundProcesses.has(process))throw new Error('Execution authority is single-process and non-transferable');
   if(!(process instanceof ChildProcess)||!Number.isSafeInteger(process.pid)||process.pid<1||process.exitCode!==null||process.signalCode!==null||typeof identity?.executable!=='string'||!/^([a-f0-9]{64})$/.test(identity?.sha256||''))throw new Error('A live owned process and executable identity are required');
   if(process.spawnfile!==identity.executable&&!(process.spawnfile==='/usr/bin/sandbox-exec'&&process.spawnargs[1]==='-p'&&process.spawnargs[3]===identity.executable))throw new Error('Executable identity does not match the owned launch');
   child=process;boundProcesses.add(process);binding=Object.freeze({...identity,pid:process.pid,launcher:process.spawnfile});child.once('exit',revoke);child.once('error',revoke);
   store.append(taskId,'execution-authority-bound',{segment,provider,pid:process.pid,configurationDigest:policyHash,permission:policy.permission});
   return binding;
  },
  stopManagedLifecycle(lifecycle){return disposeManagedAgentProcess(lifecycle,child);},
  ownsManagedLifecycle(lifecycle){current();return isManagedAgentProcess(lifecycle,child);},
  verify(){current();if(!child||child.exitCode!==null||child.signalCode!==null){revoke();throw new Error('Execution process is not live');}return {...binding};},
  verifyAdmission(){return current();},
  bindRepository(identity){current();if(rootPin===null||identity.root!==workspace||identity.filesystemIdentity?.split(';')[0]!==filesystemIdentity||repositoryId&&repositoryId!==identity.id){revoke();throw new Error('Repository authority does not match the accepted task filesystem identity');}repositoryId=identity.id;return repositoryId;},
  audit(data){current();store.append(taskId,'file-access',{segment,provider,...data});},
  revoke
 });issued.add(authority);return authority;
}
