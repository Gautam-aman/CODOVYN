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
| P1 | Streaming activity | Task events append to a page-level ordered list. The webview has no follow-latest rule or jump control; a user reading older activity can lose the task tail, while a user at the bottom may not see new events. | Preserve scroll position when reading history, follow only when already near the end, and expose an accessible jump-to-latest action. Cover both paths in a native webview test. | Implement next |
| P1 | Task history | Recent tasks are rendered as one list, without search/filter/group controls. This is usable for the small local journal but becomes harder to scan as history grows. | Add bounded search/filtering only with a clear source of complete task data and tests; avoid inventing pagination or resumability. | Open |
| P1 | Agent and routing settings | Settings are native form controls inside `<details>` after the composer. Capabilities and consent notes are present, but setup diagnostics and settings are spread across two disclosure sections. | Improve section hierarchy and setup guidance using existing diagnostics; retain native host validation and never equate install status with authentication. | Open |
| P1 | Diff/recovery | Diff and recovery controls are functional, but recovery inspection serializes structured state into a `<pre>` and task activity contains terse event labels. | Present verified state and unresolved actions in readable grouped summaries without changing recovery decisions. | Open |
| P2 | Information architecture | Composer, activity, history, diff, settings, and appearance form one long page. Finding less frequently used controls requires scrolling. | Consider small in-page section links or collapsible sections after measuring panel behavior; do not duplicate the editor command palette. | Open |
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

The existing Phase 6 routing and desktop blockers remain tracked in #15 and
#16. Gemini live authentication and hosted CI are external validation gates;
this UI audit does not change their status.
