import { hostname } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import{inspectDraftWriteLocks,draftWriteLockIsQuiescent}from'./draft-write-recovery.js';
export{inspectDraftWriteLocks}from'./draft-write-recovery.js';

export function processAbsent(pid) {
  try { process.kill(pid, 0); return false; }
  catch (error) { return error.code === 'ESRCH'; }
}

/** No timeout, guessed PID identity or missing completion event establishes safety. */
export function executionRecovery(store, id, { host = hostname(), absent = processAbsent, platform = process.platform, draftLocks } = {}) {
  const lease = store.executionLease(id);
  if (!lease) return { safe: false, reason: 'legacy-process-ownership-unknown' };
  const writeHistory=store.events(id);
  const ownershipStart=writeHistory.findLast(e=>e.kind==='execution-owned'&&e.data.token===lease.token)?.seq??0;
  for(const child of writeHistory.filter(e=>e.seq>ownershipStart&&e.kind==='execution-child-owned')){
    const stopped=writeHistory.some(e=>e.seq>child.seq&&e.kind==='execution-child-stopped'&&e.data.pid===child.data.pid&&e.data.segment===child.data.segment);
    if(!stopped&&(lease.owner.host!==host||platform==='win32'||!absent(-child.data.pid)))return {safe:false,reason:'private-provider-group-alive-or-unverifiable'};
  }
  for(const intent of store.unresolvedDraftWrites(id)){
    const launch=writeHistory.findLast(e=>e.kind==='draft-write-process'&&e.data.id===intent.id);
    if(!launch){if(draftWriteLockIsQuiescent(draftLocks,store,id,intent))continue;return {safe:false,reason:'draft-write-registration-unknown'};}
    const stopped=writeHistory.findLast(e=>e.kind==='draft-write-process-stopped'&&e.data.id===intent.id&&e.data.pid===launch.data.pid);
    if(!stopped&&(lease.owner.host!==host||platform==='win32'||!absent(-launch.data.pid)))return {safe:false,reason:'draft-writer-alive-or-unverifiable'};
  }
  if (lease.releasedAt && platform==='win32' && lease.owner.kind!=='recovery')return {safe:false,reason:'windows-process-tree-verification-unsupported'};
  if (lease.releasedAt) return { safe: true, reason: 'cleanup-recorded' };
  if (lease.owner.host !== host) return { safe: false, reason: 'different-host' };
  if (!absent(lease.owner.pid)) return { safe: false, reason: 'owner-alive-or-unverifiable' };
  if(lease.owner.kind==='recovery')return {safe:true,reason:'recovery-owner-absent-no-provider-launch'};
  const history = store.events(id);
  const ownership = history.findLast(event => event.kind === 'execution-owned' && event.data.token === lease.token);
  if (!ownership) return { safe: false, reason: 'ownership-record-missing' };
  const launches=[];
  for (const event of history.filter(event => event.seq > ownership.seq)) {
    if (event.kind === 'provider-starting') launches.push({});
    if (event.kind === 'provider-spawned') {
      const launch=launches.at(-1);
      if (!launch || launch.pid) return { safe:false,reason:'ambiguous-process-records' };
      Object.assign(launch,event.data);
    }
    if (event.kind === 'provider-stopped') {
      if (!launches.at(-1)) return { safe:false,reason:'ambiguous-process-records' };
      launches.at(-1).stopped=true;
    }
  }
  if (!launches.length) return { safe:false,reason:'provider-launch-state-unknown' };
  for (const launch of launches) {
    if (launch.stopped) continue;
    if (!Number.isSafeInteger(launch.pid) || launch.pid < 1) return { safe:false,reason:'provider-registration-gap' };
    if (platform === 'win32' || launch.group !== true) return { safe:false,reason:'process-tree-verification-unsupported' };
    if (!absent(-launch.pid)) return { safe:false,reason:'provider-group-alive-or-unverifiable' };
  }
  return { safe:true,reason:'owner-and-provider-groups-absent' };
}

export function recoveryFingerprint(snapshot) {
  if (!snapshot || typeof snapshot.root !== 'string' || typeof snapshot.commit !== 'string' ||
      typeof snapshot.workingTreeHash !== 'string') throw new Error('Incomplete recovery repository verification');
  return createHash('sha256').update(JSON.stringify({ root:snapshot.root,filesystemIdentity:snapshot.filesystemIdentity,branch:snapshot.branch,
    commit:snapshot.commit,workingTreeHash:snapshot.workingTreeHash,dirty:snapshot.dirty,
    changedPaths:snapshot.changedPaths })).digest('hex');
}

/** Explicitly stop an owned task for patch review; never remove or replay its draft. */
export async function reconcileDraft({ store, id, snapshot, expectedFingerprint, decision, confirm = false, evidence }) {
  if (!confirm || !['preserve', 'abandon'].includes(decision)) throw new Error('Explicit recovery confirmation required');
  const task=store.get(id);
  if (!task || !['running','interrupted','cancelled'].includes(task.status)) throw new Error('Task is not recoverable');
  const draftLocks=await inspectDraftWriteLocks(store,id);const safety=executionRecovery(store,id,{...evidence,draftLocks});
  if (!safety.safe) throw new Error(`Recovery blocked: ${safety.reason}`);
  const previous=store.executionLease(id);
  if (!previous.releasedAt) store.releaseExecution(id,previous.token);
  const token=randomUUID();
  store.claimExecution(id,{token,pid:process.pid,host:hostname(),kind:'recovery'});
  try {
    const repository=await snapshot();
    const fingerprint=recoveryFingerprint(repository);
    if (fingerprint !== expectedFingerprint) throw new Error('Draft changed since recovery inspection');
    store.reconcileDraftWrites(id,token);
    store.append(id,'draft-reconciled',{decision,fingerprint,repository,
      processEvidence:safety.reason,actionResolution:'unresolved outcomes remain unknown; no replay authorized'});
    return store.update(id,{status:decision==='abandon'?'cancelled':'interrupted',activeAgent:task.activeAgent,step:task.step});
  } finally {store.releaseExecution(id,token);}
}
