# Gemini CLI integration (experimental)

CODOVYN uses the official Gemini CLI headless `stream-json` interface. It does not
extract OAuth tokens, cookies or credentials. Sign in through the official CLI:
[authentication guide](https://geminicli.com/docs/get-started/authentication/).
Provider terms, quotas and billing remain separate from CODOVYN.

## Verification status

Gemini CLI **0.65.0** was installed in a temporary development directory. Version,
help and restricted headless invocation were checked. The actual invocation
exited with authentication code **41**. No authenticated Gemini read, edit or
live Codex-to-Gemini continuation has completed in this environment.

Deterministic tests exercise real adapter subprocess code with fixture CLIs.
They verify stream normalization, bounded parsing, authentication errors,
unknown errors, explicit writes, cancellation, unresolved tools and failed exits.
The Codex-to-Gemini fixture test checkpoints an injected Codex quota failure,
changes an actual isolated worktree, reviews/applies the patch and verifies the
result. This is fault injection, not a naturally occurring quota event or proof
of live Gemini tool-policy enforcement.

## Desktop setup

Install a compatible official Gemini CLI and authenticate it according to its
own documentation. It must be discoverable on the application's PATH. The shared
runtime prepends its bundled Node directory for Node-based CLI wrappers.

Open **Project agents** in the CODOVYN panel. Choose primary and ordered backups,
optionally set a Gemini model identifier, and save. Automatic switching defaults
to off. Enabling it explicitly authorizes sending task context to the selected
providers. Select **Project agents · read only** or **Project agents · edit draft**
to use saved preferences. Direct provider modes remain available as overrides.

**Inspect installed agents** uses CLI version/help checks, not a paid provider
request. Detection does not establish authentication, model access, quota or
availability; those statuses remain unknown. The Gemini authentication-guide
button opens an allowlisted official URL. No credentials enter the webview.

Settings are local and scoped to the selected project. Gemini reasoning controls are not exposed. [Routing](routing.md) supports model
selection and estimated admission; [restoration](recovery.md) requires a safe retry
boundary and newer successful-task evidence. Live Gemini restoration is unverified.
The Gemini model field is an explicit identifier override, not an availability
promise or catalogue of paid entitlements.

## CLI

With an installed authorized Gemini CLI:

```sh
node apps/cli/src/index.js agents .
node apps/cli/src/index.js gemini . "Explain the repository"
node apps/cli/src/index.js gemini-edit . "Make a small change" --allow-writes
node apps/cli/src/index.js auto-gemini-edit . "Make a small change" --allow-writes
```

The auto-gemini modes explicitly choose Codex first and Gemini as backup. Existing
`auto`/`auto-edit` retain Codex-to-Claude behavior. Saved desktop policies use the
validated `configured` modes and a host-supplied `CODOVYN_AGENT_POLICY` JSON value.
The runtime persists the chosen policy with the task.

## Permission and recovery boundaries

The adapter uses default approval mode with an explicit deny-by-default policy,
restricted core file tools, disabled hooks/skills and disabled extension selection.
Write-tool arguments are restricted to flat, unescaped absolute paths under the canonical draft root, with traversal and Git metadata targets rejected. Editing currently refuses symlink-containing drafts and paths requiring escaped filename characters; these are explicit experimental limitations. Shell execution is unavailable, including in edit mode. Gemini must report tests
for the user to run rather than pretend shell checks executed. Worktree edits
still require separate host approval and patch review before reaching the original.

Existing system settings, configured system-settings overrides and central policy
files cause refusal rather than bypass. Managed installations require additional
policy negotiation; see [#14](https://github.com/Gautam-aman/CODOVYN/issues/14).
Policy arguments/settings are tested with fixtures; enforcement by an authenticated
real provider remains unverified. A worktree is not an OS sandbox against a
malicious installed CLI or repository content. Only trust intended CLIs/projects.

Only supported structured error types and the documented authentication exit code
establish authentication failure. Current streaming error messages do not reliably
expose a quota code: arbitrary “429” or “quota” text stays unknown/fatal and does
not enable automatic switching. No guessed reset times or remaining quota are shown.

Any write-capable action blocks automatic continuation. Durable handoff packets
retain observed action IDs, unresolved state, repository fingerprint and bounded
provider reports, not hidden reasoning or a guarantee of test success. Private
absolute worktree paths are replaced with an identity hash in portable prompts.

`draft-inspect TASK_ID REPOSITORY` observes an open draft, including a task still
recorded running after a crash. It preserves partial edits and starts no provider.
Read-only inspection now reports durable process evidence when available. Explicit
preserve/abandon and file-only continuation controls require verified cleanup or
owner/group absence, current fingerprints and separate approval. Legacy unknown
ownership and registration gaps remain blocked. See [recovery](recovery.md) and #9.

macOS arm64 is the only desktop runtime verified. Cross-platform fixture tests do
not prove actual Gemini CLI launch/authentication on Windows or Linux.
