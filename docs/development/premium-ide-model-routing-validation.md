# Premium IDE and task configuration validation

Date: 2026-10-23

## Repository and validation scope

- Starting `main`: `243c92d8bfa452fcbb8282583b79b0d16e7a0e47`.
- Verified final `main`: `69532bb1467a11bf686b7a91a0f7c1c485c05da8`.
- Four meaningful commits were added and pushed during this work.
- The worktree was clean after the implementation commits; generated desktop artifacts are ignored build outputs.
- No branch, pull request, release, installation to `/Applications`, or visibility change was made.

## Delivered

The Chat composer now exposes separate provider, model, permission, routing, and reasoning controls. Its visible combined legacy mode selector is hidden while the internal compatibility mapping remains in place. The model list is populated only from the project's saved local routing catalogue, grouped by the providers CODOVYN currently supports. Unknown availability is labeled as unknown, unavailable entries are disabled, and reasoning choices appear only when configured for the selected model. Write-only is disabled because the current adapters cannot safely enforce a useful write-only coding mode. Host-side validation checks the selected provider, model, reasoning setting, routing mode, and draft-write requirement before invoking the runtime.

Prompt submission now uses a bounded request ID and clears the composer only after the host acknowledges durable execution ownership. The CLI stream carries task IDs so the host can correlate that acknowledgement. Enter submits, Shift+Enter preserves a newline, Cmd/Ctrl+Enter remains supported, and IME composition is ignored. Native Chat fixtures cover acknowledgement, prompt rendering, text safety, activity separation, scrolling, cancellation/interruption state, and SQLite transcript restoration.

The task store now has versioned persistent queue records and repository-scoped ordering and pause state. Queue operations support enqueue, reorder, cancel/remove, pause/resume, and explicit claim. A claim checks the captured repository fingerprint, queue pause state, and other records requiring reconciliation. A claim left in `starting` by a crash is not claimable again. CLI commands and deterministic tests expose these operations.

## Verification

- `npm run check`: 194 tests passed, 0 failed, 0 skipped; syntax check covered 98 JavaScript files.
- `npm run build:desktop`: passed; built the standalone app from commit `69532bb`.
- `npm run test:desktop-chat`: passed on the built app across first launch and relaunch.
- The same native Chat test passed across first launch and relaunch using an app copied from the fresh DMG.
- The Chat checks used deterministic fixtures and a disposable SQLite journal. They do not establish a live provider request.
- The native Chat harness verified composer controls, host acknowledgement behavior, transcript order/text safety, navigation/activity separation, completion state, scroll behavior, journal restoration, and interruption state.
- Full native workspace-host/search and restoration suites were not run in this work; issue #16 remains open and its historical `workspace.findFiles` stall is unresolved.
- Hosted GitHub Actions and the extension-host downloader were not verified in this work.

## Fresh development DMG

- Path: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`.
- SHA-256: `b1f2976b2036d11b0c3a802f64125d633789901ea59b69618e01264bd38f8645`.
- `hdiutil verify`: valid.
- `codesign --verify --deep --strict`: valid for both the build app and copied app.
- The copied app's native Chat test passed. macOS logged `sandbox_extension_issue_file_to_process` warnings for this temporary copied app; the test still completed all assertions and its extension-host processes exited successfully.
- The artifact is ad-hoc signed and unnotarized, for development only. It was not copied to `/Applications` and no installed user app was overwritten.
- `hdiutil` emitted a deprecation warning for the existing packaging command; image creation and integrity verification succeeded.

## Not delivered or not verified

- The queue is a durable storage and CLI foundation; Chat UI queue management and dispatch are not yet integrated. It must not be described as an end-to-end task queue.
- OpenCode and OpenRouter adapters, a universal provider catalogue, ContextFlow/token optimization, usage accounting UI, and automatic queue dispatch remain unimplemented.
- Gemini authentication remains unverified. No live Gemini or Codex-to-Gemini continuation was attempted.
- No live Codex coding task was performed in this validation. Existing Codex functionality was not replaced.
- No valid new CODOVYN screenshot was captured. The existing `docs/assets/desktop-phase8-native-chat.png` is not evidence of this UI and was left unchanged.
- Issue #16 remains open: native Chat is verified independently, but that does not explain or clear the workspace-search stall.
