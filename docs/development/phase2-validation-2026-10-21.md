# Multi-agent development checkpoint — 21 October 2026

This is an incomplete Phase 2 checkpoint, not a production-readiness declaration.

## Repository

Repository: https://github.com/Gautam-aman/CODOVYN (private). Work continued directly
on `main` from `e2664564f6dad2aff45bca45328264ea2ea3aab7` without resetting work,
creating a branch or opening a PR. The verified implementation/package source is
`f637bc59918a07a155b9f2266a7652e1a9b07c70`: 26 new meaningful commits after the
baseline. This report adds one documentation checkpoint (27 total). The target
of 100 new commits is not achieved; history was not padded.

Each completed change was pushed directly and checked against GitHub's main ref
or `git ls-remote`. A verified local recovery bundle is available at
`.git/checkpoints/codovyn-phase2-checkpoint.bundle` through the implementation tip.
No public release, marketplace publication, visibility change, force push or
protection bypass occurred. Use actual history to verify subsequent totals:

```sh
git rev-list --count e2664564f6dad2aff45bca45328264ea2ea3aab7..HEAD
git log --oneline e2664564f6dad2aff45bca45328264ea2ea3aab7..HEAD
gh api repos/Gautam-aman/CODOVYN/git/ref/heads/main --jq .object.sha
```

## Delivered shared runtime and interface

- Experimental Gemini CLI adapter using official headless structured events,
  bounded UTF-8 JSONL parsing, session/model observations, sanitized errors and
  whitelisted usage fields. No raw tool parameters or provider credentials enter
  the webview or portable memory.
- Read-only/file-edit modes, explicit edit authorization, isolated Git drafts,
  file-tool allowlists and disabled hooks/skills/extensions. Shell is denied.
  Write arguments must identify an unambiguous path within the canonical draft;
  traversal, Git metadata, duplicate path keys and symlink-containing drafts are
  rejected. Fixtures verify policy generation, not live provider enforcement.
- Cancellation and provider failure settle process-tree cleanup before handoff.
  Actual subprocess tests verify descendants cannot perform delayed writes.
- Local project primary/ordered-backup policies, explicit automatic-switching
  consent (off by default), optional Gemini model override, configured task modes,
  and cards separating installation detection from unknown authentication and
  availability. Installation diagnostics do not consume a model request.
- Portable handoff state persisted before execution: original request, verified
  Git/worktree identity, namespaced action ledger, unresolved operations, bounded
  provider reports and classified failures. Provider reports are not verified
  test evidence or hidden reasoning. Private absolute paths are replaced with
  a worktree identity hash in portable prompts.
- Read-only interrupted-draft inspection exposes partial changes and unresolved
  actions without changing task status, applying patches or starting a provider.
  It does not prove orphaned processes have stopped or authorize continuation.
- Provider CLI wrappers use the shared engine's Node runtime on PATH; desktop
  does not require a global Node installation. Existing Codex sandbox/approval
  and reviewed patch application behavior is retained.
- Singleton agent workspace prevents repeated commands from duplicating panels.
  Model input respects theme tokens and accessible focus styles. All ten existing
  workbench themes remain. Existing appearance/keyboard roadmap is not complete.

The pinned VSCodium/Code-OSS desktop foundation was reused, not replaced.
See [the Gemini guide](../agents/gemini.md) for commands, authentication and
experimental permission limits, and [the phase plan](phase2-plan.md) for the audit.

## Live versus deterministic evidence

**Live Codex:** using an existing authorized local CLI session, a real desktop
`configured-edit` task changed `answer()` from 0 to 42 and updated its test in an
isolated worktree. Tool activity streamed. The two-file diff was reviewed and
explicitly approved. The original repository then contained the accepted changes;
an independent `node --test` invocation passed. Code provenance for this live task
was `5650375`; subsequent UI and Gemini changes did not replace the Codex workflow.
Saved project preferences were checked after normal application restart.

**Gemini:** official CLI 0.65.0 was installed in a temporary development directory.
Version/help were checked and a real restricted headless request attempted. It
exited with documented authentication code **41**. No authenticated Gemini read,
edit, cancellation or cross-provider task completed. No credentials were invented
or extracted. Claude was not installed; live Claude remains unverified.

**Deterministic handoff:** real Codex/Gemini adapter subprocesses execute fixture
CLIs against a disposable Git repository. The Codex fixture reports a controlled
structured quota interruption before any tool action; the runtime checkpoints,
prepares portable context, selects Gemini, edits an isolated draft, reviews and
applies its patch, and verifies the resulting code. This is injected failure,
not a naturally occurring quota event or live provider compatibility proof.

Any write-capable history still blocks automatic continuation. Full interrupted
write reconciliation (#9), preferred-agent restoration and model routing/budgets
(#5) are not implemented. Availability is never inferred from a guessed reset or
installation. Gemini arbitrary quota/429 text remains unknown/fatal because its
current result schema does not supply a reliable quota code in all cases.

## Automated verification

- `npm run check`: **135 passed**, zero failures/skips, including syntax checks.
  Baseline was 112. Tests cover Gemini parsing/policy/error handling/cancellation,
  process trees, explicit fallback consent, portable context durability, partial
  write inspection, reviewed handoff patch application and existing regressions.
  The handoff integration also passed ten consecutive isolated repeat runs after
  an earlier non-reproducing failure; assertion diagnostics now include its event log.
- `npm run package:extension`: passed, 32 packaged files, approximately 61.49 KB.
- Real companion extension host in Microsoft VS Code 1.142.0 on macOS: passed.
- Rebuilt standalone native host: passed real edit/save, workspace search, Git,
  terminal, bundled Node and repeated-open panel reuse assertions.
- Two normal desktop launches with a shared disposable profile verify workspace,
  open editor, Warm Paper theme and extension state restoration. The second launch
  receives no project-folder argument. This is not Extension Development Host
  mode and consumes no provider quota.
- DMG creation, image checksum verification and ad-hoc signature verification
  passed. Mounted the image read-only, copied the app into a disposable temporary
  installation and reran the native host successfully with global Node excluded
  from its PATH. This is same-machine relocation, not a clean OS/VM test.
- `npm audit --audit-level=high`: zero reported npm vulnerabilities. This does not
  audit the complete Electron/editor distribution or prove product security.

Latest fully executed hosted validation at `f147e0b` passed:
[core CI](https://github.com/Gautam-aman/CODOVYN/actions/runs/39626613524) and
[desktop validation](https://github.com/Gautam-aman/CODOVYN/actions/runs/39626613430).
An earlier Windows fixture assertion exposed Git CRLF conversion and was fixed
without changing production behavior. Later jobs at `f1fc4ee` did not start:
GitHub reports failed account payments or a spending limit requiring increase.
[Core run](https://github.com/Gautam-aman/CODOVYN/actions/runs/39629335282) has empty
job steps and the billing annotation; this is an external CI blocker, not a green
result for the final code. Repository billing/security settings were not changed.

## Desktop artifacts and installation limits

Build commands are unchanged:

```sh
npm ci --ignore-scripts
npm run check
npm run build:desktop
npm run test:desktop-host
npm run test:desktop-restoration
npm run package:desktop
npm run package:extension
```

Application: `dist/desktop/CODOVYN.app`. Installer:
`dist/desktop/CODOVYN-darwin-arm64-development.dmg`. Build provenance records
`f637bc5`, a clean source tree and ad-hoc development signing. The build includes
Node/npm and does not invoke an installed Microsoft VS Code. macOS arm64 is the
only desktop platform exercised. Windows/Linux core CI does not establish
installed desktop support. Signing/notarization, a clean macOS VM and public
installation validation remain outstanding; this development image is not a
public distribution release. Image SHA-256:
`ef3959dbb71f9b02f6950fa6796d44a1766695fc6a1cc4711e069f1ffd068cab`.

[Native agent cards screenshot](../assets/desktop-agent-settings.png) shows the
actual app beside code changed through Codex. It shows configuration/diagnostics,
not an authenticated Gemini task. The capture used a fresh local profile with no
seeded task history. Existing live patch screenshots remain in the README.

## Issues and contributors

All twelve initially open issue descriptions were read before changes.

- [#2 Gemini](https://github.com/Gautam-aman/CODOVYN/issues/2): updated with actual
  implementation and authentication blocker; remains open for live validation.
- [#9 interrupted drafts](https://github.com/Gautam-aman/CODOVYN/issues/9): updated
  with durable context and inspection, explicitly remains open for reconciliation.
- [#8 standalone foundation](https://github.com/Gautam-aman/CODOVYN/issues/8):
  closed after checking the architecture decision and working native editor,
  search, terminal, Git and integration evidence; not a multi-platform release claim.
- [#13 restoration tests](https://github.com/Gautam-aman/CODOVYN/issues/13): closed
  after local normal-launch restoration and passing hosted desktop validation.
- New [#14 managed Gemini policy compatibility](https://github.com/Gautam-aman/CODOVYN/issues/14):
  advanced, labeled `help wanted`, `security`, `agent-integration`; documents the
  existing refusal of centrally managed settings rather than bypassing policy.

One genuine advanced help-wanted issue was created. No new beginner issues were
manufactured to meet discovery targets. Existing #10 appearance and #12 keyboard
work remain contribution opportunities. CONTRIBUTING now links the implemented
restoration command, Gemini guide and managed-policy issue. README, changelog,
agent documentation and actual native screenshot reflect experimental status.
No startup or memory benchmark was run; no performance improvement is claimed.
The private repository is not discoverable by outside contributors without access.

## Remaining work

1. Authenticate through the official Gemini CLI locally; verify actual read/edit,
   policy enforcement, streaming, cancellation and a controlled safe-boundary
   continuation with both authorized providers. Never send credentials in chat.
2. Complete #9 durable process ownership/leases, ambiguous-write reconciliation,
   explicit safe abandonment/recovery and crash-matrix tests. Until then retain
   conservative write-history gates; never replay an ambiguous operation.
3. Add optional restoration only after supported, non-spending availability
   evidence and safe boundaries exist; no provider flapping or invented resets.
4. Implement transparent deterministic routing/budget policies (#5), disclosing
   unknown usage and limits that cannot actually be enforced.
5. Resolve owner-side GitHub billing restriction, then rerun final cross-platform
   and desktop validation. Do not substitute local passes for hosted success.
6. Finish appearance controls, keyboard/accessibility verification, clean-system
   installation testing, signing/notarization and real Windows/Linux packaging.
7. OpenCode/ACP/local providers and permission-safe GitHub bots remain future work;
   do not enable hosted bots before webhook security (#7).
