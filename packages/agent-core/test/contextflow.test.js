import test from 'node:test';import assert from 'node:assert/strict';
import {createContextFlow,validateContextFlow,contextFlowAccounting,redactContext,contextPath,digest}from'../src/contextflow.js';
const input=()=>({task:{id:'context-test',request:'Implement the utility; password=private-value',step:1},snapshot:{root:'/sample',branch:'main',commit:'abc123',changedPaths:[]},fingerprint:digest('work'),originalFingerprint:digest('original'),reason:'quota',history:[]});
test('ContextFlow preserves provenance and unknown usage while redacting original instructions',()=>{
 const packet=createContextFlow(input());assert.match(packet.task.objective,/password=\[REDACTED\]/);assert.equal(packet.context.testResults.length,0);assert.equal(packet.accounting.reportedInputTokens,null);assert.equal(packet.handoff.requiresApproval,true);
 const metrics=contextFlowAccounting(packet);assert.equal(metrics.utf8Bytes,Buffer.byteLength(JSON.stringify(packet)));assert.equal(metrics.sha256,digest(JSON.stringify(packet)));assert.equal(metrics.inputTokens,null);
});
test('ContextFlow rejects incompatible versions, external fields, excessive bounds and unredacted text',()=>{
 for(const mutate of [p=>p.version=2,p=>p.context.hiddenReasoning='private',p=>delete p.accounting.reportedInputTokens,p=>p.task.objective='api_key=private-value',p=>p.context.files=[{path:'../private',sha256:digest('x'),excerpt:'x',verification:'host-read',truncated:false}],p=>p.task.requirements=Array(17).fill('more'),p=>p.context.pendingSteps=['x'.repeat(513)]]){const p=createContextFlow(input());mutate(p);assert.throws(()=>validateContextFlow(p));}
});
test('ContextFlow never upgrades provider test claims to host-verified evidence and deduplicates reports',()=>{
 const data=input();data.history=[1,2].map(seq=>({seq,kind:'agent-event',data:{agent:'codex',event:{type:'text',text:'All tests passed'}}}));
 const packet=createContextFlow(data);assert.equal(packet.context.providerClaims.length,1);assert.equal(packet.context.providerClaims[0].verification,'provider-reported');assert.deepEqual(packet.context.testResults,[]);
});
test('unresolved actions are retained by legacy ledger and block ContextFlow instead of being truncated',()=>{
 const data=input();data.history=[{kind:'agent-event',data:{agent:'codex',event:{type:'tool-start',actionId:'write1',action:'file_change'}}}];assert.throws(()=>createContextFlow(data),/Unresolved/);
 data.history.push({kind:'agent-event',data:{agent:'codex',event:{type:'tool-complete',actionId:'write1'}}});const p=createContextFlow(data);assert.equal(p.context.actions[0].state,'completion-reported');assert.equal(p.context.actions[0].success,null);
});
test('sensitive paths and known token formats are excluded without a perfect-detection claim',()=>{
 for(const path of ['.env','.env.local','.ssh/id_rsa','secrets/key.txt','src/../file','a\\b','auth.json','private.pem','/outside','node_modules/x.js'])assert.equal(contextPath(path),false,path);
 assert.equal(contextPath('src/Main.java'),true);assert.equal(redactContext('Bearer abcdefghijklmnop'),'Bearer [REDACTED]');assert.equal(redactContext('ghp_'+ 'a'.repeat(30)),'[REDACTED TOKEN]');
});
