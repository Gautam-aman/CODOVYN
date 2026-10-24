import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,chmodSync,realpathSync,lstatSync,openSync,readFileSync as readFd,closeSync,fstatSync,constants} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {manageAgentProcess} from './process.js';
const hash=data=>createHash('sha256').update(data).digest('hex');
const authorities=new WeakSet(),claimedAuthorities=new WeakSet();
export const isRepositoryAuthority=value=>authorities.has(value);
export function claimRepositoryAuthority(value){if(!authorities.has(value)||claimedAuthorities.has(value))return false;claimedAuthorities.add(value);return true;}
const cleanEnv={PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8'};
export async function repositoryTool(command,args,{cwd,signal,timeoutMs=10000,maxBytes=1048576}={}) {
 if(signal?.aborted)throw new Error('Repository inspection cancelled before spawn');
 const start=performance.now(),child=spawn(command,args,{cwd,env:cleanEnv,shell:false,detached:true,stdio:['pipe','pipe','pipe']});
 const lifecycle=manageAgentProcess(child,signal);child.stdin.end();let stdout=[],bytes=0,diagnostics=0,timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;lifecycle.dispose().catch(()=>{});},timeoutMs);
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes<=maxBytes)stdout.push(chunk);else lifecycle.dispose().catch(()=>{});});
 child.stderr.on('data',chunk=>{diagnostics+=chunk.length;if(diagnostics>65536)lifecycle.dispose().catch(()=>{});});
 let code;try{code=await lifecycle.closed;}finally{clearTimeout(timer);await lifecycle.dispose();}
 if(signal?.aborted||timedOut||bytes>maxBytes||diagnostics>65536||lifecycle.error())throw new Error('Repository tool cancelled, failed or exceeded its bound',{cause:{aborted:signal?.aborted===true,timedOut,exitCode:code,exitSignal:child.signalCode,stdoutBytes:bytes,stderrBytes:diagnostics,processErrorCode:lifecycle.error()?.code||null,elapsedMs:performance.now()-start}});
 return {code,stdout:Buffer.concat(stdout).toString('utf8'),pid:child.pid,elapsedMs:performance.now()-start};
}
export async function buildRepositoryReader(directory,{signal}={}) {
 if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Repository reader requires verified macOS ARM64');
 mkdirSync(directory,{recursive:true,mode:0o700});directory=realpathSync(directory);
 if(lstatSync(directory).mode&0o077)throw new Error('Repository helper directory must be owner-only');
 const source=readFileSync(new URL('../native/repository-reader.c',import.meta.url));
 const input=join(directory,'reader.c'),command=join(directory,'repository-reader');writeFileSync(input,source,{mode:0o600});
 const compile=await repositoryTool('/usr/bin/xcrun',['clang','-std=c11','-D_DARWIN_C_SOURCE','-O2','-fstack-protector-strong','-D_FORTIFY_SOURCE=2','-Wall','-Wextra','-Werror',input,'-o',command],{timeoutMs:30000,signal});
 if(compile.code!==0)throw new Error('Repository reader compilation failed');
 const signed=await repositoryTool('/usr/bin/codesign',['-s','-','--options','runtime',command],{signal});if(signed.code!==0)throw new Error('Repository reader signature failed');
 chmodSync(command,0o500);return Object.freeze({command,sha256:hash(readFileSync(command)),sourceSha256:hash(source),ownedGroups:[compile.pid,signed.pid]});
}
function verifyReader(reader) {
 const fd=openSync(reader.command,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 const info=fstatSync(fd);if(!info.isFile()||info.size>4194304||info.mode&0o022){closeSync(fd);throw new Error('Repository reader must be a protected regular executable');}
 try{if(hash(readFd(fd))!==reader.sha256)throw new Error('Repository reader integrity changed');}finally{closeSync(fd);}
}
function decode(value) {
 if(typeof value!=='string'||value.length>262144||value.length%2||!/^[a-f0-9]*$/.test(value))throw new Error('Invalid repository reader encoding');return Buffer.from(value,'hex');
}
const oidPattern=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
function currentState(record) {
 const head=decode(record.head).toString('utf8'),loose=decode(record.ref).toString('utf8').trim();let branch=null,commit=null;
 if(head.startsWith('ref: refs/heads/')){
  branch=head.slice(16);if(!branch||branch.length>1024||!/^[a-zA-Z0-9_./-]+$/.test(branch))throw new Error('Unsupported Git branch');
  if(loose)commit=loose;
  else{const ref='refs/heads/'+branch;let seen=false;for(const line of decode(record.packed).toString('utf8').split('\n')){if(!line||line.startsWith('#')||line.startsWith('^'))continue;const parts=line.split(' ');if(parts.length!==2||!oidPattern.test(parts[0]))throw new Error('Malformed packed refs');if(parts[1]===ref){if(seen)throw new Error('Duplicate packed reference');commit=parts[0];seen=true;}}}
 }else commit=head;
 if(commit!==null&&!oidPattern.test(commit))throw new Error('Malformed Git object identity');
 return {head:commit,branch,unborn:commit===null};
}
/** Host-only metadata authority. It grants no provider execution permission. */
export async function createRepositoryAuthority({root,gitDirectory,commonDirectory,reader,lease}) {
 if(!lease||lease.purpose!=='metadata-only'||typeof lease.isCurrent!=='function'||typeof lease.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(lease.id)||!Number.isSafeInteger(lease.expiresAt)||lease.expiresAt>Date.now()+300000)throw new Error('Explicit bounded metadata lease required');
 const frozenLease={...lease};root=realpathSync(root);
 if(lstatSync(join(root,'.git')).isSymbolicLink())throw new Error('Symlinked Git metadata denied');
 if(!gitDirectory){if(!lstatSync(join(root,'.git')).isDirectory())throw new Error('External Git metadata requires explicit host authorization');gitDirectory=join(root,'.git');}
 gitDirectory=realpathSync(gitDirectory);commonDirectory=realpathSync(commonDirectory||gitDirectory);
 if([root,gitDirectory,commonDirectory].some(path=>/[\0\r\n]/.test(path)))throw new Error('Unsupported Git path encoding');
 const helper=realpathSync(reader.command);for(const scope of [root,gitDirectory,commonDirectory]){const rel=relative(scope,helper);if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../'))throw new Error('Repository reader must be outside project and Git metadata');}
 let expected='-',active=true,pinTimer,pinCleanupFailed=false;const pins=[],controller=new AbortController(),measurements=[];
 function revoke(){active=false;clearTimeout(pinTimer);controller.abort();while(pins.length)try{closeSync(pins.pop());}catch{pinCleanupFailed=true;}return !pinCleanupFailed;}
 async function validLease(){
  if(!active||Date.now()>=frozenLease.expiresAt){revoke();throw new Error('Repository authorization expired or revoked');}
  let timer,abort;try{
   const current=await Promise.race([Promise.resolve().then(()=>frozenLease.isCurrent()),new Promise((_,reject)=>{abort=()=>reject(new Error('Repository authorization revoked'));controller.signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(new Error('Repository lease verification deadline exceeded')),500);})]);
   if(current!==true||!active||Date.now()>=frozenLease.expiresAt){revoke();throw new Error('Repository authorization expired or revoked');}
  }catch(error){revoke();throw error;}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);}
 }
 async function inspect(cwd,op='state',object=''){
  await validLease();const rel=relative(root,cwd);if(isAbsolute(rel)||rel==='..'||rel.startsWith('../'))throw new Error('Cross-project repository query denied');
  if(measurements.length>=512)throw new Error('Repository inspection budget exceeded');
  let result;try{verifyReader(reader);result=await repositoryTool(reader.command,[root,gitDirectory,commonDirectory,rel,expected,op,object],{signal:controller.signal});measurements.push({pid:result.pid,elapsedMs:result.elapsedMs,code:result.code});}catch(error){revoke();throw error;}
  if(result.code!==0){revoke();throw new Error('Repository identity changed or metadata is unsupported');}
  const record=JSON.parse(result.stdout);if(record.version!==1||typeof record.identity!=='string'||!/^[0-9:;]{1,399}$/.test(record.identity)||expected!=='-'&&record.identity!==expected)throw new Error('Repository identity mismatch');
  await validLease();return {record,state:currentState(record)};
 }
 const initial=await inspect(root);expected=initial.record.identity;
 // Keep these objects alive for the complete lease so deleted inode numbers
 // cannot be recycled into an existing authorization between native reads.
 try{const expectedIds=expected.split(';'),paths=[root,gitDirectory,commonDirectory,join(root,'.git')];for(let i=0;i<paths.length;i++){const fd=openSync(paths[i],constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK|(i<3?constants.O_DIRECTORY:0));pins.push(fd);const info=fstatSync(fd,{bigint:true});if((i<3&&!info.isDirectory())||(!info.isDirectory()&&!info.isFile())||!info.nlink||`${info.dev}:${info.ino}`!==expectedIds[i])throw new Error('Repository changed while pinning authorization');}await validLease();pinTimer=setTimeout(revoke,Math.max(1,frozenLease.expiresAt-Date.now()));pinTimer.unref();}catch(error){revoke();throw error;}
 const stable=Object.freeze({version:1,root,gitDirectory,commonDirectory,filesystemIdentity:expected,id:hash(JSON.stringify({root,gitDirectory,commonDirectory,expected}))});
 const sameState=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const authority=Object.freeze({identity:stable,leaseId:frozenLease.id,measurements,
  async read(cwd=root){const result=await inspect(cwd);return {...stable,...result.state,fingerprint:hash(JSON.stringify([stable.id,result.state]))};},
  async roots(cwd=root){
   const start=await inspect(cwd);if(start.state.unborn)return [];
   const pending=[start.state.head],seen=new Set(),roots=[];
   while(pending.length){if(seen.size>=128||roots.length>=16)throw new Error('Repository history exceeds metadata budget');const oid=pending.pop();if(seen.has(oid))continue;seen.add(oid);
    const read=await inspect(cwd,'object',oid);if(!sameState(read.state,start.state))throw new Error('Concurrent repository state transition');
    const content=inflateSync(decode(read.record.object),{maxOutputLength:1048576});const digest=createHash(oid.length===40?'sha1':'sha256').update(content).digest('hex');if(digest!==oid)throw new Error('Git object content hash mismatch');
    const nul=content.indexOf(0);if(nul<0||!/^commit [0-9]+$/.test(content.subarray(0,nul).toString())||Number(content.subarray(7,nul).toString())!==content.length-nul-1)throw new Error('Unsupported Git object');
    const body=content.subarray(nul+1).toString('utf8'),separator=body.indexOf('\n\n');if(separator<0)throw new Error('Malformed Git commit');const parents=body.slice(0,separator).split('\n').filter(line=>line.startsWith('parent ')).map(line=>line.slice(7));if(parents.length>32||pending.length+parents.length>512)throw new Error('Git history fanout exceeds metadata budget');if(parents.some(parent=>!oidPattern.test(parent)||parent.length!==oid.length))throw new Error('Malformed parent identity');if(!parents.length)roots.push(oid);else pending.push(...parents);
   }
   const final=await inspect(cwd);if(!sameState(start.state,final.state))throw new Error('Concurrent repository state transition');return roots.sort();
  },
  revoke
 });authorities.add(authority);return authority;
}
