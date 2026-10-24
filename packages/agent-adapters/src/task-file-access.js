import{spawn}from'node:child_process';
import{createHash}from'node:crypto';
import{mkdirSync,writeFileSync,readFileSync,chmodSync,realpathSync,openSync,closeSync,constants,lstatSync}from'node:fs';
import{join,dirname}from'node:path';
import{performance}from'node:perf_hooks';
import{isTaskExecutionAuthority}from'../../task-engine/src/execution-authority.js';
import{isRepositoryAuthority,repositoryTool}from'./repository-identity.js';
import{manageAgentProcess}from'./process.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const services=new WeakMap();
export const isTaskFileAccessFor=(service,execution)=>services.has(service)&&services.get(service)===execution;
export async function buildTaskFileReader(directory,{signal}={}){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Task file boundary requires macOS ARM64');
 mkdirSync(directory,{recursive:true,mode:0o700});directory=realpathSync(directory);if(lstatSync(directory).mode&0o077)throw new Error('Task reader directory must be private');
 const source=readFileSync(new URL('../native/task-file-reader.c',import.meta.url)),input=join(directory,'reader.c'),command=join(directory,'task-file-reader');writeFileSync(input,source,{mode:0o600});
 const compile=await repositoryTool('/usr/bin/xcrun',['clang','-std=c11','-D_DARWIN_C_SOURCE','-O2','-Wall','-Wextra','-Werror','-fstack-protector-strong','-D_FORTIFY_SOURCE=2',input,'-o',command],{signal});if(compile.code!==0)throw new Error('Task file reader compilation failed');
 const sign=await repositoryTool('/usr/bin/codesign',['-s','-','--options','runtime',command],{signal});if(sign.code!==0)throw new Error('Task file reader signing failed');chmodSync(command,0o500);
 return Object.freeze({command,sha256:hash(readFileSync(command)),sourceSha256:hash(source),ownedGroups:[compile.pid,sign.pid]});
}
const safePath=path=>typeof path==='string'&&path.length>0&&path.length<4096&&!/[\x00-\x1f\\]/.test(path)&&path.split('/').every(part=>part&&part[0]!=='.'&&!/credential|secret|token|^auth\.json$|^id_|\.pem|\.key/i.test(part));
/** Host-only read seam. Does not expose a public IPC filesystem, advertise ACP
 * fs support, grant project access to the provider, or authorize draft writes. */
export async function createTaskFileAccess({execution,repository,reader}){
 if(!isTaskExecutionAuthority(execution)||!isRepositoryAuthority(repository))throw new Error('Host-issued task and repository authorities required');
 const provider=execution.verify();let executable;try{executable=lstatSync(provider.executable,{bigint:true});if(!executable.isFile()||hash(readFileSync(provider.executable))!==provider.sha256)throw new Error('Changed executable');}catch{execution.revoke();throw new Error('Task provider executable integrity changed');}
 let initial;try{initial=await repository.read();if(initial.root!==execution.workspace)throw new Error('Task repository scope mismatch');}catch(error){execution.revoke();throw error;}
 if(reader.command.startsWith(initial.root+'/'))throw new Error('Task reader must be outside the project');
 const rootFd=openSync(initial.root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW),controller=new AbortController(),pending=new Set();let closed=false,budget=0,closing,cleanupFailure;
 const abort=()=>controller.abort();execution.signal.addEventListener('abort',abort,{once:true});
 async function verify(path){execution.verify();if(closed||controller.signal.aborted)throw new Error('File access revoked');try{const actual=lstatSync(provider.executable,{bigint:true});if(['dev','ino','size','mtimeNs','ctimeNs'].some(key=>actual[key]!==executable[key]))throw new Error('Changed executable');}catch{execution.revoke();throw new Error('Task provider executable changed');}let state;try{state=await repository.read(join(initial.root,dirname(path)));}catch(error){execution.revoke();throw error;}if(state.fingerprint!==initial.fingerprint){execution.revoke();throw new Error('Task repository changed');}}
 async function operation(path){
  const started=performance.now();let decision='denied';
  try{
   if(!safePath(path)||++budget>128)throw new Error('Unsupported or sensitive task path');await verify(path);
   try{const info=lstatSync(reader.command);if(!info.isFile()||info.mode&0o022||hash(readFileSync(reader.command))!==reader.sha256)throw new Error('Changed reader');}catch{execution.revoke();throw new Error('Task reader integrity changed');}
   const child=spawn(reader.command,[initial.root,path],{env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8'},shell:false,detached:true,stdio:['pipe','pipe','pipe',rootFd]});const lifecycle=manageAgentProcess(child,controller.signal);child.stdin.end();let bytes=0,errors=0,chunks=[];
   child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes<=131073)chunks.push(chunk);else lifecycle.dispose().catch(()=>{});});child.stderr.on('data',chunk=>{errors+=chunk.length;if(errors>4096)lifecycle.dispose().catch(()=>{});});
   const timer=setTimeout(()=>lifecycle.dispose().catch(()=>{}),3000);let code;try{code=await lifecycle.closed;}finally{clearTimeout(timer);await lifecycle.dispose();}
   if(code!==0||lifecycle.error()||bytes>131073||errors>4096)throw new Error('Task file operation denied');await verify(path);
   const encoded=Buffer.concat(chunks).toString('ascii').trim();if(!/^(?:[0-9a-f]{2})*$/.test(encoded))throw new Error('Invalid task file response');const content=Buffer.from(encoded,'hex');if(content.includes(0))throw new Error('Task reader supports text files only');
   const text=new TextDecoder('utf-8',{fatal:true}).decode(content);decision='allowed';return text;
  }finally{
   // Only bounded path/decision metadata, never file contents or credentials.
   try{execution.audit({operation:'read',path:safePath(path)?path.slice(0,1024):'[rejected path]',repositoryIdentity:initial.id,decision,elapsedMs:performance.now()-started});}catch{if(decision==='allowed'){execution.revoke();throw new Error('Task file audit could not be persisted');}}
  }
 }
 const service=Object.freeze({repositoryIdentity:initial.id,
  read(path){if(closed||cleanupFailure||pending.size>=4)return Promise.reject(new Error('File access revoked or concurrency bound exceeded'));const work=operation(path);pending.add(work);work.catch(error=>{if(error?.kind==='fatal'){cleanupFailure=error;execution.revoke();}}).finally(()=>pending.delete(work)).catch(()=>{});return work;},
  write(){return Promise.reject(new Error('Draft write mediation is not verified; writes remain blocked'));},
  close(){if(closing)return closing;closing=(async()=>{closed=true;controller.abort();execution.signal.removeEventListener('abort',abort);const results=await Promise.allSettled([...pending]);closeSync(rootFd);if(cleanupFailure||results.some(r=>r.status==='rejected'&&r.reason?.kind==='fatal'))throw new Error('Task file cleanup unverified');})();return closing;}
 });services.set(service,execution);return service;
}
