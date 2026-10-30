# ResQNet → CODOVYN automation parity

Reference: Gautam-aman/ResQNet at `44c3058d2d3eb3d0706ebe4572065f6f3900046f`. MIT source notice retained in `.github/scripts/LICENSE-ResQNet`; CODOVYN adaptations are subject to the same retained upstream grant. No IDE implementation is changed.

This checklist precedes adaptation. Verification and rollout results will be recorded below.

| Reference capability | CODOVYN implementation target |
| --- | --- |
| Interest replies; exact /assign and /unassign | Contributor bot; same patterns, two-open-issue cap, conflict handling |
| Sensitive title/label refusal; maintainer assignments | No automated sensitive assignment; native maintainer assignment remains available |
| Duplicate welcome suppression; issue/user concurrency | Marker ownership; repository-wide serialized privileged reconciliation |
| Permission failures | Safe 403/422 assignment guidance, no PAT |
| Deliberate same-repository issue references | Shared parser, excludes quoted code/external references |
| PR advisory labels/comment lifecycle | awaiting-issue-assignment, contribution-policy-ok, authorized no-issue-required |
| Assignment changes and PR lifecycle | Open/edit/synchronize/reopen/ready/label events; issue reassignment reconciliation |
| Guardian summary ownership | One canonical marker-owned summary, retire duplicate advisory |
| Checks and repository policy | CODOVYN CI matrix; automation path checks; manual/post-merge workflows not unconditional PR requirements |
| Draft/conflict/staleness/terminal states | Preserve all reference states, including legacy AWAITING_HUMAN_REVIEW compatibility |
| Human reviews and stale approvals | Preserve current-head and verified policy semantics |
| Status/explain/recheck/dismiss/help | Same commands; privileged recheck/dismiss permission checks |
| Non-dismissible findings | Preserve security/missing/unknown/policy/conflict restrictions and tighten required failures |
| Maintainer notifications | Configurable, at most once per qualifying head, bot/maintainer exclusions |
| Optional external AI reviewer | Disabled; verify configured reviewer metadata only; never invoke inference |
| API client/transport | Explicit endpoints, GET-only bounded retry, timeouts, capped pagination, no ambiguous write retry |
| Workflow trust | Trusted default-branch checkout only for privileged execution; untrusted tests read-only |
| Rollout | All writes disabled initially; fixture validation before default-branch controlled rollout |
| Tests | Port contributor, advisory, HTTP, Guardian policy/check/review/command/comment/replay suite |

## API surface

Read: issues/comments/events/timeline/assignees; pulls/files/reviews; collaborator permissions; commits/check-runs/statuses; branch protection/rulesets; bounded pull search. Optional writes: issue assignments, labels, marker-owned comments and advisory check runs. No merge, review approval, close, deployment, release, billing or model API endpoint exists in the bot client.

## Implementation and verification

PR: https://github.com/Gautam-aman/CODOVYN/pull/83. Implementation commit: `cec5806a681b6e8d3bcf4ea134ba3883e3f88882`. The table above is implemented, with these deliberate CODOVYN-specific restrictions:

- Native maintainer assignment remains the exception mechanism; the bot never claims a sensitive/restricted issue for anyone. Explicit no-auto-assign/maintainer-only labels are respected.
- Privileged workflows use a common repository concurrency group, not overlapping event-keyed groups. Because GitHub can replace pending runs, this is serialization rather than a durable event queue; the guide explains missing-confirmation handling and the PR sweep.
- Default-branch code only; contributor/advisory write gates exist at both workflow and CLI layers. Guardian defaults dry, notifications/AI off, and advisory check-run output off in its workflow.
- Actual CODOVYN CI matrix required for all PR paths, including docs. Dedicated bot tests required on automation changes. Desktop is post-merge/manual; alpha/signing is manual and not an unconditional contributor check.
- Required CI is bound to observed GitHub Actions app ID 15368. Incompatible repository-app requirements cannot accidentally certify a passing check. Only success counts for required/security results; skipped/neutral remain unknown.
- Required failures, no-data, unknown repository policy and explicit infrastructure failures are non-dismissible. Readiness for review still does not require a pre-existing human approval or imply merge authorization.
- Membership alone cannot grant a maintainer policy bypass. Current write/maintain/admin permission and exception label history are verified.
- Pagination/search truncation is an error rather than complete evidence. API writes are never retried after ambiguous network outcomes. Duplicate contributor and Guardian command event responses use authenticated bot-owned markers.
- Untrusted Markdown/mentions are escaped. Sensitive issue interest receives maintainer guidance rather than an invitation to claim it.

### Local evidence

Reference suite before policy adaptation: **189 passed**. Adapted suite: **234 passed, 0 failed/cancelled/skipped** on Node 26.12.1 (225.141125 ms); also passed on the locally installed Node 26.9.0. The changed CI policy tests replace reference Android/web/backend expectations with actual CODOVYN checks; they do not disable missing-check assertions. Required-failure dismissal tests were tightened to reject dismissal.

- Contributor/advisory: `contributor-bot.test.mjs`, `pr-assignment-bot.test.mjs`.
- HTTP/API: `lib/http.test.mjs`, `guardian/security-boundaries.test.mjs`.
- Guardian: policy, repository-policy, checks, CI-policy, reviews, readiness, commands, comments, index and lifecycle replay tests.
- **35 automation modules** passed `node --check`.
- All four workflows parsed as YAML and passed **actionlint v1.7.7** (shellcheck disabled; command bodies contain fixed Node invocations).
- checkout `11bd71901bbe5b1630ceea73d27597364c9af683` and setup-node `49933ea5288caeca8642d1e84afbd3f7d6820020` verified as GitHub commits.
- Documentation links checked locally; `git diff --check` passed. No IDE/runtime tests or live AI inference were needed for this automation-only change. This does not relabel unrelated IDE checks as passing.

### Actual hosted validation and remaining gates

A controlled manual dispatch of **Guardian tests** on the review branch succeeded: https://github.com/Gautam-aman/CODOVYN/actions/runs/41112088433. This workflow has `contents: read`, no write scopes and no provider/account secrets. Its success is current hosted evidence; historical GitHub billing restrictions are not assumed to block every run now. PR-triggered automation/CI results must be assessed independently.

Created/reused labels: `awaiting-issue-assignment`, `contribution-policy-ok`, `no-issue-required`. No exception label was applied to authorize this PR. No repository protection, settings, billing, visibility or bot rollout variable was changed.

**Not yet verified:** real default-branch Guardian dry-run evaluation with the workflow's actual token against controlled PR metadata, and subsequent controlled contributor/advisory comment/assignment/check-run writes. Those require the approved PR merge first; privileged workflows deliberately cannot execute this PR's head code as trusted default-branch automation. They remain disabled, and no automated merge or permission expansion is attempted. Follow BOTS.md before enabling any live writes. Branch-protection/ruleset permission limitations must fail closed and be reviewed, not bypassed with a PAT.
