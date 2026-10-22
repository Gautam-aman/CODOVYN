import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDesktopProcess, nativeProfileArgs } from '../../scripts/lib/desktop-process.js';
const posix = process.platform !== 'win32';

test('native test deadline reaps a TERM-resistant owned tree without touching another process', { skip: !posix }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codovyn-deadline-'));
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
  await once(unrelated, 'spawn');
  try {
    const program = `const {spawn}=require('node:child_process'); process.on('SIGTERM',()=>{});
      require('node:fs').appendFileSync(process.env.CODOVYN_HOST_TRACE, JSON.stringify({phase:'fixture-pending',state:'pending'})+'\\n');
      spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'});
      setInterval(()=>{},1000);`;
    const started = Date.now();
    await assert.rejects(runDesktopProcess({ executable: process.execPath, args: ['-e', program], env: process.env,
      directory, phase: 'stalled', timeoutMs: 2000, graceMs: 100, killGraceMs: 1500 }), /deadline exceeded/);
    assert.ok(Date.now() - started < 5000, 'total deadline is bounded');
    const report = JSON.parse(await readFile(join(directory, 'stalled-lifecycle.json')));
    assert.equal(report.result.timeout, true);
    assert.deepEqual(report.survivors, []);
    assert.equal(report.cleanupError, undefined);
    assert.ok(report.lastProgress, 'The fixture started and recorded progress before its execution deadline.');
    assert.equal(JSON.parse(report.lastProgress).phase, 'fixture-pending');
    assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
  } finally {
    unrelated.kill('SIGKILL'); await once(unrelated, 'exit');
    await rm(directory, { recursive: true, force: true });
  }
});

test('native lifecycle records normal completion and spawn failures without hanging', { skip: !posix }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codovyn-lifecycle-'));
  try {
    const result = await runDesktopProcess({ executable: process.execPath, args: ['-e', 'process.exit(0)'], env: process.env,
      directory, phase: 'normal', timeoutMs: 1000 });
    assert.equal(result.cleanupVerified, true);
    await assert.rejects(runDesktopProcess({ executable: process.execPath, args: ['-e', 'process.exit(7)'], env: process.env,
      directory, phase: 'nonzero', timeoutMs: 1000 }), /exit 7/);
    assert.equal(JSON.parse(await readFile(join(directory, 'nonzero-lifecycle.json'))).result.code, 7);
    await assert.rejects(runDesktopProcess({ executable: join(directory, 'missing'), args: [], env: process.env,
      directory, phase: 'missing', timeoutMs: 1000 }), /ENOENT/);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'missing-lifecycle.json'))).survivors, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('native lifecycle cleans an owned descendant even after the leader exits normally', { skip: !posix }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codovyn-descendant-'));
  try {
    const program = `const {spawn}=require('node:child_process');
      const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});
      child.unref(); setTimeout(()=>process.exit(0),200);`;
    const result = await runDesktopProcess({ executable: process.execPath, args: ['-e', program], env: process.env,
      directory, phase: 'descendant', timeoutMs: 1500, graceMs: 100, killGraceMs: 1500 });
    assert.equal(result.cleanupVerified, true);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'descendant-lifecycle.json'))).survivors, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('native profiles isolate shared storage as well as settings and extensions', () => {
  const directory = join(tmpdir(), 'owned-profile');
  const args = nativeProfileArgs(directory);
  assert.deepEqual(args, ['--user-data-dir', join(directory, 'profile'), '--extensions-dir', join(directory, 'extensions'),
    '--shared-data-dir', join(directory, 'shared-data')]);
});

test('native test cancellation follows verified group cleanup and pre-cancel never spawns', { skip: !posix }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codovyn-cancel-'));
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 250);
    try {
      await assert.rejects(runDesktopProcess({ executable: process.execPath,
        args: ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], env: process.env,
        directory, phase: 'cancelled', signal: controller.signal, timeoutMs: 3000, graceMs: 100, killGraceMs: 1500 }), /cancelled/);
    } finally { clearTimeout(timer); }
    const report = JSON.parse(await readFile(join(directory, 'cancelled-lifecycle.json')));
    assert.deepEqual(report.survivors, []); assert.equal(report.result.cancelled, true);
    await assert.rejects(runDesktopProcess({ executable: 'must-not-spawn', args: [], env: process.env,
      directory, phase: 'pre-cancel', signal: controller.signal }), /cancelled before launch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
