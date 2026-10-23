'use strict';

const providers = new Set(['auto', 'configured', 'codex', 'claude', 'gemini']);
const routingModes = new Set(['manual', 'auto', 'economy', 'balanced', 'performance', 'custom']);
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(value);

function validateTaskConfiguration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !['provider', 'modelId', 'permission', 'routingMode', 'reasoning', 'intent'].includes(key)) ||
    !providers.has(value.provider) ||
    (value.modelId !== null && !identifier(value.modelId)) ||
    !['read', 'read-write'].includes(value.permission) ||
    !routingModes.has(value.routingMode) ||
    (value.reasoning !== null && !identifier(value.reasoning))) {
    throw new TypeError('Invalid task configuration. Choose a supported provider, model, permission and routing mode.');
  }
  if (value.intent !== undefined && (!['ask', 'agent', 'plan'].includes(value.intent) ||
    value.permission !== (value.intent === 'agent' ? 'read-write' : 'read'))) {
    throw new TypeError('Ask and Plan require read-only permission; Agent requires explicit draft-write permission.');
  }
  if (value.provider === 'configured' && (value.modelId !== null || value.routingMode !== 'manual')) {
    throw new TypeError('Configured agent preferences do not accept a model or routing override.');
  }
  if (value.provider !== 'auto' && value.routingMode !== 'manual') {
    throw new TypeError('Routing strategies require the Auto provider.');
  }
  if (value.provider === 'auto' && value.routingMode === 'custom' && value.modelId === null) {
    throw new TypeError('Choose a configured model for custom routing.');
  }
  if (value.provider === 'auto' && value.routingMode !== 'custom' && value.modelId !== null) {
    throw new TypeError('A directly selected model requires custom routing.');
  }
  if (value.reasoning !== null && value.modelId === null) {
    throw new TypeError('Choose a model before selecting a reasoning effort.');
  }
  return Object.freeze({
    provider: value.provider,
    modelId: value.modelId,
    permission: value.permission,
    routingMode: value.routingMode,
    reasoning: value.reasoning,
    ...(value.intent !== undefined ? { intent: value.intent } : {}),
  });
}

function resolveTaskMode(configuration) {
  const task = validateTaskConfiguration(configuration);
  const suffix = task.permission === 'read-write' ? '-edit' : '';
  if (task.provider === 'auto') return `routed${suffix}`;
  if (task.provider === 'configured') return `configured${suffix}`;
  if (task.modelId) return `routed${suffix}`;
  return `${task.provider}${suffix}`;
}

function validateComposerPreferences(value) {
  if (!value || value.version !== 1 || Object.keys(value).some(key => !['version','selection','favorites','recent'].includes(key))) throw new TypeError('Invalid composer preferences');
  const selection = validateTaskConfiguration(value.selection);
  const keys = list => {
    if (!Array.isArray(list) || list.length > 32 || list.some(key => typeof key !== 'string' || !/^(auto|default:(codex|gemini|claude)|model:[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127})$/.test(key))) throw new TypeError('Invalid saved model list');
    return [...new Set(list)];
  };
  return { version: 1, selection, favorites: keys(value.favorites), recent: keys(value.recent).slice(0, 8) };
}
module.exports = { validateTaskConfiguration, resolveTaskMode, validateComposerPreferences };
