import {
  GUARDIAN_STATE_MARKER_PREFIX,
  GUARDIAN_SUMMARY_MARKER,
  GUARDIAN_SUPERSEDED_MARKER,
} from '../lib/markers.mjs';
import { MAX_DISMISSALS, MAX_FINDINGS, SEVERITIES, STATES, STATE_DESCRIPTIONS } from './constants.mjs';
import { formatPolicyDetail } from './policy.mjs';
import { formatReviewDetail } from './reviews.mjs';
import {
  codeSpan,
  escapeInline,
  parseDate,
  shortSha,
  stableFindingSort,
  truncate,
} from './util.mjs';

const MAX_BODY_LENGTH = 60_000;
const MAX_METADATA_LENGTH = 48_000;

const NEXT_ACTIONS = Object.freeze({
  [STATES.AWAITING_ASSIGNMENT]: 'Link the issue with `Closes #123` and make sure the issue is assigned to you. If an issue is not needed, ask a maintainer to apply `no-issue-required`. Guardian does not assign issues.',
  [STATES.NEEDS_CHANGES]: 'Address the findings above, then push a new commit or ask the reviewer for a fresh review. Guardian does not dismiss human reviews.',
  [STATES.CHECKS_RUNNING]: 'Wait for CI to finish. Guardian re-evaluates automatically when checks complete.',
  [STATES.CHECKS_FAILED]: 'Fix the failing checks and push a new commit. A maintainer can re-run checks from the Actions tab; Guardian does not re-run CI by itself.',
  [STATES.INFRASTRUCTURE_BLOCKED]: 'A maintainer should run `/guardian recheck` after the data source recovers. Unknown data is never treated as a pass. Unknown infrastructure outcomes, missing expected checks, required failures and security failures cannot be dismissed.',
  [STATES.AWAITING_AI_REVIEW]: 'Wait for the configured AI reviewer, or ask a maintainer whether the integration is expected to run. AI review is advisory, and without the GitHub App no independent AI review is occurring.',
  [STATES.AWAITING_HUMAN_REVIEW]: 'This legacy state is no longer emitted. Guardian reports readiness for the first maintainer review as READY_FOR_MAINTAINER_REVIEW.',
  [STATES.READY_FOR_MAINTAINER_REVIEW]: 'A maintainer can now perform the first review. Human approval and merge eligibility are separate; Guardian never merges or approves.',
  [STATES.STALE]: 'A maintainer or contributor should confirm whether the work is still active. Stale pull requests are not closed automatically.',
  [STATES.MERGED]: 'No action needed. Guardian did not merge this pull request.',
  [STATES.CLOSED]: 'No action needed. Guardian did not close this pull request.',
  [STATES.UNKNOWN]: 'A maintainer should inspect the workflow logs and run `/guardian recheck`. Guardian will not guess a readiness state.',
});

const SEVERITY_ORDER = {
  [SEVERITIES.BLOCKER]: 0,
  [SEVERITIES.WARNING]: 1,
  [SEVERITIES.INFO]: 2,
};

function validState(value) {
  return Object.values(STATES).includes(value) ? value : null;
}

function sanitizeDismissal(value, headSha) {
  if (!value || typeof value !== 'object') return null;
  const reason = typeof value.reason === 'string' ? value.reason.slice(0, 500) : '';
  const by = typeof value.by === 'string' ? value.by.slice(0, 60) : '';
  const at = typeof value.at === 'string' && parseDate(value.at) != null ? value.at : null;
  if (!reason || !by || !at) return null;
  return {
    reason,
    by,
    at,
    headSha: typeof value.headSha === 'string' ? value.headSha : headSha,
  };
}

export function encodeStateMetadata({ state, headSha, dismissals = {} }) {
  const safeDismissals = {};
  for (const [id, dismissal] of Object.entries(dismissals).slice(0, MAX_DISMISSALS)) {
    const sanitized = sanitizeDismissal(dismissal, headSha);
    if (sanitized) safeDismissals[id] = sanitized;
  }
  const payload = {
    v: 1,
    state: validState(state) ?? STATES.UNKNOWN,
    headSha: typeof headSha === 'string' ? headSha : '',
    dismissals: safeDismissals,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return encoded.length <= MAX_METADATA_LENGTH ? encoded : '';
}

export function parseStateMetadata(body) {
  if (typeof body !== 'string') return null;
  const start = body.indexOf(GUARDIAN_STATE_MARKER_PREFIX);
  if (start < 0) return null;
  const end = body.indexOf('-->', start);
  if (end < 0) return null;
  const encoded = body.slice(start + GUARDIAN_STATE_MARKER_PREFIX.length, end).trim();
  if (!encoded || encoded.length > MAX_METADATA_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  let payload;
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    if (decoded.length > MAX_METADATA_LENGTH) return null;
    payload = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!payload || payload.v !== 1) return null;
  const headSha = typeof payload.headSha === 'string' ? payload.headSha : '';
  const dismissals = {};
  if (payload.dismissals && typeof payload.dismissals === 'object') {
    for (const [id, value] of Object.entries(payload.dismissals).slice(0, MAX_DISMISSALS)) {
      if (!/^[a-z0-9][a-z0-9._:-]{2,120}$/.test(id)) continue;
      const sanitized = sanitizeDismissal(value, headSha);
      if (sanitized) dismissals[id] = sanitized;
    }
  }
  return {
    state: validState(payload.state),
    headSha,
    dismissals,
  };
}

export function isGuardianSummaryComment(comment, botLogin) {
  return comment?.user?.login === botLogin
    && comment?.user?.type === 'Bot'
    && typeof comment.body === 'string'
    && comment.body.startsWith(GUARDIAN_SUMMARY_MARKER);
}

export function findGuardianSummary(comments = [], botLogin = 'github-actions[bot]') {
  const matching = comments.filter((comment) => isGuardianSummaryComment(comment, botLogin));
  return {
    canonical: matching[0] ?? null,
    duplicates: matching.slice(1),
    previousState: matching[0] ? parseStateMetadata(matching[0].body) : null,
  };
}

function checksDetail(checks) {
  if (!checks) return 'Check data unavailable.';
  if (checks.status === 'passed') {
    const expected = checks.expected?.length
      ? `${checks.expected.length} expected check(s) passed`
      : `${checks.total} check(s) passed`;
    return `${expected}.`;
  }
  if (checks.status === 'failed') {
    return `${checks.failing.length} required or security check(s) failed: ${checks.failing.map((name) => codeSpan(name)).join(', ')}.`;
  }
  if (checks.status === 'running') {
    const waiting = checks.pending?.length ? checks.pending : checks.missing ?? [];
    return `Waiting for ${waiting.length ? waiting.map((name) => codeSpan(name)).join(', ') : 'required checks'}.`;
  }
  if (checks.status === 'blocked') {
    if (checks.missing?.length) {
      return `Missing expected check(s): ${checks.missing.map((name) => codeSpan(name)).join(', ')}.`;
    }
    return 'No checks were reported for the head commit.';
  }
  return 'Check data could not be verified.';
}

function summaryLine(label, value) {
  return `- **${label}:** ${value}`;
}

function renderFindingRow(item, dismissal) {
  const dismissed = Boolean(dismissal);
  const severity = dismissed ? 'dismissed' : item.severity;
  const detail = dismissed
    ? `${escapeInline(item.detail, { maxLength: 220 })} Dismissed by ${codeSpan(dismissal.by)}: ${escapeInline(dismissal.reason, { maxLength: 220 })}`
    : escapeInline(item.detail, { maxLength: 300 });
  return `| ${codeSpan(item.id)} | ${severity} | ${escapeInline(item.title, { maxLength: 140 })} | ${detail} |`;
}

export function renderSummaryBody({
  pull,
  outcome,
  policy,
  checks,
  reviews,
  settings = {},
  botLogin = 'github-actions[bot]',
}) {
  const state = outcome.state ?? STATES.UNKNOWN;
  const stateText = codeSpan(state);
  const findings = stableFindingSort(outcome.findings ?? []).sort((left, right) => {
    const leftDismissed = Boolean(outcome.dismissals?.[left.id]);
    const rightDismissed = Boolean(outcome.dismissals?.[right.id]);
    if (leftDismissed !== rightDismissed) return leftDismissed ? 1 : -1;
    const severity = (SEVERITY_ORDER[left.severity] ?? 3) - (SEVERITY_ORDER[right.severity] ?? 3);
    return severity || left.id.localeCompare(right.id);
  }).slice(0, MAX_FINDINGS);

  const rows = findings.map((item) => renderFindingRow(item, outcome.dismissals?.[item.id]));
  const omitted = Math.max(0, (outcome.findings?.length ?? 0) - rows.length);
  const head = shortSha(pull?.head?.sha);
  const lines = [
    `## ${codeSpan('CODOVYN Guardian')} — ${stateText}`,
    '',
    escapeInline(STATE_DESCRIPTIONS[state] ?? STATE_DESCRIPTIONS[STATES.UNKNOWN], { maxLength: 500 }),
    '',
    summaryLine('Pull request', `#${pull?.number ?? 'unknown'} · head ${codeSpan(head)}`),
    summaryLine('Assignment policy', formatPolicyDetail(policy)),
    summaryLine('Checks', checksDetail(checks)),
    summaryLine('Review', formatReviewDetail(reviews)),
  ];

  if (settings.aiReviewEnabled) {
    lines.push(summaryLine('AI review', `enabled (${codeSpan(settings.aiReviewLogin ?? 'configured reviewer')})`));
  } else {
    lines.push(summaryLine('AI review', 'not enabled — independent AI review is not part of this readiness decision'));
  }

  lines.push(
    '',
    '### Findings',
    '',
    '| Finding | Severity | Title | Detail |',
    '|---|---|---|---|',
    ...(rows.length ? rows : ['| — | — | No findings | — |']),
  );
  if (omitted) {
    lines.push('', `_${omitted} additional finding(s) omitted from this summary. Re-run Guardian after addressing the current findings._`);
  }

  lines.push(
    '',
    '### What happens next',
    '',
    NEXT_ACTIONS[state] ?? NEXT_ACTIONS[STATES.UNKNOWN],
    '',
    '### Commands',
    '',
    '- `/guardian status` — show the last recorded readiness state.',
    '- `/guardian explain` — explain the current findings.',
    '- `/guardian recheck` — re-evaluate the pull request (repository write access required).',
    '- `/guardian dismiss <finding-id> <reason>` — dismiss a verified non-required finding (repository write access required). Policy, unknown-data, missing-expected-check, and security findings cannot be dismissed.',
    '- `/guardian help` — show command help.',
    '',
    'Guardian is advisory. It never merges, approves, closes, deploys, or opens pull requests. Existing required checks and branch protection, when configured, remain authoritative.',
  );

  const metadata = encodeStateMetadata({
    state,
    headSha: pull?.head?.sha ?? '',
    dismissals: outcome.dismissals ?? {},
  });
  const marker = metadata
    ? `${GUARDIAN_STATE_MARKER_PREFIX}${metadata} -->`
    : `${GUARDIAN_STATE_MARKER_PREFIX}e30 -->`;
  return truncate(`${GUARDIAN_SUMMARY_MARKER}\n${marker}\n${lines.join('\n')}`, MAX_BODY_LENGTH);
}

function supersededBody() {
  return `${GUARDIAN_SUPERSEDED_MARKER}\nThis Guardian summary was superseded by a newer summary comment.`;
}

/**
 * Keep exactly one Guardian summary comment. The first matching comment is
 * edited in place; duplicates are explicitly marked superseded instead of
 * deleted, preserving an audit trail.
 */
export async function reconcileSummary({
  api,
  pullNumber,
  body,
  comments,
  dryRun = false,
  botLogin = 'github-actions[bot]',
}) {
  const { canonical, duplicates } = findGuardianSummary(comments, botLogin);
  const actions = [];
  if (dryRun) {
    return {
      action: canonical ? (canonical.body === body ? 'unchanged' : 'would-update') : 'would-create',
      id: canonical?.id ?? null,
      actions,
    };
  }

  let commentId = canonical?.id ?? null;
  if (!canonical) {
    const created = await api.createPullComment(pullNumber, body);
    commentId = created?.id ?? null;
    actions.push('created');
  } else if (canonical.body !== body) {
    await api.updatePullComment(pullNumber, canonical.id, body);
    actions.push('updated');
  } else {
    actions.push('unchanged');
  }

  for (const duplicate of duplicates) {
    const replacement = supersededBody();
    if (duplicate.body !== replacement) {
      await api.updatePullComment(pullNumber, duplicate.id, replacement);
      actions.push('superseded-duplicate');
    }
  }

  return { action: actions[0] ?? 'unchanged', id: commentId, actions };
}

export function buildCommandReply({ login, command, message, state, findings = [] }) {
  const lines = [
    '<!-- codovyn-guardian-command -->',
    `**Guardian** · ${codeSpan(`/guardian ${command}`)}`,
    '',
    message,
  ];
  if (state) {
    lines.push('', `Current state: ${codeSpan(state)}`);
  }
  if (findings.length) {
    lines.push('', 'Findings:', ...findings.slice(0, 12).map((item) => `- ${codeSpan(item.id)} — ${escapeInline(item.title, { maxLength: 140 })}`));
  }
  lines.push('', `Requested by ${codeSpan(login)}. Guardian never merges, approves, or closes pull requests.`);
  return truncate(lines.join('\n'), 12_000);
}

export function buildSupersededBody() {
  return supersededBody();
}
