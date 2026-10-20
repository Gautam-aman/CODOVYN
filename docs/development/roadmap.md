# Implementation and commit roadmap

The target is at least 100 independently reviewable commits. Each numbered
group below is a real workstream, not a commitment to create filler changes.
Complete a step with relevant checks before committing and pushing it.

| Workstream | Target meaningful changes | Exit gate |
| --- | ---: | --- |
| Repository tooling, architecture, community | 12 | Clean setup and documented decisions |
| Adapter contracts, registry, deterministic agent | 10 | Contract tests |
| Durable task state and recovery | 12 | Restart tests |
| Failover and primary restoration | 12 | Failure simulation tests |
| Official agent integrations and authentication | 12 | Two live-compatible documented interfaces |
| VS Code extension and shared UI | 14 | Real workspace journey |
| Git and GitHub workflow | 10 | Authorized operation tests |
| Model routing and budgets | 8 | Transparent decision tests |
| Bots and webhook security | 10 | Permission and replay tests |
| Desktop foundation, website, release hardening | 15 | Builds and release checklist |

Dependencies: contracts precede integrations; durable checkpoints precede
failover; a working extension precedes real screenshots; verified local flows
precede release claims. The targets sum to 115 possible engineering changes.
Actual completed commit count comes from Git history.

External gates: authenticated GitHub CLI for issue administration; provider
credentials for live agent checks; release credentials for publication. Draft
work locally when a gate is unavailable.
