import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGeminiAdapter } from '../src/index.js';
async function fixture(source, run, write = false) {
  const directory = await mkdtemp(join(tmpdir(), 'codovyn-gemini-fixture-'));
  try {
    const script = join(directory, 'cli.cjs');
    await writeFile(script, source);
    await run(createGeminiAdapter({ cwd: directory, command: process.execPath, prefixArgs: [script], write }));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
const emit = event => `console.log(${JSON.stringify(JSON.stringify(event))});`;
const prompt = source => `process.stdin.resume();process.stdin.on('end',()=>{${source}});`;
test('Gemini headless policy constrains tools, disables hooks, and waits for exit before success', async () => {
  await fixture(`const fs=require('fs');const a=process.argv;const p=fs.readFileSync(a[a.indexOf('--admin-policy')+1],'utf8');
    const s=JSON.parse(fs.readFileSync(process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH));
    if(!p.includes('decision = "deny"')||p.includes('toolName = "write_file"')||s.hooksConfig.enabled!==false||a[a.indexOf('--approval-mode')+1]!=='default')process.exit(3);
    ${prompt(emit({ type:'tool_use',tool_id:'r1',tool_name:'read_file' })+emit({ type:'tool_result',tool_id:'r1',status:'success' })+emit({type:'result',status:'success'}))}`, async adapter => {
    const events = [];
    for await (const e of adapter.run({ handoff:{request:'Inspect'} })) events.push(e);
    assert.deepEqual(events.map(e=>e.type),['tool-start','tool-complete','completed']);
    assert.equal(events[0].safeToRetry,true);
  });
});
test('Gemini file edits are explicit and never marked retryable', async () => {
  await fixture(prompt(emit({type:'tool_use',tool_id:'w1',tool_name:'write_file'})+emit({type:'tool_result',tool_id:'w1',status:'success'})+emit({type:'result',status:'success'})), async adapter => {
    const events=[];for await(const e of adapter.run({handoff:{request:'Edit'}}))events.push(e);
    assert.equal(events[0].safeToRetry,false);assert.equal(adapter.capabilities.writes,true);
  },true);
});
test('Gemini rejects malformed streams, unresolved tools, disallowed shell, auth failure and nonzero exit', async () => {
  const cases = [
    ['console.log("not json")','fatal'],
    [emit({type:'tool_use',tool_id:'t',tool_name:'read_file'})+emit({type:'result',status:'success'}),'fatal'],
    [emit({type:'tool_use',tool_id:'t',tool_name:'run_shell_command'}),'fatal'],
    [emit({type:'result',status:'error',error:{type:'FatalAuthenticationError',message:'PRIVATE'}}),'authentication'],
    [emit({type:'result',status:'success'})+'process.exitCode=1;','fatal'],
  ];
  for(const [source,kind] of cases)await fixture(prompt(source),async adapter=>{
    await assert.rejects(async()=>{for await(const e of adapter.run({handoff:{request:'Inspect'}}))void e;},e=>e.kind===kind&&!e.message.includes('PRIVATE'));
  });
});
test('Gemini cancellation settles before adapter disposal and never produces completion', async () => {
  await fixture(prompt(emit({type:'message',role:'assistant',content:'started'})+'setInterval(()=>{},1000);'),async adapter=>{
    const controller=new AbortController();let saw=false;
    await assert.rejects(async()=>{for await(const e of adapter.run({handoff:{request:'Inspect'},signal:controller.signal})){saw=true;controller.abort();assert.notEqual(e.type,'completed');}},e=>e.kind==='cancelled');
    assert.equal(saw,true);
  });
});
