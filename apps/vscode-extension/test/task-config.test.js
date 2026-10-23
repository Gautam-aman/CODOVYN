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

test('Ask and Plan cannot acquire write permission and Agent requires an explicit draft scope', () => {
  const base = { provider: 'codex', modelId: null, routingMode: 'manual', reasoning: null };
  for (const intent of ['ask', 'plan']) {
    assert.equal(resolveTaskMode({ ...base, intent, permission: 'read' }), 'codex');
    assert.throws(() => validateTaskConfiguration({ ...base, intent, permission: 'read-write' }), /read-only/);
  }
  assert.equal(resolveTaskMode({ ...base, intent: 'agent', permission: 'read-write' }), 'codex-edit');
  assert.throws(() => validateTaskConfiguration({ ...base, intent: 'agent', permission: 'read' }), /draft-write/);
});

test('saved composer preferences validate bounded favorites and keep permissions host-validated', () => {
  const { validateComposerPreferences } = createRequire(import.meta.url)('../task-config.cjs');
  const input = { version: 1, selection: { provider: 'codex', modelId: null, permission: 'read', routingMode: 'manual', reasoning: null, intent: 'ask' }, favorites: ['default:codex'], recent: ['auto'] };
  assert.deepEqual(validateComposerPreferences(input).favorites, ['default:codex']);
  assert.throws(() => validateComposerPreferences({ ...input, favorites: ['command:execute'] }), TypeError);
  assert.throws(() => validateComposerPreferences({ ...input, selection: { ...input.selection, permission: 'read-write' } }), TypeError);
  assert.throws(() => validateComposerPreferences({ ...input, recent: Array(100).fill('auto') }), TypeError);
});
