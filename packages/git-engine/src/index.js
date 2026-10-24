import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { promisify } from 'node:util';
import { lstat, mkdtemp, readlink, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const execute = promisify(execFile);

async function configuredRemote(root, remote) {
  if (typeof remote !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(remote)) {
    throw new TypeError('Remote must be a configured Git remote name');
  }
  const remotes = (await execute('git', ['-c','core.fsmonitor=false','-C', root, 'remote'], { encoding: 'utf8', timeout: 10_000 })).stdout.split('\n');
  if (!remotes.includes(remote)) throw new Error(`Unknown Git remote: ${remote}`);
}

/** Read-only repository identity for checkpoints. No file contents leave Git. */
export async function repositorySnapshot(directory) {
  const cwd = await realpath(directory);
  const git = async (...args) => (await execute('git', ['-c','core.fsmonitor=false','-C', cwd, ...args], {
    encoding: 'utf8', timeout: 10_000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  })).stdout.trimEnd();
  const root = await realpath(await git('rev-parse', '--show-toplevel'));
  const branch = await git('branch', '--show-current');
  let commit = null;
  try { commit = await git('rev-parse', '--verify', 'HEAD'); }
  catch (error) { if (error.code !== 128) throw error; }
  const porcelain = await git('status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all');
  const changedPaths = porcelain.split('\0').filter(Boolean).map((record) => record.slice(3));
  const hash = createHash('sha256');
  hash.update(await git('diff', '--cached', '--raw', '-z', '--no-ext-diff', '--no-textconv'));
  for (const path of [...changedPaths].sort()) {
    const absolute = join(root, path);
    let info;
    try { info = await lstat(absolute); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hash.update(JSON.stringify([path, 'deleted']));
      continue;
    }
    hash.update(JSON.stringify([path, info.mode & 0o777, info.size]));
    if (info.isSymbolicLink()) hash.update(await readlink(absolute));
    else if (info.isFile()) for await (const chunk of createReadStream(absolute)) hash.update(chunk);
  }
  return { root, branch: branch || null, commit, dirty: changedPaths.length > 0,
    changedPaths, workingTreeHash: hash.digest('hex') };
}

/** A bounded, read-only patch for the active repository. */
export async function repositoryDiff(directory, { staged = false } = {}) {
  const cwd = await realpath(directory);
  const args = ['-c','core.fsmonitor=false','-C', cwd, 'diff', ...(staged ? ['--cached'] : []), '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--'];
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
  await execute('git', ['-c','core.fsmonitor=false','-C', root, 'add', '-A', '--', ...paths], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  return repositorySnapshot(root);
}

/** Commit the current index without executing repository-provided Git hooks. */
export async function commitStaged(directory, message) {
  if (typeof message !== 'string' || !message.trim() || message.length > 500 || message.includes('\0')) {
    throw new TypeError('Commit message must contain 1 to 500 characters');
  }
  const root = (await repositorySnapshot(directory)).root;
  let hasStagedChanges = false;
  try { await execute('git', ['-c','core.fsmonitor=false','-C', root, 'diff', '--cached', '--quiet'], { timeout: 10_000 }); }
  catch (error) {
    if (error.code !== 1) throw error;
    hasStagedChanges = true;
  }
  if (!hasStagedChanges) throw new Error('No staged changes to commit');
  const emptyHooks = await mkdtemp(join(tmpdir(), 'codovyn-hooks-'));
  try {
    await execute('git', ['-c','core.fsmonitor=false','-C', root, '-c', `core.hooksPath=${emptyHooks}`, 'commit', '-m', message],
      { timeout: 30_000, maxBuffer: 1024 * 1024 });
  } finally { await rm(emptyHooks, { recursive: true, force: true }); }
  return repositorySnapshot(root);
}

/** Create and enter a new local branch without running repository hooks. */
export async function createBranch(directory, name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(name)) {
    throw new TypeError('Invalid Git branch name');
  }
  const snapshot = await repositorySnapshot(directory);
  if (!snapshot.commit) throw new Error('Commit the repository before creating a branch');
  try { await execute('git', ['-c','core.fsmonitor=false','-C', snapshot.root, 'check-ref-format', '--branch', name], { timeout: 10_000 }); }
  catch { throw new TypeError('Invalid Git branch name'); }
  const emptyHooks = await mkdtemp(join(tmpdir(), 'codovyn-hooks-'));
  try {
    await execute('git', ['-c','core.fsmonitor=false','-C', snapshot.root, '-c', `core.hooksPath=${emptyHooks}`, 'switch', '-c', name],
      { timeout: 30_000, maxBuffer: 1024 * 1024 });
  } finally { await rm(emptyHooks, { recursive: true, force: true }); }
  return repositorySnapshot(snapshot.root);
}

/** Push the current branch to an already configured remote without force. */
export async function pushCurrentBranch(directory, remote = 'origin') {
  const snapshot = await repositorySnapshot(directory);
  if (!snapshot.branch || !snapshot.commit) throw new Error('A committed branch is required before pushing');
  await configuredRemote(snapshot.root, remote);
  const emptyHooks = await mkdtemp(join(tmpdir(), 'codovyn-hooks-'));
  try {
    await execute('git', ['-c','core.fsmonitor=false','-C', snapshot.root, '-c', `core.hooksPath=${emptyHooks}`, 'push', '--porcelain', remote, `HEAD:refs/heads/${snapshot.branch}`],
      { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  } catch { throw new Error('Git push failed; check remote access and branch state'); }
  finally { await rm(emptyHooks, { recursive: true, force: true }); }
  return { branch: snapshot.branch, commit: snapshot.commit, remote };
}

/** Fetch a configured remote without changing the active branch or working tree. */
export async function fetchRemote(directory, remote = 'origin') {
  const snapshot = await repositorySnapshot(directory);
  await configuredRemote(snapshot.root, remote);
  const emptyHooks = await mkdtemp(join(tmpdir(), 'codovyn-hooks-'));
  try {
    await execute('git', ['-c','core.fsmonitor=false','-C', snapshot.root, '-c', `core.hooksPath=${emptyHooks}`, '-c', 'protocol.ext.allow=never',
      'fetch', '--no-tags', remote], { timeout: 60_000, maxBuffer: 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  } catch { throw new Error('Git fetch failed; check remote access'); }
  finally { await rm(emptyHooks, { recursive: true, force: true }); }
  return { remote, snapshot: await repositorySnapshot(snapshot.root) };
}

/** Update a clean local branch only when the remote can fast-forward it. */
export async function pullFastForward(directory, remote = 'origin') {
  const snapshot = await repositorySnapshot(directory);
  if (!snapshot.branch || !snapshot.commit) throw new Error('A committed branch is required before pulling');
  if (snapshot.dirty) throw new Error('Commit or remove working-tree changes before pulling');
  await configuredRemote(snapshot.root, remote);
  const emptyHooks = await mkdtemp(join(tmpdir(), 'codovyn-hooks-'));
  try {
    await execute('git', ['-c','core.fsmonitor=false','-C', snapshot.root, '-c', `core.hooksPath=${emptyHooks}`, '-c', 'protocol.ext.allow=never',
      'pull', '--ff-only', '--no-rebase', remote, snapshot.branch], { timeout: 60_000, maxBuffer: 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  } catch { throw new Error('Git pull failed; the branch may have diverged or remote access may be unavailable'); }
  finally { await rm(emptyHooks, { recursive: true, force: true }); }
  return repositorySnapshot(snapshot.root);
}
