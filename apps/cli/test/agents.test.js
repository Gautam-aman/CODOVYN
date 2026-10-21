import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentFailure } from '../../../packages/agent-core/src/index.js';
import { main } from '../src/index.js';

test('CLI auto mode hands a confirmed Codex quota failure to Claude', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-auto-'));
  const repository = join(directory, 'repo');
  const previous = process.env.CODOVYN_DATA_DIR;
  try {
    mkdirSync(repository);
    execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main']);
    process.env.CODOVYN_DATA_DIR = join(directory, 'data');
    const lines = [];
    const adapters = {
      createCodexAdapter: ({ cwd }) => ({ id: 'codex', capabilities: { writes: false },
        availability: async () => { assert.ok(cwd); return 'available'; },
        async *run() { throw new AgentFailure('quota', 'Structured quota'); } }),
      createClaudeAdapter: ({ cwd }) => ({ id: 'claude', capabilities: { writes: false },
        availability: async () => { assert.ok(cwd); return 'available'; },
        async *run({ handoff }) {
          if (handoff.request === 'Inspect repository') {
            assert.ok(handoff.history.some((event) => event.kind === 'checkpoint'));
          }
          yield { type: 'completed' };
        } }),
    };
    const output = { log: (line) => lines.push(line), error: () => assert.fail('unexpected usage error') };
    assert.equal(await main(['auto', repository, 'Inspect', 'repository'], output, undefined, undefined, adapters), 0);
    const result = JSON.parse(lines.at(-1));
    assert.equal(result.activeAgent, 'claude');
    assert.deepEqual(result.events.filter((event) => event.kind === 'handoff').map((event) => event.data.to), ['claude']);
    lines.length = 0;
    assert.equal(await main(['claude', repository, 'Inspect'], output, undefined, undefined, adapters), 0);
    assert.equal(JSON.parse(lines.at(-1)).activeAgent, 'claude');
  } finally {
    if (previous === undefined) delete process.env.CODOVYN_DATA_DIR;
    else process.env.CODOVYN_DATA_DIR = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('configured tasks honor explicit fallback consent and selected primary without auth probing', async () => {
  const directory = mkdtempSync(join(tmpdir(),'codovyn-policy-'));
  const repository=join(directory,'repo');mkdirSync(repository);
  const oldData=process.env.CODOVYN_DATA_DIR;
  const oldPolicy=process.env.CODOVYN_AGENT_POLICY;
  try {
    execFileSync('git',['init','-q',repository]);process.env.CODOVYN_DATA_DIR=join(directory,'data');
    const calls=[];const adapters={};
    for(const id of ['codex','gemini','claude'])adapters[`create${id==='codex'?'Codex':id==='gemini'?'Gemini':'Claude'}Adapter`]=()=>({id,capabilities:{writes:false},availability:async()=> 'available',async *run(){calls.push(id);if(id==='codex')throw new AgentFailure('quota','injected');yield {type:'completed'};}});
    const lines=[];const output={log:x=>lines.push(x),error:x=>assert.fail(x)};
    process.env.CODOVYN_AGENT_POLICY=JSON.stringify({primary:'codex',fallbacks:['gemini','claude'],automatic:false});
    assert.equal(await main(['configured',repository,'Inspect'],output,undefined,undefined,adapters),1);
    assert.deepEqual(calls,['codex']);calls.length=0;
    process.env.CODOVYN_AGENT_POLICY=JSON.stringify({primary:'codex',fallbacks:['gemini','claude'],automatic:true});
    assert.equal(await main(['configured',repository,'Inspect'],output,undefined,undefined,adapters),0);
    assert.deepEqual(calls,['codex','gemini']);
    assert.equal(JSON.parse(lines.at(-1)).activeAgent,'gemini');
    calls.length=0;
    assert.equal(await main(['agents',repository],output,undefined,undefined,adapters),0);
    assert.deepEqual(calls,[]);
    assert.ok(JSON.parse(lines.at(-1)).agents.every(a=>a.authentication==='unknown'&&a.availability==='unknown'));
  } finally {
    for(const [key,value] of [['CODOVYN_DATA_DIR',oldData],['CODOVYN_AGENT_POLICY',oldPolicy]])if(value===undefined)delete process.env[key];else process.env[key]=value;
    rmSync(directory,{recursive:true,force:true});
  }
});
