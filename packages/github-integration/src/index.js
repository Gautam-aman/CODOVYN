import { execFile } from 'node:child_process';
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
  } catch {
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
