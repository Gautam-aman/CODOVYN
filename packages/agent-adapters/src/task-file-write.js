import{spawn}from'node:child_process';
import{createHash,randomUUID}from'node:crypto';
import{mkdirSync,writeFileSync,readFileSync,chmodSync,realpathSync,lstatSync,mkdtempSync,openSync,closeSync,constants,fstatSync}from'node:fs';
import{join,dirname,relative,isAbsolute}from'node:path';
import{repositoryTool}from'./repository-identity.js';import{manageAgentProcess}from'./process.js';
import{validateDraftWorkspace}from'../../git-engine/src/draft-workspace.js';
const hash=data=>createHash('sha256').update(data).digest('hex');
export async function buildTaskFileWriter(directory,{signal}={}){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Draft publication requires macOS ARM64');mkdirSync(directory,{recursive:true,mode:0o700});directory=realpathSync(directory);if(lstatSync(directory).mode&0o077)throw new Error('Draft helper directory must be private');
 const source=readFileSync(new URL('../native/task-file-publish.c',import.meta.url)),input=join(directory,'publish.c'),command=join(directory,'task-file-publish');writeFileSync(input,source,{mode:0o600});
 const compile=await repositoryTool('/usr/bin/xcrun',['clang','-std=c11','-D_DARWIN_C_SOURCE','-O2','-Wall','-Wextra','-Werror','-fstack-protector-strong','-D_FORTIFY_SOURCE=2',input,'-o',command],{signal});if(compile.code!==0)throw new Error('Draft publisher compilation failed');const sign=await repositoryTool('/usr/bin/codesign',['-s','-','--options','runtime',command],{signal});if(sign.code!==0)throw new Error('Draft publisher signing failed');chmodSync(command,0o500);return Object.freeze({command,sha256:hash(readFileSync(command)),sourceSha256:hash(source)});
}
export async function acquireTaskWriteLock(command,fd,{signal}={}){const child=spawn(command,['--lock'],{env:{PATH:'/usr/bin:/bin'},detached:true,stdio:['pipe','pipe','pipe',fd]}),life=manageAgentProcess(child,signal);child.stdin.end();child.stdout.resume();child.stderr.resume();const timer=setTimeout(()=>life.dispose().catch(()=>{}),1500);try{return await life.closed===0;}finally{clearTimeout(timer);await life.dispose();}}
export function createTaskDraftWriter({execution,repository,writer,inspect,verify,sourcePath,rootFd,versions,signal}){
 let busy=false,cleanupFailure;
 const inside=(parent,path)=>{const r=relative(parent,path);return !isAbsolute(r)&&r!=='..'&&!r.startsWith('../');};
 return Object.freeze({get busy(){return busy;},get cleanupFailure(){return cleanupFailure;},async write(input){
  if(busy||cleanupFailure)throw new Error('Draft write is busy or fenced');busy=true;let id,stageFd,lockFd,child,life,commitSent=false,nativeCode;
  try{
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='content,expectedVersion,path'||!sourcePath(input.path)||typeof input.content!=='string'||input.content.includes('\0')||Buffer.byteLength(input.content)>65536||!(input.expectedVersion===null||typeof input.expectedVersion==='string'&&/^[a-f0-9]{64}$/.test(input.expectedVersion)))throw new Error('Invalid bounded draft write');
   const path=input.path,scope=execution.draft();await verify(path);await validateDraftWorkspace(scope.original,dirname(execution.workspace),execution.taskId,scope.baseCommit);
   let previous={text:'',identity:'-'};if(input.expectedVersion!==null){const known=versions.get(path);if(!known||known.version!==input.expectedVersion)throw new Error('Conflict: read this file and use its current version');previous=await inspect(path);if(previous.version!==input.expectedVersion)throw new Error('Conflict: draft file changed since read');}
   const info=lstatSync(writer.command);if(!info.isFile()||info.mode&0o022||hash(readFileSync(writer.command))!==writer.sha256){execution.revoke();throw new Error('Draft helper integrity changed');}
   const stageDirectory=realpathSync(mkdtempSync(join(dirname(writer.command),'write-')));
   if([execution.workspace,scope.original].some(root=>inside(root,stageDirectory))){execution.revoke();throw new Error('Host staging overlaps a protected project');}
   stageFd=openSync(stageDirectory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
   lockFd=openSync(join(stageDirectory,'lease'),constants.O_CREAT|constants.O_EXCL|constants.O_RDWR|constants.O_NOFOLLOW,0o600);if(!await acquireTaskWriteLock(writer.command,lockFd,{signal}))throw new Error('Draft descriptor lock could not be acquired');const lock=fstatSync(lockFd,{bigint:true});
   id=execution.beginWrite({lockIdentity:`${lock.dev}:${lock.ino}`,path,beforeHash:input.expectedVersion===null?null:hash(previous.text),afterHash:hash(input.content),bytes:Buffer.byteLength(input.content),repositoryIdentity:repository.identity.id,stageDirectory});
   const q=JSON.stringify,root=execution.workspace,parents=new Set(['/']);for(const target of [root,stageDirectory])for(let part=dirname(target);part!=='/';part=dirname(part))parents.add(part);const ancestorReads=`(allow file-read-data (require-all (vnode-type DIRECTORY) (require-any ${[...parents].map(p=>'(literal '+q(p)+')').join(' ')})))`;
   const profile=`(version 1)(allow default)(deny file-read-data)${ancestorReads}(allow file-read-data (subpath "/System") (subpath "/usr") (subpath "/Library/Apple") (subpath "/dev") (subpath ${q(root)}) (subpath ${q(stageDirectory)}) (literal ${q(writer.command)}))(deny file-write*)(allow file-write* (subpath ${q(root)}) (subpath ${q(stageDirectory)}) (literal "/dev/null"))(deny file-read-data (subpath ${q(repository.identity.gitDirectory)}) (subpath ${q(repository.identity.commonDirectory)}))(deny file-write* (subpath ${q(repository.identity.gitDirectory)}) (subpath ${q(repository.identity.commonDirectory)}))(deny process-exec)(allow process-exec (literal ${q(writer.command)}))(deny process-fork)(deny network*)`;
   child=spawn('/usr/bin/sandbox-exec',['-p',profile,writer.command,root,stageDirectory,path,'payload',input.expectedVersion===null?'create':'replace',previous.identity],{env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8'},shell:false,detached:true,stdio:['pipe','pipe','pipe',rootFd,stageFd,lockFd]});life=manageAgentProcess(child,signal);let output='',errors=0;
   child.stdin.on('error',()=>{});child.stdout.on('data',chunk=>{output+=chunk;if(output.length>256)life.dispose().catch(()=>{});});child.stderr.on('data',chunk=>{errors+=chunk.length;if(errors>4096)life.dispose().catch(()=>{});});
   execution.writeProcess(id,child.pid);const timer=setTimeout(()=>life.dispose().catch(()=>{}),3000);
   try{
    child.stdin.write(Buffer.concat([Buffer.from('START\n'+Buffer.byteLength(previous.text)+'\n'+Buffer.byteLength(input.content)+'\n'),Buffer.from(previous.text),Buffer.from(input.content)]));
    await new Promise((resolve,reject)=>{const ready=()=>{if(output.includes('READY\n')){cleanup();resolve();}},closed=()=>{cleanup();reject(new Error('Draft preparation rejected'));},cleanup=()=>{child.stdout.removeListener('data',ready);child.removeListener('close',closed);};child.stdout.on('data',ready);child.once('close',closed);ready();}).catch(async error=>{nativeCode=await life.closed;throw error;});
    await verify(path);execution.verify();commitSent=true;child.stdin.end('COMMIT\n');nativeCode=await life.closed;
   }finally{clearTimeout(timer);await life.dispose();execution.writeStopped(id,child.pid);}
   if(nativeCode!==0||!output.endsWith('PUBLISHED\n')||errors>4096||life.error())throw new Error('Draft publication failed or its outcome is ambiguous');
   await verify(path);const after=await inspect(path);if(hash(after.text)!==hash(input.content))throw new Error('Published draft changed before acknowledgement');
   execution.finishWrite(id,'published');return {path,version:after.version,writeId:id,status:'published',reviewRequired:true};
  }catch(error){
   if(life)try{await life.dispose();if(id&&child?.pid)execution.writeStopped(id,child.pid);}catch(failure){cleanupFailure=failure;execution.revoke();}
   if(id){const state=cleanupFailure||signal.aborted||commitSent&&![75,76].includes(nativeCode)?(nativeCode===78?'conflict':'uncertain'):[75,78].includes(nativeCode)?'conflict':'aborted';try{execution.finishWrite(id,state);}catch{execution.revoke();}if(state!=='aborted')execution.revoke();}
   throw error;
  }finally{if(lockFd!==undefined)closeSync(lockFd);if(stageFd!==undefined)closeSync(stageFd);busy=false;}
 }});
}
