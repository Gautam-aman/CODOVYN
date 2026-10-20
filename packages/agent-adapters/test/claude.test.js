import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClaudeEvent } from '../src/index.js';

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
