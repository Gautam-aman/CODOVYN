import test from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { main } from '../src/index.js';

test('agent inspection uses an explicitly configured executable without claiming authentication', async () => {
  const previous = process.env.CODOVYN_GEMINI_COMMAND;
  const seen = []; const output = [];
  process.env.CODOVYN_GEMINI_COMMAND = process.execPath;
  try {
    const adapters = Object.fromEntries(['Codex', 'Claude', 'Gemini'].map(name => [
      `create${name}Adapter`, options => {
        if (name === 'Gemini') seen.push(options.command);
        return { capabilities: { streaming: true }, availability: async () => 'available' };
      },
    ]));
    const status = await main(['agents', process.cwd()], { log: line => output.push(JSON.parse(line)), error() {} },
      undefined, {}, adapters);
    assert.equal(status, 0);
    assert.deepEqual(seen, [realpathSync(process.execPath)]);
    assert.equal(output[0].agents.find(agent => agent.id === 'gemini').authentication, 'unknown');
  } finally {
    if (previous === undefined) delete process.env.CODOVYN_GEMINI_COMMAND;
    else process.env.CODOVYN_GEMINI_COMMAND = previous;
  }
});

test('an invalid Gemini executable reports a configuration error without running it', async () => {
  const previous = process.env.CODOVYN_GEMINI_COMMAND;
  const output = [];
  process.env.CODOVYN_GEMINI_COMMAND = 'relative/gemini';
  try {
    const adapters = Object.fromEntries(['Codex', 'Claude', 'Gemini'].map(name => [
      `create${name}Adapter`, () => ({ capabilities: {}, availability: async () => 'available' }),
    ]));
    await main(['agents', process.cwd()], { log: line => output.push(JSON.parse(line)), error() {} },
      undefined, {}, adapters);
    const gemini = output[0].agents.find(agent => agent.id === 'gemini');
    assert.equal(gemini.installation, 'configuration-error');
    assert.equal(gemini.availability, 'unknown');
  } finally {
    if (previous === undefined) delete process.env.CODOVYN_GEMINI_COMMAND;
    else process.env.CODOVYN_GEMINI_COMMAND = previous;
  }
});
