import{mkdtempSync,realpathSync,rmSync,openSync,closeSync,lstatSync,fstatSync,constants}from'node:fs';import{join}from'node:path';
const proofs=new WeakMap();const identity=s=>`${s.dev}:${s.ino}`;
/** Real descriptor-lock evidence, not a renderer-provided boolean or elapsed
 * timeout. The fixed publisher retains the inherited lock until process exit. */
export async function inspectDraftWriteLocks(store,taskId){
 const writes=store.unresolvedDraftWrites(taskId).filter(w=>w.lockIdentity);if(!writes.length)return null;
 const directory=realpathSync(mkdtempSync('/private/tmp/codovyn-write-recovery-')),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000),records=[];
 try{const {buildTaskFileWriter,acquireTaskWriteLock}=await import('../../agent-adapters/src/task-file-write.js');const helper=await buildTaskFileWriter(directory,{signal:controller.signal});
  for(const w of writes){const path=join(w.stageDirectory,'lease'),fd=openSync(path,constants.O_RDWR|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{const before=fstatSync(fd,{bigint:true});if(!before.isFile()||before.nlink!==1n||before.size!==0n||before.uid!==BigInt(process.getuid())||before.mode&0o077n||identity(before)!==w.lockIdentity)throw new Error('Draft recovery lock identity is unverifiable');if(!await acquireTaskWriteLock(helper.command,fd,{signal:controller.signal}))throw new Error('Draft write descriptor authority is still held');const after=lstatSync(path,{bigint:true});if(identity(after)!==w.lockIdentity||after.isSymbolicLink())throw new Error('Draft recovery lock path changed');records.push({id:w.id,path,identity:w.lockIdentity});}finally{closeSync(fd);}}
  const proof=Object.freeze({});proofs.set(proof,{store,taskId,token:store.executionLease(taskId)?.token,records,expiresAt:Date.now()+1500});return proof;
 }finally{clearTimeout(timer);rmSync(directory,{recursive:true,force:true});}
}
export function draftWriteLockIsQuiescent(proof,store,taskId,intent){const data=proofs.get(proof);if(!data||data.store!==store||data.taskId!==taskId||data.token!==store.executionLease(taskId)?.token||data.expiresAt<Date.now())return false;const record=data.records.find(r=>r.id===intent.id&&r.identity===intent.lockIdentity);if(!record)return false;try{const info=lstatSync(record.path,{bigint:true});return info.isFile()&&info.nlink===1n&&info.size===0n&&identity(info)===record.identity;}catch{return false;}}
