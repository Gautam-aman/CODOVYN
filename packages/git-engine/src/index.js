import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';

const execute = promisify(execFile);

/** Read-only repository identity for checkpoints. No file contents leave Git. */
export async function repositorySnapshot(directory) {
  const cwd = await realpath(directory);
  const git = async (...args) => (await execute('git', ['-C', cwd, ...args], {
    encoding: 'utf8', timeout: 10_000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  })).stdout.trimEnd();
  const root = await realpath(await git('rev-parse', '--show-toplevel'));
  const branch = await git('branch', '--show-current');
  const commit = await git('rev-parse', 'HEAD');
  const porcelain = await git('status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=normal');
  const changedPaths = porcelain.split('\0').filter(Boolean).map((record) => record.slice(3));
  return { root, branch: branch || null, commit, dirty: changedPaths.length > 0, changedPaths };
}
