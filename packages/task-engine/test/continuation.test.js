import test from 'node:test';
import assert from 'node:assert/strict';
import {TaskStore} from '../../storage/src/index.js';
import {AgentRegistry,AgentFailure} from '../../agent-core/src/index.js';
import {createHandoffPacket} from '../../agent-core/src/handoff.js';
import {TaskEngine} from '../src/index.js';
import {recoveryFingerprint} from '../src/recovery.js';
test('explicit continuation preserves unknown actions, verifies state and never automatically retries or falls back',async()=>{
 const store=new TaskStore(':memory:');store.create({id:'task',request:'Finish the change',primaryAgent:'codex',fallbackAgents:['gemini']});
 store.claimExecution('task',{token:'fixture-owner-123456',pid:process.pid,host:'fixture'});store.releaseExecution('task','fixture-owner-123456');
 store.update('task',{status:'interrupted',activeAgent:'codex',step:0});
 store.append('task','agent-event',{agent:'codex',event:{type:'tool-start',actionId:'ambiguous-write',action:'command_execution'}});
 const state={root:'/draft',commit:'base',workingTreeHash:'partial',dirty:true};const fingerprint=recoveryFingerprint(state);
 store.append('task','draft-reconciled',{decision:'preserve',fingerprint,actionResolution:'unknown; no replay authorized'});
 let calls=0;const registry=new AgentRegistry();registry.register({id:'gemini',capabilities:{writes:true},availability:async()=> 'available',async *run({handoff}){
   calls++;const packet=createHandoffPacket(handoff);assert.equal(packet.actions[0].state,'unresolved');assert.equal(packet.reconciliations.length,2);
   throw new AgentFailure('quota','controlled interruption');
 }});
 const engine=new TaskEngine({store,registry,snapshot:async()=>state});
 await assert.rejects(engine.run('task',{continuation:{agent:'gemini',fingerprint:'stale'}}),/reconciled continuation/);
 assert.equal(calls,0);
 assert.equal((await engine.run('task',{continuation:{agent:'gemini',fingerprint}})).status,'interrupted');
 assert.equal(calls,1);await assert.rejects(engine.run('task',{continuation:{agent:'gemini',fingerprint}}),/Reconcile again/);
 assert.equal(calls,1);store.close();
});
