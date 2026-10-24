import test from 'node:test';import assert from 'node:assert/strict';import {contextFlowUsage} from '../src/contextflow-usage.js';
const start=agent=>({kind:'agent-started',data:{agent}});const report=usage=>({kind:'agent-event',data:{agent:'codex',event:{type:'completed',usage}}});
test('ContextFlow telemetry keeps attempt provenance and suppresses duplicate cumulative reports',()=>{
 const usage={input_tokens:200,output_tokens:30,cached_input_tokens:100};const result=contextFlowUsage([start('codex'),report(usage),report(usage),start('opencode')]);
 assert.equal(result.attempts[0].usage.inputTokens,200);assert.equal(result.attempts[0].duplicateReports,1);assert.equal(result.attempts[1].usage,null);assert.equal(result.costUsd,null);assert.equal(result.aggregateTokens,null);
});
test('different reports and malformed usage never become invented totals',()=>{
 const result=contextFlowUsage([start('codex'),report({input_tokens:20}),report({input_tokens:30}),start('codex'),report({input_tokens:-1,output_tokens:'12'})]);assert.equal(result.attempts[0].usage,null);assert.equal(result.attempts[0].reports.length,2);assert.equal(result.attempts[1].status,'unknown');
});
