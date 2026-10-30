import {
  envFlag,
  envInteger,
  isBot,
  isSafeLogin,
  parseCsv,
} from './util.mjs';
import {
  DEFAULT_AI_REVIEW_LOGIN,
  DEFAULT_MAINTAINER,
  DEFAULT_NO_CHECKS_GRACE_MINUTES,
  DEFAULT_STALE_DAYS,
} from './constants.mjs';
import { DEFAULT_BOT_LOGIN } from '../lib/markers.mjs';
import { extractIssueNumbers } from '../lib/issue-references.mjs';
import { evaluatePolicy } from './policy.mjs';
import { evaluateChecks } from './checks.mjs';
import { evaluateReviews } from './reviews.mjs';
import { loadChangedFiles, loadRepositoryPolicy } from './repository-policy.mjs';
import { computeReadiness } from './readiness.mjs';
import {
  findGuardianSummary,
  reconcileSummary,
  renderSummaryBody,
} from './comments.mjs';
import { maybeNotify } from './notifications.mjs';
import { syncGuardianCheckRun } from './checkrun.mjs';
import { handleGuardianCommand } from './commands.mjs';

export const TRIGGER_WORKFLOWS = Object.freeze(['CI', 'Desktop development validation', 'Alpha qualification (no publication)', 'Guardian tests']);

export function loadConfig(env = process.env) {
  const maintainers = [...new Set(
    parseCsv(env.GUARDIAN_MAINTAINERS || DEFAULT_MAINTAINER).filter(isSafeLogin),
  )].slice(0, 10);
  if (!maintainers.length) maintainers.push(DEFAULT_MAINTAINER);
  return {
    dryRun: envFlag(env.GUARDIAN_DRY_RUN, true),
    notify: envFlag(env.GUARDIAN_NOTIFY, false),
    aiReviewEnabled: envFlag(env.GUARDIAN_AI_REVIEW, false),
    aiReviewLogin: env.GUARDIAN_AI_REVIEW_LOGIN || DEFAULT_AI_REVIEW_LOGIN,
    staleDays: envInteger(env.GUARDIAN_STALE_DAYS, DEFAULT_STALE_DAYS, { min: 1, max: 3650 }),
    noChecksGraceMinutes: envInteger(
      env.GUARDIAN_NO_CHECKS_GRACE_MINUTES,
      DEFAULT_NO_CHECKS_GRACE_MINUTES,
      { min: 0, max: 1440 },
    ),
    maintainers,
    botLogin: env.GUARDIAN_BOT_LOGIN || DEFAULT_BOT_LOGIN,
    checkRun: envFlag(env.GUARDIAN_CHECK_RUN, true),
    maxPullsPerRun: envInteger(env.GUARDIAN_MAX_PULLS, 25, { min: 1, max: 100 }),
    mergeableRetryMs: envInteger(env.GUARDIAN_MERGEABLE_RETRY_MS, 800, { min: 0, max: 10_000 }),
  };
}

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Evaluate one pull request without writing anything. Every independent data
 * source is allowed to fail into an explicit `unknown` signal rather than
 * aborting the whole evaluation.
 */
export async function evaluatePull({ api, pullNumber, config, now = Date.now(), log = () => {} }) {
  if (!Number.isSafeInteger(pullNumber) || pullNumber < 1) {
    throw new Error('Invalid pull request number');
  }

  let pull = await api.getPull(pullNumber);
  if (pull?.state === 'open' && pull.mergeable == null && config.mergeableRetryMs > 0) {
    await (config.sleep ?? defaultSleep)(config.mergeableRetryMs);
    pull = await api.getPull(pullNumber);
  }
  // A malformed or mismatched response must not abort the run without a
  // summary, but it also must not be trusted. Keep the known event number so
  // the UNKNOWN summary can still be attached to the right pull request.
  if (!pull || typeof pull !== 'object'
    || !Number.isSafeInteger(pull.number) || pull.number !== pullNumber
    || pull.base?.repo?.full_name?.toLowerCase() !== api.repository.toLowerCase()) {
    pull = {
      ...(pull && typeof pull === 'object' ? pull : {}),
      number: pullNumber,
      state: 'unknown',
      invalid: true,
    };
  }

  let comments = [];
  try {
    comments = await api.listPullComments(pullNumber);
  } catch (error) {
    if (!config.dryRun) throw error;
    log(`guardian: could not read comments in dry-run (${error?.diagnostic?.() ?? error?.message ?? 'unknown'})`);
  }
  const previous = findGuardianSummary(comments, config.botLogin);
  const dismissals = previous.previousState?.dismissals ?? {};

  const [changedFileResult, repositoryPolicy] = await Promise.all([
    loadChangedFiles({ api, pull }),
    loadRepositoryPolicy({ api, pull }),
  ]);
  if (changedFileResult.files == null) {
    log(`guardian: changed-file policy data unavailable for PR #${pullNumber} (${changedFileResult.reason ?? 'unknown'})`);
  }
  if (repositoryPolicy.unavailable?.length) {
    log(`guardian: repository policy partially unavailable (${repositoryPolicy.unavailable.join(', ')}); using the static path policy`);
  } else if (repositoryPolicy.sources?.length) {
    log(`guardian: repository policy sources=${repositoryPolicy.sources.join(',')} required-checks=${repositoryPolicy.requiredChecks.length}`);
  }

  const [policy, checks, reviews] = await Promise.all([
    evaluatePolicy({
      api,
      pull,
      repository: api.repository,
      trustedAutomation: isBot(pull?.user),
    }),
    evaluateChecks({
      api,
      pull,
      now,
      noChecksGraceMinutes: config.noChecksGraceMinutes,
      changedFiles: changedFileResult.files,
      repositoryPolicy,
    }),
    evaluateReviews({
      api,
      pull,
      aiReviewEnabled: config.aiReviewEnabled,
      aiReviewLogin: config.aiReviewLogin,
      repositoryPolicy,
    }),
  ]);

  const outcome = computeReadiness({
    pull,
    policy,
    checks,
    reviews,
    staleDays: config.staleDays,
    aiReviewEnabled: config.aiReviewEnabled,
    dismissals,
    now,
  });

  return {
    pull,
    policy,
    checks,
    reviews,
    outcome,
    comments,
    previousState: previous.previousState?.state ?? null,
    now,
  };
}

export async function persistOutcome({
  api,
  snapshot,
  config,
  dryRun = config.dryRun,
  notify = config.notify,
  log = () => {},
}) {
  let comments = snapshot.comments;
  let outcome = snapshot.outcome;

  if (!dryRun) {
    // Re-read immediately before writing so a concurrent dismissal is not
    // overwritten by a slightly older evaluation.
    comments = await api.listPullComments(snapshot.pull.number);
    const latest = findGuardianSummary(comments, config.botLogin);
    const dismissals = {
      ...(latest.previousState?.dismissals ?? {}),
      ...(snapshot.outcome.dismissals ?? {}),
    };
    outcome = computeReadiness({
      pull: snapshot.pull,
      policy: snapshot.policy,
      checks: snapshot.checks,
      reviews: snapshot.reviews,
      staleDays: config.staleDays,
      aiReviewEnabled: config.aiReviewEnabled,
      dismissals,
      now: snapshot.now ?? Date.now(),
    });
  }

  const body = renderSummaryBody({
    pull: snapshot.pull,
    outcome,
    policy: snapshot.policy,
    checks: snapshot.checks,
    reviews: snapshot.reviews,
    settings: {
      aiReviewEnabled: config.aiReviewEnabled,
      aiReviewLogin: config.aiReviewLogin,
    },
    botLogin: config.botLogin,
  });

  const summary = await reconcileSummary({
    api,
    pullNumber: snapshot.pull.number,
    body,
    comments,
    dryRun,
    botLogin: config.botLogin,
  });

  const checkRun = await syncGuardianCheckRun({
    api,
    pull: snapshot.pull,
    outcome,
    enabled: config.checkRun,
    dryRun,
    log,
  });

  let notification;
  try {
    notification = await maybeNotify({
      api,
      pull: snapshot.pull,
      outcome,
      comments,
      enabled: notify,
      dryRun,
      botLogin: config.botLogin,
      maintainers: config.maintainers,
    });
  } catch (error) {
    notification = { action: 'failed' };
    log(`guardian: notification failed (${error?.diagnostic?.() ?? error?.message ?? 'unknown'})`);
  }

  return {
    outcome,
    summary,
    checkRun,
    notification,
  };
}

function safeNumber(value) {
  if (!/^[1-9][0-9]{0,15}$/.test(String(value ?? '').trim())) return null;
  const number = Number(String(value).trim());
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function numbersFromPulls(pulls) {
  if (!Array.isArray(pulls)) return [];
  return pulls.map((pull) => safeNumber(pull?.number)).filter(Boolean);
}

async function pullsForSha(api, sha) {
  if (!sha) return [];
  const pulls = await api.listPullsForCommit(sha);
  return numbersFromPulls((pulls ?? []).filter((pull) => pull?.state === 'open'));
}

/**
 * Find open pull requests that deliberately link an issue. The issue timeline
 * exposes cross-references, which is exact; the text-search fallback is kept
 * only for API errors because `#123` search also matches unrelated numbers.
 */
async function pullsLinkedToIssue(api, issueNumber) {
  try {
    const timeline = await api.listIssueTimeline(issueNumber);
    return numbersFromPulls((timeline ?? [])
      .filter((event) => event?.event === 'cross-referenced')
      .map((event) => event?.source?.issue)
      .filter((source) => source?.pull_request && source?.state === 'open')
      .filter((source) => extractIssueNumbers(source?.body ?? '').includes(issueNumber)));
  } catch {
    const pulls = await api.searchOpenPullsForIssue(issueNumber);
    return numbersFromPulls(pulls);
  }
}

/**
 * Resolve the pull request(s) affected by an event. check_suite/workflow_run
 * payloads can omit pull_requests for fork PRs, so the commit-to-pulls endpoint
 * is used as a documented fallback.
 */
export async function resolvePullNumbers({ eventName, event, api, config }) {
  let numbers = [];
  if (eventName === 'pull_request_target' || eventName === 'pull_request_review') {
    numbers = [safeNumber(event?.pull_request?.number)];
  } else if (eventName === 'issue_comment') {
    if (event?.issue?.pull_request) numbers = [safeNumber(event?.issue?.number)];
  } else if (eventName === 'issues') {
    if (event?.issue?.pull_request) {
      numbers = [safeNumber(event?.issue?.number)];
    } else if (safeNumber(event?.issue?.number)) {
      numbers = await pullsLinkedToIssue(api, safeNumber(event.issue.number));
    }
  } else if (eventName === 'check_suite') {
    // GitHub Actions suites are handled by workflow_run, which has a workflow
    // name and cannot loop on Guardian's own check run.
    if (event?.check_suite?.app?.slug === 'github-actions') return [];
    numbers = numbersFromPulls(event?.check_suite?.pull_requests);
    if (!numbers.length) numbers = await pullsForSha(api, event?.check_suite?.head_sha);
  } else if (eventName === 'workflow_run') {
    if (!TRIGGER_WORKFLOWS.includes(event?.workflow_run?.name)) return [];
    numbers = numbersFromPulls(event?.workflow_run?.pull_requests);
    if (!numbers.length) numbers = await pullsForSha(api, event?.workflow_run?.head_sha);
  } else if (eventName === 'workflow_dispatch') {
    const input = event?.inputs?.pr ?? event?.input?.pr;
    if (input) {
      numbers = String(input).split(',').map(safeNumber).filter(Boolean);
    } else {
      numbers = numbersFromPulls(await api.listOpenPulls({ maxItems: config.maxPullsPerRun }));
    }
  } else if (eventName === 'schedule') {
    numbers = numbersFromPulls(await api.listOpenPulls({ maxItems: config.maxPullsPerRun }));
  }

  return [...new Set(numbers)].filter(Boolean).slice(0, config.maxPullsPerRun);
}

function diagnosticOf(error) {
  return error?.diagnostic?.() ?? error?.message ?? 'unknown error';
}

/**
 * Main event dispatcher. Commands are handled by a separate path so a comment
 * can never accidentally trigger a broad reconciliation.
 */
export async function runGuardian({
  eventName,
  event,
  api,
  config,
  now = Date.now(),
  log = () => {},
}) {
  if (eventName === 'issue_comment') {
    if (!event?.issue?.pull_request) return { results: [], failed: 0 };
    const command = parseCommandPreview(event?.comment?.body);
    if (!command) return { results: [], failed: 0 };
    if (config.dryRun) log('guardian: dry-run is enabled; commands will not write comments');
    const result = await handleGuardianCommand({
      api,
      event,
      config,
      now,
      evaluate: ({ pullNumber, dryRun }) => evaluatePull({
        api,
        pullNumber,
        config: { ...config, dryRun },
        now,
        log,
      }),
      persist: ({ snapshot, dryRun, notify }) => persistOutcome({
        api,
        snapshot,
        config,
        dryRun,
        notify,
        log,
      }),
      log,
    });
    return { results: [result], failed: 0 };
  }

  const pullNumbers = await resolvePullNumbers({ eventName, event, api, config });
  const results = [];
  let failed = 0;
  for (const pullNumber of pullNumbers) {
    try {
      const snapshot = await evaluatePull({ api, pullNumber, config, now, log });
      const persisted = await persistOutcome({ api, snapshot, config, log });
      results.push({
        pullNumber,
        state: persisted.outcome.state,
        summary: persisted.summary.action,
        checkRun: persisted.checkRun.action,
        notification: persisted.notification.action,
      });
      log(`guardian: PR #${pullNumber} state=${persisted.outcome.state} summary=${persisted.summary.action} check-run=${persisted.checkRun.action} notification=${persisted.notification.action}`);
    } catch (error) {
      failed += 1;
      results.push({ pullNumber, error: diagnosticOf(error) });
      log(`guardian: PR #${pullNumber} failed (${diagnosticOf(error)})`);
    }
  }
  return { results, failed };
}

function parseCommandPreview(body) {
  return /^\/guardian(?:\s|$)/i.test(String(body ?? '').trim());
}

export function repositoryFromEnv(env = process.env) {
  const [owner, repo] = String(env.GITHUB_REPOSITORY ?? '').split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must be set to owner/repo');
  return { owner, repo };
}
