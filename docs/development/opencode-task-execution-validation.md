# Phase 15 — task-bound OpenCode execution boundary

**PRODUCTION OPENCODE CODING EXECUTION: BLOCKED**

Starting checkpoint: clean `main` at `5589a77ed11ef2b7a3daecf02b7471e56fe81ca1`, synchronized with the same `origin/main` after fetch. Baseline install passed; 280 local tests passed. No inference authorized or performed. Engineering and final native/artifact validation are in progress.

## Architecture decision

Preserve the Phase 14 metadata broker and its source-blind provider sandbox. Compose it with a separate TaskEngine-issued execution authority and a descriptor-relative host file-read leaf. No second scheduler, storage system or public privileged filesystem IPC is introduced.

The authority is bound to the real SQLite lease token (not exported), logical task, unique segment, provider, immutable accepted policy digest, authorized workspace and one live owned ChildProcess/executable. Lease owner PID/hostname, status, policy and lifetime are checked. A process cannot bind twice or move into a second authority. Revocation/expiry denies further access but never releases the SQLite ownership fence. Existing provider-stop/reconciliation rules remain responsible for lease release.

The file service additionally binds the Phase 14 repository authority and verified executable digest. Each read rechecks lease, process, executable metadata and fresh repository identity. A native host reader receives a pinned root descriptor, walks without following symlinks, rejects nested repositories and hardlinks, bounds text to 64 KiB and rechecks paths/file identity after reading. A durable sanitized audit is required before returning allowed data. Cancellation terminates owned readers; close drains them before descriptor release. Unsupported writes always reject.

## Pinned provider interface conflict

The official OpenCode 2.1.2 source at `a517687fde98a7329ada3ae644a01a9fc6c4e99e` was inspected through its Git tree/blob API:

- `packages/cli/src/acp/capabilities.ts`: capability parsing for child updates, elicitation and compaction; no client filesystem bridge.
- `packages/cli/src/acp/turn.ts`: forwards prompt execution to the private OpenCode server.
- `packages/core/src/tool/plugin/read.ts`: reads through `ReadToolFileSystem` and host/provider `FileAccess`/environment services.
- `packages/core/src/tool/plugin/write.ts` and `edit.ts`: perform provider-side filesystem mutation, with its own permission and environment services.

[Official ACP overview](https://docs.opencode.ai/docs/acp/) describes stdio ACP and native tools; it does not establish a client file-broker integration for this pinned binary. CODOVYN continues advertising `fs.readTextFile:false`, `fs.writeTextFile:false` and no terminal capability. It sends no invented protocol fields and does not fabricate tool results.

**The new host service is not consumed by OpenCode's native tools.** The actual ACP test invokes the service from the trusted validation host. It does not establish a working provider Ask/Agent coding workflow. Granting broad direct filesystem access would bypass the descriptor service. A separately validated provider interface or maintained provider patch is needed before enabling coding. No provider executable was replaced or modified.

## Reproduction

```bash
node --test packages/task-engine/test/execution-authority.test.js packages/agent-adapters/test/task-file-access.test.js
node scripts/validate-opencode-task-boundary.js
```

The latter creates its own Java project, real TaskEngine tasks/leases, actual OpenCode ACP sessions and a host-invoked file service. It covers Ask configuration and an approved isolated Agent worktree, reads Java and Maven files, checks denial of writes/secrets/Git metadata, closes owned processes and verifies the original repository remains unchanged. **No session/prompt or inference occurs.** It cannot be pointed at an owner's project.

Agent draft writes, provider-native file-tool mediation and authenticated coding are not implemented or enabled by this work. Existing independent draft-review/patch-application tests remain in place. Final counts, native evidence and installer results will be recorded after validation.
