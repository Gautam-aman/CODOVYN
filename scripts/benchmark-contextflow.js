import { performance } from 'node:perf_hooks';
import { createContextFlow,contextFlowAccounting,digest } from '../packages/agent-core/src/contextflow.js';
// Local serialization benchmark only. No inference, tokens, prices or correctness scores are inferred.
const cases=[{name:'short-history',messages:1},{name:'repeated-long-history',messages:120}];
const results=cases.map(({name,messages})=>{
 const task={id:'contextflow-benchmark',request:'Add a utility test. Preserve existing behavior and review changes before application.'};
 const snapshot={root:'/disposable/benchmark',branch:'main',commit:'fixture-baseline',changedPaths:[]};
 const history=Array.from({length:messages},(_,i)=>({seq:i+1,kind:'agent-event',data:{agent:'codex',event:{type:'text',text:`Provider report ${i}: `+'Inspect the utility and verify the expected behavior. '.repeat(12)}}}));
 const baseline=JSON.stringify({request:task.request,snapshot,history});const started=performance.now();
 const packet=createContextFlow({task,snapshot,fingerprint:digest('baseline'),originalFingerprint:digest('baseline'),history,reason:'user-requested-switch',destinationModel:'fixture/model'});
 const metrics=contextFlowAccounting(packet);
 return {name,baselineUtf8Bytes:Buffer.byteLength(baseline),contextFlowUtf8Bytes:metrics.utf8Bytes,byteDifference:metrics.utf8Bytes-Buffer.byteLength(baseline),serializationMs:Number((performance.now()-started).toFixed(3)),inputTokens:null,outputTokens:null,costUsd:null,providerCalls:0,completionOutcome:'not tested',provenance:'synthetic local UTF-8 serialization; manual full-journal baseline'};
});
console.log(JSON.stringify({version:1,environment:{node:process.version,platform:process.platform,arch:process.arch},results,limitations:'Byte sizes are not token usage, cost savings, provider latency, or evidence of successful continuation. Short histories may grow due to verification metadata.'},null,2));
