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
