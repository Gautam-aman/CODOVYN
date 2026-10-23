import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCodexReasoning } from '../src/codex-models.js';

const fixture = `const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(!['initialize','initialized','model/list','config/read'].includes(m.method))process.exit(5); if(m.id) console.log(JSON.stringify({id:m.id,result:m.id===1?{}:m.id===2?{data:[{model:'recommended',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'low'}]},{model:'configured',supportedReasoningEfforts:[{reasoningEffort:'high'},{reasoningEffort:'invented'}]}]}:{config:{model:'configured',secret:'never-export'}}}));});`;
test('Codex metadata follows initialize, reads configured default and exports only bounded capabilities', async () => {
 const result = await inspectCodexReasoning({cwd:process.cwd(),command:process.execPath,prefixArgs:['-e',fixture]});
 assert.equal(result.defaultModel,'configured'); assert.deepEqual(result.models[1].reasoning,['high']);
 assert.equal(JSON.stringify(result).includes('never-export'),false);
});
test('metadata errors, malformed output, timeouts and missing CLI fail closed and stop owned process', async () => {
 for(const script of [`console.log('bad-json')`, `process.stdin.resume();setInterval(()=>{},1000)`, `console.log(JSON.stringify({id:1,error:{message:'secret'}}))`]) {
  await assert.rejects(inspectCodexReasoning({cwd:process.cwd(),command:process.execPath,prefixArgs:['-e',script],timeout:150}));
 }
 await assert.rejects(inspectCodexReasoning({cwd:process.cwd(),command:'/missing/codex',timeout:150}));
});
