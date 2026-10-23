import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../src/index.js';

test('a separate queue writer waits for a short journal lock and commits exactly once', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-sqlite-contention-')); const file = join(directory, 'tasks.sqlite');
  const initial = new TaskStore(file); initial.close(); const lock = new DatabaseSync(file); let child; let timer;
  try {
    lock.exec('BEGIN IMMEDIATE');
    const code = `import {TaskStore} from ${JSON.stringify(new URL('../src/index.js', import.meta.url).href)}; process.stdout.write('ready'); const store = new TaskStore(${JSON.stringify(file)}); store.enqueueTask({id:'locked-request',repositoryRoot:'/repo',request:'Inspect',configuration:{provider:'codex'},baselineFingerprint:'abcdef0'}); store.close();`;
    child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
    let error = ''; child.stderr.on('data', chunk => { error = (error + chunk.toString()).slice(-2000); });
    child.stdout.once('data', () => { timer = setTimeout(() => lock.exec('COMMIT'), 200); });
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
    assert.equal(result.code, 0, error);
    const store = new TaskStore(file); assert.equal(store.listQueuedTasks('/repo').tasks.length, 1); store.close();
  } finally { clearTimeout(timer); try { lock.exec('ROLLBACK'); } catch {} lock.close(); child?.kill(); rmSync(directory, { recursive: true, force: true }); }
});
