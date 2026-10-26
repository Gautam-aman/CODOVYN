# Architecture entry points

| Layer | Responsibility |
| --- | --- |
| `apps/desktop/build`, `apps/desktop/integration` | Pinned VSCodium/Node assembly, branding/themes, supported native entry points, development/distribution packaging |
| `apps/vscode-extension` | Real webview UI, host validation, native dialogs and private worker lifecycle; no renderer credential or approval authority |
| `apps/cli/src/codex-session.js` | Owner-initiated memory-only auth and one native-reviewed disposable Ask; same TaskStore/TaskEngine, not another scheduler |
| `packages/agent-adapters` | Official provider protocols, strict process lifecycle, Codex pre-action restrictions, hardened repository/file/MCP mediation |
| `packages/task-engine` | Task identity, leases, request/write accounting integration, serial ownership, recovery and ContextFlow authorization |
| `packages/storage` | Existing private SQLite/WAL journal, durable request reservations and write intents, no ambiguous replay |
| `packages/git-engine` | Trusted host Git, repository fingerprints, isolated worktrees, reviewed patch acceptance |
| `packages/agent-core`, `packages/agent-router` | Validated policies, packets, provider contracts and bounded routing; no inferred entitlement or hidden provider transfer |

Approved prompt → native host review → durable reservation → bound process/lease → guarded turn → journalled text/outcome → independent tests/review. Metadata and auth are not inference. Ask grants no project filesystem access to Codex; the first validation sends only an approved fixed excerpt. Unsafe tools receive no grants. Draft mutations use the existing mediated, conflict-checked, durable-intent path; Agent live qualification remains blocked.

ContextFlow and multi-provider code are retained but gated. Do not create another engine, queue, journal or worktree manager to add a provider. Start with the existing tests and [Phase 16 evidence](../development/phase16-live-multiagent-validation.md).
