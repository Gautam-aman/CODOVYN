import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { obtainArtifact, validateArtifact } from '../build/artifacts.js';

const bytes = 'deterministic artifact';
const artifact = { filename: 'artifact.zip', url: 'https://github.com/VSCodium/vscodium/artifact.zip',
  sha256: createHash('sha256').update(bytes).digest('hex') };

test('downloads verify bytes before caching and reuse only a verified artifact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codovyn-artifacts-'));
  let requests = 0;
  const fetcher = async () => { requests++; return new Response(bytes); };
  try {
    const path = await obtainArtifact(artifact, directory, { fetcher });
    assert.equal(await readFile(path, 'utf8'), bytes);
    assert.equal(await obtainArtifact(artifact, directory, { fetcher }), path);
    assert.equal(requests, 1);
    await writeFile(path, 'corrupt');
    await assert.rejects(obtainArtifact(artifact, directory, { fetcher }), /Cached artifact checksum/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a checksum failure removes partial data and rejects unsafe artifact sources', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codovyn-artifacts-'));
  try {
    await assert.rejects(obtainArtifact(artifact, directory, { fetcher: async () => new Response('wrong') }), /checksum mismatch/);
    assert.deepEqual(await readdir(directory), []);
    for (const overrides of [{ filename: '../escape' }, { url: 'http://github.com/a' }, { url: 'https://evil.invalid/a' }]) {
      assert.throws(() => validateArtifact({ ...artifact, ...overrides }));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
