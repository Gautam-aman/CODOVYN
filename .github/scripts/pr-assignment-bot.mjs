import { readFile } from 'node:fs/promises';
import { createGitHubClient } from './lib/github-client.mjs';
import { extractIssueNumbers } from './lib/issue-references.mjs';
import {
  DEFAULT_BOT_LOGIN,
  GUARDIAN_SUMMARY_MARKER,
  PR_ASSIGNMENT_COMMENT_MARKER as COMMENT_MARKER,
  PR_ASSIGNMENT_RESOLUTION_MARKER as RESOLUTION_MARKER,
} from './lib/markers.mjs';

export { COMMENT_MARKER, RESOLUTION_MARKER, extractIssueNumbers };
export const LABELS = Object.freeze({
  awaiting: 'awaiting-issue-assignment',
  ok: 'contribution-policy-ok',
  exception: 'no-issue-required',
});

const ACTIONS_BOT_LOGIN = 'github-actions[bot]';
const SUPERSEDED_BODY = `${COMMENT_MARKER}\n${RESOLUTION_MARKER}\n🛡️ Assignment feedback is now included in the CODOVYN Guardian summary above. This comment will not be updated again.`;

function isBot(user) {
  return user?.type === 'Bot' || /\[bot\]$/i.test(user?.login ?? '');
}

function isOwnComment(comment) {
  return comment?.user?.login?.toLowerCase() === ACTIONS_BOT_LOGIN && comment.body?.includes(COMMENT_MARKER);
}

function isGuardianComment(comment) {
  const guardianLogin = process.env.GUARDIAN_BOT_LOGIN || DEFAULT_BOT_LOGIN;
  return comment?.user?.login === guardianLogin
    && comment?.user?.type === 'Bot'
    && comment.body?.startsWith(GUARDIAN_SUMMARY_MARKER);
}

function labelNames(labels = []) {
  return labels.map((label) => typeof label === 'string' ? label : label?.name).filter(Boolean);
}

function hasLabel(labels, name) {
  return labels.some((label) => label.toLowerCase() === name.toLowerCase());
}

function policyResult({ pull, issues, exception, bypass }) {
  if (bypass) return { state: 'bypass', issues, body: null, labels: [] };
  if (exception) return { state: 'exception', issues, body: null, labels: [LABELS.exception, LABELS.ok] };
  if (!issues.length) {
    return {
      state: 'missing', issues,
      body: `${COMMENT_MARKER}\n👋 Thanks for opening this pull request, @${pull.user.login}!\n\nCould you link the issue this PR addresses using \`Closes #123\` or explain why an issue is not needed? A maintainer can add the \`${LABELS.exception}\` label for documentation or maintenance work.\n\nThis is an advisory reminder and does not block review.\n\n— CODOVYN Contributor Bot`,
      labels: [LABELS.awaiting],
    };
  }
  const assignedElsewhere = issues.filter((item) => item.valid && item.assignedTo.length && !item.assigned);
  const missing = issues.filter((item) => !item.valid || !item.assigned);
  if (!missing.length) {
    return {
      state: 'ok', issues,
      body: `${COMMENT_MARKER}\n${RESOLUTION_MARKER}\n✅ Assignment verified! Thanks @${pull.user.login}; you’re assigned to ${issues.map((item) => `issue #${item.number}`).join(', ')}. The assignment reminder is resolved. Your PR can continue through normal review.\n\n— CODOVYN Contributor Bot`,
      labels: [LABELS.ok],
    };
  }
  const lines = missing.map((item) => {
    if (!item.valid) return `- Issue #${item.number} could not be verified in this repository. Please check the reference.`;
    if (item.assignedTo.length) return `- Issue #${item.number} is assigned to ${item.assignedTo.map((name) => `@${name}`).join(', ')}. Please coordinate with them or a maintainer.`;
    return `- Issue #${item.number} is not assigned to you. Open it and comment \`/assign\`, then wait for confirmation from the Contributor Bot.`;
  });
  return {
    state: assignedElsewhere.length && assignedElsewhere.length === missing.length ? 'coordination' : 'warning', issues,
    body: `${COMMENT_MARKER}\n👋 Hey @${pull.user.login}! Thanks for contributing to CODOVYN.\n\nI checked the issue references in this PR:\n${lines.join('\n')}\n\nThis is an advisory reminder and does not block review. Please coordinate with a maintainer if the assignment is incorrect.\n\n— CODOVYN Contributor Bot`,
    labels: [LABELS.awaiting],
  };
}

function isMaintainer(pull) {
  return ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(pull.author_association);
}

function safePull(pull, expectedRepo) {
  return Boolean(pull && Number.isSafeInteger(pull.number) && pull.number > 0
    && pull.user?.login && pull.base?.repo?.full_name?.toLowerCase() === expectedRepo.toLowerCase());
}

/** Validate and reconcile a single PR. API methods are injected for unit testing. */
export async function validatePull(pull, api, options = {}) {
  const repository = options.repository ?? pull?.base?.repo?.full_name;
  if (!safePull(pull, repository)) throw new Error('Invalid pull request or repository identity');
  if (pull.state !== 'open' || (pull.draft && options.allowDraft !== true)) return { state: 'skipped' };
  if (isBot(pull.user)) return { state: 'skipped' };

  const numbers = extractIssueNumbers(pull.body ?? '');
  const labels = labelNames(pull.labels);
  // A label name alone is not authorization. Verify the latest label event and
  // its actor's repository permission on every run, including workflow reruns.
  const exception = hasLabel(labels, LABELS.exception)
    && await api.exceptionAuthorized(pull.number, LABELS.exception);
  const bypass = (isMaintainer(pull) && await actorCanManageException(api, pull.user.login)) || options.trustedAutomation === true;
  const issues = [];
  for (const number of numbers) {
    let issue;
    try {
      issue = await api.issue(number);
    } catch (error) {
      if (error.status === 404) {
        issues.push({ number, valid: false, assignedTo: [], assigned: false });
        continue;
      }
      throw error;
    }
    const expected = repository.toLowerCase();
    const actual = issue?.repository?.full_name ?? expected;
    const valid = issue && issue.number === number && actual.toLowerCase() === expected && !issue.pull_request;
    const assignedTo = valid ? (issue.assignees ?? []).map((user) => user.login).filter(Boolean) : [];
    issues.push({ number, valid: Boolean(valid), assignedTo, assigned: assignedTo.some((login) => login.toLowerCase() === pull.user.login.toLowerCase()) });
  }

  const result = policyResult({ pull, issues, exception, bypass });
  const existing = await api.comments(pull.number);
  const hasWarning = existing.some(isOwnComment);
  const guardianPresent = existing.some(isGuardianComment);
  const desiredBody = result.state === 'ok' && !hasWarning ? null : result.body;
  await reconcileComment(pull.number, desiredBody, api, existing, { suppress: guardianPresent });
  await reconcileLabels(pull.number, labels, result.labels, api);
  return result;
}

export async function handleIssueEvent(event, api, options = {}) {
  if (!event?.issue || !Number.isSafeInteger(event.issue.number)) throw new Error('Invalid issue event');
  if (event.issue.pull_request && ['assigned', 'unassigned'].includes(event.action)) {
    return revalidateIssue(event.issue.number, api, options);
  }
  if (event.issue.pull_request && ['labeled', 'unlabeled'].includes(event.action)) {
    if (event.label?.name === LABELS.exception && !await actorCanManageException(api, event.sender?.login)) {
      return { state: 'ignored', reason: 'unauthorized-exception-label-change' };
    }
    const pull = await api.pull(event.issue.number);
    return validatePull(pull, api, { ...options, exceptionApproved: event.label?.name === LABELS.exception && event.action === 'labeled' });
  }
  if (!event.issue.pull_request && ['assigned', 'unassigned'].includes(event.action)) {
    return revalidateIssue(event.issue.number, api, options);
  }
  return { state: 'ignored' };
}

export async function handlePullEvent(event, api, options = {}) {
  if (!event?.pull_request?.number) throw new Error('Invalid pull request event');
  const pull = await api.pull(event.pull_request.number);
  return validatePull(pull, api, {
    ...options,
    allowDraft: pull.draft === true && ['opened', 'reopened'].includes(event.action),
    trustedAutomation: isBot(pull.user),
  });
}

async function reconcileComment(number, desiredBody, api, comments, { suppress = false } = {}) {
  const own = comments.filter(isOwnComment);
  if (suppress) {
    // Guardian owns the contributor-facing summary. Retire this bot's older
    // advisory once, then stay silent on every later run.
    for (const comment of own) {
      if (comment.body !== SUPERSEDED_BODY) await api.updateComment(number, comment.id, SUPERSEDED_BODY);
    }
    return;
  }
  if (!desiredBody) {
    for (const comment of own) {
      if (!comment.body.includes(RESOLUTION_MARKER)) {
        await api.updateComment(number, comment.id, `${COMMENT_MARKER}\n${RESOLUTION_MARKER}\n✅ This assignment reminder is no longer needed. The PR is covered by a maintainer-approved policy exception or bypass.\n\n— CODOVYN Contributor Bot`);
      }
    }
    return;
  }
  if (own.length) {
    const [first, ...duplicates] = own;
    if (first.body !== desiredBody) await api.updateComment(number, first.id, desiredBody);
    // Clean up only duplicates carrying this bot's unique marker.
    for (const duplicate of duplicates) await api.updateComment(number, duplicate.id, `${COMMENT_MARKER}\nSuperseded duplicate reminder.`);
    return;
  }
  await api.comment(number, desiredBody);
}

async function reconcileLabels(number, current, desired, api) {
  const managed = [LABELS.awaiting, LABELS.ok];
  for (const label of managed) {
    const present = hasLabel(current, label);
    const wanted = desired.some((item) => item.toLowerCase() === label.toLowerCase());
    if (present && !wanted) await api.removeLabel(number, label);
    if (wanted && !present) {
      await api.ensureLabel(label);
      await api.addLabel(number, label);
    }
  }
}

/** Revalidate open PRs referencing an issue after assignment changes. */
export async function revalidateIssue(issueNumber, api, options = {}) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new Error('Invalid issue number');
  const prs = await api.searchPulls(issueNumber);
  const outcomes = [];
  for (const candidate of prs.slice(0, 100)) {
    const pull = await api.pull(candidate.number);
    if (pull?.state === 'open' && extractIssueNumbers(pull.body ?? '').includes(issueNumber)) {
      let allowDraft = false;
      if (pull.draft) {
        const comments = await api.comments(pull.number);
        allowDraft = comments.some(isOwnComment);
        if (!allowDraft) {
          outcomes.push({ state: 'skipped' });
          continue;
        }
      }
      outcomes.push(await validatePull(pull, api, { ...options, allowDraft }));
    }
  }
  return outcomes;
}

export async function actorCanManageException(api, actor) {
  if (!actor || isBot({ login: actor, type: 'User' })) return false;
  const permission = await api.permission(actor);
  return ['admin', 'maintain', 'write'].includes((permission?.permission ?? '').toLowerCase());
}

function githubApi(token, owner, repo) {
  const client = createGitHubClient({ token, owner, repo });
  const permission = (login) => client.getCollaboratorPermission(login);
  return {
    issue: (number) => client.getIssue(number),
    pull: (number) => client.getPull(number),
    comments: (number) => client.listIssueComments(number),
    comment: (number, body) => client.createIssueComment(number, body),
    updateComment: (_number, id, body) => client.updateIssueComment(_number, id, body),
    ensureLabel: (name) => client.ensureLabel(name, {
      color: name === LABELS.awaiting ? 'FBCA04' : '0E8A16',
      description: 'Managed by CODOVYN PR assignment validation',
    }),
    addLabel: (number, name) => client.addLabels(number, [name]),
    removeLabel: (number, name) => client.removeLabel(number, name),
    searchPulls: async (issueNumber) => {
      const pulls = await client.searchOpenPullsForIssue(issueNumber);
      return pulls.map((item) => ({ number: item.number }));
    },
    exceptionAuthorized: async (pullNumber, labelName) => {
      const event = await client.latestLabelEvent(pullNumber, labelName);
      if (!event || event.event !== 'labeled' || !event.actor?.login || isBot(event.actor)) return false;
      const actorPermission = await permission(event.actor.login);
      return ['admin', 'maintain', 'write'].includes((actorPermission?.permission ?? '').toLowerCase());
    },
    permission,
  };
}

async function runCli() {
  if (process.env.COMMUNITY_BOTS_ENABLED !== 'true') { console.log('CODOVYN community writes disabled; maintainer rollout required'); return; }
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const api = githubApi(process.env.GH_TOKEN || process.env.GITHUB_TOKEN, owner, repo);
  const options = { repository: `${owner}/${repo}` };
  if (event.pull_request) {
    await handlePullEvent(event, api, options);
  } else if (event.issue) {
    await handleIssueEvent(event, api, options);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runCli().catch((error) => {
    console.error(`pr-assignment-bot: event=${process.env.GITHUB_EVENT_NAME ?? 'unknown'} ${error?.diagnostic?.() ?? error?.message ?? 'unexpected failure'}`);
    process.exitCode = 1;
  });
}
