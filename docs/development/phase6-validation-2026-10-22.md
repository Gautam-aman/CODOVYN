# Phase 6 engineering checkpoint — 22 October 2026

This checkpoint improves the real routing catalogue form and records an
intermittent native-host stall observed again during bounded regression runs.
Issue #15 remains open, and the historic stall in #16 remains unexplained.
Live Gemini and cross-provider continuation are still blocked by unavailable
Gemini authentication.

## Repository and commits

- Repository: https://github.com/Gautam-aman/CODOVYN (private), branch `main`.
- Starting SHA: `29a3ee3dbba9b94ea8a8eccfc50a6a7417442b87`.
- Implementation commits: `2f88aa2` adds a bounded opt-in native-webview
  inspection window and checks the validator is loaded; `c2b005c` associates
  field errors with controls and focuses the first invalid field.
- Each commit was pushed to `origin/main` and its SHA verified. No PR, release,
  visibility change, force-push or branch switch occurred.
- After `c2b005c`, Git history contains 77 commits since campaign baseline
  `e2664564f6dad2aff45bca45328264ea2ea3aab7`. The 100-commit target remains
  unmet; no commits were padded to reach it.

## Routing catalogue: real desktop evidence

The native CODOVYN agent webview was inspected using a disposable project,
isolated profile and a localhost-only, test-owned DevTools session. The
catalogue saved a user-supplied fixture entry, then its saved-policy preview
selected that entry without starting a provider. Submitting an empty model
displayed the actual inline errors, marked four controls invalid, retained the
empty ID for correction, connected the ID control through `aria-describedby`,
and focused that first invalid field. A Tab key moved from the ID control to
the Provider selector in a live webview session. These checks do not cover
screen-reader behavior or every keyboard path.

Actual application captures:

- [Saved local catalogue](../assets/desktop-phase6-routing-saved.png)
- [Saved-policy fixture preview](../assets/desktop-phase6-routing-preview.png)
- [Inline validation state](../assets/desktop-phase6-routing-errors.png)

These are test-host screenshots with disposable fixture data. The preview is a
local policy decision, not evidence of model access, authentication, quota or
provider billing. The saved catalogue screenshot captures the edited card;
the preview screenshot separately confirms the host accepted and previewed the
saved entry. Invalid input is not persisted by a rejected save.

## Desktop reliability observations

The standalone application rebuilt from the current source passed
`npm run test:desktop-host`, including editor open/edit/save, search, Git, agent
panel activation/reuse, bundled CLI routing and terminal using bundled Node.
`npm run test:desktop-restoration` passed both write and read launches and
verified workspace/editor, saved content, theme, local state and project-scoped
routing preferences. The VS Code 1.143.0 companion extension-host test passed.

During bounded native-host runs, one run completed in 46.7 seconds after a
38.8-second `workspace.findFiles` call. A later run stalled at that same
`workspace-search` phase through the 120-second harness deadline. The owned
process group was terminated and verified empty; lifecycle diagnostics report
zero surviving owned processes. Other native runs passed, including the latest
rebuilt app run, where workspace search completed quickly. The single captured
stall and variable search latency do not identify a root cause. Issue [#16](https://github.com/Gautam-aman/CODOVYN/issues/16)
remains open.

This checkpoint did not rebuild or relocate a new DMG after the latest UI
change. Previous DMG evidence remains tied to the earlier source checkpoint;
it must not be treated as validation of this revision's packaged artifact.

## Quality and external validation

- `npm run check`: 184 passed, 0 failed, 0 skipped; syntax check covers 91 JS
  files.
- Focused routing validator/host tests: 6 passed.
- `npm run test:extension-host`: passed on VS Code 1.143.0; upstream API
  proposal/session warnings were logged.
- `npm run build:desktop`: passed; native host and two-launch restoration
  passed on the rebuilt development application.
- Hosted CI for this revision failed before any job steps started. No test
  failures can be inferred from those jobs. **Local validation passed; hosted
  CI could not execute because of account configuration.** Billing was not
  changed.
- Gemini CLI authentication remains unverified after the prior official CLI
  request returned exit code 41. No repeat paid request was attempted. No live
  Gemini read/edit task or genuine Codex-to-Gemini continuation was performed.

## Remaining issue #15 work

The real UI evidence improves confidence but does not satisfy every acceptance
criterion. Keep #15 open for cancellation/unsaved-state behavior, full
add/edit/remove and restart persistence through the form, high-contrast and
narrow/zoom layouts, broader keyboard navigation, and screen-reader testing.
Existing two-launch tests cover project-scoped routing preferences, not every
catalogue form interaction. No issue was closed in this checkpoint.
