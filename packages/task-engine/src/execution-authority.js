import {randomUUID,createHash} from 'node:crypto';
import {hostname} from 'node:os';
import {ChildProcess} from 'node:child_process';
const issued=new WeakSet(),boundProcesses=new WeakSet();
const digest=value=>createHash('sha256').update(JSON.stringify(value??null)).digest('hex');
export const isTaskExecutionAuthority=value=>issued.has(value);

/** Trusted TaskEngine seam. No serialized token or task ID is a capability.
 * File access consumers must additionally bind repository/executable identity.
 * Issuance grants no direct OS permissions and no provider inference. */
export function createTaskExecutionAuthority({store,taskId,provider,token,workspace,configuration,contextFlow=false,signal,ttlMs=120000}) {
 if(!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>120000)throw new Error('Invalid execution authority lifetime');
 const segment=randomUUID(),policy=structuredClone(configuration),policyHash=digest(policy),expiresAt=Date.now()+ttlMs;
 const controller=new AbortController();let child=null,binding=null,active=true,timer;
 const revoke=()=>{active=false;clearTimeout(timer);controller.abort();signal?.removeEventListener('abort',revoke);child?.removeListener('exit',revoke);child?.removeListener('error',revoke);};
 signal?.addEventListener('abort',revoke,{once:true});if(signal?.aborted)revoke();
 const current=()=>{
  const lease=store.executionLease(taskId),task=store.get(taskId);
  if(!active||signal?.aborted||Date.now()>=expiresAt||!lease||lease.releasedAt!==null||lease.token!==token||lease.owner.pid!==process.pid||lease.owner.host!==hostname()||task?.status!=='running'||task.activeAgent!==provider){revoke();throw new Error('Task execution authority expired or revoked');}
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
  bindProcess(process,identity){
   current();if(binding||child||boundProcesses.has(process))throw new Error('Execution authority is single-process and non-transferable');
   if(!(process instanceof ChildProcess)||!Number.isSafeInteger(process.pid)||process.pid<1||process.exitCode!==null||process.signalCode!==null||typeof identity?.executable!=='string'||!/^([a-f0-9]{64})$/.test(identity?.sha256||''))throw new Error('A live owned process and executable identity are required');
   if(process.spawnfile!==identity.executable&&!(process.spawnfile==='/usr/bin/sandbox-exec'&&process.spawnargs[1]==='-p'&&process.spawnargs[3]===identity.executable))throw new Error('Executable identity does not match the owned launch');
   child=process;boundProcesses.add(process);binding=Object.freeze({...identity,pid:process.pid});child.once('exit',revoke);child.once('error',revoke);
   store.append(taskId,'execution-authority-bound',{segment,provider,pid:process.pid,configurationDigest:policyHash,permission:policy.permission});
   return binding;
  },
  verify(){current();if(!child||child.exitCode!==null||child.signalCode!==null){revoke();throw new Error('Execution process is not live');}return {...binding};},
  verifyAdmission(){return current();},
  audit(data){current();store.append(taskId,'file-access',{segment,provider,...data});},
  revoke
 });issued.add(authority);return authority;
}
