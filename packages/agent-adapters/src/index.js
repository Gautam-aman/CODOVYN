import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { AgentFailure } from '../../agent-core/src/index.js';

const execute = promisify(execFile);

export function classifyCodexError(error) {
  const code = error?.code ?? error?.status ?? error?.status_code;
  if (code === 429 || code === 'rate_limit_exceeded' || code === 'insufficient_quota') return 'quota';
  if (code === 401 || code === 403 || code === 'invalid_api_key') return 'authentication';
  return 'fatal';
}

export function parseCodexEvent(raw) {
  if (raw?.type === 'item.started' && ['command_execution', 'file_change'].includes(raw.item?.type)) {
    if (typeof raw.item.id !== 'string') throw new AgentFailure('fatal', 'Codex tool event has no action id');
    return { type: 'tool-start', actionId: raw.item.id, action: raw.item.type };
  }
  if (raw?.type === 'item.completed' && ['command_execution', 'file_change'].includes(raw.item?.type)) {
    if (typeof raw.item.id !== 'string') throw new AgentFailure('fatal', 'Codex tool event has no action id');
    return { type: 'tool-complete', actionId: raw.item.id, action: raw.item.type };
  }
  if (raw?.type === 'item.completed' && raw.item?.type === 'agent_message') {
    return { type: 'text', text: String(raw.item.text ?? '') };
  }
  if (raw?.type === 'turn.completed') return { type: 'completed', usage: raw.usage ?? null };
  if (raw?.type === 'turn.failed') throw new AgentFailure(classifyCodexError(raw.error), 'Codex turn failed');
  return null;
}

/** Uses the installed Codex CLI and its own authentication, in read-only mode. */
export function createCodexAdapter({ cwd, command = 'codex', prefixArgs = [] }) {
  if (typeof cwd !== 'string' || !cwd) throw new TypeError('Workspace directory is required');
  return {
    id: 'codex',
    capabilities: { streaming: true, resume: false, tools: false, writes: false, authenticationStatus: false, usage: true },
    async availability() {
      try { await execute(command, [...prefixArgs, '--version'], { timeout: 5000 }); return 'available'; }
      catch { return 'unavailable'; }
    },
    async *run({ handoff, signal }) {
      const prompt = [handoff.request, '', 'Repository checkpoint:', JSON.stringify(handoff.snapshot)].join('\n');
      const child = spawn(command, [...prefixArgs, 'exec', '--json', '--sandbox', 'read-only', '-'], {
        cwd, stdio: ['pipe', 'pipe', 'pipe'], signal, shell: false,
      });
      const closed = once(child, 'close');
      child.stdin.end(prompt);
      // Never include stderr in task events: provider logs can contain credentials.
      child.stderr.resume();
      try {
        for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
          if (line.length > 1024 * 1024) throw new AgentFailure('fatal', 'Codex event exceeds size limit');
          let raw;
          try { raw = JSON.parse(line); }
          catch { throw new AgentFailure('fatal', 'Codex emitted malformed JSONL'); }
          const event = parseCodexEvent(raw);
          if (event) yield event;
        }
        const [code] = await closed;
        if (code !== 0) throw new AgentFailure('fatal', `Codex exited with status ${code}`);
      } catch (error) {
        if (!child.killed) child.kill();
        if (signal?.aborted) throw new AgentFailure('cancelled', 'Codex was cancelled');
        throw error;
      }
    },
  };
}
