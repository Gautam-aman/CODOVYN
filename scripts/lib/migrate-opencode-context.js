/** Operator-only, offline private-context migration. Not bundled or exposed to
 * renderer/provider IPC. Approval here grants no task or inference authority. */
import{constants,lstatSync,realpathSync,readdirSync,openSync,closeSync,fstatSync,readSync,writeSync,fchmodSync,mkdirSync,mkdtempSync,renameSync,unlinkSync,existsSync}from'node:fs';
import{join,dirname,basename,resolve}from'node:path';import{createHash}from'node:crypto';import{openCodeAccountContext}from'../../packages/agent-adapters/src/opencode-campaign.js';import diagnostics from'../../packages/agent-adapters/src/opencode-diagnostics.cjs';
const reviews=new WeakMap(),maxBytes=128*1024*1024,uid=BigInt(process.getuid());
const identity=s=>[s.dev,s.ino,s.mode,s.uid,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
function check(path,root=false){if(realpathSync(path)!==path)throw new Error('Canonical private objects required');const s=lstatSync(path,{bigint:true});if(s.uid!==uid||s.isSymbolicLink()||(!s.isDirectory()&&!s.isFile())||s.mode&0o7022n||root&&s.mode&0o077n||s.isFile()&&s.nlink!==1n)throw new Error('Unsafe private context object');return s;}
function tree(root){const nodes=[];let bytes=0;function visit(path,rel){const s=check(path,rel==='');if(nodes.length>=256||s.isFile()&&(bytes+=Number(s.size))>maxBytes)throw new Error('Private context exceeds copy bound');nodes.push({rel,id:identity(s),file:s.isFile(),mode:Number(s.mode&0o777n),size:Number(s.size)});if(s.isDirectory())for(const name of readdirSync(path).sort())visit(join(path,name),rel?join(rel,name):name);}visit(root,'');return nodes;}
const same=(root,nodes,renamed=false)=>{const current=tree(root);if(renamed&&current.length===nodes.length){current[0]={...current[0],id:current[0].id.split(':').slice(0,-1).join(':')};nodes=nodes.map((n,i)=>i===0?{...n,id:n.id.split(':').slice(0,-1).join(':')}:n);}return JSON.stringify(current)===JSON.stringify(nodes);};
function fingerprint(fd){const hash=createHash('sha256'),buffer=Buffer.alloc(65536);try{for(let offset=0;;){const n=readSync(fd,buffer,0,buffer.length,offset);if(!n)return hash.digest('hex');hash.update(buffer.subarray(0,n));offset+=n;if(offset>maxBytes)throw new Error('Private file exceeds copy bound');}}finally{buffer.fill(0);}}
function copy(source,incoming,nodes){mkdirSync(incoming,{mode:0o700});for(const node of nodes){if(!node.rel)continue;const from=join(source,node.rel),to=join(incoming,node.rel);if(!node.file){mkdirSync(to,{mode:0o700});continue;}let input,output;const buffer=Buffer.alloc(65536);try{
 input=openSync(from,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);if(identity(fstatSync(input,{bigint:true}))!==node.id)throw new Error('Private source changed');output=openSync(to,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 for(let offset=0;offset<node.size;){const n=readSync(input,buffer,0,Math.min(buffer.length,node.size-offset),offset);if(!n)throw new Error('Private source truncated');for(let written=0;written<n;){const count=writeSync(output,buffer,written,n-written,offset+written);if(!count)throw new Error('Private copy incomplete');written+=count;}offset+=n;}
 if(identity(fstatSync(input,{bigint:true}))!==node.id||fingerprint(input)!==fingerprint(output))throw new Error('Private copy integrity failed');fchmodSync(output,node.mode);
 }finally{buffer.fill(0);if(input!==undefined)closeSync(input);if(output!==undefined)closeSync(output);}}
 // Parent root stays 0700; restore only safe original directory permissions.
 for(const node of [...nodes].reverse())if(node.rel&&!node.file){const fd=openSync(join(incoming,node.rel),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{fchmodSync(fd,node.mode);}finally{closeSync(fd);}}
}
export function reviewContextMigration({source,destination}){
 source=resolve(source);destination=resolve(destination);const parent=dirname(source);
 if(source===destination||dirname(destination)!==parent||![source,destination].every(p=>/^[a-f0-9]{24}$/.test(basename(p))))throw new Error('Two distinct isolated namespaces in one private parent required');check(parent,true);check(source,true);check(destination,true);
 const account=openCodeAccountContext(source);try{openCodeAccountContext(destination);throw new Error('Destination already configured');}catch(error){if(diagnostics.diagnostic(error).code!=='AUTH_NOT_CONFIGURED')throw error;}
 const review=Object.freeze({version:1,scope:'Isolated context migration only; no inference',expiresAt:Date.now()+120000});reviews.set(review,{source,destination,parent,account,sourceTree:tree(source),destinationTree:tree(destination)});return review;
}
export async function migrateContext(review,{confirm,assertIdle}={}){
 const r=reviews.get(review);if(!r||Date.now()>=review.expiresAt)throw new Error('Fresh host-only migration review required');reviews.delete(review);
 if(typeof confirm!=='function'||await confirm(review)!=='Migrate isolated Calculator context only')throw new Error('Explicit isolated-context migration approval required');
 if(typeof assertIdle!=='function'||await assertIdle()!==true)throw new Error('Context ownership is not quiescent');
 // Metadata was validated immediately before these snapshots. Opening SQLite
 // again here writes its read-mark SHM file even in read-only mode. Freeze all
 // file identities/versions instead, including DB and WAL; reject any change.
 if(!same(r.source,r.sourceTree)||!same(r.destination,r.destinationTree))throw new Error('Private context changed after review');
 const parent=check(r.parent,true),parentFd=openSync(r.parent,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW),lock=join(r.parent,'.calculator-context-migration.lock');let lockFd,transaction,moved=false,published=false,settled=false;
 try{
  lockFd=openSync(lock,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  transaction=mkdtempSync(join(r.parent,'.calculator-context-migration-'));const incoming=join(transaction,'incoming'),backup=join(transaction,'previous-destination');copy(r.source,incoming,r.sourceTree);openCodeAccountContext(incoming);
  if(await assertIdle()!==true||!same(r.source,r.sourceTree)||!same(r.destination,r.destinationTree)||identity(fstatSync(parentFd,{bigint:true})).split(':').slice(0,4).join(':')!==identity(parent).split(':').slice(0,4).join(':')||realpathSync(r.parent)!==r.parent)throw new Error('Context changed before publication');
  renameSync(r.destination,backup);moved=true;if(existsSync(r.destination))throw new Error('Destination namespace unexpectedly occupied');renameSync(incoming,r.destination);published=true;
  if(openCodeAccountContext(r.destination)===r.account||await assertIdle()!==true||!same(r.source,r.sourceTree)||!same(backup,r.destinationTree,true))throw new Error('Published context verification failed');
  settled=true;return {verified:true,sourcePreserved:true,destinationConfigurationAndCachePreserved:true,opaqueCopyVerified:true,newAccountBinding:true,inferenceSubmissions:0};
 }catch(error){
  // Quiescent host operation only: preserve failed copies, never retry. Restore
  // the original destination if its private namespace can still be proven.
  if(moved){try{check(r.parent,true);if(published){check(r.destination,true);renameSync(r.destination,join(transaction,'unverified-incoming'));}if(!existsSync(r.destination)&&same(join(transaction,'previous-destination'),r.destinationTree,true)){renameSync(join(transaction,'previous-destination'),r.destination);settled=same(r.source,r.sourceTree)&&same(r.destination,r.destinationTree,true);}}catch{}}
  else settled=true;
  throw new Error(settled?'Isolated-context migration failed; original contexts preserved':'Isolated-context migration requires manual reconciliation');
 }finally{if(lockFd!==undefined){closeSync(lockFd);if(settled)unlinkSync(lock);}closeSync(parentFd);}
}
