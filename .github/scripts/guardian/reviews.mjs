import { DEFAULT_AI_REVIEW_LOGIN, SEVERITIES } from './constants.mjs';
import { codeSpan, escapeInline, isBot, isSameLogin } from './util.mjs';

const WRITE_PERMISSIONS = new Set(['admin', 'maintain', 'write']);

function finding(id, severity, title, detail) {
  return { id, severity, title, detail };
}

function reviewTime(review) {
  return Date.parse(review?.submitted_at ?? '') || 0;
}

function latestPerUser(reviews) {
  const latest = new Map();
  for (const review of reviews) {
    const login = review?.user?.login;
    if (!login) continue;
    const state = String(review?.state ?? '').toUpperCase();
    if (state === 'PENDING') continue;
    const key = login.toLowerCase();
    const current = latest.get(key);
    if (!current || reviewTime(review) >= reviewTime(current)) latest.set(key, review);
  }
  return [...latest.values()];
}

function describeLogins(logins) {
  return logins.map((login) => codeSpan(login)).join(', ');
}

function onCurrentHead(review, headSha) {
  const commitId = String(review?.commit_id ?? '');
  const head = String(headSha ?? '');
  return Boolean(commitId && head && commitId.toLowerCase() === head.toLowerCase());
}

/**
 * Reviews from users without repository write access do not affect GitHub's
 * effective review decision. Guardian applies the same rule so a drive-by
 * approval cannot produce a false ready state, and a drive-by change request
 * cannot block an otherwise ready pull request.
 */
async function classifyReviewers(api, reviewers) {
  const trusted = new Map();
  for (const reviewer of reviewers) {
    const login = reviewer.user.login;
    const key = login.toLowerCase();
    if (trusted.has(key)) continue;
    let permission;
    try {
      permission = await api.getCollaboratorPermission(login);
    } catch {
      return { trusted, error: true };
    }
    const level = String(permission?.permission ?? '').toLowerCase();
    trusted.set(key, WRITE_PERMISSIONS.has(level));
  }
  return { trusted, error: false };
}

/**
 * Summarise effective reviews. Only the latest non-pending review per user
 * counts. By default a review must carry the current head SHA; an approval for
 * commit A is not an approval for commit B. The only exception is an explicitly
 * verified repository policy that says stale approvals are not dismissed.
 */
export async function evaluateReviews({
  api,
  pull,
  aiReviewEnabled = false,
  aiReviewLogin = DEFAULT_AI_REVIEW_LOGIN,
  repositoryPolicy = null,
}) {
  let reviews;
  try {
    reviews = await api.listReviews(pull.number);
  } catch (error) {
    return {
      status: 'unknown',
      approvedBy: [],
      changesRequestedBy: [],
      staleApprovedBy: [],
      aiReviewed: false,
      aiChangesRequestedBy: [],
      findings: [
        finding('review.api-unavailable', SEVERITIES.BLOCKER, 'Review data is unavailable',
          `Guardian could not read reviews for this pull request (HTTP ${error?.status ?? 'unknown'}). Readiness cannot be determined from incomplete data.`),
      ],
    };
  }

  const headSha = pull?.head?.sha ?? '';
  const allowStaleApprovals = repositoryPolicy?.dismissStaleReviews === false;
  const latest = latestPerUser(Array.isArray(reviews) ? reviews : []);
  const author = pull?.user?.login ?? '';
  const decisionStates = new Set(['APPROVED', 'CHANGES_REQUESTED']);
  const humanCandidates = latest.filter((review) => !isBot(review.user)
    && !isSameLogin(review.user?.login, author)
    // An enabled AI reviewer is advisory even if its login is a user account.
    // It must never be counted as a human approval.
    && !(aiReviewEnabled && isSameLogin(review.user?.login, aiReviewLogin))
    && decisionStates.has(String(review.state).toUpperCase()));
  const ai = latest.filter((review) => isSameLogin(review.user?.login, aiReviewLogin));

  const reviewerTrust = await classifyReviewers(api, humanCandidates);
  if (reviewerTrust.error) {
    return {
      status: 'unknown',
      approvedBy: [],
      changesRequestedBy: [],
      staleApprovedBy: [],
      aiReviewed: false,
      aiChangesRequestedBy: [],
      findings: [
        finding('review.api-unavailable', SEVERITIES.BLOCKER, 'Reviewer permissions are unavailable',
          'Guardian could not verify whether reviewers have repository write access. Readiness cannot be determined from incomplete data.'),
      ],
    };
  }

  const trustedHumans = humanCandidates.filter((review) => reviewerTrust.trusted.get(review.user.login.toLowerCase()));
  const untrusted = humanCandidates.filter((review) => !reviewerTrust.trusted.get(review.user.login.toLowerCase()));
  const currentHumans = trustedHumans.filter((review) => onCurrentHead(review, headSha));
  const staleHumans = trustedHumans.filter((review) => !onCurrentHead(review, headSha));
  const verifiableStaleHumans = staleHumans.filter((review) => String(review?.commit_id ?? ''));
  const unverified = staleHumans.filter((review) => !String(review?.commit_id ?? ''));
  // A stale-review policy can make an earlier approval effective, but it cannot
  // manufacture a commit SHA. Reviews without one remain unverified. A stale
  // change request is reported as a warning rather than an approval blocker;
  // only a review of the current head can request changes.
  const effectiveApprovals = allowStaleApprovals
    ? [...currentHumans, ...verifiableStaleHumans]
    : currentHumans;

  const approvedBy = effectiveApprovals
    .filter((review) => String(review.state).toUpperCase() === 'APPROVED')
    .map((review) => review.user.login);
  const changesRequestedBy = currentHumans
    .filter((review) => String(review.state).toUpperCase() === 'CHANGES_REQUESTED')
    .map((review) => review.user.login);
  const staleApprovedBy = verifiableStaleHumans
    .filter((review) => String(review.state).toUpperCase() === 'APPROVED')
    .map((review) => review.user.login);
  const staleChangesRequestedBy = verifiableStaleHumans
    .filter((review) => String(review.state).toUpperCase() === 'CHANGES_REQUESTED')
    .map((review) => review.user.login);

  // AI review is always head-scoped, even when the repository permits stale
  // human approvals. A repository review policy is not an AI-review policy.
  const currentAi = ai.filter((review) => onCurrentHead(review, headSha));
  const staleAi = ai.filter((review) => !onCurrentHead(review, headSha));
  const aiChangesRequested = currentAi
    .filter((review) => String(review.state).toUpperCase() === 'CHANGES_REQUESTED')
    .map((review) => review.user.login);
  const aiReviewed = currentAi.some((review) => ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'].includes(
    String(review.state).toUpperCase(),
  ));

  const findings = [];

  if (untrusted.length) {
    findings.push(finding(
      'review.untrusted-reviewers',
      SEVERITIES.INFO,
      'Reviews without write access were ignored',
      `${untrusted.length} review(s) came from users without repository write access. They do not count toward approval or changes requested.`,
    ));
  }

  if (staleApprovedBy.length) {
    findings.push(finding(
      'review.stale-approval',
      allowStaleApprovals ? SEVERITIES.INFO : SEVERITIES.WARNING,
      'Approval is for an earlier commit',
      allowStaleApprovals
        ? `${describeLogins(staleApprovedBy)} approved an earlier commit, not ${codeSpan(String(headSha).slice(0, 7))}. The verified repository policy does not dismiss stale reviews, so Guardian records it as effective.`
        : `${describeLogins(staleApprovedBy)} approved an earlier commit, not ${codeSpan(String(headSha).slice(0, 7))}. Guardian does not treat that as approval of the current head because the repository stale-review policy was not verified as permitting it.`,
    ));
  }

  if (staleChangesRequestedBy.length) {
    findings.push(finding(
      'review.stale-changes-requested',
      SEVERITIES.WARNING,
      'Change request is for an earlier commit',
      `${describeLogins(staleChangesRequestedBy)} requested changes on an earlier commit. That review is not treated as a blocker for the current head; ask for a fresh review if the concern still applies.`,
    ));
  }

  if (unverified.length) {
    findings.push(finding(
      'review.unverified-commit',
      SEVERITIES.WARNING,
      'Review commit could not be verified',
      `${unverified.length} review(s) did not include a commit SHA. Guardian cannot prove they apply to the current head and does not count them.`,
    ));
  }

  if (allowStaleApprovals && staleApprovedBy.length) {
    findings.push(finding(
      'review.stale-policy',
      SEVERITIES.INFO,
      'Repository policy allows stale reviews',
      'Branch protection or a repository ruleset reports that stale reviews are not dismissed on push, so an earlier approval remains effective. This is a repository policy decision, not a Guardian assumption.',
    ));
  }

  if (changesRequestedBy.length) {
    findings.push(finding(
      'review.changes-requested',
      SEVERITIES.BLOCKER,
      'Changes were requested by a human reviewer',
      `${describeLogins(changesRequestedBy)} requested changes on the current head. Address the review and ask for a fresh review; Guardian does not dismiss reviews on its own.`,
    ));
  }

  if (aiReviewEnabled) {
    if (aiChangesRequested.length) {
      findings.push(finding(
        'review.ai-changes-requested',
        SEVERITIES.BLOCKER,
        'The configured AI reviewer requested changes',
        `${describeLogins(aiChangesRequested)} requested changes on the current head. Guardian does not treat AI output as human approval.`,
      ));
    }
    if (staleAi.length) {
      findings.push(finding(
        'review.ai-stale',
        SEVERITIES.WARNING,
        'AI review is for an earlier commit',
        `${codeSpan(aiReviewLogin)} reviewed an earlier commit. Guardian requires a review of the current head before treating the configured AI-review condition as satisfied.`,
      ));
    }
    if (!aiReviewed) {
      findings.push(finding(
        'review.ai-pending',
        SEVERITIES.INFO,
        'AI review has not completed',
        `Waiting for a review of the current head from ${codeSpan(aiReviewLogin)}. If the GitHub App is not installed, this condition will never complete; disabling AI review does not mean an AI review happened.`,
      ));
    } else {
      findings.push(finding(
        'review.ai-reviewed',
        SEVERITIES.INFO,
        'AI review completed',
        `${codeSpan(aiReviewLogin)} reviewed the current head. AI review is advisory and never substitutes for human approval.`,
      ));
    }
  }

  if (approvedBy.length) {
    findings.push(finding(
      'review.approved',
      SEVERITIES.INFO,
      'Human approval present',
      `${describeLogins(approvedBy)} ${allowStaleApprovals && staleApprovedBy.length
        ? 'provided an effective approval under the verified repository stale-review policy'
        : 'approved the current head'}. Approval is tracked separately from readiness; a maintainer still decides whether to merge.`,
    ));
  } else if (!changesRequestedBy.length) {
    findings.push(finding(
      'review.no-human-approval',
      SEVERITIES.INFO,
      'No current-head human approval',
      'Approval is informational for Guardian readiness and is not required to request a maintainer review. Guardian does not approve or request reviewers automatically.',
    ));
  }

  let status = 'none';
  if (changesRequestedBy.length) status = 'changes-requested';
  else if (approvedBy.length) status = 'approved';

  return {
    status,
    approvedBy,
    changesRequestedBy,
    staleApprovedBy,
    staleChangesRequestedBy,
    aiReviewed,
    aiChangesRequestedBy: aiChangesRequested,
    findings,
  };
}

export function formatReviewDetail(reviews) {
  if (!reviews) return 'Review data unavailable.';
  if (reviews.status === 'changes-requested') {
    return `Changes requested by ${escapeInline(reviews.changesRequestedBy.join(', '), { maxLength: 120 })}.`;
  }
  if (reviews.status === 'approved') {
    return `Approved by ${escapeInline(reviews.approvedBy.join(', '), { maxLength: 120 })}. Approval is separate from readiness.`;
  }
  if (reviews.status === 'unknown') return 'Review data could not be verified.';
  if ((reviews.staleApprovedBy?.length ?? 0) > 0) {
    return `No current-head approval. ${reviews.staleApprovedBy.length} approval(s) are for earlier commits.`;
  }
  return 'No current-head human approval yet. Approval is tracked separately from readiness.';
}
