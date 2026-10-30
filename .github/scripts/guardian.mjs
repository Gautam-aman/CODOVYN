import { readFile } from 'node:fs/promises';
import { createGitHubClient } from './lib/github-client.mjs';
import {
  loadConfig,
  repositoryFromEnv,
  runGuardian,
} from './guardian/index.mjs';

export async function main({
  env = process.env,
  fetchImpl = globalThis.fetch,
  log = console.log,
} = {}) {
  if (!env.GITHUB_EVENT_PATH) throw new Error('GITHUB_EVENT_PATH is not set');
  const raw = await readFile(env.GITHUB_EVENT_PATH, 'utf8');
  const event = JSON.parse(raw);
  const { owner, repo } = repositoryFromEnv(env);
  const token = env.GUARDIAN_TOKEN || env.GITHUB_TOKEN;
  if (!token) throw new Error('GUARDIAN_TOKEN or GITHUB_TOKEN is required');

  const api = createGitHubClient({
    token,
    owner,
    repo,
    fetchImpl,
    apiBase: env.GITHUB_API_URL || 'https://api.github.com',
  });
  const config = loadConfig(env);
  const eventName = env.GITHUB_EVENT_NAME || 'unknown';
  const result = await runGuardian({
    eventName,
    event,
    api,
    config,
    log,
  });
  if (result.failed) process.exitCode = 1;
  return result;
}

const isMain = process.argv[1]
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
  main().catch((error) => {
    console.error(`guardian: ${error?.diagnostic?.() ?? error?.message ?? 'unexpected failure'}`);
    process.exitCode = 1;
  });
}
