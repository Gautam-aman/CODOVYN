import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { repositorySnapshot } from './index.js';

const execute = promisify(execFile);
const taskIdPattern = /^[a-zA-Z0-9_-]{1,80}$/;

function draftPath(directory, taskId) {
  if (typeof taskId !== 'string' || !taskIdPattern.test(taskId)) throw new TypeError('Invalid task id');
  return join(directory, taskId);
}

async function git(root, args, maxBuffer = 1024 * 1024) {
  const { stdout } = await execute('git', ['-C', root, ...args], {
    encoding: 'utf8', timeout: 30_000, maxBuffer,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return stdout;
}

async function gitApply(root, args, patch) {
  await new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', root, 'apply', ...args, '-'], {
      stdio: ['pipe', 'pipe', 'pipe'], shell: false,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2048); });
    child.stdout.resume();
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Patch cannot be applied: ${stderr.trim() || `Git status ${code}`}`)));
    child.stdin.end(patch);
  });
}

async function validateDraft(repository, draftsDirectory, taskId, baseCommit) {
  const path = await realpath(draftPath(draftsDirectory, taskId));
  const root = await realpath(repository);
  if (path !== join(await realpath(draftsDirectory), taskId)) throw new Error('Draft path was redirected');
  const common = await realpath(resolve(root, (await git(root, ['rev-parse', '--git-common-dir'])).trim()));
  const draftCommon = await realpath(resolve(path, (await git(path, ['rev-parse', '--git-common-dir'])).trim()));
  if (common !== draftCommon) throw new Error('Draft belongs to a different Git repository');
  if (await realpath((await git(path, ['rev-parse', '--show-toplevel'])).trim()) !== path) {
    throw new Error('Invalid draft worktree');
  }
  if ((await git(path, ['rev-parse', 'HEAD'])).trim() !== baseCommit) {
    throw new Error('Draft HEAD changed; review committed changes manually before continuing');
  }
  return { path, root };
}

/** A clean repository is required so the draft sees exactly the reviewed base. */
export async function createDraftWorkspace(repository, draftsDirectory, taskId) {
  const snapshot = await repositorySnapshot(repository);
  if (!snapshot.commit || snapshot.dirty) throw new Error('Commit or remove working-tree changes before starting an edit draft');
  await mkdir(draftsDirectory, { recursive: true, mode: 0o700 });
  const path = draftPath(draftsDirectory, taskId);
  await git(snapshot.root, ['worktree', 'add', '--detach', path, snapshot.commit]);
  return { path, baseCommit: snapshot.commit, branch: snapshot.branch, repositoryRoot: snapshot.root };
}

/** Include new files in the review, but never stage anything in the user's repository. */
export async function reviewDraftWorkspace(repository, draftsDirectory, taskId, baseCommit) {
  const { path } = await validateDraft(repository, draftsDirectory, taskId, baseCommit);
  await git(path, ['add', '-A', '--']);
  const patch = await git(path, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv', '--no-color', baseCommit, '--']);
  if (/^(?:new file mode|new mode) (?:120000|160000)$/m.test(patch)) {
    throw new Error('Drafts cannot add symlinks or Git submodules');
  }
  if (!patch) return { patch: '', patchHash: null, changedPaths: [] };
  const names = await git(path, ['diff', '--cached', '--name-only', '-z', baseCommit, '--']);
  return { patch, patchHash: createHash('sha256').update(patch).digest('hex'),
    changedPaths: names.split('\0').filter(Boolean) };
}

/** Apply only the exact patch the user reviewed, if the original base is still clean. */
export async function acceptDraftWorkspace(repository, draftsDirectory, taskId, baseCommit, expectedHash) {
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new TypeError('Reviewed patch hash is required');
  const review = await reviewDraftWorkspace(repository, draftsDirectory, taskId, baseCommit);
  if (!review.patch || review.patchHash !== expectedHash) throw new Error('Draft changed since review; inspect it again');
  const snapshot = await repositorySnapshot(repository);
  if (snapshot.commit !== baseCommit || snapshot.dirty) throw new Error('Repository changed since draft creation; reconcile before accepting');
  await gitApply(snapshot.root, ['--check', '--binary'], review.patch);
  await gitApply(snapshot.root, ['--binary'], review.patch);
  await git(snapshot.root, ['worktree', 'remove', '--force', draftPath(draftsDirectory, taskId)]);
  return { changedPaths: review.changedPaths, snapshot: await repositorySnapshot(snapshot.root) };
}

/** Rejecting a draft deletes its isolated worktree, including its ignored build outputs. */
export async function rejectDraftWorkspace(repository, draftsDirectory, taskId, baseCommit) {
  const { root, path } = await validateDraft(repository, draftsDirectory, taskId, baseCommit);
  await git(root, ['worktree', 'remove', '--force', path]);
  return { rejected: true };
}
