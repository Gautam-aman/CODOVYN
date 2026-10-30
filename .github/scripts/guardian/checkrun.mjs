import {
  CHECK_RUN_EXTERNAL_ID_PREFIX,
  CHECK_RUN_NAME,
} from './constants.mjs';
import { checkRunConclusion, isTerminalState } from './readiness.mjs';
import { codeSpan, shortSha } from './util.mjs';

function desiredCheckRun({ pull, outcome }) {
  const externalId = `${CHECK_RUN_EXTERNAL_ID_PREFIX}${pull.number}`;
  const blockers = (outcome.activeFindings ?? []).map((item) => item.id);
  const summary = [
    `State: ${codeSpan(outcome.state)}`,
    `Head: ${codeSpan(shortSha(pull?.head?.sha))}`,
    `Active blockers: ${blockers.length}`,
    ...(blockers.length ? [`Blocking findings: ${blockers.slice(0, 10).map((id) => codeSpan(id)).join(', ')}`] : []),
    'Guardian is advisory and never merges, approves, or closes pull requests.',
  ].join('\n');
  return {
    name: CHECK_RUN_NAME,
    head_sha: pull.head.sha,
    external_id: externalId,
    status: 'completed',
    conclusion: checkRunConclusion(outcome.state),
    output: {
      title: `Guardian: ${outcome.state}`,
      summary,
    },
  };
}

function sameOutput(existing, desired) {
  return existing?.status === desired.status
    && existing?.conclusion === desired.conclusion
    && existing?.output?.title === desired.output.title
    && existing?.output?.summary === desired.output.summary;
}

/**
 * Publish the advisory check run. A permission or validation failure is logged
 * and swallowed: the summary comment remains the authoritative Guardian view,
 * and a missing advisory check must not break the workflow.
 */
export async function syncGuardianCheckRun({
  api,
  pull,
  outcome,
  enabled = true,
  dryRun = false,
  log = () => {},
}) {
  if (!enabled) return { action: 'disabled' };
  if (!pull?.head?.sha || !Number.isSafeInteger(pull?.number)) return { action: 'missing-identity' };
  if (isTerminalState(outcome.state)) return { action: 'terminal' };

  const desired = desiredCheckRun({ pull, outcome });
  let existing = null;
  try {
    const runs = await api.listCheckRunsForRef(pull.head.sha);
    existing = (runs ?? []).find((run) => run?.external_id === desired.external_id) ?? null;
  } catch (error) {
    log(`guardian-check-run: could not list check runs (${error?.diagnostic?.() ?? error?.message ?? 'unknown'})`);
    return { action: 'skipped', reason: 'list-failed' };
  }

  if (existing && sameOutput(existing, desired)) return { action: 'unchanged', id: existing.id };
  if (dryRun) return { action: existing ? 'would-update' : 'would-create', id: existing?.id ?? null };

  try {
    if (existing) {
      await api.updateCheckRun(existing.id, {
        status: desired.status,
        conclusion: desired.conclusion,
        output: desired.output,
      });
      return { action: 'updated', id: existing.id };
    }
    const created = await api.createCheckRun(desired);
    return { action: 'created', id: created?.id ?? null };
  } catch (error) {
    log(`guardian-check-run: could not publish advisory check (${error?.diagnostic?.() ?? error?.message ?? 'unknown'})`);
    return { action: 'skipped', reason: 'write-failed' };
  }
}

export { CHECK_RUN_NAME };
