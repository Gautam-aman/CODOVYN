import { COMMAND_NAMES, FINDING_ID_PATTERN, DISMISSAL_REASON_MAX, STATES } from './constants.mjs';
import { findGuardianSummary, parseStateMetadata, buildCommandReply } from './comments.mjs';
import { computeReadiness, isDismissibleFinding } from './readiness.mjs';
import { truncate } from './util.mjs';

const WRITE_PERMISSIONS = new Set(['admin', 'maintain', 'write']);
const RESTRICTED = new Set(['recheck', 'dismiss']);

export function parseGuardianCommand(body) {
  const firstLine = String(body ?? '').split(/\r?\n/, 1)[0].trim();
  const match = firstLine.match(/^\/guardian(?:\s+(.*))?$/i);
  if (!match) return null;
  const rest = (match[1] ?? '').trim();
  if (!rest) return { command: 'help', raw: firstLine };
  const tokens = rest.split(/\s+/);
  const command = tokens[0].toLowerCase();
  if (!COMMAND_NAMES.includes(command) && command !== 'merge') {
    return { command: 'unknown', raw: truncate(firstLine, 100) };
  }
  if (['status', 'recheck', 'explain', 'help', 'merge'].includes(command) && tokens.length > 1) {
    return { command: 'usage', raw: truncate(firstLine, 100), attempted: command };
  }
  if (command !== 'dismiss') return { command, raw: firstLine };

  const dismissMatch = rest.match(/^dismiss\s+(\S+)(?:\s+([\s\S]+))?$/i);
  if (!dismissMatch) return { command: 'usage', raw: truncate(firstLine, 100), attempted: 'dismiss' };
  const findingId = dismissMatch[1].toLowerCase();
  const reason = String(dismissMatch[2] ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!FINDING_ID_PATTERN.test(findingId)) {
    return { command: 'usage', raw: truncate(firstLine, 100), attempted: 'dismiss' };
  }
  if (!reason || reason.length > DISMISSAL_REASON_MAX) {
    return { command: 'usage', raw: truncate(firstLine, 100), attempted: 'dismiss' };
  }
  return { command, findingId, reason, raw: firstLine };
}

function helpText() {
  return [
    'Guardian records a deterministic readiness state and one summary comment per pull request.',
    '',
    '- `/guardian status` — show the last recorded state.',
    '- `/guardian explain` — evaluate live and explain the current findings without writing the summary.',
    '- `/guardian recheck` — re-evaluate and update the summary (write access required).',
    '- `/guardian dismiss <finding-id> <reason>` — dismiss a verified non-required check or review false positive (write access required).',
    '- `/guardian help` — show this help.',
    '',
    '`/guardian merge` does not exist. Guardian never merges, approves, closes, deploys, or opens pull requests.',
  ].join('\n');
}

async function authorize(api, login) {
  const permission = await api.getCollaboratorPermission(login);
  const level = String(permission?.permission ?? '').toLowerCase();
  return WRITE_PERMISSIONS.has(level);
}

function availableDismissible(outcome) {
  return (outcome.findings ?? []).filter((item) => item.severity !== 'info'
    && isDismissibleFinding(item.id)
    && !outcome.dismissals?.[item.id]);
}

async function reply({ api, pullNumber, login, command, message, state, findings, dryRun, log, eventMarker = '' }) {
  const body = buildCommandReply({ login, command, message, state, findings }) + (eventMarker ? `\n${eventMarker}` : '');
  if (dryRun) {
    log(`guardian-command: dry-run reply for /guardian ${command}: ${message.replace(/\s+/g, ' ').slice(0, 300)}`);
    return { action: 'dry-run-reply', body };
  }
  await api.createPullComment(pullNumber, body);
  return { action: 'replied', body };
}

/**
 * Handle `/guardian` commands on a pull request.
 *
 * status/explain/help are open to any non-bot commenter. recheck/dismiss require
 * repository write permission. The caller supplies evaluation and persistence
 * callbacks so command handling stays independent from the event orchestration.
 */
export async function handleGuardianCommand({
  api,
  event,
  config,
  now = Date.now(),
  evaluate,
  persist,
  log = () => {},
}) {
  const issue = event?.issue;
  const comment = event?.comment;
  if (!issue?.pull_request || !Number.isSafeInteger(issue.number) || !comment?.user?.login) {
    return { action: 'ignored' };
  }
  if (comment.user.type === 'Bot' || /\[bot\]$/i.test(comment.user.login)) {
    return { action: 'ignored' };
  }
  const eventMarker = Number.isSafeInteger(comment.id) ? `<!-- codovyn-guardian-command-event:${comment.id} -->` : '';
  if (eventMarker && (await api.listPullComments(issue.number)).some(item => item.user?.type === 'Bot' && item.user?.login === config.botLogin && item.body?.includes(eventMarker))) return { action: 'already-handled' };
  const parsed = parseGuardianCommand(comment.body ?? '');
  if (!parsed) return { action: 'ignored' };

  const pullNumber = issue.number;
  const login = comment.user.login;
  const dryRun = config.dryRun;
  const botLogin = config.botLogin;
  const send = (options) => reply({ api, pullNumber, login, dryRun, log, eventMarker, ...options });

  if (parsed.command === 'help') {
    return send({ command: 'help', message: helpText() });
  }
  if (parsed.command === 'usage' || parsed.command === 'unknown') {
    return send({
      command: parsed.command,
      message: `I did not recognise that command. Try ${'`/guardian help`'} for the available commands.`,
    });
  }

  if (parsed.command === 'merge') {
    return send({
      command: 'merge',
      message: 'Guardian does not support `/guardian merge` and will never merge, approve, close, deploy, or open pull requests. Use the normal review and merge controls.',
    });
  }

  let allowed = false;
  if (RESTRICTED.has(parsed.command)) {
    let permission;
    try {
      permission = await authorize(api, login);
      allowed = permission;
    } catch (error) {
      log(`guardian-command: permission lookup failed (${error?.diagnostic?.() ?? error?.message ?? 'unknown'})`);
      return send({
        command: parsed.command,
        message: 'Guardian could not verify your repository permission. No change was made; try again later.',
      });
    }
    if (!allowed) {
      return send({
        command: parsed.command,
        message: 'This command requires repository write permission. No change was made.',
      });
    }
  }

  if (parsed.command === 'status') {
    const comments = await api.listPullComments(pullNumber);
    const { canonical, previousState } = findGuardianSummary(comments, botLogin);
    if (!canonical) {
      return send({
        command: 'status',
        message: `Guardian has not recorded a state for this pull request yet. A maintainer can run ${'`/guardian recheck`'} to evaluate it.`,
      });
    }
    return send({
      command: 'status',
      message: 'This is the last recorded state. Run `/guardian explain` for a live evaluation or `/guardian recheck` to persist a fresh state.',
      state: previousState?.state ?? STATES.UNKNOWN,
    });
  }

  if (parsed.command === 'explain') {
    const snapshot = await evaluate({ pullNumber, dryRun: true });
    const comments = await api.listPullComments(pullNumber);
    const recorded = findGuardianSummary(comments, botLogin).previousState?.state ?? null;
    const changed = recorded && recorded !== snapshot.outcome.state;
    return send({
      command: 'explain',
      message: [
        snapshot.outcome.stateDescription,
        changed
          ? `The live state ${'`'}${snapshot.outcome.state}${'`'} differs from the last recorded state ${'`'}${recorded}${'`'}. Run ${'`'}/guardian recheck${'`'} to persist it.`
          : 'This matches the last recorded state.',
      ].join(' '),
      state: snapshot.outcome.state,
      findings: snapshot.outcome.activeFindings,
    });
  }

  if (parsed.command === 'recheck') {
    const snapshot = await evaluate({ pullNumber, dryRun });
    const result = await persist({ snapshot, dryRun, notify: config.notify });
    return send({
      command: 'recheck',
      message: dryRun
        ? 'Dry-run: Guardian evaluated the pull request but did not write the summary or notification.'
        : 'Guardian re-evaluated the pull request and updated the summary comment.',
      state: result?.outcome?.state ?? snapshot.outcome.state,
      findings: result?.outcome?.activeFindings ?? snapshot.outcome.activeFindings,
    });
  }

  if (parsed.command === 'dismiss') {
    const snapshot = await evaluate({ pullNumber, dryRun: true });
    const target = (snapshot.outcome.findings ?? []).find((item) => item.id === parsed.findingId);
    if (!target) {
      return send({
        command: 'dismiss',
        message: `Finding ${'`'}${parsed.findingId}${'`'} is not present in the current evaluation. Nothing was dismissed.`,
        state: snapshot.outcome.state,
        findings: availableDismissible(snapshot.outcome),
      });
    }
    if (target.id.startsWith('policy.')) {
      return send({
        command: 'dismiss',
        message: 'Policy findings cannot be dismissed. Link and claim the issue, or ask a maintainer to apply the `no-issue-required` label for work that genuinely does not need an issue.',
        state: snapshot.outcome.state,
      });
    }
    if (!isDismissibleFinding(target.id)) {
      return send({
        command: 'dismiss',
        message: `Finding ${'`'}${target.id}${'`'} cannot be dismissed. Unknown-data, missing-expected-check, security, and mergeability findings must be resolved rather than suppressed.`,
        state: snapshot.outcome.state,
      });
    }
    if (target.severity === 'info') {
      return send({
        command: 'dismiss',
        message: `Finding ${'`'}${target.id}${'`'} is informational and does not block readiness, so it cannot be dismissed.`,
        state: snapshot.outcome.state,
      });
    }

    const dismissals = {
      ...snapshot.outcome.dismissals,
      [target.id]: {
        reason: parsed.reason,
        by: login,
        at: new Date(now).toISOString(),
        headSha: snapshot.pull?.head?.sha ?? '',
      },
    };
    const outcome = computeReadiness({
      pull: snapshot.pull,
      policy: snapshot.policy,
      checks: snapshot.checks,
      reviews: snapshot.reviews,
      staleDays: config.staleDays,
      aiReviewEnabled: config.aiReviewEnabled,
      dismissals,
      now,
    });
    const result = await persist({ snapshot: { ...snapshot, outcome }, dryRun, notify: config.notify });
    return send({
      command: 'dismiss',
      message: dryRun
        ? `Dry-run: ${'`'}${target.id}${'`'} would be dismissed by ${'`'}${login}${'`'}, but nothing was written.`
        : `${'`'}${target.id}${'`'} was dismissed by ${'`'}${login}${'`'}. New state: ${'`'}${result?.outcome?.state ?? outcome.state}${'`'}.`,
      state: result?.outcome?.state ?? outcome.state,
      findings: result?.outcome?.activeFindings ?? outcome.activeFindings,
    });
  }

  return send({ command: parsed.command, message: helpText() });
}
