import test,{before,after}from'node:test';import assert from'node:assert/strict';
import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync,symlinkSync,linkSync,renameSync,openSync,closeSync,constants,copyFileSync,chmodSync}from'node:fs';
import{join}from'node:path';import{tmpdir}from'node:os';import{spawn,execFileSync}from'node:child_process';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
import{TaskStore}from'../../storage/src/index.js';import{TaskEngine}from'../../task-engine/src/index.js';import{AgentRegistry}from'../../agent-core/src/index.js';import{repositorySnapshot}from'../../git-engine/src/index.js';
import{buildRepositoryReader,createRepositoryAuthority,repositoryTool}from'../src/repository-identity.js';import{buildTaskFileReader,createTaskFileAccess}from'../src/task-file-access.js';import{manageAgentProcess}from'../src/process.js';
import{createRepositoryBroker}from'../src/repository-broker.js';import{openCodeBoundary}from'../src/opencode-sandbox.js';import{probeProcess}from'../../../scripts/lib/opencode-git-probe.js';
const supported=process.platform==='darwin'&&process.arch==='arm64';let base,metadataReader,fileReader,index=0;
before(async()=>{if(supported){base=realpathSync(mkdtempSync(join(tmpdir(),'codovyn-task-files-')));metadataReader=await buildRepositoryReader(join(base,'metadata'));fileReader=await buildTaskFileReader(join(base,'files'));}});after(()=>{if(base)rmSync(base,{recursive:true,force:true});});
function git(root,...args){return execFileSync('/usr/bin/git',['-c','core.fsmonitor=false','-C',root,...args],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},stdio:['pipe','pipe','pipe']}).trim();}
async function run(intent,callback,ownershipChanged=false,executable=process.execPath,prepare=()=>{}){const root=join(base,'project-'+ ++index);mkdirSync(root);git(root,'init','-q');writeFileSync(join(root,'Calculator.java'),'class Calculator {}\n');writeFileSync(join(root,'pom.xml'),'<project/>\n');writeFileSync(join(root,'README.md'),'Project documentation\n');git(root,'add','.');git(root,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','baseline');prepare(root);const store=new TaskStore(join(base,'state-'+index,'tasks.sqlite'));const config={provider:'opencode',permission:'read',intent,modelId:null,reasoning:null,routingMode:'manual'};store.create({id:'task',request:'Read authorized files in an OS fixture; no model request',repositoryRoot:root,primaryAgent:'opencode'});store.append('task','task-configuration',config);const registry=new AgentRegistry();let saved;
 let fixtureError;registry.register({id:'opencode',capabilities:{writes:false,shell:false},availability:async()=> 'available',async*run({execution}){
  const child=spawn(executable,executable===process.execPath?['-e','process.stdin.resume()']:[],{detached:true,stdio:['pipe','pipe','pipe']});const lifecycle=manageAgentProcess(child);execution.starting();execution.spawned({pid:child.pid,group:true});
  let repository,files;try{
   saved=execution.authority;saved.bindProcess(child,{executable,sha256:createHash('sha256').update(readFileSync(executable)).digest('hex')});
   repository=await createRepositoryAuthority({root,gitDirectory:git(root,'rev-parse','--absolute-git-dir'),reader:metadataReader,lease:{id:'file-test',purpose:'metadata-only',expiresAt:Date.now()+60000,isCurrent:()=>{try{saved.verify();return true;}catch{return false;}}}});
   files=await createTaskFileAccess({execution:saved,repository,reader:fileReader});await callback({root,store,execution:saved,repository,files,child});yield{type:'completed'};
  }catch(error){fixtureError=error;throw error;}finally{try{await files?.close();repository?.revoke();await lifecycle.dispose();}catch(error){throw error;}execution.stopped();}
 }});
 try{const result=new TaskEngine({store,registry,snapshot:()=>repositorySnapshot(root)}).run('task');if(ownershipChanged)await assert.rejects(result,/Execution ownership changed/);else assert.equal((await result).status,'completed',fixtureError?.stack);if(fixtureError)throw fixtureError;assert.notEqual(store.executionLease('task').releasedAt,null);assert.throws(()=>saved.verify(),/revoked/);return store.events('task');}finally{store.close();}
}
function check(name,fn){test(name,{skip:!supported},fn);}
check('real TaskEngine lease permits bounded Ask/Plan source reads and journals no source contents',async()=>{
 for(const intent of ['ask','plan']){const events=await run(intent,async({files,execution})=>{assert.equal(await files.read('Calculator.java'),'class Calculator {}\n');assert.equal(await files.read('pom.xml'),'<project/>\n');assert.equal(await files.read('README.md'),'Project documentation\n');await assert.rejects(files.write('Calculator.java','bad'),/writes remain blocked/);assert.equal(execution.intent,intent);});const access=events.filter(e=>e.kind==='file-access');assert.equal(access.length,3);assert.ok(access.every(e=>e.data.decision==='allowed'));assert.ok(!JSON.stringify(access).includes('class Calculator'));}
});
check('file service rejects secrets, traversal, symlinks, hardlinks, nested repositories and forged task authority',async()=>{
 await run('ask',async({root,files,execution,repository})=>{
  await assert.rejects(createTaskFileAccess({execution:{...execution},repository,reader:fileReader}),/Host-issued/);
  const external=join(base,'external');writeFileSync(external,'private witness');symlinkSync(external,join(root,'outside.java'));linkSync(external,join(root,'hard.java'));mkdirSync(join(root,'nested'));git(join(root,'nested'),'init','-q');writeFileSync(join(root,'nested','file.java'),'nested');
  for(const path of ['../external','/etc/passwd','.env','.git/config','.ssh/id_rsa','auth.json','outside.java','hard.java','nested/file.java'])await assert.rejects(files.read(path));
  assert.equal(readFileSync(external,'utf8'),'private witness');
 });
});
check('accepted policy changes and released SQLite execution leases permanently revoke file reads',async()=>{
 for(const mutation of ['configuration','lease'])await run('ask',async({files,store})=>{
  assert.ok(await files.read('pom.xml'));if(mutation==='configuration')store.append('task','task-configuration',{provider:'opencode',permission:'read-write',intent:'agent'});else store.releaseExecution('task',store.executionLease('task').token);
  await assert.rejects(files.read('pom.xml'),/changed|revoked/);
 },mutation==='lease');
});
check('repository path replacement rejects file access and restoring the path cannot revive authority',async()=>{
 await run('ask',async({root,files})=>{renameSync(root,root+'-old');mkdirSync(root);git(root,'init','-q');writeFileSync(join(root,'pom.xml'),'other repository');await assert.rejects(files.read('pom.xml'));rmSync(root,{recursive:true});renameSync(root+'-old',root);await assert.rejects(files.read('pom.xml'));});
});
check('task authority rejects duplicate process binding and revokes reads immediately on cancellation or process exit',async()=>{
 for(const stop of ['revoke','exit'])await run('ask',async({files,execution,child})=>{
  await assert.rejects(async()=>execution.bindProcess(child,{executable:process.execPath,sha256:'0'.repeat(64)}),/single-process/);
  if(stop==='revoke')execution.revoke();else{const life=manageAgentProcess(child);await life.dispose();}
  await assert.rejects(files.read('Calculator.java'),/revoked|not live/);
 });
});
check('a failed durable file audit prevents otherwise allowed content from being returned',async()=>{
 await run('ask',async({files,store})=>{const original=store.append;store.append=function(...args){if(args[1]==='file-access')throw new Error('Audit storage unavailable');return original.apply(this,args);};try{await assert.rejects(files.read('pom.xml'),/audit could not be persisted/);}finally{store.append=original;}});
});
check('an observed provider executable deletion permanently revokes authority even after restoration',async()=>{
 const executable=join(base,'owned-cat');copyFileSync('/bin/cat',executable);chmodSync(executable,0o500);
 await run('ask',async({files})=>{assert.ok(await files.read('pom.xml'));renameSync(executable,executable+'-saved');try{await assert.rejects(files.read('pom.xml'),/executable changed/);}finally{renameSync(executable+'-saved',executable);}await assert.rejects(files.read('pom.xml'),/revoked/);},false,executable);
});
check('a task grant does not broaden the provider OS sandbox or permit direct execution of the host file helper',async()=>{
 await run('ask',async({root,repository})=>{const broker=await createRepositoryBroker(repository);try{
  const boundary=broker.boundary(openCodeBoundary({cwd:root,stateDirectory:join(base,'sandbox-private'),command:process.execPath}));
  const actions=[`s.readFileSync('Calculator.java')`,`s.writeFileSync('Calculator.java','bad')`,`s.writeFileSync('.git/config','bad')`,`c.execFileSync('/bin/sh',['-c','true'])`,`c.execFileSync('/usr/bin/git',['push'])`,`c.execFileSync(${JSON.stringify(fileReader.command)},[${JSON.stringify(root)},'Calculator.java'])`];
  const code=`const s=require('fs'),c=require('child_process');let denied=0;for(const op of [${actions.map(x=>'()=>'+x).join(',')}])try{op()}catch{denied++}console.log(denied);`;
  const result=await probeProcess(boundary.command,[...boundary.prefixArgs,'-e',code],{cwd:root,env:boundary.env});assert.equal(result.code,0);assert.equal(Number(result.stdout.trim()),actions.length);assert.equal(readFileSync(join(root,'Calculator.java'),'utf8'),'class Calculator {}\n');
 }finally{await broker.close();}});
});
check('native file descriptor race rejects file substitution and parent relocation without returning content',async()=>{
 const root=join(base,'race');mkdirSync(root);writeFileSync(join(root,'file.java'),'approved');const fd=openSync(root,constants.O_RDONLY|constants.O_DIRECTORY),command=join(base,'race-reader');assert.equal((await repositoryTool('/usr/bin/xcrun',['clang','-D_DARWIN_C_SOURCE','-DCODOVYN_TASK_FILE_TEST_PAUSE','-Wall','-Wextra','-Werror',fileURLToPath(new URL('../native/task-file-reader.c',import.meta.url)),'-o',command])).code,0);
 try{for(const mutation of ['file','root']){const child=spawn(command,[root,'file.java'],{env:{PATH:'/usr/bin:/bin'},detached:true,stdio:['pipe','pipe','pipe',fd]});const life=manageAgentProcess(child);let output='';child.stdout.on('data',chunk=>output+=chunk);let expired=false;const deadline=setTimeout(()=>{expired=true;life.dispose().catch(()=>{});},3000);try{while(!output.includes('PINNED')){await new Promise(r=>setTimeout(r,5));if(expired||child.exitCode!==null||child.signalCode!==null||life.error())throw new Error('Native race did not reach barrier');}if(mutation==='file'){renameSync(join(root,'file.java'),join(root,'old.java'));writeFileSync(join(root,'file.java'),'substitution');}else{renameSync(root,root+'-moved');mkdirSync(root);}child.stdin.end('\n');assert.equal(await life.closed,mutation==='root'?77:76);assert.equal(output.trim(),'PINNED');}finally{clearTimeout(deadline);await life.dispose();}}}finally{closeSync(fd);}
});

check('bare repositories inside an approved source tree revoke access instead of exposing Git metadata',async()=>{
 await run('ask',async({root,files,execution})=>{const bare=join(root,'bare');git(root,'init','--bare','-q',bare);await assert.rejects(files.read('bare/HEAD'));assert.throws(()=>execution.verifyAdmission(),/revoked/);await assert.rejects(files.read('pom.xml'));});
});
check('a separate non-hidden Git directory within the project is never treated as source',async()=>{
 await run('ask',async({root,execution})=>{const moved=join(root,'metadata');renameSync(join(root,'.git'),moved);writeFileSync(join(root,'.git'),'gitdir: '+join(root,'metadata')+'\n');const authority=await createRepositoryAuthority({root,gitDirectory:moved,commonDirectory:moved,reader:metadataReader,lease:{id:'separate-store-test',purpose:'metadata-only',expiresAt:Date.now()+60000,isCurrent:()=>{try{execution.verify();return true;}catch{return false;}}}});let files;try{await assert.rejects(createTaskFileAccess({execution,repository:authority,reader:fileReader}),/accepted task filesystem identity/);}finally{await files?.close();authority.revoke();}});
});

check('authorized separate Git stores with ordinary names are excluded from source access',async()=>{
 await run('ask',async({files})=>{await assert.rejects(files.read('metadata/HEAD'),/sensitive task path/);await assert.rejects(files.read('metadata/config'),/sensitive task path/);assert.equal(await files.read('pom.xml'),'<project/>\n');},false,process.execPath,root=>{renameSync(join(root,'.git'),join(root,'metadata'));writeFileSync(join(root,'.git'),'gitdir: '+join(root,'metadata')+'\n');});
});
