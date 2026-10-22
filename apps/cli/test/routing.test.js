import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/index.js';
import { createCodexAdapter } from '../../../packages/agent-adapters/src/index.js';
test('routed execution persists its decision and applies validated model/reasoning flags without fallback spending',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'codovyn-route-'));const oldData=process.env.CODOVYN_DATA_DIR,oldPolicy=process.env.CODOVYN_ROUTING_POLICY;
 try {
  execFileSync('git',['init','-q',directory]);const fixture=join(directory,'codex.cjs'),observed=join(directory,'args.json');
  writeFileSync(fixture,`if(process.argv.includes('--version'))process.exit(0);require('fs').writeFileSync(${JSON.stringify(observed)},JSON.stringify(process.argv));process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({type:'turn.completed'})));`);
  process.env.CODOVYN_DATA_DIR=join(directory,'data');
  const policy={mode:'balanced',reasoning:'high',models:[{id:'chosen',provider:'codex',model:'fixture-model',quality:90,reliability:1,reasoning:['high'],capabilities:['streaming','tools'],availability:'unknown',price:null}],allowUnknownAvailability:true};
  process.env.CODOVYN_ROUTING_POLICY=JSON.stringify(policy);
  const lines=[],output={log:x=>lines.push(x),error:x=>assert.fail(x)};
  const factories={createCodexAdapter:options=>createCodexAdapter({...options,command:process.execPath,prefixArgs:[fixture]})};
  assert.equal(await main(['routed',directory,'Explain'],output,undefined,undefined,factories),0);
  const result=JSON.parse(lines.at(-1));const decision=result.events.find(e=>e.kind==='routing-decision');
  assert.equal(decision.data.selected.model,'fixture-model');assert.equal(decision.data.hardSpendingGuarantee,false);
  assert.ok(decision.seq<result.events.find(e=>e.kind==='provider-starting').seq);
  const args=JSON.parse(readFileSync(observed,'utf8'));assert.equal(args[args.indexOf('--model')+1],'fixture-model');
  assert.equal(args[args.indexOf('--config')+1],'model_reasoning_effort="high"');
  process.env.CODOVYN_ROUTING_POLICY=JSON.stringify({...policy,budget:{taskUsd:1}});let called=false;
  assert.equal(await main(['routed',directory,'Explain'],output,undefined,undefined,{createCodexAdapter:()=>{called=true;throw Error('must not spawn');}}),1);
  assert.equal(called,false);assert.equal(JSON.parse(lines.at(-1)).routing.selected,null);
 } finally {
  if(oldData===undefined)delete process.env.CODOVYN_DATA_DIR;else process.env.CODOVYN_DATA_DIR=oldData;
  if(oldPolicy===undefined)delete process.env.CODOVYN_ROUTING_POLICY;else process.env.CODOVYN_ROUTING_POLICY=oldPolicy;
  rmSync(directory,{recursive:true,force:true});
 }
});

test('concurrent routed requests with stale previews cannot reserve the same remaining monthly estimate',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'codovyn-budget-dispatch-'));
 const oldData=process.env.CODOVYN_DATA_DIR,oldPolicy=process.env.CODOVYN_ROUTING_POLICY;
 try {
  const repository=join(directory,'repo');execFileSync('git',['init','-q',repository]);
  process.env.CODOVYN_DATA_DIR=join(directory,'data');
  process.env.CODOVYN_ROUTING_POLICY=JSON.stringify({mode:'economy',tokens:{input:1000,output:1000},budget:{monthUsd:0.003,monthSpentUsd:0},
    models:[{id:'fixture',provider:'codex',model:'fixture',quality:90,reliability:1,reasoning:[],capabilities:['streaming','tools'],availability:'available',price:{inputPerMillionUsd:1,outputPerMillionUsd:1,source:'fixture only'}}]});
  let calls=0;const adapters={createCodexAdapter:()=>{calls++;return {id:'codex',capabilities:{streaming:true,tools:true,writes:false},availability:async()=> 'available',async *run(){yield {type:'completed'};}};}};
  const outputs=[[],[]];const results=await Promise.all(outputs.map(lines=>main(['routed',repository,'Explain'],{log:x=>lines.push(x),error:()=>{}},undefined,undefined,adapters)));
  assert.deepEqual([...results].sort(),[0,1]);assert.equal(calls,1);
  const rejected=JSON.parse(outputs[results.indexOf(1)].at(-1));assert.equal(rejected.budgetRejected,true);
  const accepted=JSON.parse(outputs[results.indexOf(0)].at(-1));
  assert.ok(accepted.events.find(e=>e.kind==='budget-reserved').seq<accepted.events.find(e=>e.kind==='agent-started').seq);
  assert.equal(accepted.events.find(e=>e.kind==='budget-reserved').data.hardSpendingGuarantee,false);
 }finally{
  if(oldData===undefined)delete process.env.CODOVYN_DATA_DIR;else process.env.CODOVYN_DATA_DIR=oldData;
  if(oldPolicy===undefined)delete process.env.CODOVYN_ROUTING_POLICY;else process.env.CODOVYN_ROUTING_POLICY=oldPolicy;
  rmSync(directory,{recursive:true,force:true});
 }
});
