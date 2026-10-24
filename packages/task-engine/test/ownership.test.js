import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskStore } from '../../storage/src/index.js';
import { AgentRegistry } from '../../agent-core/src/index.js';
import { TaskEngine } from '../src/index.js';
test('another engine cannot start an owned task while the first awaits its provider', async () => {
  const store=new TaskStore(':memory:');store.create({id:'task',request:'Inspect',primaryAgent:'agent'});
  let release,entered;const ready=new Promise(resolve=>entered=resolve);
  const registry=new AgentRegistry();registry.register({id:'agent',capabilities:{},availability:async()=> 'available',
    async *run(){entered();await new Promise(resolve=>release=resolve);yield {type:'completed'};}});
  const first=new TaskEngine({store,registry}).run('task');await ready;
  await assert.rejects(new TaskEngine({store,registry}).run('task'),/process reconciliation/);
  release();await first;assert.ok(store.executionLease('task').releasedAt);store.close();
});
test('a provider registration gap retains its durable lease after failure', async () => {
  const store=new TaskStore(':memory:');store.create({id:'task',request:'Inspect',primaryAgent:'agent'});
  const registry=new AgentRegistry();registry.register({id:'agent',capabilities:{},availability:async()=> 'available',
    async *run({execution}){execution.starting();throw new Error('launch failed before registration');}});
  assert.equal((await new TaskEngine({store,registry}).run('task')).status,'interrupted');
  assert.equal(store.executionLease('task').releasedAt,null);
  await assert.rejects(new TaskEngine({store,registry}).run('task'),/process reconciliation/);store.close();
});

test('a legacy running task never acquires a new lease to conceal unknown old processes',async()=>{
 const store=new TaskStore(':memory:');store.create({id:'task',request:'Edit',primaryAgent:'agent'});
 store.update('task',{status:'running',activeAgent:'agent',step:0});
 await assert.rejects(new TaskEngine({store,registry:new AgentRegistry()}).run('task'),/process reconciliation/);
 assert.equal(store.executionLease('task'),null);assert.equal(store.get('task').status,'running');store.close();
});

test('failed ACP cleanup keeps the task lease fenced even when the test later reaps its process',async()=>{
 const {AcpConnection}=await import('../../agent-adapters/src/acp.js');const store=new TaskStore(':memory:');store.create({id:'acp-cleanup',request:'Inspect',primaryAgent:'opencode'});let client,actualDispose;
 const registry=new AgentRegistry();registry.register({id:'opencode',capabilities:{shell:false,writes:false},availability:async()=> 'available',async*run({execution}){
  client=new AcpConnection({command:process.execPath,args:['-e',"process.stdin.resume()"],cwd:process.cwd(),env:process.env,execution});actualDispose=client.lifecycle.dispose.bind(client.lifecycle);client.lifecycle.dispose=async()=>{throw new Error('Injected cleanup failure');};await client.dispose();yield{type:'completed'};
 }});
 try{assert.equal((await new TaskEngine({store,registry}).run('acp-cleanup')).status,'interrupted');assert.equal(store.executionLease('acp-cleanup').releasedAt,null);assert.ok(!store.events('acp-cleanup').some(event=>event.kind==='provider-stopped'));await assert.rejects(new TaskEngine({store,registry}).run('acp-cleanup'),/process reconciliation/);}
 finally{if(client){client.lifecycle.dispose=actualDispose;await actualDispose();await client.pump;}store.close();}
});
