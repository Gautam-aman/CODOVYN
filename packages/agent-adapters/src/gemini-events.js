import { AgentFailure } from '../../agent-core/src/index.js';
const string = (value, maximum) => typeof value === 'string' && value.length > 0 && value.length <= maximum;
export function parseGeminiEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !string(raw.type, 64)) throw new AgentFailure('fatal', 'Malformed Gemini event');
  if (raw.type === 'init') {
    if (!string(raw.session_id, 256) || !string(raw.model, 256)) throw new AgentFailure('fatal', 'Malformed Gemini session');
    return { type: 'session', sessionId: raw.session_id, model: raw.model };
  }
  if (raw.type === 'message' && raw.role === 'assistant') {
    if (typeof raw.content !== 'string' || raw.content.length > 65536) throw new AgentFailure('fatal', 'Malformed Gemini message');
    return { type: 'text', text: raw.content };
  }
  if (raw.type === 'tool_use') {
    if (!string(raw.tool_id, 256) || !string(raw.tool_name, 128)) throw new AgentFailure('fatal', 'Malformed Gemini tool');
    return { type: 'tool-start', actionId: raw.tool_id, action: raw.tool_name };
  }
  if (raw.type === 'tool_result') {
    if (!string(raw.tool_id, 256) || !['success', 'error'].includes(raw.status)) throw new AgentFailure('fatal', 'Malformed Gemini tool result');
    return { type: 'tool-complete', actionId: raw.tool_id, success: raw.status === 'success' };
  }
  if (raw.type === 'result') {
    if (raw.status !== 'success' || raw.error) {
      const kind = ['FatalAuthenticationError', 'UnauthorizedError', 'ForbiddenError'].includes(raw.error?.type)
        ? 'authentication' : raw.error?.type === 'FatalCancellationError' ? 'cancelled' : 'fatal';
      throw new AgentFailure(kind, 'Gemini task failed');
    }
    const usage = {};
    for (const key of ['total_tokens', 'input_tokens', 'output_tokens', 'cached']) {
      if (Number.isSafeInteger(raw.stats?.[key]) && raw.stats[key] >= 0) usage[key] = raw.stats[key];
    }
    return { type: 'completed', usage: Object.keys(usage).length ? usage : null };
  }
  // Warning/error messages contain free-form diagnostics, not reliable quota codes.
  if (raw.type === 'error' && raw.severity !== 'warning') throw new AgentFailure('fatal', 'Gemini reported an error');
  return null;
}
