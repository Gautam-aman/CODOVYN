import { extractIssueNumbers } from '../lib/issue-references.mjs';
import { SEVERITIES } from './constants.mjs';
import { codeSpan, escapeInline, isBot, isSameLogin } from './util.mjs';

const EXCEPTION_LABEL = 'no-issue-required';
const WRITE_PERMISSIONS = new Set(['admin', 'maintain', 'write']);
const MAINTAINER_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const SECURITY_LABEL = /^(security|security-sensitive|vulnerability)$/i;
const SECURITY_TEXT = /\b(?:security|vulnerabilit(?:y|ies)|cve-\d{4}|credential(?:s)?|secret(?:s)?)\b/i;

function finding(id, severity, title, detail) {
  return { id, severity, title, detail };
}

function labelNames(labels = []) {
  return labels
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean);
}

function hasLabel(labels, name) {
  return labels.some((label) => label.toLowerCase() === name.toLowerCase());
}

function isSecuritySensitive(issue) {
  return labelNames(issue?.labels).some((label) => SECURITY_LABEL.test(label))
    || SECURITY_TEXT.test(String(issue?.title ?? ''));
}

async function exceptionIsAuthorized(api, pullNumber) {
  const event = await api.latestLabelEvent(pullNumber, EXCEPTION_LABEL);
  if (!event || event.event !== 'labeled' || !event.actor?.login || isBot(event.actor)) {
    return { authorized: false, reason: 'no-authorized-label-event' };
  }
  const permission = await api.getCollaboratorPermission(event.actor.login);
  const level = String(permission?.permission ?? '').toLowerCase();
  return WRITE_PERMISSIONS.has(level)
    ? { authorized: true, actor: event.actor.login }
    : { authorized: false, reason: 'label-actor-lacks-write' };
}

function describeAssignees(assignees) {
  return assignees.map((login) => codeSpan(login)).join(', ');
}

/**
 * Evaluate the linked-issue assignment policy.
 *
 * The policy is advisory to CI but authoritative for Guardian readiness: a
 * missing or unassigned linked issue produces `AWAITING_ASSIGNMENT`, never a
 * successful readiness state. Maintainer-authored PRs, trusted automation and
 * a maintainer-applied `no-issue-required` label are the explicit exceptions.
 */
export async function evaluatePolicy({ api, pull, repository, trustedAutomation = false }) {
  const findings = [];
  const labels = labelNames(pull?.labels);
  const author = pull?.user?.login ?? '';
  const authorAssociation = String(pull?.author_association ?? '').toUpperCase();

  if (!pull || !Number.isSafeInteger(pull.number) || !author) {
    return {
      status: 'unknown',
      findings: [
        finding('policy.invalid-pull', SEVERITIES.BLOCKER, 'Pull request identity is incomplete',
          'Guardian could not verify the pull request author or number.'),
      ],
      issues: [],
    };
  }

  let verifiedMaintainer = false;
  if (MAINTAINER_ASSOCIATIONS.has(authorAssociation)) {
    try { verifiedMaintainer = WRITE_PERMISSIONS.has(String((await api.getCollaboratorPermission(author))?.permission ?? '').toLowerCase()); }
    catch { return { status: 'unknown', issues: [], findings: [finding('policy.api-unavailable', SEVERITIES.BLOCKER, 'Author permission is unreadable', 'Maintainer bypass requires verified write permission.')] }; }
  }
  if (verifiedMaintainer) {
    return {
      status: 'compliant',
      issues: [],
      exception: false,
      bypass: 'maintainer',
      findings: [
        finding('policy.maintainer-bypass', SEVERITIES.INFO, 'Maintainer pull request',
          'The author has repository maintainer permissions, so the contributor assignment policy is advisory only.'),
      ],
    };
  }

  if (trustedAutomation || isBot(pull.user)) {
    return {
      status: 'compliant',
      issues: [],
      exception: false,
      bypass: 'automation',
      findings: [
        finding('policy.trusted-automation', SEVERITIES.INFO, 'Trusted automation',
          'The pull request was opened by automation, so the contributor assignment policy does not apply.'),
      ],
    };
  }

  let exception = false;
  if (hasLabel(labels, EXCEPTION_LABEL)) {
    let authorization;
    try {
      authorization = await exceptionIsAuthorized(api, pull.number);
    } catch (error) {
      return {
        status: 'unknown',
        issues: [],
        exception: false,
        findings: [
          finding('policy.api-unavailable', SEVERITIES.BLOCKER, 'Exception label could not be verified',
            `Guardian could not verify who applied ${codeSpan(EXCEPTION_LABEL)} (HTTP ${error?.status ?? 'unknown'}).`),
        ],
      };
    }
    exception = authorization.authorized;
    if (exception) {
      return {
        status: 'compliant',
        issues: [],
        exception: true,
        findings: [
          finding('policy.exception-approved', SEVERITIES.INFO, 'Maintainer-approved exception',
            `${codeSpan(EXCEPTION_LABEL)} was applied by ${codeSpan(authorization.actor)} with repository write access.`),
        ],
      };
    }
    findings.push(finding(
      'policy.exception-unauthorized',
      SEVERITIES.WARNING,
      'Exception label is not authorized',
      `${codeSpan(EXCEPTION_LABEL)} is present, but its latest label event was not applied by a repository maintainer.`,
    ));
  }

  const numbers = extractIssueNumbers(pull.body ?? '');
  if (!numbers.length) {
    findings.push(finding(
      'policy.no-issue-reference',
      SEVERITIES.BLOCKER,
      'No linked issue',
      `Add ${codeSpan('Closes #123')} to the pull request description. For documentation or maintenance work, ask a maintainer to apply ${codeSpan(EXCEPTION_LABEL)}.`,
    ));
    return { status: 'blocked', issues: [], exception: false, findings };
  }

  const issues = [];
  for (const number of numbers) {
    let issue;
    try {
      issue = await api.getIssue(number);
    } catch (error) {
      if (error?.status === 404) {
        issues.push({
          number, valid: false, assigned: false, assignees: [], securitySensitive: false,
        });
        findings.push(finding(
          `policy.issue-${number}-unverified`,
          SEVERITIES.BLOCKER,
          `Issue #${number} could not be verified`,
          'The reference is missing, closed to this repository, or points at a pull request instead of an issue.',
        ));
        continue;
      }
      findings.push(finding(
        'policy.api-unavailable',
        SEVERITIES.BLOCKER,
        'Linked issue data is unavailable',
        `Guardian could not read issue #${number} (HTTP ${error?.status ?? 'unknown'}). Readiness cannot be determined from incomplete data.`,
      ));
      return { status: 'unknown', issues, exception: false, findings };
    }

    const expected = String(repository).toLowerCase();
    const actual = String(issue?.repository?.full_name ?? repository).toLowerCase();
    const valid = Boolean(
      issue
      && Number.isSafeInteger(issue.number)
      && issue.number === number
      && actual === expected
      && !issue.pull_request,
    );
    const assignees = valid
      ? (issue.assignees ?? []).map((user) => user.login).filter(Boolean)
      : [];
    const assigned = assignees.some((login) => isSameLogin(login, author));
    const securitySensitive = valid && isSecuritySensitive(issue);
    issues.push({ number, valid, assigned, assignees, securitySensitive });

    if (!valid) {
      findings.push(finding(
        `policy.issue-${number}-unverified`,
        SEVERITIES.BLOCKER,
        `Issue #${number} could not be verified`,
        'The reference is missing, belongs to another repository, or points at a pull request instead of an issue.',
      ));
      continue;
    }

    if (securitySensitive) {
      findings.push(finding(
        `policy.issue-${number}-security-sensitive`,
        SEVERITIES.INFO,
        `Issue #${number} is security-sensitive`,
        'Security-sensitive issues are assigned by maintainers. Guardian does not change assignments.',
      ));
    }

    if (!assigned) {
      if (assignees.length) {
        findings.push(finding(
          `policy.issue-${number}-assigned-elsewhere`,
          SEVERITIES.BLOCKER,
          `Issue #${number} is assigned to another contributor`,
          `Currently assigned to ${describeAssignees(assignees)}. Coordinate with them or ask a maintainer; Guardian does not reassign issues.`,
        ));
      } else {
        findings.push(finding(
          `policy.issue-${number}-unassigned`,
          SEVERITIES.BLOCKER,
          `Issue #${number} is not assigned to the author`,
          `Comment ${codeSpan('/assign')} on issue #${number} and wait for the Contributor Bot to confirm before requesting review.`,
        ));
      }
    }
  }

  const blocked = issues.some((issue) => !issue.valid || !issue.assigned);
  if (!blocked) {
    findings.push(finding(
      'policy.assignment-verified',
      SEVERITIES.INFO,
      'Issue assignment verified',
      `The author is assigned to ${issues.map((issue) => `#${issue.number}`).join(', ')}.`,
    ));
  }

  const status = blocked ? 'blocked' : 'compliant';
  return { status, issues, exception: false, findings };
}

export function formatPolicyDetail(policy) {
  if (!policy) return 'Policy data unavailable.';
  if (policy.status === 'compliant') return 'Linked issue assignment is compliant.';
  if (policy.status === 'blocked') return 'Linked issue assignment needs attention.';
  return 'Linked issue assignment could not be verified.';
}

export function formatIssueSummary(issue) {
  if (!issue.valid) return `#${issue.number} (unverified)`;
  if (issue.assigned) return `#${issue.number} (assigned)`;
  if (issue.assignees.length) return `#${issue.number} (assigned to ${escapeInline(issue.assignees.join(', '), { maxLength: 80 })})`;
  return `#${issue.number} (unassigned)`;
}
