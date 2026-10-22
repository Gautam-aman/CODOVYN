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
- Added an event-count badge to Activity when real streamed events arrive while
  another destination is selected. It exposes an accessible count and clears
  on opening Activity or beginning a new task.
- Added real-app screenshots and a prioritized UX audit. See the
  [audit](phase8-ux-audit-2026-10-22.md),
  [workspace navigation](../assets/desktop-phase8-workspace-navigation.png),
  and [Activity update indicator](../assets/desktop-phase8-activity-indicator.png).
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
| `npm run test:desktop-routing-ui` | Passed on the rebuilt app and again against the final copied DMG app. Checked five destinations and tab geometry, ArrowRight/Home/End focus/selection, persisted selected-view state, command routing, unsaved form and active-task state across navigation, streamed-event badge semantics/rendering/clearing, routing save/discard/validation, timeline behavior and history filters. |
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

The final development DMG passed `hdiutil verify`; the staged and copied
application passed `codesign --verify --deep --strict`. It was mounted
read-only, copied to `/tmp/codovyn-phase8-final-relocated/CODOVYN.app`, and
tested there. SHA-256:

```text
b3969442d156f081d017263076da3ff95de3ef4a44dac8299197c3a6c633c8bf
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
- The GitHub Actions [CI run for `74eeb7d`](https://github.com/Gautam-aman/CODOVYN/actions/runs/39798706508) failed before Ubuntu steps started. Its annotation says recent account payments failed or the spending limit needs attention; Windows and macOS jobs were still queued when inspected. The previous desktop run also reported macOS ARM64 runner capacity. No billing change was made; hosted CI is not green.
- Existing issues #15 and #16 remain open. Their progress comments are linked at
  [#15](https://github.com/Gautam-aman/CODOVYN/issues/15#issuecomment-6341336944)
  and [#16](https://github.com/Gautam-aman/CODOVYN/issues/16#issuecomment-6341336909).
  Existing contributor issues #17–#20 were reviewed and left open; no new issue
  was created because this implementation did not uncover a separate,
  independently actionable defect that was not already tracked.

## Git checkpoint

The Phase 8 commits were pushed directly to `origin/main`: `80d9cbf` (persistent
workspace destinations), `4700630` (bounded lifecycle fixture startup),
`121f0ee` (native view-state persistence assertion), `f7b19b9` (audit and
validation report), `6cb1864` (tab focus assertion), `4a4403c` (Activity update
indicator), and `74eeb7d` (packaged-host screenshot and indicator test). The
final DMG includes the app changes through `4a4403c`; `74eeb7d` only updates
native UI test evidence. At report preparation, 102 commits followed campaign
baseline `e2664564f6dad2aff45bca45328264ea2ea3aab7`. The documentation commit
containing this final evidence follows separately. The repository remains
private. No branch, PR, or release was created.
