import { spawn, execFile } from 'node:child_process';
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

/** Portable, bounded context made only from observable task events. */
export function formatHandoffPrompt(handoff) {
  if (typeof handoff.request !== 'string' || handoff.request.length > 10_000) {
    throw new AgentFailure('fatal', 'Task request exceeds the Codex handoff limit');
  }
  const snapshot = handoff.snapshot || {};
  const state = { branch: snapshot.branch ?? null, commit: snapshot.commit ?? null,
    dirty: snapshot.dirty ?? null, changedPaths: Array.isArray(snapshot.changedPaths)
      ? snapshot.changedPaths.slice(0, 20).map((path) => String(path).slice(0, 100)) : [] };
  const progress = (handoff.history || []).filter((entry) => entry.kind === 'agent-event' &&
    ['text', 'completed'].includes(entry.data?.event?.type) && typeof entry.data.event.text === 'string')
    .slice(-6).map((entry) => `${entry.data.agent}: ${entry.data.event.text.slice(0, 500)}`);
  return [handoff.request, '', 'Verified repository state:', JSON.stringify(state),
    '', 'Recorded agent progress (observable output only):', progress.join('\n') || 'None recorded',
    '', 'Continue from the verified state. Check files before repeating work.'].join('\n');
}

/** Uses the installed Codex CLI and its own authentication within the selected sandbox. */
export function createCodexAdapter({ cwd, command = 'codex', prefixArgs = [], write = false }) {
  if (typeof cwd !== 'string' || !cwd) throw new TypeError('Workspace directory is required');
  if (typeof write !== 'boolean') throw new TypeError('Write permission must be explicit');
  return {
    id: 'codex',
    capabilities: { streaming: true, resume: false, tools: true, writes: write, authenticationStatus: false, usage: true },
    async availability() {
      try { await execute(command, [...prefixArgs, '--version'], { timeout: 5000 }); return 'available'; }
      catch { return 'unavailable'; }
    },
    async *run({ handoff, signal }) {
      if (signal?.aborted) throw new AgentFailure('cancelled', 'Codex was cancelled');
      const prompt = formatHandoffPrompt(handoff) + (write
        ? '\n\nWork only inside this isolated draft workspace. Do not commit, push, deploy, or modify files outside this worktree. Run relevant local checks and report what changed.' : '');
      const child = spawn(command, [...prefixArgs, 'exec', '--json', '--sandbox', write ? 'workspace-write' : 'read-only', '-'], {
        cwd, stdio: ['pipe', 'pipe', 'pipe'], signal, shell: false,
      });
      let processError = null;
      child.on('error', (error) => { processError = error; });
      child.stdin.on('error', (error) => { processError = error; });
      const closed = new Promise((resolve) => child.once('close', resolve));
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
        const code = await closed;
        if (processError) throw processError;
        if (code !== 0) throw new AgentFailure('fatal', `Codex exited with status ${code}`);
      } catch (error) {
        if (!child.killed) child.kill();
        if (signal?.aborted) throw new AgentFailure('cancelled', 'Codex was cancelled');
        throw error;
      }
    },
  };
}

/** Translate documented Claude stream-json messages into the shared event contract. */
export function parseClaudeEvent(raw) {
  if (raw?.type === 'stream_event' && raw.event?.delta?.type === 'text_delta' &&
    typeof raw.event.delta.text === 'string') {
    return { type: 'text', text: raw.event.delta.text };
  }
  if (raw?.type === 'result') {
    if (raw.is_error || raw.subtype !== 'success') {
      throw new AgentFailure('fatal', 'Claude Code turn failed');
    }
    return { type: 'completed', usage: raw.usage ?? null,
      estimatedCostUsd: typeof raw.total_cost_usd === 'number' ? raw.total_cost_usd : null };
  }
  return null;
}

/** Uses Claude Code's authenticated CLI with only read/search tools available. */
export function createClaudeAdapter({ cwd, command = 'claude', prefixArgs = [] }) {
  if (typeof cwd !== 'string' || !cwd) throw new TypeError('Workspace directory is required');
  return {
    id: 'claude',
    capabilities: { streaming: true, resume: false, tools: false, writes: false,
      authenticationStatus: false, usage: true },
    async availability() {
      try { await execute(command, [...prefixArgs, '--version'], { timeout: 5000 }); return 'available'; }
      catch { return 'unavailable'; }
    },
    async *run({ handoff, signal }) {
      if (signal?.aborted) throw new AgentFailure('cancelled', 'Claude Code was cancelled');
      const prompt = formatHandoffPrompt(handoff);
      const args = [...prefixArgs, '--bare', '-p',
        'Continue the task described on stdin. Inspect repository files as needed and report the result.',
        '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
        '--permission-mode', 'plan', '--permission-prompts', 'none',
        '--tools', 'Read,Glob,Grep', '--no-session-persistence'];
      const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], signal, shell: false });
      let processError = null;
      child.on('error', (error) => { processError = error; });
      child.stdin.on('error', (error) => { processError = error; });
      const closed = new Promise((resolve) => child.once('close', resolve));
      child.stdin.end(prompt);
      // Provider diagnostics can contain secrets and must not enter task history.
      child.stderr.resume();
      let sawText = false;
      try {
        for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
          if (line.length > 1024 * 1024) throw new AgentFailure('fatal', 'Claude Code event exceeds size limit');
          let raw;
          try { raw = JSON.parse(line); }
          catch { throw new AgentFailure('fatal', 'Claude Code emitted malformed JSONL'); }
          const event = parseClaudeEvent(raw);
          if (event?.type === 'text') sawText = true;
          if (event?.type === 'completed' && !sawText && typeof raw.result === 'string') {
            yield { type: 'text', text: raw.result };
          }
          if (event) yield event;
        }
        const code = await closed;
        if (processError) throw processError;
        if (code !== 0) throw new AgentFailure('fatal', `Claude Code exited with status ${code}`);
      } catch (error) {
        if (signal?.aborted) throw new AgentFailure('cancelled', 'Claude Code was cancelled');
        throw error;
      } finally {
        if (child.exitCode === null && !child.killed) child.kill();
      }
    },
  };
}
