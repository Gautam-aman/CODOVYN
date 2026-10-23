# Premium composer and native desktop validation

Date: 2026-10-23. Environment: macOS 27.0.1, ARM64, Node 26.9.0.

## Git and artifact provenance

- Starting `main`: `091135defbc41b21c8d338f9ff1f604251fa92ae`.
- Validated application source: `4c5dca5437a9c64ba05b67b3c684f14911b8330f`.
- Embedded `codovyn-build.json`: that source commit and `sourceDirty: false`.
- Source changes were committed and pushed directly to `main` after relevant checks. The documentation/screenshots follow the application source in a separate commit.
- No branch, PR, release, force-push, repository visibility change, or generated installer commit.
- `/Applications/CODOVYN.app` was not overwritten.

## Delivered experience

The composer now has a naturally expanding input, a model chip, Ask/Agent/Plan mode chip, advanced settings action, Queue, Send and active-task Stop. The permanent model search and five-column control grid are gone from Chat. Advanced controls remain in Settings. The model popover searches the configured catalogue, groups providers, exposes Provider Default, shows uncertain access honestly, and supports favorites, recents, arrows, Enter, Escape and focus restoration. Favorites and selection are validated and persisted by the host for each project.

Provider Default uses the actual CLI default without requiring a model identifier. Codex and Gemini configured overrides reach their existing selectors; explicit Claude overrides remain disabled because that adapter cannot apply them. Installation diagnostics use the existing bounded CLI inspection, not an inference request. Unknown authentication and model access remain unknown. The picker does not scrape interactive CLI screens, invent model names, or present unimplemented OpenCode/OpenRouter connections.

Ask and Plan use the existing read-only adapters. Plan adds planning guidance while preserving the original journal request. The host and CLI reject mode/permission mismatches. Agent requests native approval for the existing isolated draft and reviewed patch process. No new shell, deployment, external-directory or cross-provider permissions are implied.

Enter submits, Shift+Enter adds a newline, Cmd/Ctrl+Enter submits, and IME composition is ignored. Composer clearing still waits for durable acknowledgement. While running, Enter queues another instruction and retains the active conversation. Queue acknowledgement is idempotent and durable. A failure preserves the draft.

The persistent Queue view supports add, reorder, pause/resume, cancel, and **Review & run next**. Dispatch uses the existing host handler and task engine, with the queue's durable ID reused for task history. It revalidates trust, repository fingerprint, policy snapshot, approvals and current routing/budget admission. The runtime checks the captured baseline again before starting. Pending drafts and unreconciled ownership block dispatch. Restart never dispatches automatically.

Native editor tabs, menus, badges and surfaces use supported theme tokens. The editor title bar has a native Chat action. First-run welcome actions expose Chat and agent setup, and close the unused auxiliary pane only for new profiles. All ten themes remain available. Panel popovers use the browser top layer, responsive sizing, native palette variables, and reduced-motion-aware CSS without another UI framework.

## Reliability findings fixed

- The queue initially looked up Send while its panel was detached. The composer now passes its actual button reference.
- Queue acknowledgement could arrive while the host still rejected a second enqueue as busy. Acknowledgement now follows the completed queue update.
- A deterministic independent-process test reproduced SQLite `database is locked` during queue admission. Connections now wait at most three seconds for a local transaction lock. This never retries provider execution or replays tool actions.
- Native test waiters initially accepted an unrelated startup queue snapshot as a completed mutation. They now wait for the exact expected durable transition.
- The combined UI smoke mixed native replies and synthetic activity and tried to scroll Activity after task-start navigation selected Chat. Its fixture phase now isolates browser-posted host replies and selects the actual view under test; all activity/scroll assertions remain.
- `--extensionTestsPath` forces in-memory global storage. Native Chat persistence now runs through a disposable installed probe in the normal application lifecycle, with isolated profile, extensions and shared storage.
- Real screenshots exposed a light-palette root-token mismatch. Surface variables now resolve at panel scope, with native computed-style assertions for navigation and project surfaces.

These findings do not causally explain the historical `workspace.findFiles` stall in issue #16. That issue remains open.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | 201 passed, 0 failed, 0 skipped; 102 JavaScript files syntax checked |
| Companion extension host | Passed on cached VS Code 1.143.1 |
| Standalone build | Passed from clean source above |
| Native Chat | Passed on first launch and relaunch, including favorites and queued-task persistence |
| Native keyboard/picker | Search, favorites/recents, provider default, mode scope, Escape/focus and narrow composer passed |
| Native composer | Acknowledgement clearing, IME/Shift+Enter and queueing during a running conversation passed |
| Native transcript | Ordered text-safe output, Activity separation, scroll-follow/jump and SQLite restoration passed |
| Native restoration | Workspace, editor content, local state, theme and routing preferences passed across two launches |
| Combined routing/activity UI | Passed, including real settings persistence, fixture activity, history filtering and scrolling |
| Copied DMG app | Passed: native host, Chat first launch/relaunch and two-launch restoration |

The queued-dispatch integration test runs the real host handler, CLI operations, SQLite and task engine with a deterministic provider adapter. Native queue management uses the actual host and database. Native Chat response/stream states use explicit fixtures. No paid provider request was performed for this work. These are not live Codex/Gemini or cross-provider continuation evidence.

Screen-reader speech, full workbench high-zoom testing, and a dedicated secondary-sidebar Chat contribution are not completed. Issue #15 remains open. Narrow composer geometry and actual high-contrast/light panel states were checked. No FPS, token savings or comparative performance claims are made.

## Development DMG

- Path: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`.
- SHA-256: `3f317704ceb82db483c1d810d2c5f7a2c076606e32df2f448d74dec727897b4a`.
- Image integrity verification passed.
- Strict deep bundle signature verification passed for the build and copied application.
- Ad-hoc signed and unnotarized; development artifact only.
- Mounted read-only and copied to a disposable installation directory, not `/Applications`.
- Final copied-app native host, Chat first launch/relaunch and two-launch restoration all passed. Each lifecycle report recorded `survivors: []`. Native search completed in 184.75 ms in this run; this does not explain or eliminate the historical intermittent stall.
- Packaging emitted macOS `hdiutil` deprecation warnings. No security controls were disabled.

## Screenshots

These are captures of the actual standalone application with a disposable project. Configured fixture models and synthetic responses are test data; they are not authenticated-provider evidence.

- [Compact Chat](../assets/premium-composer/composer-dark.png)
- [Searchable model picker](../assets/premium-composer/model-picker.png)
- [Ask/Agent/Plan menu](../assets/premium-composer/task-modes.png)
- [Persisted task queue](../assets/premium-composer/task-queue.png)
- [Light panel](../assets/premium-composer/composer-light-panel.png)
- [High-contrast panel](../assets/premium-composer/composer-high-contrast-panel.png)
- [Submitted prompt and streamed response fixture](../assets/premium-composer/desktop-phase8-chat-transcript.png)
- [Activity indicator fixture](../assets/premium-composer/desktop-phase8-activity-indicator.png)
- [History/navigation fixture](../assets/premium-composer/desktop-phase8-workspace-navigation.png)

## External gates and remaining scope

Hosted CI did not execute job steps. The [observed source-revision run](https://github.com/Gautam-aman/CODOVYN/actions/runs/39909532072) reported failed account payments or a spending-limit restriction; all three platform jobs had zero steps. Owner remediation is in GitHub account **Billing & plans**, followed by rerunning the current workflows. No billing settings were changed. Local validation is separate from hosted CI.

Gemini authentication and real cross-provider coding remain unverified. OpenCode/OpenRouter integrations, broad automatic model discovery, automatic queue dispatch/escalation, provider billing settlement and token-saving benchmarks remain outside this delivery. Provider-default behavior remains usable without manual catalogue IDs where an installed, authorized CLI exists.

An interrupted dispatch remains blocked for reconciliation. Task/draft recovery stays available through existing history/Changes controls; clearing an orphaned queue marker can still require explicit CLI inspection/update. No ambiguous write or process is restarted automatically. Windows/Linux installed-app support and public signing/notarization are not established by these macOS checks.
