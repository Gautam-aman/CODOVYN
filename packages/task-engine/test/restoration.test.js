import test from 'node:test';
import assert from 'node:assert/strict';
import {restorationDecision} from '../src/restoration.js';
test('restoration requires optional consent, a safe boundary, fresh success and cooldown',()=>{
 const now=1000000;const options={enabled:true,primary:'codex',current:'gemini',safe:true,now,
  failedAt:new Date(now-90000).toISOString(),switchedAt:new Date(now-80000).toISOString(),
  evidence:{agent:'codex',source:'successful-task',observedAt:new Date(now-1000).toISOString()}};
 assert.equal(restorationDecision(options).restore,true);
 for(const change of [{enabled:false},{safe:false},{evidence:null},{evidence:{...options.evidence,source:'cli-installed'}},
  {evidence:{...options.evidence,observedAt:new Date(now-200000).toISOString()}},{switchedAt:new Date(now-100).toISOString()},
  {evidence:{...options.evidence,observedAt:new Date(now+1000).toISOString()}}])assert.equal(restorationDecision({...options,...change}).restore,false);
});

test('engine restores only between attempts using newer successful-task evidence in the same repository',async()=>{
 const {TaskStore}=await import('../../storage/src/index.js');const {AgentRegistry,AgentFailure}=await import('../../agent-core/src/index.js');
 const {TaskEngine}=await import('../src/index.js');const store=new TaskStore(':memory:');const registry=new AgentRegistry();
 const snapshot=async()=>({root:'/repo',commit:'abc',workingTreeHash:'unchanged',dirty:false});let primary=0,backup=0;
 registry.register({id:'codex',capabilities:{},availability:async()=> 'available',async *run(){if(++primary===1)throw new AgentFailure('quota','fixture');yield {type:'completed'};}});
 registry.register({id:'gemini',capabilities:{},availability:async()=> 'available',async *run(){backup++;throw new AgentFailure('authentication','fixture');}});
 store.create({id:'task',request:'Explain',repositoryRoot:'/repo',primaryAgent:'codex',fallbackAgents:['gemini']});
 assert.equal((await new TaskEngine({store,registry,snapshot}).run('task')).status,'interrupted');
 assert.equal(store.providerStatus('codex','/other'),null);
 store.create({id:'proof',request:'Authorized separate request',repositoryRoot:'/repo',primaryAgent:'codex'});
 await new TaskEngine({store,registry,snapshot}).run('proof');
 const engine=new TaskEngine({store,registry,snapshot,restoration:{enabled:true},now:()=>Date.now()+61000});
 assert.equal((await engine.run('task')).activeAgent,'codex');assert.equal(backup,1);assert.equal(primary,3);
 assert.equal(store.events('task').findLast(e=>e.kind==='restoration-decision').data.restore,true);
 store.close();
});
