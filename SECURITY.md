# Security policy

This repository is pre-release. No version has a stable support promise yet.

Please report a vulnerability privately through GitHub's **Report a vulnerability**
feature for this repository. Do not put exploit details or secrets in a public issue.
If private reporting is unavailable, open a public issue asking for a private
contact channel without disclosing the vulnerability.

## Current boundary

Task history is stored locally in SQLite. On Unix-like systems the database
file is restricted to the current user. The Codex adapter delegates
authentication to the installed Codex CLI and requests read-only execution.
The CLI does not print provider stderr into stored task history. No hosted
CODOVYN service exists.

Git staging, committing, and pushing require explicit CLI commands. CODOVYN's
commit command uses an empty hooks directory so repository-provided hooks do
not run. Push results omit remote URLs, which may contain embedded credentials.

Repository and task text can contain untrusted instructions. Do not treat that
text as authorization to run commands, publish data, or grant access. Current
limitations include no encrypted task database, no cross-process writer lock,
and no independent validation of provider-side sandbox enforcement. Do not
store sensitive prompts in CODOVYN until those limits are addressed for your
use case.
