# Inline reasoning effort — validation

Date: 2026-10-23. macOS 27.0.1 ARM64, Node 26.9.0.

## Source and scope

Starting main: `dcda0f366a4eccd7c232afec671d2b3605dd914b`.
Application source: `ed6278bb3b7ba695bccbf9807998963b1d90e286`, embedded `sourceDirty: false`.

Source commits, tested and pushed directly to main:

- `dbfca30`: independent Codex reasoning override, bounded metadata reader and dispatch checks.
- `2efce23`: inline accessible effort popover, project/model preferences and history labels.
- `a8af733`: isolated native metadata transport and durable queue reasoning tests.
- `739129f`: wait for metadata acknowledgement before native effort assertions.
- `ed6278b`: isolate disposable macOS tests from the real Keychain.

Documentation and real application captures follow in a separate commit (six meaningful commits added in total; 137 campaign commits since `e2664564`). No branch, PR, release, generated installer commit, or visibility change. `/Applications/CODOVYN.app` is unchanged.

## Implemented

The compact composer now has Model, Effort, task mode, Settings, Queue and Send. Effort uses the existing top-layer popover, keyboard Arrow/Home/End navigation, native button activation, Escape/focus restoration, responsive wrapping, theme variables and reduced-motion rules. Auto / Default means no reasoning override; no workload-based effort classifier was added.

Codex Provider Default no longer requires a catalogue model to set effort. The installed CLI's documented `model/list` and `config/read` RPCs identify its configured default and advertised effort levels. The inspector only sends initialize/initialized and metadata requests; it never sends thread/start or turn/start. Output is bounded to 1 MiB with a six-second request deadline and existing owned-process-tree cleanup. Only normalized model IDs and effort lists are exported; raw config, stderr, credentials and RPC errors are not exposed to the renderer. Unknown/unsupported metadata fails closed to Auto.

Configured Codex models retain their declared reasoning options. Provider Default uses actual CLI metadata instead of a hardcoded effort list. The local Codex 0.163.0 metadata read identified the configured default and its advertised efforts without an inference request. Catalogue metadata is not an entitlement, authentication or quota check. Minimal is absent when the selected model does not advertise it; Extra High maps to `xhigh`. Additional advertised levels keep their own names.

Host and CLI validation reject unsupported providers/settings. Default-model effort support is checked again immediately before task execution. The adapter now accepts reasoning independently of model and sends the existing `--config model_reasoning_effort="high"` override without adding `--model` for Provider Default. Existing read-only/draft sandboxes, approval and worktree behavior are preserved. Gemini and Claude remain Auto-only; OpenCode/OpenRouter are not integrated or claimed supported.

Project preferences add an optional, bounded per-model effort map to the existing version-1 record; old preferences remain valid. Accepted tasks and queued records retain immutable configuration snapshots. Provider/model changes cannot mutate an active task. Unsupported choices reset to Auto. Requested effort appears in task Activity/history; unknown effective provider reasoning remains unknown.

## Tests and native evidence

| Check | Result |
| --- | --- |
| `npm run check` | 207 passed; zero failed, cancelled or skipped |
| `npm run test:extension-host` | Passed using cached VS Code 1.143.1 executable |
| `npm run build:desktop` | Passed from clean application source above |
| `npm run test:desktop-chat` | Passed first launch and normal relaunch |
| `npm run test:desktop-routing-ui` | Passed native settings persistence and isolated activity/scroll fixtures |
| `npm run test:desktop-restoration` | Passed two launches: workspace, editor/save, theme, routing and local state |
| `npm run test:desktop-host` | Passed editor/save, search, Git, terminal and bundled Node |
| Copied DMG app | Passed native Chat first launch/relaunch, routing UI, two-launch restoration and full desktop host |

Native Chat assertions verify menu open/selection, End/Escape and focus restoration, Provider Default + High, explicit model + Low, rejection of undeclared options, provider switching, per-model preference restoration, narrow composer geometry and queue configuration after restart. Existing transcript ordering/text safety/scroll and navigation assertions remain. The host queue integration runs the real host handler, CLI, SQLite and task engine with a fixture provider, checks that High reaches the adapter, and confirms it remains in journal metadata. Adapter tests check actual child argv, sandbox and absence of a model override. Metadata tests cover malformed data, RPC errors, missing CLI, timeout cleanup and sanitized output.

The first native attempt failed its effort End-key expectation because Code-OSS resolved the login-shell environment instead of retaining the fixture CLI PATH. The test now uses the native CLI-launch environment and checks the exact metadata fixture identity before asserting options. Both application launches then passed. The first copied-DMG check subsequently exposed a second fixture timing defect: a three-second polling loop checked capabilities before the bounded metadata request returned. The test now awaits an explicit host metadata acknowledgement. Native checks passed again with that handshake. These changes fix test isolation/readiness; they do not explain issue #16.

Two subsequent normal-profile test launches timed out before webview readiness. An actual screen capture showed a macOS Keychain authorization dialog blocking the test app. Both owned processes were cleaned up with no survivors. The disposable test profile helper now uses Chromium's macOS `--use-mock-keychain`, following the [upstream Electron test procedure](https://releases.electronjs.org/pr/53790). This prevents fixture tests from requesting the user's real encryption secrets. It is not added to normal application launches or build/product configuration. The same real editor and webview assertions then passed, without increasing timeouts or weakening assertions. These tests do not validate production Keychain credential storage, which remains unchanged. A normal ad-hoc development launch can still request standard macOS Keychain authorization. This concrete startup blocker is distinct from a proven explanation for the historical workspace-search stall.

Native search took 68.87 ms in the final source-host run. This is one observed duration, not a performance improvement claim. The historical intermittent workspace-search stall remains causally unresolved and #16 stays open. Screen-reader speech and a full high-zoom workbench audit were not performed.

## Real application screenshots

These final captures come from the DMG’s copied standalone native workbench and webview in a disposable test project. Response text, catalogue metadata and running state in these captures are explicitly deterministic test fixtures, not live paid-model execution.

- [Composer with Codex Provider Default and High](../assets/reasoning-effort/composer-effort-high.png)
- [Open Effort menu](../assets/reasoning-effort/reasoning-effort-menu.png)

## Development installer

Path: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`.

SHA-256: `021bfe9cf6ee9b98930522f2932fb82771e347108a52c865d3a167120e24f748`.

Image integrity and strict deep bundle signature verification passed. Mounted read-only and copied to a disposable installation directory. Final copied-app native Chat (including effort/queue restart), routing UI, two-launch restoration, and full host checks all passed. Lifecycle reports recorded `survivors: []` for host, both Chat launches and both restoration launches. Copied-app workspace search took 402.84 ms in this run. The read-only mount was detached after verification.

The application is ad-hoc signed and unnotarized. No Keychain permissions were granted and no macOS security settings were changed. No installed application was replaced and no user settings/projects were deleted.

## External verification limits

No authenticated Codex/Gemini inference request was issued for this change. Actual local Codex metadata inspection is separate from fixture-based execution and native UI evidence. Gemini authentication, genuine cross-provider continuation, Windows/Linux installed-app validation, public signing/notarization and hosted CI remain separate gates. Hosted CI's previously observed account billing/spending blockage was not changed; local passing checks are not hosted CI success.

Official interfaces: [Codex configuration reference](https://developers.openai.com/codex/config-reference/) and [Codex app-server model/list](https://developers.openai.com/codex/app-server/). Effort levels depend on the selected model/client; no availability or quota was fabricated.
