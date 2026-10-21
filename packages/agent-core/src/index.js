/** @typedef {'idle' | 'available' | 'unavailable'} Availability */
/** @typedef {'quota' | 'temporary' | 'authentication' | 'cancelled' | 'fatal'} FailureKind */

export class AgentFailure extends Error {
  /** @param {FailureKind} kind @param {string} message */
  constructor(kind, message) {
    super(message);
    this.name = 'AgentFailure';
    this.kind = kind;
  }
}

/**
 * An adapter has `id`, `capabilities`, `availability()` and `run(request)`.
 * `run` returns an async iterator of events ending in exactly one `completed`
 * event. It may throw AgentFailure. Side effects must be reported as tool events.
 */
export class AgentRegistry {
  #agents = new Map();

  register(adapter) {
    if (!adapter || typeof adapter.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(adapter.id)) {
      throw new TypeError('Adapter id must be a lowercase slug');
    }
    if (this.#agents.has(adapter.id)) throw new Error(`Adapter already registered: ${adapter.id}`);
    if (typeof adapter.availability !== 'function' || typeof adapter.run !== 'function') {
      throw new TypeError('Adapter must implement availability() and run()');
    }
    if (!adapter.capabilities || typeof adapter.capabilities !== 'object') {
      throw new TypeError('Adapter must declare capabilities');
    }
    this.#agents.set(adapter.id, adapter);
    return adapter;
  }

  get(id) { return this.#agents.get(id); }
  list() { return [...this.#agents.values()]; }

  require(id) {
    const adapter = this.get(id);
    if (!adapter) throw new Error(`Unknown adapter: ${id}`);
    return adapter;
  }
}
