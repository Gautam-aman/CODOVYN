import test from 'node:test';
import assert from 'node:assert/strict';
import policy from '../src/policy.cjs';
const { defaultPolicy, validateAgentPolicy, policyCandidates } = policy;
test('agent policy requires explicit automatic switching and preserves ordered backups', () => {
  assert.deepEqual(policyCandidates(defaultPolicy), ['codex']);
  assert.deepEqual(policyCandidates({ primary:'gemini', fallbacks:['claude','codex'], automatic:true }), ['gemini','claude','codex']);
  const parsed=validateAgentPolicy(defaultPolicy);parsed.fallbacks.pop();assert.equal(defaultPolicy.fallbacks.length,1);
});
test('agent policies reject duplicate unknown and executable configuration fields', () => {
  for(const input of [null, [], {...defaultPolicy,fallbacks:['codex']}, {...defaultPolicy,fallbacks:['gemini','gemini']},
    {...defaultPolicy,primary:'unknown'}, {...defaultPolicy,automatic:'true'}, {...defaultPolicy,command:'sh'},
    {...defaultPolicy,geminiModel:'--approval-mode=yolo'}, {...defaultPolicy,geminiModel:'a\nb'}]) assert.throws(()=>validateAgentPolicy(input));
  assert.equal(validateAgentPolicy({...defaultPolicy,geminiModel:'explicit-model'}).geminiModel,'explicit-model');
});
