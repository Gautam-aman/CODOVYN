import { execFile } from 'node:child_process';
import { dirname, delimiter } from 'node:path';
import { promisify } from 'node:util';
import { AgentFailure } from '../../agent-core/src/index.js';

const execute = promisify(execFile);
const managedProcesses=new WeakMap();
export async function disposeManagedAgentProcess(value,child){const record=managedProcesses.get(value);if(!record||record.child!==child)throw new Error('Matching managed process required');await record.dispose();}
export const isManagedAgentProcess=(value,child)=>!!child&&managedProcesses.get(value)?.child===child;

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
  const exited = new Promise(resolve=>{child.once('exit',resolve);child.once('error',()=>resolve(null));});
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
              // Darwin may report EPERM before Node delivers an owned child's exit.
              // Retry for at most 450 ms; persistent denial still fails cleanup.
              // No exit notification or permission error proves group disappearance.
              if (error.code === 'EPERM' && attempt < 9) {
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
  const managed = {
    closed,
    exited,
    error: () => processError,
    async dispose() {
      signal?.removeEventListener('abort', abort);
      await stop();
    },
  };
  managedProcesses.set(managed,{child,dispose:managed.dispose});
  return managed;
}
