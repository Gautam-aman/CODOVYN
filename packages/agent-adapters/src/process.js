import { execFile } from 'node:child_process';
import { dirname, delimiter } from 'node:path';
import { promisify } from 'node:util';
import { AgentFailure } from '../../agent-core/src/index.js';

const execute = promisify(execFile);

function delay(milliseconds) {
  let timer;
  const promise = new Promise((resolve) => { timer = setTimeout(resolve, milliseconds); });
  return { promise, cancel: () => clearTimeout(timer) };
}

/** Agent CLI shims use the same Node runtime as the shared engine. */
export function agentEnvironment() {
  const env = { ...process.env };
  const pathKey = process.platform === 'win32' ? Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH' : 'PATH';
  env[pathKey] = `${dirname(process.execPath)}${delimiter}${env[pathKey] || ''}`;
  return env;
}

/** Stop the provider and its children before allowing a checkpoint or handoff. */
export function manageAgentProcess(child, signal) {
  let processError = null;
  let termination = null;
  child.on('error', (error) => { processError = error; });
  child.stdin.on('error', (error) => { processError = error; });
  const closed = new Promise((resolve) => child.once('close', resolve));

  const stop = () => {
    if (termination) return termination;
    termination = (async () => {
      if (!child.pid) { await closed; return; }
      if (process.platform === 'win32') {
        if (child.exitCode === null && child.signalCode === null) {
          try { await execute('taskkill', ['/pid', String(child.pid), '/t', '/f'], { timeout: 5000, windowsHide: true }); }
          catch {
            if (child.exitCode === null && child.signalCode === null) {
              throw new AgentFailure('fatal', 'Could not stop the agent process tree');
            }
          }
        }
      } else {
        const killGroup = async (kind) => {
          for (let attempt = 0; attempt < 10; attempt++) {
            try { process.kill(-child.pid, kind); return; }
            catch (error) {
              if (error.code === 'ESRCH') return;
              // Darwin can briefly deny signals to an exited group being reaped.
              // Never ignore the error: retry until the group disappears or stop fails.
              if (error.code === 'EPERM' && attempt < 9 &&
                (child.exitCode !== null || child.signalCode !== null)) {
                await new Promise((resolve) => setTimeout(resolve, 50));
                continue;
              }
              throw new AgentFailure('fatal', `Could not stop the agent process group (${error.code})`);
            }
          }
        };
        await killGroup('SIGTERM');
        const grace = delay(750);
        try { await Promise.race([closed, grace.promise]); }
        finally { grace.cancel(); }
        // A wrapper may exit before its children. Kill any remaining group members.
        await killGroup('SIGKILL');
      }
      const deadline = delay(2000);
      try {
        await Promise.race([closed, deadline.promise.then(() => {
          throw new AgentFailure('fatal', 'Agent process did not close after cancellation');
        })]);
      } finally { deadline.cancel(); }
    })();
    // Abort callbacks cannot return a promise; dispose() observes cleanup failures.
    termination.catch(() => {});
    return termination;
  };
  const abort = () => { stop(); };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  return {
    closed,
    error: () => processError,
    async dispose() {
      signal?.removeEventListener('abort', abort);
      await stop();
    },
  };
}
