# Phase 8 validation — 22 October 2026

This report records the Phase 8 workspace navigation change on `main`. CODOVYN's
Code-OSS/VSCodium desktop, shared agent runtime, provider adapters, storage,
patch review, and recovery safety boundaries were retained.

## Delivered

- Reorganized the existing CODOVYN panel into persistent Chat, Activity,
  History, Changes, and Settings destinations.
- Kept project, selected agent, and live task status visible in a shared context
  strip.
- Preserved existing forms, task state, and event listeners by moving their
  existing DOM into panels instead of rebuilding their controls.
- Added accessible tab labels/relationships, roving tab order, arrow/Home/End
  navigation, and selection persistence using the host webview state API.
- Kept activity follow-tail state correct while Activity is hidden.
- Added native command-palette actions for opening Chat and Activity.
- Added a real-app screenshot and a prioritized UX audit. See the
  [audit](phase8-ux-audit-2026-10-22.md) and
  [captured workspace](../assets/desktop-phase8-workspace-navigation.png).
- Made the existing bounded process-cleanup fixture less susceptible to a
  short Node startup window under suite load. Its test still verifies timeout,
  TERM-to-KILL escalation, no surviving owned process, and survival of an
  unrelated process.

The screenshot contains disposable native-smoke fixtures, not user history or
live provider output.

## Local quality and native application checks

| Check | Result |
|---|---|
| `npm run check` | Passed on the final application/test state: 185 passed, 0 failed, 0 skipped; syntax checked 92 JavaScript files. An earlier run exposed a flaky 700 ms fixture startup deadline; after making its expected startup evidence explicit and retaining a bounded deadline, the focused lifecycle suite passed 5/5 and the complete suite passed. |
| `npm run test:extension-host` | Passed on VS Code 1.143.0 for macOS ARM64. |
| `npm run build:desktop` | Passed; rebuilt `dist/desktop/CODOVYN.app`. |
| `npm run test:desktop-routing-ui` | Passed on the rebuilt app and again against the copied DMG app. Checked five destinations and tab geometry, ArrowRight/Home/End navigation, persisted selected-view state, command destination routing, form state across navigation, routing save/discard/validation, task controls across navigation, timeline behavior and history filters. |
| `npm run test:desktop-host` | Passed on the rebuilt app and the copied DMG app. Editor edit/save, workspace file search, CODOVYN panel activation, Git, terminal, and bundled Node all passed. |
| `npm run test:desktop-restoration` | Passed on the rebuilt app and copied DMG app. Both write/read launches restored workspace, editor, saved content, theme, local state, and routing preferences. |
| Owned-process lifecycle records | The latest host and both restoration launches report exit code 0 and `survivors: []`. |

Three bounded host/restoration cycles were exercised across the source build and
the copied package. `workspace-search` was about 0.14 s on the first source run,
1.04 s on the copied package, and 0.11 s on the repeated source run. This is a
small sample; it does not explain the historical intermittent delay or close
[#16](https://github.com/Gautam-aman/CODOVYN/issues/16). The macOS process
emitted `sandbox_extension_issue_file_to_process ... Operation not permitted`
warnings for the copied app under `/tmp`; despite that OS warning, the copied
application completed host and restoration assertions successfully.

The development DMG passed `hdiutil verify`; the staged and copied application
passed `codesign --verify --deep --strict`. It was mounted read-only, copied to
`/tmp/codovyn-phase8-relocated/CODOVYN.app`, and tested there. SHA-256:

```text
4e1a0433d1b6d35a17569f610057bbfaf8017233c77a1614bd9b60e6395e4d4d
```

This is an ad-hoc-signed, unnotarized development artifact. It was not published
or validated as a clean-machine public installer. Only macOS ARM64 was tested
as an installed/copied application.

## Accessibility and remaining UX scope

The native webview test exercises keyboard event handling, tab relationships,
selected state, focus movement caused by its handler, visible label geometry,
and settings state retention. It is not an OS-level keyboard-only or
screen-reader audit. High zoom, systematic sidebar resizing, live assistive
technology, and catalogue reopen-after-restart remain unverified; issue
[#15](https://github.com/Gautam-aman/CODOVYN/issues/15) remains open. Its
acceptance status was updated with the evidence and limitations.

Chat message presentation, compact tool-result summaries, a richer Changes
inspector, and project overview are not delivered in this step. The screenshot
shows History in the current navigation structure; it does not establish those
planned improvements.

## Providers, hosted CI, and issues

- Existing deterministic handoff tests passed in the 185-test suite. They do
  not establish live Gemini authentication or real Codex-to-Gemini continuation.
- Gemini's prior CLI attempt failed authentication with exit code 41. No
  repeated provider request was made; live Gemini read/edit/cancellation and
  two-provider continuation remain blocked on official authentication.
- The GitHub Actions [CI run for `121f0ee`](https://github.com/Gautam-aman/CODOVYN/actions/runs/39783323100) failed before steps started. The
  annotations say recent account payments failed or the spending limit needs
  attention, and separately note macOS ARM64 runner capacity. No billing change
  was made; hosted CI is not green.
- Existing issues #15 and #16 remain open. Their progress comments are linked at
  [#15](https://github.com/Gautam-aman/CODOVYN/issues/15#issuecomment-6341336944)
  and [#16](https://github.com/Gautam-aman/CODOVYN/issues/16#issuecomment-6341336909).
  Existing contributor issues #17–#20 were reviewed and left open; no new issue
  was created because this implementation did not uncover a separate,
  independently actionable defect that was not already tracked.

## Git checkpoint

The implementation checkpoints are `80d9cbf` (persistent workspace
destinations), `4700630` (bounded lifecycle fixture startup), and `121f0ee`
(native view-state persistence assertion). They were pushed directly to
`origin/main`. The app build in the DMG contains the workspace implementation;
the later lifecycle and smoke-test commits only changed test coverage. The
repository remains private. No branch, PR, or release was created.
