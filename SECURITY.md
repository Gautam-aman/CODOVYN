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

The Codex and Claude adapters delegate authentication to their installed CLIs.
Commands without `-edit` request read-only execution. Explicit edit modes create
a separate Git worktree from a clean committed repository. Codex uses its
`workspace-write` sandbox; Claude uses `acceptEdits`, a restricted file-tool
list, bare mode, and denial of permission prompts. Claude shell and MCP tools
are unavailable in this integration. These are provider-enforced boundaries,
not an independent CODOVYN operating-system sandbox; Claude's live enforcement
has not been verified locally. The CLI does not print provider stderr into
stored task history. No hosted CODOVYN service exists.

Draft application requires a hash of the displayed patch and an unchanged,
clean base repository. Drafts cannot introduce symlinks or submodules. Rejecting
a draft deletes its isolated worktree, including ignored build outputs. A
worktree shares Git metadata with its repository and is not a security boundary
by itself. Review generated changes and run project checks before committing.

Git staging, branching, committing, fetching, pulling, and pushing require
explicit CLI commands. Branch, commit, fetch, pull, and push use an empty hooks
directory so repository-provided hooks do not run. Fetch and pull reject Git's
external-command transport. Pull only fast-forwards a clean branch. Push
results omit remote URLs, which may contain embedded credentials.

Repository and task text can contain untrusted instructions. Do not treat that
text as authorization to run commands, publish data, or grant access. Current
limitations include no encrypted task database, no cross-process writer lock,
and no independent validation of provider-side sandbox enforcement. Do not
store sensitive prompts in CODOVYN until those limits are addressed for your
use case.

## Standalone development distribution

Desktop assembly accepts only pinned SHA-256 editor and Node artifacts from the
committed manifest. Rebranding uses local ad-hoc signing, not a public developer
identity or notarization. Do not treat the development DMG as a verified public
release. Preserve the included upstream and third-party license notices.

The desktop workbench runs installed compatible extensions with the normal
Code-OSS extension-host privileges. Install only extensions you trust. Provider
credentials stay in the provider's supported CLI authentication storage; CODOVYN
does not pass them to its welcome or agent webviews. The native integrations
allowlist webview actions and retain explicit draft-edit and patch-application
confirmations. A Git worktree protects the open working tree from unapproved
patch application; it is not an operating-system security boundary against
malicious tools or repository build scripts.

Remote-debugging flags used during local verification expose application control.
They are not part of normal launch instructions and must not be enabled on a
shared or untrusted network.


## Routing budget records

Routing reservations are local estimates, not exact provider billing or quotas.
They retain task IDs, session/month scopes and amounts after task-history deletion;
otherwise deleting a task could silently restore already used allowance. Unknown
amounts remain unknown and may block later finite budgets. Only provably unstarted
preparation is refunded automatically. No cancellation/crash refund is inferred.
The ledger stores no prompts or source code. Explicit ledger retention/usage
settlement controls are not implemented; back up the private database before
maintenance. Deleting the database resets all local accounting and is not secure
erasure or a way to change provider charges.
