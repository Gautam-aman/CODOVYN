import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { manageAgentProcess } from '../src/process.js';

function exitedChild() {
  const child = Object.assign(new EventEmitter(), {
    pid: 123456, exitCode: 0, signalCode: null, stdin: new EventEmitter(),
  });
  queueMicrotask(() => child.emit('close', 0));
  return child;
}

test('an exited POSIX group may finish reaping after a transient signal denial', { skip: process.platform === 'win32' }, async (t) => {
  let attempts = 0;
  t.mock.method(process, 'kill', (pid, signal) => {
    assert.equal(pid, -123456);
    if (signal === 'SIGTERM') return true;
    attempts++;
    throw Object.assign(new Error('simulated group state'), { code: attempts === 1 ? 'EPERM' : 'ESRCH' });
  });
  await manageAgentProcess(exitedChild()).dispose();
  assert.equal(attempts, 2);
});

test('a persistent POSIX signal denial never reports successful cleanup', { skip: process.platform === 'win32' }, async (t) => {
  t.mock.method(process, 'kill', (pid) => {
    assert.equal(pid, -123456);
    throw Object.assign(new Error('simulated denial'), { code: 'EPERM' });
  });
  await assert.rejects(manageAgentProcess(exitedChild()).dispose(), (error) =>
    error.kind === 'fatal' && error.message.includes('EPERM'));
});
