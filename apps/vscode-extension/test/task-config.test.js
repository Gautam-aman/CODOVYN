import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { validateTaskConfiguration, resolveTaskMode } = createRequire(import.meta.url)('../task-config.cjs');

test('task configuration keeps provider, model, permission, and routing independent', () => {
  const config = validateTaskConfiguration({ provider: 'auto', modelId: null,
    permission: 'read-write', routingMode: 'balanced', reasoning: null });
  assert.deepEqual(config, { provider: 'auto', modelId: null,
    permission: 'read-write', routingMode: 'balanced', reasoning: null });
  assert.equal(Object.isFrozen(config), true);
});

test('task configuration accepts explicit models and reasoning only through custom selection', () => {
  assert.deepEqual(validateTaskConfiguration({ provider: 'auto', modelId: 'catalog.codex-fast',
    permission: 'read', routingMode: 'custom', reasoning: 'low' }).modelId, 'catalog.codex-fast');
  assert.equal(resolveTaskMode({ provider: 'gemini', modelId: null, permission: 'read-write',
    routingMode: 'manual', reasoning: null }), 'gemini-edit');
  assert.equal(resolveTaskMode({ provider: 'codex', modelId: 'codex.fast', permission: 'read',
    routingMode: 'manual', reasoning: null }), 'routed');
});

test('task configuration rejects write-only, unknown providers, arbitrary fields, and invalid routing combinations', () => {
  const valid = { provider: 'codex', modelId: null, permission: 'read', routingMode: 'manual', reasoning: null };
  for (const value of [
    { ...valid, permission: 'write' },
    { ...valid, provider: 'openrouter' },
    { ...valid, admin: true },
    { ...valid, provider: 'codex', routingMode: 'balanced' },
    { ...valid, provider: 'auto', routingMode: 'custom' },
    { ...valid, modelId: null, reasoning: 'high' },
  ]) assert.throws(() => validateTaskConfiguration(value), TypeError);
});
