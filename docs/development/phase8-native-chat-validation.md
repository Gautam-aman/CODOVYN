# Phase 8.1 Native Chat and Desktop Validation

Validation date: 2026-10-22 (local time, macOS ARM64)

## Repository and scope

- Starting revision: `54186b49e99b235fce6e8e2d729498bef764441d`.
- Last code-bearing revision used to build the validated app: `3bf1508d3f14ee7843cc0c2336a3636aed6cf60d`. The only later changes on `main` update the real Chat screenshot and this report; no application source changed after that build.
- Current `main` revision at report preparation: `5e10d59ed0dfaf48148266f5b74d84f5e260ddf8` (report commit will follow).
- `origin/main` was verified after each push. Worktree is clean before the report change.
- No branch, pull request, release, or repository visibility change was made.
- Two meaningful commits were added during this continuation: native screenshot evidence and its refreshed final-artifact capture. The preceding turn added the native Chat test and workspace-search instrumentation commits.

## Native workspace-search stall (#16)

The harness now records monotonic phase boundaries, extension-host heartbeat progress, the `workspace.findFiles` call and Promise return, response delivery/rejection, match count, cancellation, and owned-process cleanup. It preserves the original recursive search and file-match assertion. The public VS Code API does not expose internal search-worker or main-process IPC acknowledgements, so a still-pending API Promise cannot distinguish a lost internal result from a lost response.

The full native host passed against the clean-built app and against the app copied from the mounted DMG. Both exercised extension activation, recursive file search, editor open/edit/save, CODOVYN panel activation, Git, terminal, and bundled Node. Search latency was 7.644 seconds in the in-place run and 6.786 seconds in the final copied-app run. Recent successful samples also included 35–177 ms; historical attempts have remained pending until the 120-second deadline. This spread is evidence of variable timing, not a proven cause or fix. The historical stall was not reproduced in the final runs and remains unexplained; issue [#16](https://github.com/Gautam-aman/CODOVYN/issues/16) remains open. A new evidence update is recorded at [issue comment](https://github.com/Gautam-aman/CODOVYN/issues/16#issuecomment-6347887713).

The copied app's native-host lifecycle completed with exit code 0 and `survivors: []`. Both Chat launch lifecycles also exited with code 0 and no owned survivors. Cleanup is limited to the test-owned process group. No unrelated CODOVYN process was targeted.

## Native Chat integration

`npm run test:desktop-chat` launched the actual CODOVYN desktop app twice with isolated workspace, profile, shared-storage, and task-journal data. It opened the actual CODOVYN panel/webview and used a test-only harness enabled only by the native test environment variable. The same test passed against the app copied from the fresh DMG.

Verified in the native webview:

- Submitted prompt and persisted agent reply render in the correct order.
- Stream chunks append to the intended response; HTML/script-like text is rendered inertly as text.
- Activity is separated from the conversation and navigation does not lose task state.
- Completed and interrupted states, cancel-control state, scroll-follow behavior, and jump-to-latest behavior are checked.
- A real SQLite task journal is read after the app's second launch; its persisted request and response are restored without duplicates, and tool events remain in Activity.

These are deterministic journal/UI tests, not a live provider call. `activityRows` is empty in the final report after the test deliberately transitions to the interruption state; the harness separately asserts that the restored journal's `read_file` tool event appears in Activity and not Chat. The captured [native Chat screenshot](../assets/desktop-phase8-native-chat.png) is from the actual CODOVYN app and displays deterministic SQLite fixture content, not live model output.

## Desktop package

- Clean build: `npm run build:desktop` passed.
- Embedded provenance: `sourceCommit: 3bf1508d3f14ee7843cc0c2336a3636aed6cf60d`, `sourceDirty: false`, `platform: darwin-arm64`.
- App identity: CODOVYN Desktop 1.140.0, macOS ARM64.
- App bundle signature verification passed. This is an ad-hoc development signature; the artifact is not a signed/notarized public release.
- Fresh development DMG: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`.
- `hdiutil verify` passed; SHA-256: `d34c400fa8d8da2cbb6f900f64132e4092b43cdbe38b7db42bf27e36f15d6771`.
- The mounted image contained `CODOVYN.app`; that app was copied to a disposable install path and passed bundle-signature, native-host, native Chat, and two-launch restoration checks. Launching from `/tmp` printed a macOS sandbox-extension warning, but all tests completed successfully.
- Restoration verified reopened workspace/editor, saved content, CODOVYN local state, `CODOVYN Warm Paper`, and routing preferences.

## Tests and known failure

- `npm run check`: 185 passed, 0 failed, 0 skipped.
- `npm run test:extension-host`: passed using VS Code 1.143.0 on macOS ARM64.
- `npm run test:desktop-host`: passed on the rebuilt app and the relocated DMG copy; real search/edit/Git/terminal/bundled-Node assertions passed.
- `npm run test:desktop-chat`: passed twice per invocation (first launch and relaunch) on the rebuilt app and relocated DMG copy.
- `npm run test:desktop-restoration`: passed on the rebuilt app and relocated DMG copy.
- `npm run test:desktop-routing-ui`: **failed** during the combined routing/activity UI smoke. The harness starts a real task from its composer and injects fixture progress while the host can concurrently send task responses; assertions then observe inconsistent activity/jump-control state. This needs a deterministic test transport and remains unresolved. The failed test was not weakened or marked as passed. This failure means the full routing UI smoke is not green.
- GitHub Actions runs `39828972741` and `39828742685` completed as failures with empty step lists on Windows, macOS, and Ubuntu: jobs did not begin executing tests. Hosted CI remains blocked by repository/account configuration; this is not evidence of a source-level test failure.

## Agent verification

- The existing authorized Codex workflow is covered by the local deterministic suite; this continuation did not run a new live Codex coding request.
- Gemini authentication remains unverified. The previous live attempt returned authentication exit code 41. No credentials were requested or bypassed.
- Fixture-based failover and handoff tests pass in the 185-test suite. No live Codex-to-Gemini continuation was performed; production-grade real cross-provider handoff remains unverified.

## Remaining work

1. Diagnose the historical `workspace.findFiles` stall causally; keep #16 open until evidence supports closure.
2. Make the combined routing/activity UI smoke deterministic without removing native assertions, then rerun it.
3. Rerun hosted CI after the account restriction is resolved.
4. Authenticate Gemini through the official CLI flow and validate real read, edit, cancellation, and cross-provider continuation.
5. Obtain production signing/notarization credentials and validate a release-signed installer before public distribution.

