import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync,rmSync}from'node:fs';import{tmpdir,hostname}from'node:os';import{join}from'node:path';import{spawn}from'node:child_process';import{randomUUID}from'node:crypto';
import{TaskStore}from'../../storage/src/index.js';import{createTaskExecutionAuthority,isTaskExecutionAuthority}from'../src/execution-authority.js';import{manageAgentProcess}from'../../agent-adapters/src/process.js';
const policy={provider:'opencode',permission:'read',intent:'ask'};
async function fixture(fn){const directory=mkdtempSync(join(tmpdir(),'codovyn-task-scope-')),store=new TaskStore(join(directory,'tasks.sqlite')),token=randomUUID();store.create({id:'task',request:'Local lease witness',repositoryRoot:directory,primaryAgent:'opencode'});store.append('task','task-configuration',policy);store.claimExecution('task',{token,pid:process.pid,host:hostname()});store.update('task',{status:'running',activeAgent:'opencode',step:0});
 const child=spawn(process.execPath,['-e','process.stdin.resume()'],{detached:true,stdio:['pipe','pipe','pipe']}),lifecycle=manageAgentProcess(child);const grants=[];
 const create=extra=>{const a=createTaskExecutionAuthority({store,taskId:'task',provider:'opencode',token,workspace:directory,configuration:policy,...extra});grants.push(a);return a;};
 try{await fn({store,token,child,create,directory});}finally{for(const a of grants)a.revoke();await lifecycle.dispose();store.close();rmSync(directory,{recursive:true,force:true});}
}
test('execution scope cannot transfer a child, token, task identity or serialized authority',async()=>fixture(async({store,child,create,directory})=>{
 const a=create();assert.equal(isTaskExecutionAuthority(a),true);assert.equal(isTaskExecutionAuthority({...a}),false);a.bindProcess(child,{executable:process.execPath,sha256:'a'.repeat(64)});assert.ok(a.verify().pid);
 assert.throws(()=>create().bindProcess(child,{executable:process.execPath,sha256:'a'.repeat(64)}),/single-process/);
 assert.throws(()=>create({token:randomUUID()}).verifyAdmission(),/revoked/);
 store.create({id:'other',request:'Other task',repositoryRoot:directory,primaryAgent:'opencode'});assert.throws(()=>store.claimExecution('other',{token:randomUUID(),pid:process.pid,host:hostname()}),/unreconciled/);
 assert.throws(()=>create({taskId:'other'}).verifyAdmission(),/revoked/);
}));
test('expiry and task cancellation revoke authority without releasing the SQLite ownership fence',async()=>fixture(async({store,create})=>{
 const expired=create({ttlMs:10});await new Promise(resolve=>setTimeout(resolve,20));assert.throws(()=>expired.verifyAdmission(),/revoked/);assert.equal(store.executionLease('task').releasedAt,null);
 const abort=new AbortController(),cancelled=create({signal:abort.signal});abort.abort();assert.throws(()=>cancelled.verifyAdmission(),/revoked/);assert.equal(store.executionLease('task').releasedAt,null);
}));
test('authority rejects unsupported modes and unrelated executable launch identities',async()=>fixture(async({store,child,create})=>{
 store.append('task','task-configuration',{...policy,permission:'read-write'});assert.throws(()=>create({configuration:{...policy,permission:'read-write'}}).verifyAdmission(),/permission policy/);
 store.append('task','task-configuration',policy);assert.throws(()=>create().bindProcess(child,{executable:'/bin/sh',sha256:'a'.repeat(64)}),/does not match/);
}));
