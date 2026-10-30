import { CHECK_RUN_NAME } from './constants.mjs';

function normalizeCheckName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function addRequiredCheck(map, name, appId, source) {
  const clean = String(name ?? '').trim();
  if (!clean || normalizeCheckName(clean) === normalizeCheckName(CHECK_RUN_NAME)) return;
  const key = normalizeCheckName(clean);
  const normalizedAppId = Number.isSafeInteger(appId) && appId > 0 ? appId : null;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { name: clean, appId: normalizedAppId, sources: [source] });
    return;
  }
  if (!existing.sources.includes(source)) existing.sources.push(source);
  if (existing.appId == null && normalizedAppId != null) existing.appId = normalizedAppId;
}

function branchPatternMatches(pattern, branch) {
  const value = String(pattern ?? '');
  if (value === '~ALL' || value === '~DEFAULT_BRANCH') return true;
  const normalized = value.replace(/^refs\/heads\//, '');
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`).test(branch);
}

function branchRuleApplies(rule, branch) {
  if (!rule || rule.target !== 'branch') return false;
  if (String(rule.enforcement ?? 'active').toLowerCase() === 'disabled') return false;
  const include = rule.conditions?.ref_name?.include;
  const exclude = rule.conditions?.ref_name?.exclude;
  if (Array.isArray(exclude) && exclude.some((pattern) => branchPatternMatches(pattern, branch))) {
    return false;
  }
  if (!Array.isArray(include) || !include.length) return true;
  return include.some((pattern) => branchPatternMatches(pattern, branch));
}

function recordStalePolicy(values, value) {
  if (typeof value === 'boolean') values.push(value);
}

function addStatusContexts(map, required, source) {
  if (!required || typeof required !== 'object') return;
  for (const context of required.contexts ?? []) {
    addRequiredCheck(map, context, null, source);
  }
  for (const check of required.checks ?? []) {
    addRequiredCheck(map, check?.context, check?.app_id, source);
  }
}

/**
 * Read branch protection and repository rulesets when the workflow token has
 * access. This is best-effort: the static path policy still applies when the
 * API is unavailable. A failure is not treated as proof that no protection
 * exists, so it is surfaced in the workflow log; a requirement configured only
 * in inaccessible repository settings may remain unknown to Guardian.
 */
export async function loadRepositoryPolicy({ api, pull } = {}) {
  const branch = String(pull?.base?.ref ?? '');
  const required = new Map();
  const sources = [];
  const unavailable = [];
  const stalePolicies = [];

  if (!branch) {
    return {
      branch,
      requiredChecks: [],
      dismissStaleReviews: null,
      sources,
      unavailable: ['missing-base-branch'],
    };
  }

  if (typeof api?.getBranchProtection === 'function') {
    try {
      const protection = await api.getBranchProtection(branch);
      if (protection) {
        sources.push('branch-protection');
        addStatusContexts(required, protection.required_status_checks, 'branch-protection');
        recordStalePolicy(
          stalePolicies,
          protection.required_pull_request_reviews?.dismiss_stale_reviews,
        );
      }
    } catch (error) {
      unavailable.push(`branch-protection:${error?.status ?? 'error'}`);
    }
  }

  if (typeof api?.listRepositoryRulesets === 'function') {
    try {
      const summaries = await api.listRepositoryRulesets();
      for (const summary of (Array.isArray(summaries) ? summaries : []).slice(0, 30)) {
        if (!branchRuleApplies(summary, branch)) continue;
        let ruleset = summary;
        if (!Array.isArray(ruleset.rules) && typeof api.getRuleset === 'function') {
          try {
            ruleset = await api.getRuleset(summary.id);
          } catch (error) {
            unavailable.push(`ruleset-${summary.id}:${error?.status ?? 'error'}`);
            continue;
          }
        }
        if (!ruleset) continue;
        sources.push(`ruleset:${ruleset.id ?? summary.id ?? 'unknown'}`);
        for (const rule of ruleset.rules ?? []) {
          if (rule?.type === 'required_status_checks') {
            for (const check of rule.parameters?.required_status_checks ?? []) {
              addRequiredCheck(
                required,
                check?.context,
                check?.integration_id,
                `ruleset:${ruleset.id ?? summary.id ?? 'unknown'}`,
              );
            }
          } else if (rule?.type === 'pull_request') {
            recordStalePolicy(
              stalePolicies,
              rule.parameters?.dismiss_stale_reviews_on_push,
            );
          }
        }
      }
    } catch (error) {
      unavailable.push(`rulesets:${error?.status ?? 'error'}`);
    }
  }

  return {
    branch,
    requiredChecks: [...required.values()],
    // Strict wins if multiple policies disagree. Null means "not verified".
    dismissStaleReviews: stalePolicies.length
      ? stalePolicies.includes(true)
      : null,
    sources,
    unavailable,
  };
}

/**
 * Load the changed-file list used by the path policy. GitHub returns at most
 * 3,000 files for this endpoint; an exactly-full response may be truncated, so
 * it is treated as unknown rather than silently applying a partial policy.
 */
export async function loadChangedFiles({ api, pull } = {}) {
  if (typeof api?.listPullFiles !== 'function') {
    return { files: null, reason: 'unsupported' };
  }
  try {
    const raw = await api.listPullFiles(pull?.number);
    if (!Array.isArray(raw)) return { files: null, reason: 'invalid-response' };
    if (raw.length >= 3000) return { files: null, reason: 'truncated' };
    const files = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        files.push(item);
      } else {
        if (typeof item?.filename === 'string') files.push(item.filename);
        if (typeof item?.previous_filename === 'string') files.push(item.previous_filename);
      }
    }
    return { files: [...new Set(files)], reason: null };
  } catch (error) {
    return { files: null, reason: 'api-error', status: error?.status ?? null };
  }
}
