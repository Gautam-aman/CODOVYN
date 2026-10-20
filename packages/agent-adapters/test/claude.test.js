import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClaudeAdapter, parseClaudeEvent } from '../src/index.js';

async function withSimulatedCli(source, run) {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-claude-'));
  try {
    const script = join(directory, 'claude.cjs');
    writeFileSync(script, source);
    await run(createClaudeAdapter({ cwd: process.cwd(), command: process.execPath, prefixArgs: [script] }));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('Claude stream text and successful result map to shared events', () => {
  assert.deepEqual(parseClaudeEvent({ type: 'stream_event', event: { delta: { type: 'text_delta', text: 'Hello' } } }),
    { type: 'text', text: 'Hello' });
  assert.deepEqual(parseClaudeEvent({ type: 'result', subtype: 'success', is_error: false,
    usage: { input_tokens: 2 }, total_cost_usd: 0.001 }),
  { type: 'completed', usage: { input_tokens: 2 }, estimatedCostUsd: 0.001 });
  assert.equal(parseClaudeEvent({ type: 'system', subtype: 'init' }), null);
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
