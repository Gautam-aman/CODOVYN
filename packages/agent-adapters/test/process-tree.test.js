import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { createCodexAdapter, createClaudeAdapter } from '../src/index.js';

async function fixture(event, callback) {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-process-tree-'));
  const marker = join(directory, 'late-write.txt');
  const script = join(directory, 'provider.cjs');
  const descendant = `setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'late write'), 2000); process.send('ready');`;
  writeFileSync(script, `
    const child = require('node:child_process').spawn(process.execPath,
      ['-e', ${JSON.stringify(descendant)}, ${JSON.stringify(marker)}],
      { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.once('message', () => console.log(${JSON.stringify(JSON.stringify(event))}));
    process.stdin.resume();
    setInterval(() => {}, 1000);
  `);
  try {
    await callback({ cwd: directory, command: process.execPath, prefixArgs: [script] });
    await delay(2200);
    assert.equal(existsSync(marker), false, 'A descendant must not write after the adapter returns');
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('Codex quota failure stops descendant processes before returning to failover', async () => {
  await fixture({ type: 'turn.failed', error: { code: 429 } }, async (options) => {
    await assert.rejects(async () => {
      for await (const _event of createCodexAdapter(options).run({ handoff: { request: 'Inspect', snapshot: {} } })) {}
    }, (error) => error.kind === 'quota');
  });
});

test('ending iteration at Claude completion reaps its provider and descendants', async () => {
  await fixture({ type: 'result', subtype: 'success', is_error: false }, async (options) => {
    for await (const event of createClaudeAdapter(options).run({ handoff: { request: 'Inspect', snapshot: {} } })) {
      assert.equal(event.type, 'completed');
      break;
    }
  });
});

test('cancellation stops a Codex wrapper and its live descendant', async () => {
  await fixture({ type: 'item.completed', item: { type: 'agent_message', text: 'ready' } }, async (options) => {
    const controller = new AbortController();
    await assert.rejects(async () => {
      for await (const _event of createCodexAdapter(options).run({
        handoff: { request: 'Inspect', snapshot: {} }, signal: controller.signal,
      })) controller.abort();
    }, (error) => error.kind === 'cancelled');
  });
});
