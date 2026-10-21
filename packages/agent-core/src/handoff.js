import { createHash } from 'node:crypto';
import { AgentFailure } from './index.js';
const clipped = (value, size) => typeof value === 'string' ? value.slice(0, size) : null;
/** Portable observable state, not provider reasoning or a claim of tool success. */
export function createHandoffPacket({ request, snapshot = {}, history = [], step = 0 }) {
  if (typeof request !== 'string' || !request.trim() || request.length > 10000 || !Array.isArray(history)) {
    throw new AgentFailure('fatal', 'Invalid portable handoff context');
  }
  const actions = new Map();
  const reports = [];
  const errors = [];
  let attempt = 'legacy';
  for (const [index, entry] of history.entries()) {
    if (entry.kind === 'agent-started') attempt = String(entry.seq ?? index);
    if (entry.kind === 'agent-failed') errors.push({ agent: clipped(entry.data?.agent, 64), kind: clipped(entry.data?.kind, 32) });
    if (entry.kind !== 'agent-event') continue;
    const { agent, event } = entry.data || {};
    if (!event) continue;
    if (['text', 'completed'].includes(event.type) && typeof event.text === 'string') {
      reports.push({ agent: clipped(agent, 64), text: event.text.slice(0, 500), verification: 'provider-reported' });
    }
    if (event.type === 'tool-start') {
      if (actions.size >= 128) throw new AgentFailure('fatal', 'Handoff action history requires manual review');
      const id = `${clipped(agent, 64)}:${attempt}:${clipped(event.actionId, 256)}`;
      if (actions.has(id)) throw new AgentFailure('fatal', 'Ambiguous duplicate handoff action');
      actions.set(id, { id, provider: clipped(agent, 64), actionId: clipped(event.actionId, 256),
        action: clipped(event.action, 128), state: 'unresolved', safeToRetry: event.safeToRetry === true });
    }
    if (event.type === 'tool-complete') {
      const id = `${clipped(agent, 64)}:${attempt}:${clipped(event.actionId, 256)}`;
      const action = actions.get(id);
      if (action) { action.state = 'completion-reported'; action.success = typeof event.success === 'boolean' ? event.success : null; }
    }
  }
  return { schemaVersion: 1, request, step, repository: {
    worktreeIdentity: typeof snapshot.root === 'string' ? createHash('sha256').update(snapshot.root).digest('hex') : null, branch: clipped(snapshot.branch, 256), commit: clipped(snapshot.commit, 128),
    workingTreeHash: clipped(snapshot.workingTreeHash, 128), dirty: typeof snapshot.dirty === 'boolean' ? snapshot.dirty : null,
    changedPaths: Array.isArray(snapshot.changedPaths) ? snapshot.changedPaths.slice(0, 20).map(path => String(path).slice(0, 200)) : [],
  }, reconciliations: history.filter(entry=>['draft-reconciled','continuation-approved'].includes(entry.kind)).slice(-4).map(entry=>({kind:entry.kind,decision:clipped(entry.data.decision,32),policy:clipped(entry.data.policy||entry.data.actionResolution,256),fingerprint:clipped(entry.data.fingerprint,128)})), actions: [...actions.values()], providerReports: reports.slice(-6), failures: errors.slice(-6),
  continuation: 'Inspect the verified worktree before continuing. Do not replay unresolved or write-capable actions automatically.' };
}
