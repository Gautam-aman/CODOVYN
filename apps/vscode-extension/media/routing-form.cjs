(function (root) {
  'use strict';
  const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(value);
  function validateModel(model) {
    const errors = {};
    if (!identifier(model.id)) errors.id = 'Use 1–128 letters, numbers, dots, underscores, slashes or hyphens; start with a letter or number.';
    if (!['codex', 'gemini', 'claude'].includes(model.provider)) errors.provider = 'Choose a supported provider.';
    if (!identifier(model.model)) errors.model = 'Enter a valid provider model identifier.';
    if (!Number.isFinite(model.quality) || model.quality < 0 || model.quality > 100) errors.quality = 'Enter a policy score from 0 to 100.';
    if (!Number.isFinite(model.reliability) || model.reliability < 0 || model.reliability > 1) errors.reliability = 'Enter a policy score from 0 to 1.';
    if (!['available', 'unavailable', 'unknown'].includes(model.availability)) errors.availability = 'Choose an availability evidence state.';
    if (!Array.isArray(model.capabilities) || model.capabilities.some(value => !['streaming', 'tools', 'writes'].includes(value)) || new Set(model.capabilities).size !== model.capabilities.length) errors.capabilities = 'Use unique capabilities: streaming, tools, writes.';
    if (!Array.isArray(model.reasoning) || model.reasoning.some(value => !identifier(value)) || new Set(model.reasoning).size !== model.reasoning.length) errors.reasoning = 'Use unique reasoning identifiers with letters, numbers, dots, underscores, slashes or hyphens.';
    const price = model.priceFields || [];
    if (price.some(Boolean) && (!price.every(Boolean) || !Number.isFinite(Number(price[0])) || Number(price[0]) < 0 || !Number.isFinite(Number(price[1])) || Number(price[1]) < 0 || price[2].length > 200)) errors.price = 'Provide two non-negative prices and a source of at most 200 characters, or leave all three empty.';
    return errors;
  }
  const api = { validateModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CodovynRoutingForm = api;
})(typeof window !== 'undefined' ? window : globalThis);
