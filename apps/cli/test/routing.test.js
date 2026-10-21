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
