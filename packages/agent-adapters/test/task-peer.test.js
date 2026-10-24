import test,{before,after}from'node:test';import assert from'node:assert/strict';import{createServer}from'node:http';import{spawn}from'node:child_process';import{once}from'node:events';import{randomUUID,createHash}from'node:crypto';import{mkdtempSync,realpathSync,rmSync,readFileSync}from'node:fs';import{tmpdir,hostname}from'node:os';import{join}from'node:path';
import{TaskStore}from'../../storage/src/index.js';import{createTaskExecutionAuthority}from'../../task-engine/src/execution-authority.js';import{buildTaskPeerReader,createTaskPeerVerifier}from'../src/task-peer.js';import{manageAgentProcess}from'../src/process.js';import{repositoryTool}from'../src/repository-identity.js';
const supported=process.platform==='darwin'&&process.arch==='arm64';let base,reader;
before(async()=>{if(supported){base=realpathSync(mkdtempSync(join(tmpdir(),'codovyn-task-peer-')));reader=await buildTaskPeerReader(join(base,'reader'));}});after(()=>{if(base)rmSync(base,{recursive:true,force:true});});
async function fixture(fn){
 const store=new TaskStore(':memory:'),token=randomUUID(),policy={provider:'opencode',permission:'read',intent:'ask'};store.create({id:'peer-task',request:'Only local socket identity; no model inference',repositoryRoot:base,primaryAgent:'opencode'});store.append('peer-task','task-configuration',policy);store.claimExecution('peer-task',{token,pid:process.pid,host:hostname()});store.update('peer-task',{status:'running',activeAgent:'opencode',step:0});
 const source="require('readline').createInterface({input:process.stdin}).on('line',url=>{const r=require('http').get(url,res=>{res.resume();res.on('end',()=>console.log(res.statusCode))});r.setTimeout(3000,()=>r.destroy());r.on('error',()=>console.log('request-failed'))});";
 const child=spawn(process.execPath,['-e',source],{detached:true,stdio:['pipe','pipe','pipe']}),life=manageAgentProcess(child);const authority=createTaskExecutionAuthority({store,taskId:'peer-task',provider:'opencode',token,workspace:base,configuration:policy});authority.bindProcess(child,{executable:process.execPath,sha256:createHash('sha256').update(readFileSync(process.execPath)).digest('hex')});
 let verifier;const observed=[];const server=createServer(async(req,res)=>{try{const a=await verifier.verify(req.socket),b=await verifier.verify(req.socket);assert.equal(a,b);observed.push({allowed:true,generation:a});res.writeHead(200);}catch{observed.push({allowed:false});res.writeHead(403);}res.end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
 const request=async()=>{const reply=once(child.stdout,'data');child.stdin.write(url+'\n');return (await reply)[0].toString().trim();};
 try{verifier=await createTaskPeerVerifier({execution:authority,pid:child.pid,reader});await fn({authority,child,store,verifier,observed,url,request});}
 finally{authority.revoke();await life.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}
}
function check(name,fn){test(name,{skip:!supported,timeout:15000},fn);}
check('actual loopback socket belongs to the bound task process; another local process cannot borrow its authority',async()=>fixture(async({request,url,authority,observed})=>{
 assert.equal(await request(),'200');assert.equal((await fetch(url,{signal:AbortSignal.timeout(3000)})).status,403);assert.equal(authority.verifyAdmission(),true);assert.equal(await request(),'200');assert.deepEqual(observed.map(e=>e.allowed),[true,false,true]);
}));
check('revoked task denies the same live process on its existing HTTP connection without releasing the lease',async()=>fixture(async({request,authority,store})=>{
 assert.equal(await request(),'200');authority.revoke();assert.equal(await request(),'403');assert.equal(store.executionLease('peer-task').releasedAt,null);
}));
check('peer inspection rejects forged authorities, wrong parent/birth identity and unrelated process selection',async()=>fixture(async({authority,child})=>{
 await assert.rejects(createTaskPeerVerifier({execution:{...authority},pid:child.pid,reader}),/Host-issued/);
 const stale=await repositoryTool(reader.command,['socket',String(child.pid),String(process.pid),process.execPath,'0','0','1','2']);assert.equal(stale.code,77);
 await assert.rejects(createTaskPeerVerifier({execution:authority,pid:process.pid,reader}),/identity changed/);assert.throws(()=>authority.verifyAdmission(),/revoked/);
}));
