import { AgentFailure } from '../../agent-core/src/index.js';

/** Bound buffered bytes before decoding, including streams with no newline. */
export async function* boundedJsonLines(stream, limit = 1024 * 1024) {
  let pending = Buffer.alloc(0);
  const decode = (bytes) => {
    try {
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch { throw new AgentFailure('fatal', 'Agent emitted malformed JSONL'); }
  };
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    let offset = 0;
    while (offset < bytes.length) {
      const newline = bytes.indexOf(10, offset);
      const end = newline < 0 ? bytes.length : newline;
      const piece = bytes.subarray(offset, end);
      if (pending.length + piece.length > limit) throw new AgentFailure('fatal', 'Agent event exceeds size limit');
      pending = Buffer.concat([pending, piece]);
      if (newline < 0) break;
      if (pending.length) yield decode(pending);
      pending = Buffer.alloc(0);
      offset = newline + 1;
    }
  }
  if (pending.length) yield decode(pending);
}
