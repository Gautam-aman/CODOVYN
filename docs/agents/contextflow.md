# ContextFlow: review before changing providers

ContextFlow can prepare a stopped Codex task for one new OpenCode session under the same CODOVYN task ID. This is experimental, consent-based continuation. A live Codex-to-OpenCode continuation has not yet been verified. It does not migrate a provider's private session or reasoning.

1. Stop Codex and wait for cleanup. Select the interrupted task in History.
2. For edit tasks, inspect the draft and explicitly **Preserve** it in recovery first. Unknown tool outcomes still block ContextFlow; preserving a draft does not turn an ambiguous write into a completed action.
3. Choose OpenCode and its intended model/variant in Chat. This changes the next request's selection, not the stopped task's policy.
4. Open **Activity → Switch Agent**, then **Prepare review** in Changes. Preparation performs local checks and bounded model discovery, without inference.
5. Review the recipient, objective, permissions, source excerpts, action ledger and exact packet. Click **Continue with OpenCode…** for a separate native authorization prompt. Only approve if you accept sharing this context and consuming the selected provider's quota or paid access.
6. Review any resulting draft through the normal patch-review controls. Continuation never applies changes to the original project automatically.

The initial path supports the pinned macOS ARM64 OpenCode 2.1.2 boundary. Shell, external directories, MCP and subagents remain denied. Ask/Plan remain read-only. Agent remains confined to the existing draft. Permissions cannot increase during a transfer. Routed tasks are blocked pending separate budget admission. Automatic preparation is optional and defaults off; it only prepares a review after a classified eligible interruption and never authorizes another provider.

Approvals bind the packet, executable/version, model/variant, permission snapshot and repository state. They expire after ten minutes and are consumed atomically with execution ownership. A restart never starts a prepared or consumed transfer automatically. Changed files, changed provider configuration, unresolved actions and unknown ownership require fresh inspection. A crashed starting transfer remains consumed; inspect ownership and drafts before any new run.

Packets are limited to 32 KiB, eight host-read excerpts and 128 action records. Retrieval uses tracked paths, changed draft paths, objective words and common manifests. It currently has no symbol/dependency graph or AI summarizer. Known sensitive paths, symlinks and binary/large files are excluded. Content redaction is best effort: review the exact packet before approving. File hashes establish observed bytes; provider claims and tool completion reports are not independent proof that tests passed.

Local UTF-8 byte counts are measured. Codex usage reports, when present, retain provider provenance per attempt. Repeated identical reports are deduplicated; differing reports are not summed without known semantics. OpenCode usage, aggregate tokens and cost remain unknown. Run `node scripts/benchmark-contextflow.js` for a synthetic size comparison; it makes no provider calls and establishes no token, cost or correctness improvement.

## CLI

The CLI shares the same SQLite journal, repository checks and one-use execution lease:

```text
contextflow-prepare <task-id> <repo> <task-configuration-json> --manual
contextflow-read <task-id> <repo>
contextflow-run <transfer-id> <repo> <reviewed-hash> --yes
contextflow-reject <transfer-id> <repo> --yes
```

Prepare validates an OpenCode configuration through normal model discovery. Run revalidates it and requires explicit authorization. Never put credentials in configuration JSON. A prepared review blocks queued dispatch for that repository until resolved; ordinary task admission cannot bypass repository ownership, and any intervening repository changes invalidate continuation.
