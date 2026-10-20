import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const repositoryPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export async function runGh(args) {
  try {
    const { stdout } = await exec('gh', args, {
      encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: '1' },
    });
    return stdout;
  } catch (error) {
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      throw new Error('GitHub response exceeds the 1 MiB display limit');
    }
    throw new Error('GitHub CLI request failed; check gh installation, authentication, and repository access');
  }
}

export function validateRepository(repository) {
  if (typeof repository !== 'string' || !repositoryPattern.test(repository) || repository.includes('..')) {
    throw new TypeError('GitHub repository must be OWNER/REPO');
  }
  return repository;
}

function parseList(output) {
  let records;
  try { records = JSON.parse(output); }
  catch { throw new Error('GitHub CLI returned invalid JSON'); }
  if (!Array.isArray(records)) throw new Error('GitHub CLI returned an invalid list');
  return records;
}

function parseObject(output) {
  let record;
  try { record = JSON.parse(output); }
  catch { throw new Error('GitHub CLI returned invalid JSON'); }
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('GitHub CLI returned an invalid record');
  return record;
}

function validateNumber(number, kind) {
  if (!Number.isSafeInteger(number) || number < 1) throw new TypeError(`${kind} number must be positive`);
}

/** Read public or authorized repository issues using the user's GitHub CLI session. */
export async function listIssues(repository, { limit = 30, run = runGh } = {}) {
  validateRepository(repository);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Issue limit must be between 1 and 100');
  const output = await run(['issue', 'list', '--repo', repository, '--state', 'open', '--limit', String(limit),
    '--json', 'number,title,state,url,labels']);
  return parseList(output).map((issue) => ({
    number: issue.number, title: issue.title, state: issue.state, url: issue.url,
    labels: issue.labels?.map((label) => label.name) ?? [],
  }));
}

/** Inspect one issue without executing or trusting its Markdown body. */
export async function issueDetails(repository, number, { run = runGh } = {}) {
  validateRepository(repository);
  validateNumber(number, 'Issue');
  const issue = parseObject(await run(['issue', 'view', String(number), '--repo', repository,
    '--json', 'number,title,body,state,url,labels,author,createdAt,updatedAt']));
  if (issue.number !== number || typeof issue.title !== 'string' || typeof issue.body !== 'string') {
    throw new Error('GitHub CLI returned invalid issue details');
  }
  return { number, title: issue.title, body: issue.body, state: issue.state, url: issue.url,
    labels: issue.labels?.map((label) => label.name) ?? [], author: issue.author?.login ?? null,
    createdAt: issue.createdAt, updatedAt: issue.updatedAt };
}

/** List PR metadata without fetching source diffs or executing PR code. */
export async function listPullRequests(repository, { limit = 30, run = runGh } = {}) {
  validateRepository(repository);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Pull request limit must be between 1 and 100');
  const output = await run(['pr', 'list', '--repo', repository, '--state', 'open', '--limit', String(limit),
    '--json', 'number,title,state,url,headRefName,baseRefName,isDraft']);
  return parseList(output).map((pullRequest) => ({
    number: pullRequest.number, title: pullRequest.title, state: pullRequest.state, url: pullRequest.url,
    headRefName: pullRequest.headRefName, baseRefName: pullRequest.baseRefName,
    isDraft: pullRequest.isDraft,
  }));
}

/** Inspect one PR's metadata and description without checking out its branch. */
export async function pullRequestDetails(repository, number, { run = runGh } = {}) {
  validateRepository(repository);
  validateNumber(number, 'Pull request');
  const pullRequest = parseObject(await run(['pr', 'view', String(number), '--repo', repository,
    '--json', 'number,title,body,state,url,headRefName,baseRefName,isDraft,author,reviewDecision']));
  if (pullRequest.number !== number || typeof pullRequest.title !== 'string' || typeof pullRequest.body !== 'string') {
    throw new Error('GitHub CLI returned invalid pull request details');
  }
  return { number, title: pullRequest.title, body: pullRequest.body, state: pullRequest.state, url: pullRequest.url,
    headRefName: pullRequest.headRefName, baseRefName: pullRequest.baseRefName, isDraft: pullRequest.isDraft,
    author: pullRequest.author?.login ?? null, reviewDecision: pullRequest.reviewDecision ?? null };
}

/** A bounded read-only PR patch for review, with no checkout or PR code execution. */
export async function pullRequestDiff(repository, number, { run = runGh } = {}) {
  validateRepository(repository);
  validateNumber(number, 'Pull request');
  const patch = await run(['pr', 'diff', String(number), '--repo', repository, '--color', 'never', '--patch']);
  if (typeof patch !== 'string' || Buffer.byteLength(patch) > 1024 * 1024) {
    throw new Error('GitHub response exceeds the 1 MiB display limit');
  }
  return patch;
}

/** Create an issue only when explicitly invoked, using existing gh authorization. */
export async function createIssue(repository, { title, body, labels = [] }, { run = runGh } = {}) {
  validateRepository(repository);
  if (typeof title !== 'string' || !title.trim() || title.length > 256 || title.includes('\0')) {
    throw new TypeError('Issue title must contain 1 to 256 characters');
  }
  if (typeof body !== 'string' || !body.trim() || body.length > 65_536 || body.includes('\0')) {
    throw new TypeError('Issue body must contain 1 to 65536 characters');
  }
  if (!Array.isArray(labels) || labels.length > 10 || labels.some((label) =>
    typeof label !== 'string' || !label.trim() || label.length > 100 || label.includes('\0'))) {
    throw new TypeError('Issue labels must be a list of at most 10 names');
  }
  const temporary = await mkdtemp(join(tmpdir(), 'codovyn-issue-'));
  try {
    const bodyFile = join(temporary, 'body.md');
    await writeFile(bodyFile, body, { mode: 0o600 });
    const args = ['issue', 'create', '--repo', repository, '--title', title, '--body-file', bodyFile,
      ...labels.flatMap((label) => ['--label', label])];
    const output = (await run(args)).trim();
    const match = /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/([1-9]\d*)$/.exec(output);
    if (!match || new URL(output).pathname.toLowerCase() !== `/${repository}/issues/${match[1]}`.toLowerCase()) {
      throw new Error('GitHub CLI did not return a valid issue URL; verify before retrying');
    }
    return { number: Number(match[1]), url: output };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
