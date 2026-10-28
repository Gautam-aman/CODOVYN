import {claimOpenCodePromptTransport} from '../../agent-adapters/src/opencode.js';
import {claimCodexTurnTransport} from '../../agent-adapters/src/codex-control.js';
import {createHash} from 'node:crypto';
import {isTaskExecutionAuthority} from './execution-authority.js';
import {validateCampaignSpec} from '../../agent-core/src/campaign-consent.js';
import {repositorySnapshot} from '../../git-engine/src/index.js';
import {recoveryFingerprint} from './recovery.js';
/** A single host-controlled transport invocation, never a scheduler or retry
 * loop. Live execution requires a private, single-use read-only provider transport;
 * arbitrary callbacks are admitted only for deterministic fixtures. */
export async function dispatchCampaignRequest({execution,consentId,requestId,selection,prompt,submit,signal,lifecycle,transport}){
 const spec=validateCampaignSpec(selection);
 if(spec.purpose==='live'){if(submit||lifecycle)throw new Error('Live campaign dispatch requires a private provider transport');({submit,lifecycle}=(spec.provider==='codex'?claimCodexTurnTransport:claimOpenCodePromptTransport)(transport,execution,spec,prompt));}
 if(!isTaskExecutionAuthority(execution)||typeof submit!=='function'||typeof prompt!=='string'||Buffer.byteLength(prompt)>32768||createHash('sha256').update(prompt).digest('hex')!==spec.promptSha256)throw new Error('Matching host task and exact approved prompt required');
 execution.verify();if(!execution.ownsManagedLifecycle(lifecycle))throw new Error('Bound managed provider lifecycle required');
 if(recoveryFingerprint(await repositorySnapshot(execution.workspace))!==spec.repositoryFingerprint)throw new Error('Campaign repository fingerprint changed');
 execution.reserveInference({consentId,requestId,selection:spec});
 try{if(recoveryFingerprint(await repositorySnapshot(execution.workspace))!==spec.repositoryFingerprint)throw new Error('Campaign repository changed before submission');execution.verify();}catch(error){execution.transitionInference({requestId,state:'cancelled'});await execution.stopManagedLifecycle(lifecycle);throw error;}
 if(signal?.aborted||execution.signal.aborted){execution.transitionInference({requestId,state:'cancelled'});await execution.stopManagedLifecycle(lifecycle);throw new Error('Cancelled before submission; reservation retained');}
 // FULL-sync transaction commits before invoking the transport, even if the
 // process dies on the very next instruction. No connection retry is made.
 try{execution.transitionInference({requestId,state:'submitting',selection:spec});}catch(error){try{execution.transitionInference({requestId,state:'cancelled'});}finally{await execution.stopManagedLifecycle(lifecycle);}throw error;}
 let acknowledged=false,accepting=true,timer,revocationPoll;
 const controller=new AbortController(),abort=()=>controller.abort('owner-signal');
 signal?.addEventListener('abort',abort,{once:true});execution.signal.addEventListener('abort',abort,{once:true});
 const stopped=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('Campaign submission interrupted; do not replay')),{once:true}));
 try{
  timer=setTimeout(()=>controller.abort('deadline'),spec.maxRequestMs);
  revocationPoll=setInterval(()=>{try{execution.verify();}catch{controller.abort('authority-revoked');}},100);
  const result=await Promise.race([Promise.resolve().then(()=>{execution.verify();validateCampaignSpec(spec);if(controller.signal.aborted)throw new Error('Submission cancelled');return submit({signal:controller.signal,onAcknowledged(){if(!accepting||controller.signal.aborted||acknowledged)return false;execution.transitionInference({requestId,state:'confirmed'});acknowledged=true;return true;}});}),stopped]);
  if(!acknowledged)throw new Error('No explicit provider acknowledgement');
  execution.transitionInference({requestId,state:result?.providerOutcome==='failed'?'failed':'completed'});return result;
 }catch(error){execution.transitionInference({requestId,state:'uncertain'});throw error;}
 finally{accepting=false;clearTimeout(timer);clearInterval(revocationPoll);signal?.removeEventListener('abort',abort);execution.signal.removeEventListener('abort',abort);await execution.stopManagedLifecycle(lifecycle);}
}
