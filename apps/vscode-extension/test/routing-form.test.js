import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { validateModel } = createRequire(import.meta.url)('../media/routing-form.cjs');
const validModel = {
  id: 'codex-balanced', provider: 'codex', model: 'gpt-codex', quality: 80, reliability: 0.9,
  availability: 'unknown', capabilities: ['streaming', 'tools'], reasoning: ['high'], priceFields: [],
};

test('routing catalogue accepts a valid user-supplied model policy', () => {
  assert.deepEqual(validateModel(validModel), {});
});

test('routing catalogue reports errors per invalid field', () => {
  const errors = validateModel({ ...validModel, id: '../bad', provider: 'other', model: '', quality: 101,
    reliability: -1, availability: 'maybe', capabilities: ['unknown'], reasoning: ['bad value'],
    priceFields: ['-1', 'unknown', ''] });
  assert.deepEqual(Object.keys(errors).sort(), ['availability', 'capabilities', 'id', 'model', 'price', 'provider', 'quality', 'reasoning', 'reliability'].sort());
});

test('catalogue rejects duplicate capability and reasoning entries', () => {
  const errors = validateModel({ ...validModel, capabilities: ['tools', 'tools'], reasoning: ['high', 'high'] });
  assert.equal(errors.capabilities, 'Use unique capabilities: streaming, tools, writes.');
  assert.match(errors.reasoning, /unique reasoning identifiers/);
});

test('catalogue accepts complete non-negative user-provided price evidence', () => {
  assert.deepEqual(validateModel({ ...validModel, priceFields: ['0.25', '1.5', 'provider documentation'] }), {});
});

test('catalogue rejects incomplete or overlong price evidence', () => {
  assert.ok(validateModel({ ...validModel, priceFields: ['0.25', '', 'source'] }).price);
  assert.ok(validateModel({ ...validModel, priceFields: ['0.25', '1.5', 'x'.repeat(201)] }).price);
});
