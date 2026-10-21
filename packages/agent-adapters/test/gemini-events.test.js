import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { boundedJsonLines } from '../src/jsonl.js';
import { parseGeminiEvent } from '../src/gemini-events.js';
test('Gemini normalizes observable sessions tools messages and bounded usage without tool payloads', () => {
  assert.deepEqual(parseGeminiEvent({ type: 'init', session_id: 's1', model: 'selected' }), { type: 'session', sessionId: 's1', model: 'selected' });
  assert.deepEqual(parseGeminiEvent({ type: 'tool_use', tool_id: 't1', tool_name: 'read_file', parameters: { secret: 'private' } }), { type: 'tool-start', actionId: 't1', action: 'read_file' });
  assert.equal(parseGeminiEvent({ type: 'message', role: 'user', content: 'prompt' }), null);
  assert.equal(parseGeminiEvent({ type: 'message', role: 'assistant', content: 'answer', delta: true }).text, 'answer');
  assert.deepEqual(parseGeminiEvent({ type: 'result', status: 'success', stats: { input_tokens: 3, output_tokens: -1, secret: 'private' } }).usage, { input_tokens: 3 });
});
test('Gemini classifies only supported error types and never guesses quota from text', () => {
  for (const error of [{ type: 'ApiError', message: '429 quota exceeded', code: 429 }, { type: 'Error', message: 'secret' }]) {
    assert.throws(() => parseGeminiEvent({ type: 'result', status: 'error', error }), e => e.kind === 'fatal' && !e.message.includes('secret'));
  }
  assert.throws(() => parseGeminiEvent({ type: 'result', status: 'error', error: { type: 'FatalAuthenticationError' } }), e => e.kind === 'authentication');
  assert.throws(() => parseGeminiEvent({ type: 'tool_use', tool_name: 'write_file' }), /Malformed/);
});
test('JSONL reader bounds bytes before newline and handles split UTF-8 safely', async () => {
  const values = [];
  for await (const item of boundedJsonLines(Readable.from([Buffer.from('{"text":"é"}\n').subarray(0, 10), Buffer.from('{"text":"é"}\n').subarray(10)]))) values.push(item);
  assert.deepEqual(values, [{ text: 'é' }]);
  await assert.rejects(async () => { for await (const item of boundedJsonLines(Readable.from(['x'.repeat(33)]), 32)) void item; }, /size limit/);
  await assert.rejects(async () => { for await (const item of boundedJsonLines(Readable.from(['[]\n']))) void item; }, /malformed/);
});
