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

The standalone application rebuilt from the current clean source passed
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
remains open. Multiple bounded host runs passed, including the clean final
source build; the captured stall remained limited to the search phase. The
failure did not recur on every run, so no causal fix is claimed.

The final development DMG was rebuilt from clean commit
`54a0d5d80f2a98014b4d1b98fa04af0d1d236221`, mounted read-only, and its app was
copied to a disposable install path. The copied build metadata matched that
commit with `sourceDirty: false`; signature verification and native host tests
passed. Both native-host and two-launch restoration tests passed against the
copied app. Lifecycle reports recorded zero surviving test-owned processes:
host 10.8s, restoration write 4.9s, restoration read 3.4s. macOS emitted a
sandbox-extension warning while launching the copied app, but the tested
operations completed and the owned process groups exited cleanly.

Artifact: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`.
SHA-256: `7984d2fbfc9bed90310350a262f6a3c0c2e02242f3cfdf0f8a491cde2a797da0`.
It remains ad-hoc signed and unnotarized. This is a locally validated
development artifact, not a public-release installer.

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

## Routing form follow-up

The local catalogue form now has an explicit **Discard unsaved edits** action.
Adding a row directs focus to its ID field, and removing a row returns focus to
the next row, previous row, or Add model control. Canceling reloads the last
host-confirmed saved policy, so rejected saves do not replace persisted values.

`npm run test:desktop-routing-ui` runs a bounded native-host/webview check using
an isolated disposable workspace. It verified that a valid fixture catalogue
is saved to that workspace's `.vscode/settings.json`, discarded field edits and
new unsaved rows revert to the saved model, and an invalid ID remains editable
with its associated alert and ARIA error relationship. The smoke test is an
explicit macOS command and is excluded from portable unit-test discovery. This
DevTools harness cannot observe focus reliably inside the embedded webview, so
it does not count as keyboard-focus verification. Narrow/zoom layout, high
contrast, broader keyboard navigation, and screen-reader behavior remain open
under issue #15.

Follow-up checks: `npm run check` passes 184 tests with 0 failures or skips and
syntax-checks 92 JavaScript files; the native routing UI smoke test passes; and
`npm run test:extension-host` passes against VS Code 1.143.0. The extension host
logs the existing upstream `agentsWindowActivation` proposal warning.
