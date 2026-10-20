import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

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
  let commit = null;
  try { commit = await git('rev-parse', '--verify', 'HEAD'); }
  catch (error) { if (error.code !== 128) throw error; }
  const porcelain = await git('status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=normal');
  const changedPaths = porcelain.split('\0').filter(Boolean).map((record) => record.slice(3));
  return { root, branch: branch || null, commit, dirty: changedPaths.length > 0, changedPaths };
}

/** A bounded, read-only patch for the active repository. */
export async function repositoryDiff(directory, { staged = false } = {}) {
  const cwd = await realpath(directory);
  const args = ['-C', cwd, 'diff', ...(staged ? ['--cached'] : []), '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--'];
  try {
    return (await execute('git', args, { encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })).stdout;
  } catch (error) {
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') throw new Error('Diff exceeds the 1 MiB display limit');
    throw error;
  }
}

/** Stage only caller-selected repository-relative paths. */
export async function stagePaths(directory, paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.some((path) =>
    typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\0') ||
    path.split(/[\\/]/).some((part) => part === '..'))) {
    throw new TypeError('Stage paths must be repository-relative and cannot contain parent traversal');
  }
  const root = (await repositorySnapshot(directory)).root;
  await execute('git', ['-C', root, 'add', '-A', '--', ...paths], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  return repositorySnapshot(root);
}

/** Commit the current index without executing repository-provided Git hooks. */
export async function commitStaged(directory, message) {
  if (typeof message !== 'string' || !message.trim() || message.length > 500 || message.includes('\0')) {
    throw new TypeError('Commit message must contain 1 to 500 characters');
  }
  const root = (await repositorySnapshot(directory)).root;
  try { await execute('git', ['-C', root, 'diff', '--cached', '--quiet'], { timeout: 10_000 }); }
  catch (error) { if (error.code !== 1) throw error; }
  const staged = await repositoryDiff(root, { staged: true });
  if (!staged) throw new Error('No staged changes to commit');
  const emptyHooks = await mkdtemp(join(tmpdir(), 'codovyn-hooks-'));
  try {
    await execute('git', ['-C', root, '-c', `core.hooksPath=${emptyHooks}`, 'commit', '-m', message],
      { timeout: 30_000, maxBuffer: 1024 * 1024 });
  } finally { await rm(emptyHooks, { recursive: true, force: true }); }
  return repositorySnapshot(root);
}
