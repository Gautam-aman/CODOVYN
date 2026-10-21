import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentFailure, AgentRegistry } from '../packages/agent-core/src/index.js';
import { TaskStore } from '../packages/storage/src/index.js';
import { TaskEngine } from '../packages/task-engine/src/index.js';
import { repositorySnapshot } from '../packages/git-engine/src/index.js';

test('a simulated rate limit hands a real repository edit to an eligible fallback', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-handoff-'));
  const storageDirectory = mkdtempSync(join(tmpdir(), 'codovyn-handoff-state-'));
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { stdio: 'pipe' });
  let store;
  try {
    git('init', '-q', '-b', 'feature');
    writeFileSync(join(directory, 'answer.js'), 'export const answer = 0;\n');
    git('add', 'answer.js');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'initial');
    const before = await repositorySnapshot(directory);
    store = new TaskStore(join(storageDirectory, 'task.sqlite'));
    store.create({ id: 'handoff', request: 'Set the answer to 42', repositoryRoot: before.root,
      primaryAgent: 'primary', fallbackAgents: ['fallback'] });
    const registry = new AgentRegistry();
    registry.register({ id: 'primary', capabilities: { writes: true }, availability: async () => 'available',
      async *run() { throw new AgentFailure('quota', 'Simulated limit'); } });
    registry.register({ id: 'fallback', capabilities: { writes: true }, availability: async () => 'available',
      async *run({ handoff }) {
        assert.equal(handoff.snapshot.commit, before.commit);
        assert.ok(handoff.history.some((event) => event.kind === 'checkpoint'));
        yield { type: 'tool-start', actionId: 'edit-answer' };
        writeFileSync(join(directory, 'answer.js'), 'export const answer = 42;\n');
        yield { type: 'tool-complete', actionId: 'edit-answer' };
        yield { type: 'completed', text: 'Updated and verified the answer' };
      } });
    const engine = new TaskEngine({ registry, store, snapshot: () => repositorySnapshot(directory) });
    const finished = await engine.run('handoff');
    assert.equal(finished.status, 'completed');
    assert.equal(finished.activeAgent, 'fallback');
    assert.equal(readFileSync(join(directory, 'answer.js'), 'utf8'), 'export const answer = 42;\n');
    execFileSync(process.execPath, ['--check', join(directory, 'answer.js')]);
    assert.deepEqual((await repositorySnapshot(directory)).changedPaths, ['answer.js']);
    assert.deepEqual(store.events('handoff').filter((event) => event.kind === 'handoff').map((event) => event.data.to), ['fallback']);
  } finally {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
    rmSync(storageDirectory, { recursive: true, force: true });
  }
});
