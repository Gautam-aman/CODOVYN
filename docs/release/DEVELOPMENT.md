# Development setup

Install Node 26.12.1/npm, Git and Xcode Command Line Tools on Apple Silicon. Java/Maven are needed only for Java workflow qualification; prepare the pinned dependencies before offline tests. Do not install or authenticate a provider merely to run unit tests.

```sh
npm ci --ignore-scripts
npm run check
npm run test:extension-host
npm run build:desktop
CODOVYN_HOST_JAVA_VALIDATION=1 npm run test:desktop-host
npm run test:desktop-chat
npm run test:desktop-routing-ui
npm run test:desktop-restoration
npm run package:desktop
```

Run major native suites sequentially. Use isolated profiles/shared storage and recorded process groups. Preserve a failed run's diagnostics; redact secrets before sharing. Never kill by executable name, overwrite an installed app, increase timeouts to hide a failure, or confuse fixtures with real inference.

Metadata-only provider checks: `node scripts/validate-codex-auth.js`, `node scripts/validate-codex-native-worker.js`, and existing OpenCode broker/task initialization harnesses. They do not start sign-in or submit a model prompt. Live tests need a separate approved campaign.

Build artifacts and journals stay out of Git. See [architecture](ARCHITECTURE.md), [distribution](DISTRIBUTION.md), [security](../../SECURITY.md) and the [contributor backlog](CONTRIBUTOR-BACKLOG.md). Maintainers use direct main commits in the current campaign; external contributors should open reviewed PRs once repository access is granted.

## Task-history retention

The CLI uses `tasks.sqlite` under `CODOVYN_DATA_DIR`, or `~/.codovyn` when that
variable is unset. Use the same data directory as the tasks you intend to inspect.
From the CODOVYN checkout, replace the repository path and task ID below with
your own values:

```sh
node apps/cli/src/index.js tasks /path/to/project
node apps/cli/src/index.js history TASK_ID /path/to/project
node apps/cli/src/index.js task-delete TASK_ID /path/to/project
node apps/cli/src/index.js task-prune /path/to/project 2026-01-01T00:00:00Z
```

The deletion commands ask for terminal confirmation; decline to cancel. A final
`--yes` skips that prompt and performs deletion, so it is not a preview flag.
`task-prune` reports the candidate count before confirmation and returns the
deleted task IDs. These commands do not start a provider.

The existing [TaskStore implementation](../../packages/storage/src/index.js)
defines the boundaries:

| Operation | Eligibility and result |
| --- | --- |
| `delete(id)` | Refuses running tasks, unreleased execution leases, open edit drafts and campaign-accounting history. Removes the task, its events and execution leases in one transaction; returns `true`, or `false` for a missing task. |
| `prunable({ before, repositoryRoot, limit })` | Returns candidate IDs without deleting history. Requires a nonempty repository root and an ISO-style, parseable cutoff. Selects only `completed`, `failed` or `cancelled` tasks whose `updated_at` is strictly before the cutoff, excluding unreleased leases, open drafts and campaign-accounting history. Orders by update time, then ID. |
| `prune(options)` | Recomputes candidates and deletes their task, event and lease records in one transaction; returns the deleted IDs. The storage API defaults to 100 tasks and accepts limits from 1 to 1000. The CLI uses the default 100-task batch. |

Pruning retains interrupted and other unfinished tasks for recovery. An open
draft is a `draft-created` event without a later `draft-accepted` or
`draft-rejected` event. Apply or discard it through the existing review flow
before deleting its history; do not bypass review by editing journal records.
See [recovery](../agents/recovery.md). Ordinary retention cannot delete campaign
accounting or reset consumed reservations.

Deletion is logical removal from SQLite, not secure erasure of database pages,
WAL contents, filesystem snapshots or backups. Manage copied journals and backups
separately; see the [security policy](../../SECURITY.md#current-boundary).

Existing deterministic coverage is in
[store.test.js](../../packages/storage/test/store.test.js) (durable deletion,
running-task refusal, open-draft retention and bounded repository pruning) and
[campaign.test.js](../../packages/storage/test/campaign.test.js) (accounting
history remains retained after reopening). Run these without provider credentials:

```sh
node --test packages/storage/test/store.test.js packages/storage/test/campaign.test.js
```
