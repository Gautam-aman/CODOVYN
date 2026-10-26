import { spawn, execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm, access, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { AgentFailure } from '../../agent-core/src/index.js';
import { formatHandoffPrompt } from './index.js';
import { manageAgentProcess, agentEnvironment } from './process.js';
import { boundedJsonLines } from './jsonl.js';
import { parseGeminiEvent } from './gemini-events.js';
const execute = promisify(execFile);
export const geminiReadTools = Object.freeze(['read_file', 'list_directory', 'glob', 'grep_search', 'search_file_content', 'read_many_files']);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function geminiWritePattern(root, platform = process.platform) {
  const normalized = platform === 'win32' ? root.replaceAll('\\', '/') : root;
  const prefix = normalized.replace(/\/+$/, '') + '/';
  if (/["\\\x00-\x1f]/.test(prefix)) throw new AgentFailure('fatal', 'Unsupported Gemini draft path');
  const scalar = String.raw`(?:"(?:[^"\\]|\\.)*"|true|false|null|-?[0-9]+(?:\.[0-9]+)?)`;
  const pair = String.raw`"(?:content|old_string|new_string|expected_replacements|allow_multiple|instruction)"\s*:\s*${scalar}`;
  const path = String.raw`${escapeRegex(prefix)}(?![^"]*\.\.)(?![^"]*\\)(?![^"]*\.[gG][iI][tT](?:[./ :]|"))[^"\\]+`;
  return String.raw`^\{\s*(?:${pair}\s*,\s*)*"file_path"\s*:\s*"${path}"(?:\s*,\s*${pair})*\s*\}$`;
}
export async function assertGeminiDraft(root) {
  const directories = [root]; let entries = 0;
  while (directories.length) {
    const parent = directories.pop();
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (++entries > 100000) throw new AgentFailure('fatal', 'Gemini draft is too large for permission inspection');
      if (entry.isSymbolicLink()) throw new AgentFailure('fatal', 'Gemini editing currently requires a draft without symbolic links');
      if (entry.isDirectory()) directories.push(join(parent, entry.name));
    }
  }
}
export function geminiPolicy(write, root) {
  return ['[[rule]]', 'toolName = "*"', 'decision = "deny"', 'priority = 998', '',
    ...geminiReadTools.flatMap(name => ['[[rule]]', `toolName = "${name}"`, 'decision = "allow"', 'priority = 999', '']),
    ...(write ? ['replace', 'write_file'].flatMap(name => ['[[rule]]', `toolName = "${name}"`,
      `argsPattern = ${JSON.stringify(geminiWritePattern(root))}`, 'decision = "allow"', 'priority = 999', '']) : []),
  ].join('\n');
}
async function assertUnmanaged() {
  const directory = process.platform === 'darwin' ? '/Library/Application Support/GeminiCli'
    : process.platform === 'win32' ? 'C:\\ProgramData\\gemini-cli' : '/etc/gemini-cli';
  if (process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH || process.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH) {
    throw new AgentFailure('fatal', 'Gemini managed settings require a separately reviewed integration');
  }
  // Never replace an organization's existing system settings or policy boundary.
  try { await access(join(directory, 'settings.json')); throw new AgentFailure('fatal', 'Gemini system settings are not supported in this permission mode'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try {
    if ((await readdir(join(directory, 'policies'))).some(name => name.endsWith('.toml'))) {
      throw new AgentFailure('fatal', 'Gemini central policies prevent the required isolated permission policy');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export function createGeminiAdapter({ cwd, command = 'gemini', prefixArgs = [], write = false, model }) {
  if (typeof cwd !== 'string' || !cwd || typeof write !== 'boolean') throw new TypeError('Explicit workspace and write policy required');
  if (model !== undefined && (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(model))) throw new TypeError('Invalid Gemini model');
  const tools = [...geminiReadTools, ...(write ? ['replace', 'write_file'] : [])];
  return {
    id: 'gemini', executionSupported:command===process.execPath&&prefixArgs.length>0, diagnostic:'Gemini live execution is deferred for the macOS alpha; fixture coverage is not live validation.', capabilities: { streaming: true, tools: true, writes: write, resume: false, authenticationStatus: false, usage: true, shell: false },
    async availability() {
      try {
        const { stdout } = await execute(command, [...prefixArgs, '--help'], { cwd: tmpdir(), env: agentEnvironment(), timeout: 10000, maxBuffer: 1024 * 1024 });
        return ['--admin-policy', '--output-format', '--extensions'].every(flag => stdout.includes(flag)) ? 'available' : 'unavailable';
      } catch { return 'unavailable'; }
    },
    async *run({ handoff, signal, execution }) {
      if(!(command===process.execPath&&prefixArgs.length))throw new AgentFailure('fatal','Gemini live execution is deferred for the macOS alpha; no provider started');
      if (signal?.aborted) throw new AgentFailure('cancelled', 'Gemini cancelled');
      await assertUnmanaged();
      const root = await realpath(cwd);
      if (write) await assertGeminiDraft(root);
      const directory = await mkdtemp(join(tmpdir(), 'codovyn-gemini-policy-'));
      let lifecycle;
      try {
        const policy = join(directory, 'policy.toml');
        const settings = join(directory, 'settings.json');
        await writeFile(policy, geminiPolicy(write, root), { mode: 0o600 });
        await writeFile(settings, JSON.stringify({ hooksConfig: { enabled: false }, skills: { enabled: false },
          tools: { core: tools }, general: { enableAutoUpdate: false } }), { mode: 0o600 });
        const args = [...prefixArgs, '--prompt', 'Continue the task provided on stdin. Inspect files before repeating work.',
          '--output-format', 'stream-json', '--approval-mode', 'default', '--admin-policy', policy,
          '--extensions', 'none', '--allowed-mcp-server-names', `codovyn-disabled-${randomUUID()}`,
          ...(model ? ['--model', model] : [])];
        execution?.starting();
        const child = spawn(command, args, { cwd, shell: false, detached: process.platform !== 'win32',
          stdio: ['pipe', 'pipe', 'pipe'], env: { ...agentEnvironment(), GEMINI_CLI_SYSTEM_SETTINGS_PATH: settings } });
        lifecycle = manageAgentProcess(child, signal);
        execution?.spawned({ pid: child.pid, group: process.platform !== 'win32' });
        child.stderr.resume();
        child.stdin.end(formatHandoffPrompt(handoff) + '\nUse absolute forward-slash file paths inside this draft, without dot-dot or escaped path components. Use only permitted file tools. Never execute shell, deploy, commit or push. Report tests for the user to run.');
        const active = new Map();
        let finished = false;
        for await (const raw of boundedJsonLines(child.stdout)) {
          const event = parseGeminiEvent(raw);
          if (!event) continue;
          if (finished) throw new AgentFailure('fatal', 'Gemini emitted events after completion');
          if (event.type === 'tool-start') {
            if (!tools.includes(event.action) || active.has(event.actionId)) throw new AgentFailure('fatal', 'Gemini violated the tool event policy');
            active.set(event.actionId, event.action);
            yield { ...event, safeToRetry: geminiReadTools.includes(event.action) };
          } else if (event.type === 'tool-complete') {
            if (!active.has(event.actionId)) throw new AgentFailure('fatal', 'Gemini completed an unknown tool');
            const action = active.get(event.actionId); active.delete(event.actionId);
            yield { ...event, action };
          } else if (event.type === 'completed') {
            if (active.size) throw new AgentFailure('fatal', 'Gemini completed with unresolved tools');
            finished = event;
            await lifecycle.exited;await lifecycle.dispose();
          } else yield event;
        }
        const code = await lifecycle.closed;
        if (signal?.aborted) throw new AgentFailure('cancelled', 'Gemini cancelled');
        if (lifecycle.error()) throw lifecycle.error();
        if (code === 41) throw new AgentFailure('authentication', 'Gemini CLI authentication is required');
        if (code !== 0 || !finished) throw new AgentFailure('fatal', `Gemini exited without successful completion (status ${code})`);
        yield finished;
      } catch (error) {
        if (signal?.aborted) throw new AgentFailure('cancelled', 'Gemini cancelled');
        throw error;
      } finally {
        if (lifecycle) { await lifecycle.dispose(); execution?.stopped(); }
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
