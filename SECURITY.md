# Security policy

This repository is pre-release. No version has a stable support promise yet.

Please report a vulnerability privately through GitHub's **Report a vulnerability**
feature for this repository. Do not put exploit details or secrets in a public issue.
If private reporting is unavailable, open a public issue asking for a private
contact channel without disclosing the vulnerability.

## Current boundary

Task history is stored locally in SQLite. On Unix-like systems CODOVYN requires
a private database directory (mode 0700) and restricts the main database file
to the current user. The private directory also protects SQLite WAL and shared
memory sidecar files, which SQLite may create with broader file modes. New VS
Code task history uses a `private` subdirectory in extension storage; an older
journal remains accessible in its original location only if that directory is
already private. Task history is not encrypted. Windows filesystem ACLs are
not independently audited by CODOVYN.

The CLI can delete a selected non-running task and its event history, or prune
up to 100 old finished tasks per invocation for a selected repository. These
commands require a terminal confirmation or an explicit `--yes` flag. SQLite
deletion does not securely erase old database pages or WAL contents; filesystem
snapshots and backups may retain copies. Backups and copied databases must be
managed separately. Interrupted tasks are retained by pruning so recovery
context is not removed automatically. Tasks with open edit drafts cannot be
deleted or pruned until the draft is applied or discarded, preserving the
base commit and history needed for review.

## Alpha execution gates

General live coding is blocked. The native isolated Codex flow uses official memory-only device authentication, a private process and explicit one-request review. Global credentials are not copied. Authentication and metadata do not authorize inference. Credentials/device codes must never enter Chat, Git, logs or issue attachments.

The first guarded Ask sends only the reviewed fixed Calculator excerpt. Shell, Git, nested agents and file tools receive no grants; the OS boundary denies project/private reads, project writes and executable spawning. Durable SQLite reservation precedes submission. Uncertain outcomes remain spent/fenced after restart and are never automatically retried. Cancellation cannot guarantee a remote provider immediately stops billing.

Agent execution remains disabled until separately approved and live-verified. Existing isolated draft mediation records intents before mutation, checks versions/identity, and requires explicit patch review. Unverified third-party live providers and automatic fallback are gated. ContextFlow authorization cannot bypass task admission.

Task data is not encrypted; ordinary source may contain sensitive information even when known secret paths are denied. Secret detection is not perfect. Do not export raw task databases, auth files, provider stderr or private worktrees as public bug reports. Campaign accounting cannot be erased by ordinary task retention commands.

The bundled Node runtime is hardened with JIT-only entitlements; the upstream debugging/DYLD allowances are removed during assembly. Development ad-hoc signing is not public Developer ID/notarization. See [release gates](docs/release/PUBLIC-ALPHA-READINESS.md), [redistribution review](docs/release/REDISTRIBUTION.md), and the current validation report. No claim of general production readiness or security on other platforms is made.
