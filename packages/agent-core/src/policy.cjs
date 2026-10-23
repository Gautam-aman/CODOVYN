const providers = Object.freeze(['codex', 'gemini', 'claude']);
const defaultPolicy = Object.freeze({ primary: 'codex', fallbacks: Object.freeze(['gemini']), automatic: false, geminiModel: '' });
function validateAgentPolicy(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    Object.keys(input).some(key => !['primary', 'fallbacks', 'automatic', 'geminiModel', 'restorePrimary','prepareOpenCode'].includes(key))) throw new TypeError('Invalid agent policy');
  const { primary, fallbacks, automatic, geminiModel = '' } = input;
  if (!providers.includes(primary) || !Array.isArray(fallbacks) || fallbacks.length > 2 ||
    fallbacks.some(id => !providers.includes(id) || id === primary) || new Set(fallbacks).size !== fallbacks.length ||
    typeof automatic !== 'boolean') throw new TypeError('Choose a primary and unique ordered backups');
  if (typeof geminiModel !== 'string' || geminiModel.length > 128 ||
    (geminiModel && !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(geminiModel))) throw new TypeError('Invalid Gemini model');
  if(input.restorePrimary!==undefined&&typeof input.restorePrimary!=='boolean')throw new TypeError('Invalid restoration preference');
  if(input.prepareOpenCode!==undefined&&(typeof input.prepareOpenCode!=='boolean'||input.prepareOpenCode&&primary!=='codex'))throw new TypeError('ContextFlow preparation requires Codex primary; consent is always separate');
  return { ...(input.prepareOpenCode!==undefined?{prepareOpenCode:input.prepareOpenCode}:{}), ...(input.restorePrimary!==undefined?{restorePrimary:input.restorePrimary}:{}), primary, fallbacks: [...fallbacks], automatic, geminiModel };
}
function policyCandidates(input) {
  const policy = validateAgentPolicy(input);
  return [policy.primary, ...(policy.automatic ? policy.fallbacks : [])];
}
module.exports = { providers, defaultPolicy, validateAgentPolicy, policyCandidates };
