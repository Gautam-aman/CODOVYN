import test,{before,after}from'node:test';import assert from'node:assert/strict';
import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync,renameSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{execFileSync}from'node:child_process';import net from'node:net';
import{buildRepositoryReader,createRepositoryAuthority,repositoryTool}from'../src/repository-identity.js';import{createRepositoryBroker}from'../src/repository-broker.js';import{openCodeBoundary}from'../src/opencode-sandbox.js';import{probeProcess}from'../../../scripts/lib/opencode-git-probe.js';
const supported=process.platform==='darwin'&&process.arch==='arm64';let base,reader,index=0;
before(async()=>{if(supported){base=realpathSync(mkdtempSync(join(tmpdir(),'codovyn-broker-test-')));reader=await buildRepositoryReader(join(base,'reader'));}});after(()=>{if(base)rmSync(base,{recursive:true,force:true});});
function git(root,...args){return execFileSync('/usr/bin/git',['-c','core.fsmonitor=false','-C',root,...args],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},stdio:['pipe','pipe','pipe']}).trim();}
async function fixture(){const root=join(base,'repo-'+ ++index);mkdirSync(root);git(root,'init','-q');writeFileSync(join(root,'f'),'x');git(root,'add','.');git(root,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','initial');let current=true;const authority=await createRepositoryAuthority({root,reader,lease:{id:'broker-test',purpose:'metadata-only',expiresAt:Date.now()+60000,isCurrent:()=>current}});const broker=await createRepositoryBroker(authority);const boundary=broker.boundary(openCodeBoundary({cwd:root,stateDirectory:join(base,'state-'+index),command:process.execPath}));return {root,authority,broker,boundary,revoke(){current=false;}};}
async function client(f,args,cwd=f.root,env={}){return probeProcess(f.boundary.command,[f.boundary.prefixArgs[0],f.boundary.prefixArgs[1],f.broker.command,...args],{cwd,env:{...f.boundary.env,...env}});}
function check(name,fn){test(name,{skip:!supported},fn);}
check('native broker client returns fresh verified branch/HEAD and rejects new nested/replaced repositories',async()=>{const f=await fixture();try{
 const head=git(f.root,'rev-parse','HEAD');assert.equal((await client(f,['rev-parse','HEAD'])).stdout,head+'\n');git(f.root,'checkout','-qb','fresh');assert.equal((await client(f,['symbolic-ref','--quiet','--short','HEAD'])).stdout,'fresh\n');
 assert.equal((await client(f,['rev-list','--max-parents=0','HEAD'])).stdout,head+'\n');const nested=join(f.root,'nested');mkdirSync(nested);assert.equal((await client(f,['rev-parse','HEAD'],nested)).code,0);git(nested,'init','-q');assert.equal((await client(f,['rev-parse','HEAD'],nested)).code,126);
 renameSync(f.root,f.root+'-old');mkdirSync(f.root);git(f.root,'init','-q');assert.equal((await client(f,['rev-parse','HEAD'])).code,126);
 }finally{await f.broker.close();}});
check('native client denies command escalation, environment redirection, cross-project and revoked leases',async()=>{const f=await fixture();try{
 for(const args of [['push'],['commit'],['reset','--hard'],['config','x.y','bad'],['rev-parse','HEAD','extra'],['-C','/tmp','rev-parse','HEAD'],['--git-dir','/tmp','--work-tree',f.root,'rev-parse','HEAD']])assert.equal((await client(f,args)).code,126);
 assert.equal((await client(f,['rev-parse','HEAD'],base)).code,126);assert.equal((await client(f,['rev-parse','HEAD'],f.root,{GIT_DIR:'/etc',GIT_WORK_TREE:'/etc',DYLD_LIBRARY_PATH:'/tmp',CODOVYN_BROKER_SOCKET:'/tmp/evil'})).stdout,git(f.root,'rev-parse','HEAD')+'\n');
 const raw=await new Promise((resolve,reject)=>{const socket=net.connect(f.broker.endpoint,()=>socket.write('1 '+'0'.repeat(64)+' 1 2f746d70\n'));let text='';socket.on('data',b=>text+=b);socket.on('end',()=>resolve(text));socket.on('error',reject);});assert.equal(raw,'126 \n');f.revoke();assert.equal((await client(f,['rev-parse','HEAD'])).code,126);
 }finally{await f.broker.close();}});
check('OS process policy still denies real Git, shells, network executables, metadata writes and broker tampering',async()=>{const f=await fixture();try{
 const outside=join(base,'outside');writeFileSync(outside,'private');
 for(const write of [false,true]){const b=f.broker.boundary(openCodeBoundary({cwd:f.root,stateDirectory:join(base,'witness-'+index+'-'+write),command:process.execPath,write}));const actions=[`c.execFileSync('/usr/bin/git',['push'])`,`c.execFileSync('/Library/Developer/CommandLineTools/usr/bin/git',['config','x.y','z'])`,`c.execFileSync('/bin/sh',['-c','true'])`,`c.execFileSync('/usr/bin/curl',['--version'])`,`c.execFileSync(${JSON.stringify(reader.command)},[])`,`s.writeFileSync('.git/config','bad')`,`s.readFileSync(${JSON.stringify(outside)})`,`s.writeFileSync(${JSON.stringify(outside)},'bad')`,`s.writeFileSync(${JSON.stringify(f.broker.command)},'bad')`,`s.linkSync(${JSON.stringify(f.broker.command)},'linked-client')`,`s.unlinkSync(${JSON.stringify(f.broker.endpoint)})`,`s.renameSync(${JSON.stringify(f.broker.bin)},'moved-client')`];const code=`const s=require('fs'),c=require('child_process');let denied=0;for(const action of [${actions.map(a=>'()=>'+a).join(',')}])try{action()}catch{denied++}console.log(denied);`;
 const result=await probeProcess(b.command,[...b.prefixArgs,'-e',code],{cwd:b.cwd,env:b.env});assert.equal(result.code,0);assert.equal(Number(result.stdout.trim()),actions.length);assert.equal(readFileSync(outside,'utf8'),'private');}
 }finally{await f.broker.close();}});
check('hardened client ignores injected dynamic libraries under the provider sandbox',async()=>{const f=await fixture();try{
 const source=join(base,'injected.c'),library=join(base,'injected.dylib'),control=join(base,'control');writeFileSync(source,'#include <unistd.h>\n__attribute__((constructor)) static void injected(void){_exit(77);}\n');assert.equal((await repositoryTool('/usr/bin/xcrun',['clang','-dynamiclib',source,'-o',library])).code,0);writeFileSync(join(base,'control.c'),'int main(void){return 0;}\n');assert.equal((await repositoryTool('/usr/bin/xcrun',['clang',join(base,'control.c'),'-o',control])).code,0);
 // Positive injection witness runs outside the provider sandbox, with its own
 // owned group. It confirms the harmless library actually intercepts startup.
 const injected=await probeProcess(control,[],{env:{PATH:'/usr/bin:/bin',DYLD_INSERT_LIBRARIES:library}});assert.equal(injected.code,77);
 const b={...f.boundary,prefixArgs:[...f.boundary.prefixArgs]};b.prefixArgs[1]+=`\n(allow file-read* (literal ${JSON.stringify(library)}))`;
 const code=`const c=require('child_process');const r=c.spawnSync(${JSON.stringify(f.broker.command)},['rev-parse','HEAD'],{env:{PATH:'/usr/bin:/bin',DYLD_INSERT_LIBRARIES:${JSON.stringify(library)}},encoding:'utf8',timeout:5000});console.log(JSON.stringify({code:r.status,stdout:r.stdout}));`;
 const result=await probeProcess(b.command,[...b.prefixArgs,'-e',code],{cwd:b.cwd,env:b.env});assert.equal(result.code,0);const reply=JSON.parse(result.stdout);assert.equal(reply.code,0);assert.equal(reply.stdout,git(f.root,'rev-parse','HEAD')+'\n');
 }finally{await f.broker.close();}});
check('broker shutdown revokes abandoned requests and stale clients cannot reuse authorization',async()=>{
 const f=await fixture();let blocked=false;const original=f.authority;await f.broker.close();await assert.rejects(original.read(),/revoked/);
 // A deliberately stalled host ownership check is bounded, including shutdown.
 const root=join(base,'abandoned');mkdirSync(root);git(root,'init','-q');const authority=await createRepositoryAuthority({root,reader,lease:{id:'abandoned',purpose:'metadata-only',expiresAt:Date.now()+60000,isCurrent:()=>blocked?new Promise(()=>{}):true}});const broker=await createRepositoryBroker(authority);blocked=true;
 await assert.rejects(authority.read(),/deadline exceeded/);
 const request=authority.read();const rejection=assert.rejects(request,/revoked/);const start=Date.now();await broker.close();await rejection;assert.ok(Date.now()-start<1000);await assert.rejects(authority.read(),/revoked/);
});

check('oversized IPC frames close before any repository inspection',async()=>{
 const f=await fixture();try{const before=f.authority.measurements.length;await new Promise((resolve,reject)=>{const socket=net.connect(f.broker.endpoint,()=>socket.end('x'.repeat(17000)));socket.on('error',error=>{if(error.code!=='ECONNRESET')reject(error);});socket.on('close',resolve);socket.setTimeout(2000,()=>{socket.destroy();reject(new Error('Oversized frame was not bounded'));});});assert.equal(f.authority.measurements.length,before);}finally{await f.broker.close();}
});
