import{mkdirSync,realpathSync,lstatSync,readFileSync,writeFileSync,chmodSync}from'node:fs';
import{join}from'node:path';import{createHash}from'node:crypto';import{Socket}from'node:net';
import{repositoryTool}from'./repository-identity.js';import{isTaskExecutionAuthority}from'../../task-engine/src/execution-authority.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
/** Native inspection stays outside the provider profile; it grants no new
 * executable or filesystem capability to OpenCode. */
export async function buildTaskPeerReader(directory,{signal}={}){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Task peer inspection requires macOS ARM64');mkdirSync(directory,{recursive:true,mode:0o700});directory=realpathSync(directory);if(lstatSync(directory).mode&0o077)throw new Error('Peer reader directory must be private');
 const source=readFileSync(new URL('../native/task-peer-reader.c',import.meta.url)),input=join(directory,'reader.c'),command=join(directory,'task-peer-reader');writeFileSync(input,source,{mode:0o600});
 const compile=await repositoryTool('/usr/bin/xcrun',['clang','-std=c11','-D_DARWIN_C_SOURCE','-O2','-Wall','-Wextra','-Werror','-fstack-protector-strong','-D_FORTIFY_SOURCE=2',input,'-o',command],{signal});if(compile.code!==0)throw new Error('Task peer reader compilation failed');
 const sign=await repositoryTool('/usr/bin/codesign',['-s','-','--options','runtime',command],{signal});if(sign.code!==0)throw new Error('Task peer reader signing failed');chmodSync(command,0o500);
 // Establish native helper/process-inspection readiness before opening a data
 // endpoint. No sleep/retry and no relaxation of the per-request deadline.
 const ready=await repositoryTool(command,['identity',String(process.pid),String(process.ppid),process.execPath,'-','-','0','0'],{signal,timeoutMs:5000,maxBytes:4096});if(ready.code!==0)throw new Error('Task peer inspection is not ready');
 return Object.freeze({command,sha256:hash(readFileSync(command)),sourceSha256:hash(source),startupMs:ready.elapsedMs,ownedGroups:[compile.pid,sign.pid,ready.pid]});
}
export async function createTaskPeerVerifier({execution,pid,reader}){
 if(!isTaskExecutionAuthority(execution)||!Number.isSafeInteger(pid)||pid<1)throw new Error('Host-issued task process identity required');
 const owner=execution.verify(),parent=pid===owner.pid?process.pid:owner.pid;let birth;
 async function inspect(operation,local=0,remote=0){
  execution.verify();const info=lstatSync(reader.command);if(!info.isFile()||info.mode&0o022||hash(readFileSync(reader.command))!==reader.sha256){execution.revoke();throw new Error('Peer reader integrity changed');}
  const result=await repositoryTool(reader.command,[operation,String(pid),String(parent),owner.executable,birth?.seconds||'-',birth?.micros||'-',String(local),String(remote)],{signal:execution.signal,timeoutMs:1500,maxBytes:4096});
  if(result.code===77){execution.revoke();throw new Error('Task peer identity changed');}if(result.code!==0)throw new Error('Socket does not belong to the authorized task process');
  const value=JSON.parse(result.stdout);execution.verify();return value;
 }
 birth=await inspect('identity');if(!/^\d{1,20}$/.test(birth.seconds)||!/^\d{1,6}$/.test(birth.micros))throw new Error('Invalid task peer birth identity');
 return Object.freeze({pid,parent,
  async verify(socket){
   if(!(socket instanceof Socket)||socket.destroyed||socket.remoteAddress!=='127.0.0.1'||socket.localAddress!=='127.0.0.1'||![socket.remotePort,socket.localPort].every(port=>Number.isSafeInteger(port)&&port>0&&port<=65535))throw new Error('Only a live task-owned loopback socket is accepted');
   const value=await inspect('socket',socket.remotePort,socket.localPort);if(!/^[a-f0-9]{1,16}$/.test(value.generation))throw new Error('Invalid socket generation');return value.generation;
  }
 });
}
