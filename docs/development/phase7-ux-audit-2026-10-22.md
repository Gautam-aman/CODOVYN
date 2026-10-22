# CODOVYN Phase 7 UX audit — 22 October 2026

This audit inspects the current standalone Code-OSS application and its shipped
CODOVYN webview (`apps/vscode-extension/extension.cjs`,
`apps/vscode-extension/media/workspace.js`, and `workspace.css`). It uses the
recent native-host and routing UI smoke evidence recorded in the Phase 6
report. It does not claim a fresh expert screen-reader audit or a full visual
review at every display size.

## Current product surface

The native editor supplies the file explorer, editor, search, terminal, Git,
window navigation, and command palette. CODOVYN adds a project-aware webview
with a prompt composer, explicit agent/task-mode selector, project agent and
routing settings, task activity, saved task list, draft recovery/review, Git
diff controls, and appearance selection. Native Phase 6 tests exercised real
workspace settings persistence, invalid form feedback, saved-row removal and
discard, project-switch protection, editor/terminal/Git smoke, and restart
restoration. The UI uses VS Code theme variables and reduced-motion-aware button
transitions.

## Prioritized findings

| Priority | Area | Observed behavior and user impact | Next useful action | Status |
|---|---|---|---|---|
| P1 | Streaming activity | Task activity now uses a bounded-height scroll region, batches each progress update, follows the tail only when already there, and exposes an accessible reduced-motion-aware jump action. | Native smoke tests verify follow, preserve-position, and jump behavior with 48 fixture events. | Implemented |
| P1 | Task history | Recent history now has case-insensitive prompt search, six actual journal status filters, result counts, explicit latest-25 scope, and responsive row actions. It still loads only the CLI's 25 most recent tasks. | Native fixture tests verify search/status composition, no-match state, and interrupted-row geometry. Pagination is an independently scoped contributor task in #20. | Partial; #20 open |
| P1 | Agent and routing settings | Settings are native form controls inside `<details>` after the composer. Capabilities and consent notes are present, but setup diagnostics and settings are spread across two disclosure sections. | Improve section hierarchy and setup guidance using existing diagnostics; retain native host validation and never equate install status with authentication. | Open |
| P1 | Diff/recovery | Diff and recovery controls are functional, but recovery inspection serializes structured state into a `<pre>` and task activity contains terse event labels. | Present verified state and unresolved actions in readable grouped summaries without changing recovery decisions. | Open |
| P2 | Information architecture | Composer, activity, history, diff, settings, and appearance remain one long page. Four native command-palette entries now open the workspace at Recent Tasks, Agent Settings, Model Routing, or Repository Diff; focused sections expand after webview readiness. | Native extension tests verify queued focus requests and panel reuse; desktop smoke verifies the settings disclosure path. A broader project dashboard remains open. | Partial |
| P2 | Responsive layout | Main content has a max width and fluid padding; controls are full width. No automated narrow-webview/high-zoom geometry checks exist. | Add native geometry assertions for narrow panel and increased font/zoom; retain wrapping for long IDs and errors. | Open |
| P2 | Accessibility | Labels, live statuses, validation relationships, keyboard focus styles, and reduced motion exist. Full screen-reader behavior and systematic focus restoration remain unverified. | Add targeted keyboard tests and use the actual extension host with accessibility inspection where available. Avoid making the entire verbose event list a live region. | Open |
| P2 | Visual consistency | CSS inherits editor colors and has a restrained base, but component spacing/radii/button treatment are mostly ad hoc selectors rather than shared tokens. | Consolidate only repeated CODOVYN-specific tokens and verify against existing themes before broad restyling. | Open |
| P3 | Welcome/onboarding | The native workbench provides its editor welcome experience; CODOVYN setup help is inside the agent panel and requires users to discover its selectors/settings. | Improve the first-use path with native commands and accurate setup status; no fake connected state or provider request. | Open |
| P3 | Performance evidence | No comparable interaction frame-time or memory benchmark exists. Native test durations include launch/assertion/cleanup and are not startup or UI performance measurements. | Establish repeatable local interaction measurements before making performance claims. | Open |

## Delivery sequence

1. Implement and natively verify scroll-follow behavior for task activity.
2. Add useful bounded task-history search using existing journal results.
3. Improve task status and recovery summaries from existing persisted events.
4. Audit narrow/high-contrast keyboard behavior in the actual host.
5. Consolidate repeated style values only where it reduces inconsistency.

The project-opening empty state, prompt shortcut hint, task-history loading
feedback, and older-history pagination are now scoped as #17–#20 after checking
the complete existing issue list for duplicates. Existing Phase 6 routing and
desktop blockers remain tracked in #15 and #16. Gemini live authentication and
hosted CI are external validation gates; this UI audit does not change their
status.

## Implemented during Phase 7

- Added four palette commands that reveal the existing CODOVYN panel at
  Recent Tasks, Agent Settings, Model Routing, and Repository Diff.
- Added accessible local prompt/status filters over the existing 25-task
  response, with an explicit scope note and an understandable no-match state.
- Kept task event updates batched in a bounded feed. The feed follows new events
  only while the reader is at the tail, otherwise it preserves position and
  offers a jump action.
- Changed task rows to a two-column responsive action layout after a real
  application screenshot exposed a narrow-title regression for interrupted
  tasks. A native geometry check now guards that case.
- Captured [a real native-host task-history state](../assets/desktop-phase7-task-history.png).
  Its task names and activity are disposable test fixtures, not user history or
  evidence of provider execution.
