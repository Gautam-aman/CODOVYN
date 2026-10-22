import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('CLI direct invocation runs through a symlinked installation path', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'codovyn-cli-link-'));
  try {
    const link = join(temporary, 'codovyn-cli.js');
    symlinkSync(resolve(import.meta.dirname, '../src/index.js'), link);
    const policy = { mode: 'balanced', models: [{ id: 'fixture', provider: 'codex', model: 'fixture',
      capabilities: ['streaming', 'tools'], reasoning: [], quality: 70, reliability: 0.8,
      availability: 'unknown', price: null }], allowUnknownAvailability: true };
    const result = spawnSync(process.execPath, [link, 'route', temporary, 'Explain the fixture'], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, CODOVYN_EVENT_STREAM: '1', CODOVYN_ROUTING_POLICY: JSON.stringify(policy),
        CODOVYN_DATA_DIR: temporary },
    });
    assert.equal(result.status, 0, result.stderr);
    const response = JSON.parse(result.stdout.trim());
    assert.equal(response.type, 'result');
    assert.equal(response.routing.selected.id, 'fixture');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
