import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexAdapter, parseCodexEvent, classifyCodexError } from '../src/index.js';

test('maps documented Codex JSONL events without treating text as tool execution', () => {
  assert.deepEqual(parseCodexEvent({ type: 'item.started', item: { id: 'a', type: 'command_execution' } }), { type: 'tool-start', actionId: 'a', action: 'command_execution' });
  assert.deepEqual(parseCodexEvent({ type: 'item.completed', item: { id: 'a', type: 'command_execution' } }), { type: 'tool-complete', actionId: 'a', action: 'command_execution' });
  assert.deepEqual(parseCodexEvent({ type: 'item.completed', item: { type: 'agent_message', text: 'hello' } }), { type: 'text', text: 'hello' });
  assert.deepEqual(parseCodexEvent({ type: 'turn.completed', usage: { input_tokens: 12 } }), { type: 'completed', usage: { input_tokens: 12 } });
});

test('only structured provider codes confirm quota or authentication failures', () => {
  assert.equal(classifyCodexError({ status: 429 }), 'quota');
  assert.equal(classifyCodexError({ code: 401 }), 'authentication');
  assert.equal(classifyCodexError({ message: 'rate limit' }), 'fatal');
});

test('runs a local JSONL command through the Codex adapter without shell interpolation', async () => {
  const script = `process.stdin.resume(); let p=''; process.stdin.on('data', c => p += c); process.stdin.on('end', () => { if (!p.includes('Inspect this repository')) process.exit(2); console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'reviewed'}})); console.log(JSON.stringify({type:'turn.completed'})); });`;
  const adapter = createCodexAdapter({ cwd: process.cwd(), command: process.execPath, prefixArgs: ['-e', script] });
  const events = [];
  for await (const event of adapter.run({ handoff: { request: 'Inspect this repository', snapshot: { branch: 'test' } } })) events.push(event);
  assert.deepEqual(events.map((event) => event.type), ['text', 'completed']);
});

test('cancels a running Codex subprocess without waiting for its reply', async () => {
  const script = `process.stdin.resume(); process.stdin.on('end', () => setTimeout(() => console.log(JSON.stringify({type:'turn.completed'})), 5000));`;
  const adapter = createCodexAdapter({ cwd: process.cwd(), command: process.execPath, prefixArgs: ['-e', script] });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30);
  try {
    await assert.rejects(async () => {
      for await (const _event of adapter.run({ handoff: { request: 'Inspect', snapshot: {} }, signal: controller.signal })) {}
    }, (error) => error.kind === 'cancelled');
  } finally { clearTimeout(timer); }
});
