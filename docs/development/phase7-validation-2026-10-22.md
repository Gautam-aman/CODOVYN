# Phase 7 validation — 22 October 2026

This report records the local engineering and desktop validation completed on
`main`. The standalone editor and shared orchestration engine were preserved.
The UI changes target the existing CODOVYN webview.

## Implemented

- Added native command-palette entries to open Recent Tasks, Agent Settings,
  Model Routing and Repository Diff in the existing CODOVYN panel.
- Added case-insensitive task-request search and status filters over the latest
  25 journal records returned for the active project. The UI states this limit;
  older-history pagination is tracked in [#20](https://github.com/Gautam-aman/CODOVYN/issues/20).
- Bounded the activity feed, batched new event rows, followed the tail only when
  the reader was already there, and added an accessible reduced-motion-aware
  jump-to-latest action.
- Fixed a narrow task-history layout where a long recovery button squeezed the
  task title. A native geometry assertion now covers interrupted-task rows.
- Added four bounded contributor opportunities in #17–#20 and linked them from
  `CONTRIBUTING.md`.
- Captured [the native task-history view](../assets/desktop-phase7-task-history.png).
  Its task content is disposable test data.

The routing catalogue smoke test exercises actual webview save, discard,
project-switch protection and field-associated validation behavior. Native
keyboard-only navigation, focus restoration after every dialog, screen-reader
announcements, narrow/high-zoom layouts and full restart-persistence acceptance
are not established by that smoke test. [Issue #15](https://github.com/Gautam-aman/CODOVYN/issues/15)
remains open. In a native harness probe, the isolated webview context did not
expose sufficient focus state for a reliable keyboard assertion; no product
accessibility pass is claimed from that probe.

## Local checks

| Check | Result |
|---|---|
| `npm run check` | 185 passed, 0 failed, 0 skipped; syntax checked 92 JavaScript files |
| `npm run test:extension-host` | Passed using VS Code 1.143.0 on macOS ARM64 |
| `npm run build:desktop` | Passed; produced `dist/desktop/CODOVYN.app` |
| `npm run test:desktop-host` | Passed on the rebuilt app: editor open/edit/save, workspace search, CODOVYN panel, Git, terminal and bundled Node |
| `npm run test:desktop-restoration` | Passed: project, editor, content, theme, local state and routing preferences restored across two launches |
| `CODOVYN_CAPTURE_DIR=docs/assets npm run test:desktop-routing-ui` | Passed: valid routing save, discard, validation association, command section disclosure, activity following/jump, search/status filters and interrupted-row geometry |
| Copied-DMG native-host check | Passed against the copied app from the mounted DMG |
| Copied-DMG restoration check | Passed against the same copied app |

After packaging, three source-app host runs passed. The measured
`workspace-search` durations were approximately 10.3 s, 0.31 s and 0.08 s;
the copied-DMG host run measured approximately 0.17 s. These bounded samples
show substantial timing variation. The historic native-host stall has not been
causally explained and [#16](https://github.com/Gautam-aman/CODOVYN/issues/16)
remains open. No broad process-name termination was used. The latest host and
both restoration lifecycle records reported exit code 0 and no owned survivors.
These checks do not establish that unrelated user processes were actively
monitored during the run.

The development DMG passed `hdiutil verify`; the packaged app passed
`codesign --verify --deep --strict`. DMG SHA-256:

```text
43e09ee75477e6bb2ccacf4667a8db35749cddadca3d564d6a2420d8580b4d4b
```

The artifact is ad-hoc signed and unnotarized. It is a development build, not a
public-release installer. Only macOS ARM64 was tested as an installed app.

## External validation gates

- The latest hosted CI matrix failed before executing any steps; every reported
  job had an empty `steps` array. Prior account diagnostics identify billing or
  spending configuration as the blocker. No hosted test result is claimed and
  no billing settings were changed.
- `gemini` is not discoverable in the current environment's PATH. The previous
  live invocation failed authentication with exit code 41. No repeat provider
  request was made. Install the official Gemini CLI, complete its official
  interactive authentication in the owner's terminal, then follow
  [the Gemini validation guide](../agents/gemini.md). Do not provide secrets in
  chat.
- Fixture-based Codex-to-Gemini handoff remains covered by local tests; a real
  authenticated Gemini task and real cross-provider continuation remain
  unverified. Deterministic tests are not live-provider evidence.

## GitHub and contribution status

Issues [#17](https://github.com/Gautam-aman/CODOVYN/issues/17),
[#18](https://github.com/Gautam-aman/CODOVYN/issues/18) and
[#19](https://github.com/Gautam-aman/CODOVYN/issues/19) are bounded
`good first issue` opportunities; [#20](https://github.com/Gautam-aman/CODOVYN/issues/20)
is an intermediate `help wanted` task. Existing issue #15 and #16 received
evidence updates and remain open. The repository remains private, so outside
contributors need maintainer-provided access. No PR, release or visibility
change was made.

At the source checkpoint before this report, the branch was `main` at
`c3ec3ef76c632e5ea6412f3a14e2c425a35c59a7`. Phase 7 had added seven meaningful
commits after its `8d6c2cec27ce4609e4bb52d2fc7da396fe02d73d` starting point and
the campaign contained 94 commits after baseline
`e2664564f6dad2aff45bca45328264ea2ea3aab7`. The 100-commit campaign target was
not reached; no filler commits were created.
