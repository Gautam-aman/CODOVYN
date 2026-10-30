# CODOVYN contributor bots and Guardian

## Rollout status

The implementation is proposed for maintainer review. Contributor Bot and PR Assignment Bot writes default **off** (`COMMUNITY_BOTS_ENABLED` must be exactly `true` in both workflow and CLI). Guardian defaults to **dry run**, notifications off, AI review off, and its workflow defaults advisory check-run publication off. Commands described below become interactive only after the controlled default-branch rollout. Until then, ask a maintainer in the issue or PR.

## Claiming an issue

Read the issue and existing discussion first. A message such as “I would like to work on this” gets a welcome and contribution links; it does not assign the issue. Comment exactly `/assign` to claim an available, unrestricted issue. You may hold at most **two open issues**. Comment `/unassign` on an issue you own to release it. Finish or release work before claiming another.

An existing assignee is never displaced. Maintainers use GitHub's normal assignment controls for exceptions. Security, authentication, credentials and explicitly restricted issues are never automatically assigned—even for a maintainer's `/assign`. Ask for human review instead. A GitHub permission failure produces guidance, not repeated assignment attempts or a request for a token.

Duplicate events and welcome replies are suppressed with bot-owned markers. Privileged workflows share repository-wide serialization so two different issue claims cannot bypass the two-issue limit. GitHub concurrency keeps only a bounded pending run and can replace older pending events: this is not a durable queue. If no confirmation appears, inspect Actions or ask a maintainer before repeating a request. Guardian's daily sweep reconciles PR readiness; it does not replay claims.

## Linking pull requests

Use `Closes #123`, `Fixes #123`, `Resolves #123`, `Related issue: #123`, or `Issue #123` in the PR description, outside code examples. Bare numbers, external repository references and quoted examples do not establish policy compliance. Up to ten distinct deliberate references are checked against this repository. Assignment to the PR author must be verified for each issue.

The advisory maintains `awaiting-issue-assignment` or `contribution-policy-ok`. A maintainer may apply `no-issue-required` for genuine documentation/maintenance exceptions. The bot verifies the most recent label event and its actor's **current write/maintain/admin permission**; a label name alone is not authorization. Maintainer-authored bypass similarly requires verified permission. Automation-authored PRs are exempt from assignment policy, not from CI or review.

The advisory responds to PR opening/reopening/editing/synchronization, readiness and labels, and rechecks linked PRs after issue assignments change. When Guardian owns a summary, the separate advisory is retired to avoid competing feedback. These bots never close or reject a contribution.

## Understanding Guardian

Guardian maintains one canonical summary: state, blockers, assignment status, expected/required CI, reviews, security findings, warnings and next actions. Duplicate summaries are superseded. **Ready for maintainer review does not mean approved to merge.** Human approval and GitHub's protection rules remain separate.

| State | Meaning |
| --- | --- |
| `AWAITING_ASSIGNMENT` | Missing/unverified issue reference or assignment. |
| `NEEDS_CHANGES` | Draft, merge conflict or an effective request for changes. |
| `CHECKS_RUNNING` | Expected CI is pending or within its initial reporting grace period. |
| `CHECKS_FAILED` | A required or security check failed. |
| `INFRASTRUCTURE_BLOCKED` | Missing expected checks, unreadable evidence, unknown results or explicit infrastructure restriction. |
| `AWAITING_AI_REVIEW` | Optional configured external reviewer has not reviewed this head. |
| `READY_FOR_MAINTAINER_REVIEW` | Automated conditions permit human review; not approval or merge permission. |
| `STALE` | A previously review-ready/waiting PR has no activity beyond the configured window. |
| `MERGED` / `CLOSED` | Terminal state observed from GitHub, never performed by Guardian. |
| `UNKNOWN` | Trustworthy PR identity/state cannot be established. |

Legacy `AWAITING_HUMAN_REVIEW` is retained for parsing old summaries; new readiness uses `READY_FOR_MAINTAINER_REVIEW`. Stale human approvals are reported separately and obey readable repository policy. Requests for changes are evaluated using current effective human reviews. Optional external AI metadata never substitutes for a human decision and never invokes a model.

### Commands on a PR

| Command | Access |
| --- | --- |
| `/guardian status` | Any non-bot contributor; reads recorded state. |
| `/guardian explain` | Any non-bot contributor; evaluates without changing canonical summary. |
| `/guardian help` | Any non-bot contributor. |
| `/guardian recheck` | Verified repository write/maintain/admin permission. |
| `/guardian dismiss <finding-id> <reason>` | Same permission; requires a present, dismissible, non-informational finding and reason. |

Security findings, required check failures, missing checks, unknown infrastructure/policy data, merge conflicts and other safety findings cannot be dismissed. Allowed false-positive dismissals are recorded with actor, reason, time and head binding where appropriate. They expire or become invalid as state changes. Guardian never dismisses GitHub human reviews. Replayed command events do not create duplicate responses.

Notifications are optional: at most one mention per qualifying head SHA, with configured validated maintainer logins; bot/maintainer-authored PRs are excluded. Readiness can still change after a notification.

## CODOVYN CI policy

Every PR—including documentation—expects all three current `CI` jobs: `test (ubuntu-latest)`, `test (macos-latest)`, `test (windows-latest)`, bound to GitHub Actions' app identity. Changes under `.github/scripts` or to the four bot workflows also expect `guardian + bot tests`. Readable branch protection and rulesets add requirements. Unreadable policy is unknown, not an assumed absence of rules.

The `Desktop development validation` workflow is post-merge/manual, and `Alpha qualification (no publication)` is manual. Neither is an unconditional PR requirement. Their reported results can still be observed; no bot triggers signing, release or application execution. Missing, neutral and skipped required results are not successful. Explicit GitHub startup/billing/runner failure evidence is classified as infrastructure-blocked; an ordinary failure is not automatically blamed on billing.

## Maintainer rollout

1. Review the PR's source, MIT attribution, pinned actions, workflow permissions and tests. Run:
   ```sh
   node --test .github/scripts/*.test.mjs .github/scripts/lib/*.test.mjs .github/scripts/guardian/*.test.mjs
   ```
2. Use the read-only `Guardian tests` workflow on the reviewed branch. It executes fixtures with `contents: read`, no provider account and no write scopes. A first workflow definition may be undispatchable until merged onto the default branch; do not bypass the trusted-checkout model to work around that.
3. Merge only through the approved review process. Keep `COMMUNITY_BOTS_ENABLED` absent/false and `GUARDIAN_DRY_RUN=true`. Dispatch Guardian against a controlled PR; inspect results and permission diagnostics. No summary/check-run/notification is written in dry run.
4. After fixture and real dry-run evidence is reviewed, enable Contributor/PR advisory writes with `COMMUNITY_BOTS_ENABLED=true` on controlled disposable issue/PR events. Review assignment, permission-denial, replay and comment/label behavior before broader use.
5. Separately enable Guardian comments with `GUARDIAN_DRY_RUN=false`, then optionally `GUARDIAN_CHECK_RUN=true`. Verify one canonical comment and update per event. Enable `GUARDIAN_NOTIFY=true` only after deduplication is confirmed. Roll back using the same variables.

Other bounded settings: `GUARDIAN_MAX_PULLS` (default 25, max 100), `GUARDIAN_STALE_DAYS` (30), `GUARDIAN_NO_CHECKS_GRACE_MINUTES` (15), `GUARDIAN_MERGEABLE_RETRY_MS` (800), `GUARDIAN_MAINTAINERS`, `GUARDIAN_BOT_LOGIN`. Optional `GUARDIAN_AI_REVIEW=false` and `GUARDIAN_AI_REVIEW_LOGIN` recognize an existing reviewer only. Do not enable paid reviews implicitly.

Privileged execution always checks out the trusted default branch, never the PR head. API reads have deadlines, limited retry and pagination caps; incomplete evidence fails closed. Non-idempotent API writes are not automatically retried after ambiguous responses. Tokens use only `GITHUB_TOKEN`; do not add a PAT. Some repository-policy endpoints may require permissions not available to a workflow token; report and review that limitation instead of weakening the policy or changing branch protection.

The bots never merge, approve, close, deploy, publish, run application code, consume inference quota, alter billing, or execute commands supplied in comments. Report security concerns through [SECURITY.md](../../SECURITY.md), not a public exploit comment.
