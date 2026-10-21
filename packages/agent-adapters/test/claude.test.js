import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClaudeAdapter, parseClaudeEvent } from '../src/index.js';

async function withSimulatedCli(source, run, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-claude-'));
  try {
    const script = join(directory, 'claude.cjs');
    writeFileSync(script, source);
    await run(createClaudeAdapter({ cwd: process.cwd(), command: process.execPath, prefixArgs: [script], ...options }));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('Claude stream text and successful result map to shared events', () => {
  assert.deepEqual(parseClaudeEvent({ type: 'stream_event', event: { delta: { type: 'text_delta', text: 'Hello' } } }),
    { type: 'text', text: 'Hello' });
  assert.deepEqual(parseClaudeEvent({ type: 'result', subtype: 'success', is_error: false,
    usage: { input_tokens: 2 }, total_cost_usd: 0.001 }),
  { type: 'completed', usage: { input_tokens: 2 }, estimatedCostUsd: 0.001 });
  assert.equal(parseClaudeEvent({ type: 'system', subtype: 'init' }), null);
  assert.deepEqual(parseClaudeEvent({ type: 'stream_event', event: { type: 'content_block_start',
    content_block: { type: 'tool_use', id: 'tool-1', name: 'Edit' } } }),
  { type: 'tool-start', actionId: 'tool-1', action: 'Edit' });
});

test('Claude failures do not infer quota from unstructured text', () => {
  assert.throws(() => parseClaudeEvent({ type: 'result', subtype: 'error_during_execution',
    is_error: true, result: 'rate limit maybe' }), (error) => error.kind === 'fatal');
});

test('Claude adapter runs a simulated JSONL CLI with read-only tools', async () => {
  const script = `const a=process.argv.slice(1); if (!a.includes('--bare') ||
    a[a.indexOf('--tools')+1] !== 'Read,Glob,Grep' || !a.includes('--no-session-persistence')) process.exit(2);
    let p=''; process.stdin.on('data', c => p += c); process.stdin.on('end', () => {
    if (!p.includes('Inspect repository')) process.exit(3);
    console.log(JSON.stringify({type:'stream_event',event:{delta:{type:'text_delta',text:'Reviewed'}}}));
    console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,result:'Reviewed'})); });`;
  await withSimulatedCli(script, async (adapter) => {
    const events = [];
    for await (const event of adapter.run({ handoff: { request: 'Inspect repository', snapshot: { branch: 'main' } } })) {
      events.push(event);
    }
    assert.deepEqual(events.map((event) => event.type), ['text', 'completed']);
    assert.equal(events[0].text, 'Reviewed');
  });
});

test('Claude edit mode limits tools and streams file edit activity', async () => {
  const script = `const a=process.argv.slice(1); if (a[a.indexOf('--permission-mode')+1] !== 'acceptEdits' ||
    a[a.indexOf('--tools')+1] !== 'Read,Glob,Grep,Edit,Write' ||
    a[a.indexOf('--disallowedTools')+1] !== 'mcp__*' || !a.includes('--permission-prompts')) process.exit(2);
    let p=''; process.stdin.on('data', c => p += c); process.stdin.on('end', () => {
    if (!p.includes('isolated draft workspace')) process.exit(3);
    console.log(JSON.stringify({type:'stream_event',event:{type:'content_block_start',content_block:{type:'tool_use',id:'edit-1',name:'Edit'}}}));
    console.log(JSON.stringify({type:'user',message:{content:[{type:'tool_result',tool_use_id:'edit-1'}]}}));
    console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,result:'Edited'})); });`;
  await withSimulatedCli(script, async (adapter) => {
    assert.equal(adapter.capabilities.writes, true);
    const events = [];
    for await (const event of adapter.run({ handoff: { request: 'Edit a file', snapshot: {} } })) events.push(event);
    assert.deepEqual(events.map((event) => event.type), ['tool-start', 'tool-complete', 'text', 'completed']);
    assert.equal(events[1].actionId, 'edit-1');
  }, { write: true });
});

test('Claude adapter falls back to final result when no partial text arrived', async () => {
  const script = `process.stdin.resume(); process.stdin.on('end', () =>
    console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,result:'Final answer'})));`;
  await withSimulatedCli(script, async (adapter) => {
    const events = [];
    for await (const event of adapter.run({ handoff: { request: 'Inspect', snapshot: {} } })) events.push(event);
    assert.deepEqual(events.map((event) => event.type), ['text', 'completed']);
    assert.equal(events[0].text, 'Final answer');
  });
});

test('Claude adapter cancels an in-flight local process', async () => {
  const script = `process.stdin.resume(); process.stdin.on('end', () =>
    setTimeout(() => console.log(JSON.stringify({type:'result',subtype:'success'})), 5000));`;
  await withSimulatedCli(script, async (adapter) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30);
    try {
      await assert.rejects(async () => {
        for await (const _event of adapter.run({ handoff: { request: 'Inspect', snapshot: {} },
          signal: controller.signal })) {}
      }, (error) => error.kind === 'cancelled');
    } finally { clearTimeout(timer); }
  });
});
