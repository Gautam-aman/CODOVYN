# Phase 8 UX audit and workspace navigation — 22 October 2026

This audit inspected the existing standalone CODOVYN webview in the macOS
Code-OSS application and its source in
`apps/vscode-extension/media/workspace.js` and `workspace.css`. It builds on the
Phase 7 audit; the editor framework, task engine, provider adapters, and native
workbench were retained.

## Observed information hierarchy

Before this change, the CODOVYN panel placed the prompt composer, activity,
recent tasks, diff/recovery controls, agent settings, routing catalogue, and
appearance controls on one vertically scrolling page. Finding history or
settings required scrolling past unrelated task content. Switching away from
activity also hid the live tool timeline from view, while the project, agent,
and task state were mixed into the activity section.

The native layout now provides five destinations: **Chat**, **Activity**,
**History**, **Changes**, and **Settings**. The active project, selected agent,
and actual task status remain visible in a compact context strip. Existing
elements are moved into these panels rather than recreated, so open form values,
task state, and event listeners remain attached while navigating. The selected
destination is persisted through the supported webview state API. Native
command-palette actions reveal Chat and Activity in addition to the Phase 7
History, Settings, Routing, and Changes destinations.

The five controls use tab semantics, one selected tab in the tab order, arrow
key navigation, and Home/End navigation. Labels stay on one line at the tested
native sidebar width. The activity timeline retains its existing follow-tail
behavior: events received while another view is open do not read hidden-panel
geometry, and returning to Activity follows the tail only when that was the
reader's prior behavior.
While another destination is active, new streamed entries also add a compact
Activity count badge and update that tab's accessible name. Opening Activity or
starting a new task clears the count. The count uses actual progress events and
does not announce every event through a live region.

## Evidence

The [native workspace capture](../assets/desktop-phase8-workspace-navigation.png)
shows the five destinations and task history in the actual CODOVYN development
application. Its project, task names, and agent status are disposable smoke-test
fixtures; it is not evidence of a live agent handoff. A second
[capture](../assets/desktop-phase8-activity-indicator.png) shows the Activity
count while History is selected. The prior
[Phase 7 history capture](../assets/desktop-phase7-task-history.png) documents
the previous single-page hierarchy.

`npm run test:desktop-routing-ui` ran against the rebuilt native application.
It checked destination labels and panel associations, selected-tab behavior,
ArrowRight/Home/End navigation, tab geometry, panel switching, retention of an
unsaved routing form, task/cancel status while navigating, streamed-event
counting and badge clearing, routing save/discard and validation, activity
follow/jump behavior, history filters, and recovery row geometry. The harness
can dispatch keyboard events and inspect the resulting
webview state, but it does not provide a full OS-level screen-reader or focus
audit. Issue [#15](https://github.com/Gautam-aman/CODOVYN/issues/15) remains open
for that broader accessibility and restart-persistence acceptance.

## Remaining UX work

- The current workspace now has clear destinations, but Chat message styling,
  compact tool-result presentation, Changes navigation, and a richer task
  inspector remain future product work.
- High-zoom and systematic narrow-window behavior were not fully audited; only
  tab geometry at the native host's current sidebar width was asserted.
- Focus announcements and screen-reader behavior require an accessibility
  inspection in the actual host with assistive technology.
- The historical intermittent native `workspace-search` delay remains
  unexplained. The latest bounded host and restoration checks pass, but this is
  not a causal resolution of issue [#16](https://github.com/Gautam-aman/CODOVYN/issues/16).
- Live Gemini authentication and real Codex-to-Gemini continuation remain
  blocked on official Gemini authentication. GitHub Actions remain blocked
  before job steps by the account billing/spending restriction.
