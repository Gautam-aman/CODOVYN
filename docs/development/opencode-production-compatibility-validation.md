# Phase 14 — repository identity and OpenCode compatibility

Status: engineering in progress, no inference authorized or performed.

Starting checkpoint: `6c8f2faefdb5e3861851711af2f46ed09d05c687`, clean `main`, same local/remote SHA after fetch. Baseline dependency install passed and **255 tests passed**, zero failed/skipped. Existing commit is the recoverable checkpoint; no branch/reset/history rewrite.

## Architecture decision

Choose a host-controlled metadata broker with a small native descriptor-based reader and a restricted native client. Do not extend Phase 13's immutable-response shim. The client carries a fixed lease/socket identity, not cached Git results. The host reads HEAD/refs freshly and rejects replaced roots or metadata stores. Every query is scoped to the same host-approved root and expiring authorization.

A version-pinned provider patch could offer a cleaner in-process API, but it still needs this authority model. Upstream 2.1.2 is pinned at `a517687fde98a7329ada3ae644a01a9fc6c4e99e`; its build requests Bun 1.4.2 while this machine has 1.3.11. A modified provider binary would require a separate reproducible build/provenance/distribution review. No owner executable will be replaced and no modified provider will be shipped.

The broker avoids running Git entirely: no configuration, include files, hooks, fsmonitor, credential helpers, SSH or network tools are consulted. Native reads use directory descriptors and no-follow path traversal. Loose commit objects are bounded, decompressed and content-hash verified in the host. Unsupported object storage fails closed; no fabricated root commit or fallback to real Git. This deliberately narrows compatibility rather than implementing another general Git engine.

## Pinned compatibility inventory

| Upstream operation | Role | Intended compatibility |
| --- | --- | --- |
| `rev-parse --git-dir --git-common-dir --show-toplevel` | Project discovery | Essential; fresh authorized paths/identity |
| `rev-parse HEAD` | Session/VCS current commit | Essential; fresh HEAD/ref resolution, explicit unborn state |
| `symbolic-ref --quiet --short HEAD` | Current branch | Essential; fresh branch or detached state |
| `rev-list --max-parents=0 HEAD` | Project root-commit identity | Bounded verified loose-object graph; unsupported storage rejected |
| `remote get-url origin` | Optional remote-derived project identity | Denied; upstream can use real root commits, never a made-up URL |
| `worktree list --porcelain` | Optional main-worktree canonicalization | Denied initially; current worktree/common-directory identity remains explicit |
| `symbolic-ref refs/remotes/.../HEAD` | Optional remote branch | Denied |
| clone/fetch/checkout/reset, worktree add/remove | Mutating provider VCS features | Denied |
| index refresh/write-tree/diff/restore/object packing | Provider snapshots | Disabled by existing policy and denied by transport |
| ACP initialize/session-new/config/model metadata | Session startup | No inference; retain client FS/terminal capability denial |
| ACP session persistence | Provider-owned private state | Existing isolated provider context only |

Git methods may carry a `--git-dir ... --work-tree ...` prefix. Only exact authorized values and exact read operations are candidates; arbitrary flags/subcommands remain denied. ACP has no documented client repository-metadata field. The native client is an explicitly maintained, version-pinned local integration ABI, not an invented ACP extension.

Initial compatibility is experimental. No success of metadata initialization will authorize a prompt or imply authenticated access. Production Git execution remains blocked until all relevant gates pass.
