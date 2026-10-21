import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskStore } from '../../storage/src/index.js';
import { executionRecovery, recoveryFingerprint } from '../src/recovery.js';
function fixture() {
 const store=new TaskStore(':memory:');store.create({id:'task',request:'Edit',primaryAgent:'codex'});
 store.claimExecution('task',{token:'owner-token-123456',pid:100,host:'fixture'});
 store.append('task','execution-owned',{token:'owner-token-123456'});return store;
}
test('crash matrix never equates missing process or completion evidence with safe replay', () => {
 const options={host:'fixture',platform:'darwin',absent:()=>true};
 for (const point of ['before-launch','during-registration','during-write','after-write','after-completion','during-cleanup','after-cleanup']) {
  const store=fixture();
  if(point!=='before-launch')store.append('task','provider-starting');
  if(!['before-launch','during-registration'].includes(point))store.append('task','provider-spawned',{pid:101,group:true});
  if(['during-write','after-write','after-completion','during-cleanup','after-cleanup'].includes(point))store.append('task','agent-event',{event:{type:'tool-start',actionId:'write'}});
  if(['after-completion','during-cleanup','after-cleanup'].includes(point))store.append('task','agent-event',{event:{type:'tool-complete',actionId:'write'}});
  if(point==='after-cleanup')store.append('task','provider-stopped');
  assert.equal(executionRecovery(store,'task',options).safe,!['before-launch','during-registration'].includes(point),point);
  if(point==='during-write') {
   assert.equal(executionRecovery(store,'task',{...options,absent:pid=>pid===100}).safe,false);
   assert.equal(executionRecovery(store,'task',{...options,absent:()=>false}).safe,false);
   assert.equal(executionRecovery(store,'task',{...options,platform:'win32'}).safe,false);
  }
  assert.equal(executionRecovery(store,'task',{...options,host:'other'}).safe,false);store.close();
 }
});
test('recovery fingerprints bind actual worktree state and reject incomplete snapshots',()=>{
 const state={root:'/draft',branch:'draft',commit:'abc',workingTreeHash:'hash',dirty:true,changedPaths:['a']};
 assert.notEqual(recoveryFingerprint(state),recoveryFingerprint({...state,workingTreeHash:'changed'}));
 assert.throws(()=>recoveryFingerprint({}),/Incomplete/);
});

test('explicit reconciliation binds inspected state and preserves unresolved write outcomes', async()=>{
 const { reconcileDraft }=await import('../src/recovery.js');const store=fixture();
 store.append('task','provider-starting');store.append('task','provider-spawned',{pid:101,group:true});
 store.append('task','agent-event',{agent:'codex',event:{type:'tool-start',actionId:'write',action:'file_change'}});
 store.update('task',{status:'running',activeAgent:'codex',step:0});
 const state={root:'/draft',commit:'base',workingTreeHash:'partial'};
 const options={store,id:'task',snapshot:async()=>state,expectedFingerprint:recoveryFingerprint(state),decision:'preserve',
   evidence:{host:'fixture',platform:'darwin',absent:()=>true}};
 await assert.rejects(reconcileDraft(options),/confirmation/);
 await assert.rejects(reconcileDraft({...options,confirm:true,expectedFingerprint:'stale'}),/changed/);
 const result=await reconcileDraft({...options,confirm:true});assert.equal(result.status,'interrupted');
 assert.equal(store.events('task').filter(e=>e.kind==='agent-event').length,1);
 assert.match(store.events('task').at(-1).data.actionResolution,/unknown/);
 assert.ok(store.executionLease('task').releasedAt);
 assert.equal((await reconcileDraft({...options,confirm:true,decision:'abandon'})).status,'cancelled');store.close();
});

test('a crashed reconciliation owner can be recovered without inventing a provider process',()=>{
 const store=new TaskStore(':memory:');store.create({id:'task',request:'Edit',primaryAgent:'codex'});
 store.claimExecution('task',{token:'recovery-token-123456',pid:123,host:'fixture',kind:'recovery'});
 assert.equal(executionRecovery(store,'task',{host:'fixture',absent:()=>false}).safe,false);
 assert.equal(executionRecovery(store,'task',{host:'fixture',absent:()=>true}).reason,'recovery-owner-absent-no-provider-launch');
 assert.equal(store.events('task').length,0);store.close();
});
