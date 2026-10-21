import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentFailure } from '../../../packages/agent-core/src/index.js';
import { main } from '../src/index.js';

test('CLI auto mode hands a confirmed Codex quota failure to Claude', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-auto-'));
  const repository = join(directory, 'repo');
  const previous = process.env.CODOVYN_DATA_DIR;
  try {
    mkdirSync(repository);
    execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main']);
    process.env.CODOVYN_DATA_DIR = join(directory, 'data');
    const lines = [];
    const adapters = {
      createCodexAdapter: ({ cwd }) => ({ id: 'codex', capabilities: { writes: false },
        availability: async () => { assert.ok(cwd); return 'available'; },
        async *run() { throw new AgentFailure('quota', 'Structured quota'); } }),
      createClaudeAdapter: ({ cwd }) => ({ id: 'claude', capabilities: { writes: false },
        availability: async () => { assert.ok(cwd); return 'available'; },
        async *run({ handoff }) {
          if (handoff.request === 'Inspect repository') {
            assert.ok(handoff.history.some((event) => event.kind === 'checkpoint'));
          }
          yield { type: 'completed' };
        } }),
    };
    const output = { log: (line) => lines.push(line), error: () => assert.fail('unexpected usage error') };
    assert.equal(await main(['auto', repository, 'Inspect', 'repository'], output, undefined, undefined, adapters), 0);
    const result = JSON.parse(lines.at(-1));
    assert.equal(result.activeAgent, 'claude');
    assert.deepEqual(result.events.filter((event) => event.kind === 'handoff').map((event) => event.data.to), ['claude']);
    lines.length = 0;
    assert.equal(await main(['claude', repository, 'Inspect'], output, undefined, undefined, adapters), 0);
    assert.equal(JSON.parse(lines.at(-1)).activeAgent, 'claude');
  } finally {
    if (previous === undefined) delete process.env.CODOVYN_DATA_DIR;
    else process.env.CODOVYN_DATA_DIR = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
