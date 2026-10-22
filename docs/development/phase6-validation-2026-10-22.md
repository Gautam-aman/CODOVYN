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

An additional native run after `3931d2c` removed a previously saved catalogue
row, discarded that edit, and confirmed both the row and unchanged workspace
setting were restored. The same run completed the invalid-ID association and
correction path successfully.

Follow-up checks: `npm run check` passes 184 tests with 0 failures or skips and
syntax-checks 92 JavaScript files; the native routing UI smoke test passes; and
`npm run test:extension-host` passes against VS Code 1.143.0. The extension host
logs the existing upstream `agentsWindowActivation` proposal warning.

## Final artifact verification after `1bc8699`

Rebuilt the standalone app from the pushed commit. Embedded build metadata
reports `sourceCommit: 1bc8699b2cbefe05f74b85820dd8cbf383a2fb32` and
`sourceDirty: false`. The native host passed editor save, search, Git, agent
panel, bundled CLI routing, and bundled-Node terminal checks in 12.2 seconds;
its lifecycle report recorded zero surviving owned processes. Two-launch
restoration passed on the rebuilt app (write 6.1 seconds, read 2.7 seconds),
including workspace/editor, content, theme, local state and project routing
preferences, with zero surviving owned processes in either launch.

Rebuilt the development DMG, verified its disk-image checksum and app signature,
mounted it read-only, copied the app to a disposable `/tmp` install location,
and repeated native-host and two-launch restoration tests against that copy.
The copied app passed both; macOS emitted its sandbox-extension
`Operation not permitted` warning while launching from `/tmp`. This is a
development environment artifact, not a clean-machine or notarization test.
DMG SHA-256: `8723c9fabb96efcf2f1586be1f251a4cf3194718c2d6fc8f2fbd32ed49ed8252`.
It remains ad-hoc signed and unnotarized, and was not published.

The historical intermittent native-host stall remains unexplained. The latest
source and relocated-artifact lifecycle checks passed, but a successful run
does not identify the cause of the earlier `workspace-search` stall. Issue #16
remains open. Hosted Actions are still blocked before job steps by repository
account configuration; no billing controls were changed. Gemini live access
and real Codex-to-Gemini continuation also remain unverified due the recorded
Gemini CLI authentication failure.

## Unsaved project-switch protection

The routing form now tracks edits and blocks a project-selector change until
the user saves or discards the current policy. The UI restores the active
project selection and retains the unsaved form values with a live status
message. The native smoke test injects a second selector value, attempts the
switch while a catalogue ID is dirty, and verifies that the project and draft
remain unchanged. It also removes an already-saved row, discards that change,
and confirms the persisted workspace setting stays intact.

`npm run check` passed 184 tests (0 failures, 0 skipped) after these changes.
The rebuilt development app's native routing smoke then passed in 40.5 seconds
with zero surviving owned processes; the extension-host test passed against
VS Code 1.143.0. One earlier smoke run stayed at `workspace-search` for 101.8
seconds before the smoke script's shorter deadline canceled it; its cleanup
recorded zero survivors. The script's webview wait now exceeds the native host's
120-second timeout so future stalls can retain the host timeout classification.
This intermittent behavior still has no proven root cause, and #16 remains
open. The fix and regression check are in `2a67d91`.

The fault-injected Codex quota fixture now remains alive briefly after emitting
its structured 429 event. This ensures the adapter's owned-process cleanup is
what terminates it, rather than racing a naturally exiting fixture. One
parallel-suite run before that adjustment intermittently classified the quota
attempt as fatal; five isolated repeats and the full 184-test suite pass after
the fixture change. No production adapter behavior or safety assertion was
weakened; the test still requires a confirmed quota handoff and reviewed patch.

## Final clean-artifact validation at `76ff4ff`

The final packaged build was produced from clean source at
`76ff4ffea8cda4c12673d4c698afde0c91389a58` (`sourceDirty: false`). The
development DMG SHA-256 is
`6300a2ad343a2e9f131d888b23de4a0fb4c7ea0cb5b1f2673febb65e6c698b9f`. It was
mounted read-only, its app signature was checked, and the application was
copied to a disposable install path. The copied application passed the native
host (25.951 seconds) and two-launch restoration (write 4.365 seconds, read
2.139 seconds). The routing UI smoke passed against that copy, covering save,
validation, discard, saved-row removal, and rejection of a project switch with
an unsaved draft. Each lifecycle report recorded zero surviving owned
processes. This remains an ad-hoc signed, unnotarized development artifact;
it was not released and this is not clean-machine notarization evidence.

On the clean-source app, native-host, two-launch restoration, and routing UI
smoke passed; restoration again reported zero surviving processes. The full
local suite passed 184 tests with zero failures or skips, and the extension
host passed under VS Code 1.143.0. A bounded earlier native UI smoke run took
101.8 seconds at `workspace-search` before its outer deadline canceled it; the
later copied-artifact smoke completed. This does not explain the historical
intermittent stall, so issue #16 remains open.

The newest hosted CI run for this commit is
[run 39771298827](https://github.com/Gautam-aman/CODOVYN/actions/runs/39771298827).
The Ubuntu, macOS, and Windows jobs failed before executing any steps, and the
run logs were unavailable to this environment. Hosted CI is therefore blocked,
not green; local validation passed. No account billing settings were changed.
Live Gemini requests and real Codex-to-Gemini continuation remain blocked by
the previously observed Gemini CLI authentication exit code 41. Deterministic
handoff tests are not evidence of live provider continuation.
