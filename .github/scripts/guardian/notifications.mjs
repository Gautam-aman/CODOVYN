import { GUARDIAN_NOTIFICATION_MARKER_PREFIX } from '../lib/markers.mjs';
import { STATES } from './constants.mjs';
import { codeSpan, isSafeLogin, shortSha } from './util.mjs';

const MAINTAINER_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

function notificationMarker(headSha) {
  return `${GUARDIAN_NOTIFICATION_MARKER_PREFIX}${headSha} -->`;
}

function existingNotification(comments, headSha, botLogin) {
  const marker = notificationMarker(headSha);
  return comments.find((comment) => comment?.user?.login === botLogin
    && comment?.user?.type === 'Bot'
    && typeof comment.body === 'string'
    && comment.body.startsWith(marker));
}

function isMaintainerAuthored(pull) {
  return MAINTAINER_ASSOCIATIONS.has(String(pull?.author_association ?? '').toUpperCase())
    || /\[bot\]$/i.test(pull?.user?.login ?? '');
}

export function buildNotificationBody({ pull, headSha, approvedBy = [], maintainers = [] }) {
  const mentions = [...new Set(maintainers.filter(isSafeLogin))].map((login) => `@${login}`);
  const audience = mentions.length ? mentions.join(' ') : 'Maintainers';
  return [
    notificationMarker(headSha),
    `## Guardian: ready for maintainer review`,
    '',
    `${audience}: pull request #${pull.number} is ready for its first maintainer review. Automated readiness conditions are satisfied.`,
    '',
    `- Head: ${codeSpan(shortSha(headSha))}`,
    ...(approvedBy.length
      ? [`- Human approval already recorded: ${approvedBy.map((login) => codeSpan(login)).join(', ')}`]
      : ['- Human approval: none yet. Approval is not required to request review.']),
    '',
    'Human approval and merge eligibility are separate from readiness. Guardian did not approve or merge this pull request, and required checks and branch protection remain authoritative.',
  ].join('\n');
}

/**
 * Notify once per ready head SHA. The first evaluation that reaches
 * READY_FOR_MAINTAINER_REVIEW is a genuine transition, including when Guardian
 * has no earlier summary (for example after rollout).
 */
export async function maybeNotify({
  api,
  pull,
  outcome,
  comments = [],
  enabled = false,
  dryRun = false,
  botLogin = 'github-actions[bot]',
  maintainers = [],
}) {
  if (!enabled) return { action: 'disabled' };
  if (outcome.state !== STATES.READY_FOR_MAINTAINER_REVIEW) return { action: 'not-ready' };
  if (isMaintainerAuthored(pull)) return { action: 'maintainer-authored' };

  const headSha = pull?.head?.sha;
  if (!headSha) return { action: 'missing-head-sha' };
  if (existingNotification(comments, headSha, botLogin)) return { action: 'already-notified' };

  const body = buildNotificationBody({
    pull,
    headSha,
    approvedBy: outcome.approvedBy ?? [],
    maintainers,
  });
  if (dryRun) return { action: 'would-notify', body };
  await api.createPullComment(pull.number, body);
  return { action: 'notified' };
}
