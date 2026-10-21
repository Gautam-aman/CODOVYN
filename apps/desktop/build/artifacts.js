import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, rename, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function fileHash(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export function validateArtifact(artifact) {
  if (!artifact || typeof artifact.filename !== 'string' || basename(artifact.filename) !== artifact.filename ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]+$/.test(artifact.filename) || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
    throw new TypeError('Invalid pinned artifact');
  }
  const url = new URL(artifact.url);
  if (url.protocol !== 'https:' || url.username || url.password ||
    !['github.com', 'nodejs.org'].includes(url.hostname)) throw new TypeError('Artifact source is not approved');
}

/** Only verified regular files enter the cache; partial or corrupt downloads never do. */
export async function obtainArtifact(artifact, directory, { fetcher = fetch } = {}) {
  validateArtifact(artifact);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = join(directory, artifact.filename);
  try {
    const stat = await lstat(destination);
    if (!stat.isFile()) throw new Error('Artifact cache entry must be a regular file');
    if (await fileHash(destination) === artifact.sha256) return destination;
    throw new Error('Cached artifact checksum mismatch; remove this cache entry and retry');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = join(directory, `${artifact.filename}.${randomUUID()}.partial`);
  try {
    const response = await fetcher(artifact.url, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok || !response.body) throw new Error(`Artifact download failed (${response.status})`);
    let received = 0;
    const bound = new Transform({ transform(chunk, _encoding, callback) {
      received += chunk.length;
      callback(received > 600 * 1024 * 1024 ? new Error('Artifact exceeds download size limit') : null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), bound, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    if (await fileHash(temporary) !== artifact.sha256) throw new Error('Downloaded artifact checksum mismatch');
    await rename(temporary, destination);
    return destination;
  } finally { await rm(temporary, { force: true }); }
}
