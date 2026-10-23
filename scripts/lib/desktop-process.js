import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const execute = promisify(execFile);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function members(group) {
  const { stdout } = await execute('/bin/ps', ['-axo', 'pid=,pgid=,stat='], { timeout: 2000 });
  return stdout.trim().split('\n').flatMap(line => {
    const [pid, pgid, state] = line.trim().split(/\s+/);
    return Number(pgid) === group && !state.startsWith('Z') ? [{ pid: Number(pid), state }] : [];
  });
}
function signalGroup(group, signal) {
  try { process.kill(-group, signal); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

/** Include upstream shared storage: --user-data-dir alone does not isolate it. */
export function nativeProfileArgs(directory) {
  return ['--user-data-dir', join(directory, 'profile'), '--extensions-dir', join(directory, 'extensions'),
    '--shared-data-dir', join(directory, 'shared-data'),
    // Test-only Chromium store: never request the user's real Keychain secrets.
    // Electron uses the same switch for spawned macOS test apps (PR #53790).
    ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : [])];
}

/** Keep Ctrl-C/termination inside the same owned cleanup path. */
export function nativeTestCancellation() {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on('SIGINT', abort); process.on('SIGTERM', abort);
  return { signal: controller.signal, dispose() {
    process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
  } };
}

/** POSIX native-test ownership only. Never discover targets by executable name. */
export async function runDesktopProcess({ executable, args, env, directory, phase,
  timeoutMs = 120000, graceMs = 1500, killGraceMs = 2500, signal }) {
  if (process.platform === 'win32') throw new Error('Native desktop group cleanup is not implemented for Windows');
  for (const duration of [timeoutMs, graceMs, killGraceMs]) {
    if (!Number.isSafeInteger(duration) || duration < 1) throw new Error('Invalid native test deadline');
  }
  if (signal?.aborted) throw new Error(`${phase}: cancelled before launch`);
  const tracePath = join(directory, `${phase}-trace.jsonl`);
  const logPath = join(directory, `${phase}-output.log`);
  const child = spawn(executable, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...env, CODOVYN_HOST_TRACE: tracePath } });
  const outcome = new Promise(resolve => {
    child.once('error', error => resolve({ error: error.message }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  let outputBytes = 0;
  const writes = [];
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
    process.stdout.write(data);
    if (outputBytes < 10 * 1024 * 1024) {
      const writing = appendFile(logPath, data);
      writing.catch(() => {}); // Observed below, without an early unhandled rejection.
      writes.push(writing);
    }
    outputBytes += data.length;
  });
  const startedAt = Date.now();
  let timer;
  let result;
  let aborted;
  const cancellation = new Promise(resolve => {
    aborted = () => resolve({ cancelled: true });
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
  let cleanupError;
  let survivors = [];
  try {
    result = await Promise.race([outcome, cancellation, new Promise(resolve => {
      timer = setTimeout(() => resolve({ timeout: true }), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', aborted);
    if (child.pid) {
      try {
        signalGroup(child.pid, 'SIGTERM');
        const graceEnd = Date.now() + graceMs;
        while ((await members(child.pid)).length && Date.now() < graceEnd) await sleep(50);
        if ((await members(child.pid)).length) signalGroup(child.pid, 'SIGKILL');
        const killEnd = Date.now() + killGraceMs;
        while ((survivors = await members(child.pid)).length && Date.now() < killEnd) await sleep(50);
        if (survivors.length) throw new Error(`Owned native test group still has ${survivors.length} live process(es)`);
      } catch (error) { cleanupError = error.message; }
    }
    await Promise.all(writes);
    const trace = await readFile(tracePath, 'utf8').catch(() => '');
    await writeFile(join(directory, `${phase}-lifecycle.json`), JSON.stringify({ phase,
      pid: child.pid ?? null, result, cleanupError, survivors, elapsedMs: Date.now() - startedAt,
      timeoutMs, graceMs, killGraceMs, lastProgress: trace.trim().split('\n').at(-1) || null }, null, 2));
  }
  if (cleanupError || result?.timeout || result?.cancelled || result?.error || result?.code !== 0) {
    throw new Error(`${phase}: ${cleanupError || (result?.timeout ? 'startup/execution deadline exceeded' : (result?.cancelled ? 'cancelled' : result?.error) || `exit ${result?.code} (${result?.signal})`)}. Diagnostics: ${directory}`);
  }
  return { pid: child.pid, cleanupVerified: true, elapsedMs: Date.now() - startedAt };
}
