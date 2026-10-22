import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TaskStore} from '../src/index.js';
const now=new Date('2026-10-22T00:00:00Z');
test('connections atomically reserve the remaining estimate and history deletion never refunds it',()=>{
 const directory=mkdtempSync(join(tmpdir(),'codovyn-budget-'));let a,b;
 try {
  a=new TaskStore(join(directory,'tasks.sqlite'));b=new TaskStore(join(directory,'tasks.sqlite'));
  for(const id of ['first','second'])a.create({id,request:'Inspect',primaryAgent:'codex'});
  const options={session:'session',estimatedUsd:0.6,budget:{monthUsd:1,monthSpentUsd:0},now};
  a.reserveRouteBudget('first',options);
  assert.throws(()=>b.reserveRouteBudget('second',options),/exceeded/);
  assert.equal(b.routeBudgetTotals('session',now).month.estimatedUsd,0.6);
  assert.throws(()=>b.reserveRouteBudget('first',options),/already reserved/);
  a.update('first',{status:'cancelled',activeAgent:null,step:0});a.delete('first');
  assert.equal(b.routeBudgetTotals('session',now).month.estimatedUsd,0.6);
  assert.throws(()=>b.reserveRouteBudget('second',options),/exceeded/);
  assert.equal(b.routeBudgetTotals('other',now).session.estimatedUsd,0);
  assert.equal(b.routeBudgetTotals('other',new Date('2026-11-01T00:00:00Z')).month.estimatedUsd,0);
 }finally{a?.close();b?.close();rmSync(directory,{recursive:true,force:true});}
});
test('unknown historical cost and conservative micro-USD rounding cannot silently become budget headroom',()=>{
 const store=new TaskStore(':memory:');for(const id of ['unknown','known','tiny'])store.create({id,request:'Inspect',primaryAgent:'codex'});
 store.reserveRouteBudget('unknown',{session:'session',estimatedUsd:null,now});
 assert.equal(store.routeBudgetTotals('session',now).month.unknownRequests,1);
 assert.throws(()=>store.reserveRouteBudget('known',{session:'session',estimatedUsd:0,budget:{monthUsd:1,monthSpentUsd:0},now}),/unobservable/);
 assert.throws(()=>store.reserveRouteBudget('tiny',{session:'other',estimatedUsd:0.0000001,budget:{taskUsd:0.0000001},now}),/exceeded/);
 assert.throws(()=>store.reserveRouteBudget('known',{session:'../invalid',estimatedUsd:0,now}),/scope/);store.close();
});

test('only proven unstarted preparation can void a reservation',()=>{
 const store=new TaskStore(':memory:');for(const id of ['unstarted','owned'])store.create({id,request:'Inspect',primaryAgent:'codex'});
 for(const id of ['unstarted','owned'])store.reserveRouteBudget(id,{session:'session',estimatedUsd:0.5,now});
 store.voidUnstartedRoute('unstarted');assert.equal(store.hasRouteBudget('unstarted'),false);assert.equal(store.get('unstarted').status,'failed');
 store.claimExecution('owned',{token:'owner-token-123456',pid:process.pid,host:'fixture'});store.releaseExecution('owned','owner-token-123456');
 assert.throws(()=>store.voidUnstartedRoute('owned'),/may have started/);assert.equal(store.hasRouteBudget('owned'),true);store.close();
});
