import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentFailure, AgentRegistry } from '../src/index.js';

const adapter = (id) => ({ id, capabilities: { resume: false, tools: false }, availability: async () => 'available', async *run() { yield { type: 'completed', text: 'done' }; } });

test('registers and retrieves adapters in registration order', () => {
  const registry = new AgentRegistry();
  registry.register(adapter('one'));
  registry.register(adapter('two'));
  assert.deepEqual(registry.list().map((item) => item.id), ['one', 'two']);
  assert.equal(registry.require('one').id, 'one');
});

test('rejects malformed or duplicate adapters', () => {
  const registry = new AgentRegistry();
  assert.throws(() => registry.register(adapter('Bad ID')), /lowercase slug/);
  assert.throws(() => registry.register({ id: 'bad', capabilities: {} }), /must implement/);
  registry.register(adapter('valid'));
  assert.throws(() => registry.register(adapter('valid')), /already registered/);
  assert.throws(() => registry.require('missing'), /Unknown adapter/);
});

test('failure kind remains inspectable', () => {
  const error = new AgentFailure('quota', 'limit reached');
  assert.equal(error.kind, 'quota');
});
