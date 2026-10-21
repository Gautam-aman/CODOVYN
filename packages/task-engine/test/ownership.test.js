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
