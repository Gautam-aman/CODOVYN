import { isSafeLogin } from './guardian/util.mjs';
import { readFile } from 'node:fs/promises';
import { createGitHubClient } from './lib/github-client.mjs';
import { CONTRIBUTOR_INTEREST_MARKER_PREFIX as MARKER } from './lib/markers.mjs';

const LIMIT = 2;
const HELP_URL = 'https://github.com/Gautam-aman/CODOVYN/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22';
const GUIDE_URL = 'https://github.com/Gautam-aman/CODOVYN/blob/main/CONTRIBUTING.md';
const INTEREST_PATTERNS = [
  /\b(?:i(?:'d| would)?|we(?:'d| would)?|would|'d)?(?:\s+(?:really|also|just))*\s*(?:like|love|want) to (?:work on|contribute(?: to)?|help(?: (?:with|on))?|take(?: on)?|handle|fix|resolve|implement|improve|be assigned)\b/i,
  /\b(?:i(?:'m| am)|we(?:'re| are)) (?:very |really )?interested in (?:working on|contributing(?: to)?|helping(?: (?:with|on))?|taking(?: on)?|this|the)\b/i,
  /\binterested in (?:working on|contributing(?: to)?|helping(?: (?:with|on))?|taking(?: on)?|this (?:issue|problem|task)|the (?:issue|problem|task))\b/i,
  /\b(?:can|could|may|would) (?:i|we) (?:please )?(?:work on|contribute(?: to)?|help(?: (?:with|on))?|take(?: on)?|handle|fix|resolve|implement|improve|be assigned|try)\b/i,
  /\b(?:can|could|would|will) (?:you|someone|anyone|a maintainer) (?:please )?assign (?:me|this|it|the (?:issue|problem|task))\b/i,
  /\bplease (?:assign|add) (?:me|this|it|the (?:issue|problem|task))\b/i,
  /\b(?:assign|add) (?:me|this|it|the (?:issue|problem|task))\b/i,
  /\b(?:i(?:'d| would)? (?:like|love|want)|please) (?:to be|be) assigned(?: to)? (?:this|it|the (?:issue|problem|task))?\b/i,
  /\b(?:i(?:'d| would)? (?:like|love|want)|(?:can|could|may) i have) (?:this (?:issue|problem|task)|this|it|the (?:issue|problem|task)) (?:to be )?assigned to me\b/i,
];
const NOT_INTERESTED = /\b(?:not interested|no longer interested|(?:do not|don't) want|(?:do not|don't) plan|(?:can't|cannot|won't|unable to) work|(?:do not|don't|please don't) assign)\b/i;

function isBot(user) {
  return user?.type === 'Bot' || /\[bot\]$/i.test(user?.login ?? '');
}

export function classify(body) {
  const message = body.trim();
  const normalized = message.replace(/[‘’]/g, "'");
  if (/^\/assign$/i.test(normalized)) return 'assign';
  if (/^\/unassign$/i.test(normalized)) return 'unassign';
  if (/\$\{/.test(normalized) || NOT_INTERESTED.test(normalized)) return null;
  if (INTEREST_PATTERNS.some((pattern) => pattern.test(normalized))) return 'interest';
  return null;
}

function sensitive(issue) {
  return issue.labels.some((label) => /^(security|security-sensitive|vulnerability|maintainer-only|no-auto-assign|restricted)$/i.test(typeof label === 'string' ? label : label.name))
    || /\b(?:security|vulnerabilit(?:y|ies)|cve-\d{4}|credential(?:s)?|secret(?:s)?|authentication|keychain|password|token)\b/i.test(issue.title);
}

export async function handle(event, api) {
  const { issue, comment } = event;
  if (!issue || !comment || issue.pull_request || issue.state !== 'open' || isBot(comment.user)) return;
  const command = classify(comment.body ?? '');
  if (!command) return;
  const login = comment.user.login;
  if (!isSafeLogin(login)) return;
  const eventMarker = Number.isSafeInteger(comment.id) ? `<!-- codovyn-contributor-event:${comment.id} -->` : '';
  if (eventMarker && (await api.comments(issue.number)).some(item => item.user?.login === 'github-actions[bot]' && item.user?.type === 'Bot' && item.body?.startsWith(eventMarker))) return;
  const number = issue.number;
  const say = (body) => api.comment(number, eventMarker ? `${eventMarker}\n${body}` : body);

  // Re-read mutable issue state after the workflow's issue lock is acquired.
  const current = await api.issue(number);
  if (current.state !== 'open' || current.pull_request) return;

  if (command === 'interest') {
    const marker = `${MARKER}${login.toLowerCase()} -->`;
    const comments = await api.comments(number);
    if (comments.some((item) => isBot(item.user) && item.body?.includes(marker))) return;
    if (sensitive(current)) { await say(`${marker}\nThanks for your interest in CODOVYN, @${login}. A maintainer handles assignments for this restricted issue. Please ask here for guidance.`); return; }
    await say(`${marker}\nHey @${login}! Thanks for your interest in CODOVYN! 🚀\n\nFeel free to take this up. Comment \`/assign\` to claim the issue. Our [setup and contribution guide](${GUIDE_URL}) can help you get started. Looking forward to your PR!`);
    return;
  }

  const assignees = current.assignees.map((user) => user.login);
  if (command === 'unassign') {
    if (!assignees.includes(login)) return;
    try { await api.unassign(number, login); } catch (error) { if (![403,422].includes(error.status)) throw error; await say('GitHub could not update this assignment. Please ask a maintainer for help.'); return; }
    await say(`@${login}, you’ve been unassigned. Thanks for letting us know!`);
    return;
  }

  if (sensitive(current)) {
    await say(`Thanks for offering to help, @${login}. A maintainer handles assignments for this issue. Please ask here if you need guidance.`);
    return;
  }
  if (assignees.includes(login)) {
    await say(`@${login}, you’re already assigned to this issue.`);
    return;
  }
  if (assignees.length) {
    await say(`This issue is currently being worked on by @${assignees[0]}. Feel free to explore our [other open good first issues](${HELP_URL})!`);
    return;
  }
  const active = await api.assignedOpenIssues(login);
  if (active.filter((item) => !item.pull_request).length >= LIMIT) {
    await say(`@${login}, you already have ${LIMIT} open issues assigned. Please finish one or comment \`/unassign\` there before claiming another.`);
    return;
  }
  try {
    await api.assign(number, login);
  } catch (error) {
    if (![403, 422].includes(error.status)) throw error;
    await say(`@${login}, GitHub couldn't assign you automatically. Please ask a maintainer here for help.`);
    return;
  }
  // A maintainer can change assignees outside the workflow's concurrency lock.
  const after = await api.issue(number);
  if (after.assignees.some((user) => user.login !== login)) {
    await api.unassign(number, login);
    await say(`This issue is currently being worked on by @${after.assignees.find((user) => user.login !== login).login}. Feel free to explore our [other open good first issues](${HELP_URL})!`);
    return;
  }
  await say(`Thanks, @${login}! You’re assigned to this issue. Please link it in your PR and ask here if you need help.`);
}

function githubApi(token, owner, repo) {
  const client = createGitHubClient({ token, owner, repo });
  return {
    issue: (number) => client.getIssue(number),
    comments: (number) => client.listIssueComments(number),
    assignedOpenIssues: (login) => client.listIssuesAssignedTo(login),
    comment: (number, body) => client.createIssueComment(number, body),
    assign: (number, login) => client.assignIssue(number, login),
    unassign: (number, login) => client.unassignIssue(number, login),
  };
}

async function runCli() {
  if (process.env.COMMUNITY_BOTS_ENABLED !== 'true') { console.log('CODOVYN community writes disabled; maintainer rollout required'); return; }
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  await handle(event, githubApi(process.env.GH_TOKEN || process.env.GITHUB_TOKEN, owner, repo));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runCli().catch((error) => {
    console.error(`contributor-bot: ${error?.diagnostic?.() ?? error?.message ?? 'unexpected failure'}`);
    process.exitCode = 1;
  });
}
