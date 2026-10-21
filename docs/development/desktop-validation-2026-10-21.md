# Standalone desktop verification — 21 October 2026

This is a development checkpoint, not a release or completion declaration.

## Repository and provenance

- Repository: https://github.com/Gautam-aman/CODOVYN (private at audit).
- Active branch: `main`; direct pushes are authorized by the campaign instructions.
- Campaign baseline: `f8eccc0f5791553a764295f49c2f96f8ee03135d`.
- Verified code tip: `6ce29dabbd6f5a9829abe30293b58ba883000ccb`.
- The code tip contains 16 new meaningful commits. This documentation checkpoint
  adds one, for 17. The 100-new-commit target is **not achieved**.
- Every completed step was pushed and checked against `git ls-remote origin refs/heads/main`.
- Recovery bundle: `.git/checkpoints/codovyn-standalone-start.bundle`, verified locally.
- No development branch, pull request, public release or marketplace publication
  was created. No force push, history reset, visibility change or protection bypass occurred.

Use actual history rather than historical campaign totals:

```sh
git rev-list --count f8eccc0f5791553a764295f49c2f96f8ee03135d..HEAD
git log --oneline f8eccc0f5791553a764295f49c2f96f8ee03135d..HEAD
git ls-remote origin refs/heads/main
```

## Implemented desktop foundation

[ADR 0003](../architecture/0003-standalone-foundation.md) compares Code-OSS,
Eclipse Theia and custom Electron/Monaco. The selected foundation is a pinned
VSCodium/Code-OSS distribution overlay. It includes mature editing, explorer,
search, terminal, Git, language tooling and compatible extensions. It is its own
application; it does not launch an installed copy of Microsoft VS Code.

Implemented: native CODOVYN bundle and helper identities, original icon,
independent data names, own welcome page, ten whole-workbench themes, Open VSX
policy, disabled upstream replacement updates, checksum-verified editor/runtime
artifacts, bundled Node 26.9.0/npm and the existing shared agent integration.
Upstream license notices are retained. Native app version is 0.1.0 with alpha
status in CODOVYN product metadata. Build provenance records source SHA, dirty
state, artifact pins and development signing status.

The shared CLI, SQLite journal, task engine, adapters and Git/GitHub services were
reused. Desktop adds host integration rather than a second orchestration engine.

## Automated verification

- `npm run check`: **112 tests passed**, zero failures, zero skips in the final
  local run; includes syntax checks, adapter parsing, deterministic failover,
  repository reconciliation guards, storage, Git/GitHub and theme tests.
- `npm run test:desktop-host`: passed in the generated standalone application.
  Discovers packaged integrations, edits/saves a real file, opens the agent panel,
  verifies real Git status and runs a terminal command. Its launch PATH excludes
  Homebrew and the terminal's `process.execPath` equals bundled Node.
- Relocated application test: mounted the DMG, copied CODOVYN.app to a separate
  temporary installation, verified the signature and reran the native-host test;
  all assertions passed.
- Companion `npm run test:extension-host`: passed in real VS Code 1.142.0 on macOS.
- `npm run package:extension`: passed; about 50 KB. File-list verification confirms
  desktop sources, generated application bundles and integration fixtures are excluded.
- `npm audit --audit-level=high`: **zero vulnerabilities reported**. This audits npm
  dependencies, not all Electron/OS components or the entire product threat model.
- Desktop CI run [39591209962](https://github.com/Gautam-aman/CODOVYN/actions/runs/39591209962)
  passed checks, build, native-host tests and DMG packaging on macOS arm64.
- General three-OS CI run [39591209966](https://github.com/Gautam-aman/CODOVYN/actions/runs/39591209966)
  passed at the verified code tip, including the native-version metadata changes.
  Inspect the latest run for subsequent documentation commits.

A Windows-only path assertion initially failed and was corrected. Actual desktop
runtime validation is macOS arm64 only; cross-platform core CI is not Windows or
Linux desktop installation verification.

## Live agent workflow

Using the existing authorized local Codex CLI 0.163.0 session, the standalone app
opened a disposable Git repository with a greeting function and one test:

1. The user-facing permission dialog authorized an isolated worktree draft.
2. Codex changed `greet()` and its test to use `Hello CODOVYN`.
3. Tool progress streamed into the panel and the task was persisted.
4. The open original repository remained clean while the draft awaited review.
5. The panel displayed the real two-file patch.
6. A separate confirmation applied the hash-reviewed patch to the original.
7. An independent `node --test` run passed; `npm test` also passed in the desktop terminal.
8. A subsequent live read task was cancelled during tool activity. It settled as
   cancelled, and no `codex exec` process remained afterward.
9. After quitting and reopening the same profile, the editor file and completed
   and cancelled task records remained available.

![Native capture after accepted live Codex patch](../assets/desktop-live-reviewed-patch.png)

The screenshot is a native application-window capture, not a mock. Test fixtures,
logs and provider state are not committed. No new provider credentials were
created or extracted. Claude Code was not installed/authenticated here, so its
adapter and live two-provider failover remain unverified. Deterministic failure
simulations do not establish live compatibility. Automatic primary restoration
and safe automatic replay of interrupted write actions are not implemented.

## Build and installation

```sh
npm ci --ignore-scripts
npm run build:desktop
open dist/desktop/CODOVYN.app
npm run test:desktop-host
npm run package:desktop
```

Outputs: `dist/desktop/CODOVYN.app`,
`dist/desktop/CODOVYN-darwin-arm64-development.dmg`, and
`dist/desktop/host-result.json`. Signing checks use
`codesign --verify --deep --strict`; disk image checks use `hdiutil verify`.
The final image was mounted read-only and a relocated application exercised;
its native-host test passed again after the metadata rebuild. The local DMG is
355,484,018 bytes with SHA-256
`fc66ce1995b859f05e241ed18cf99eb513638226a39aae2b39b6e5a7b377bea5`. These are
ad-hoc signed, unnotarized local development artifacts, not a public installer release.

No clean machine with VS Code uninstalled was available. Independence was checked
through the app's own packaged paths and runtime, not by uninstalling user software.
No startup or memory benchmark was measured; no performance claim is made.

## Community and remaining work

All ten previously open issues were reviewed; none was closed without proving its
full acceptance criteria. New bounded opportunities, after duplicate searches:

- [#12 Welcome shortcut hints](https://github.com/Gautam-aman/CODOVYN/issues/12):
  `good first issue`, accessibility, enhancement.
- [#13 Two-launch workspace/theme restoration test](https://github.com/Gautam-aman/CODOVYN/issues/13):
  `help wanted`, testing. Manual restoration passed, but repeatable two-phase
  automation is missing.

The requested 10–15 new beginner and 8–12 intermediate opportunities have not yet
been identified/published; no placeholder issues were created to meet a count.
Existing relevant work remains: #1 extended host/accessibility/platform validation,
#2 Gemini, #3 retention controls, #4 approved PR flow, #5 routing/budgets, #6 live
Claude, #7 webhook security, #8 foundation exit criteria, #9 interrupted writes,
#10 appearance controls. No bots or accounts/cloud dependency were added.

Remaining product gates include Windows/Linux packaging and runtime testing,
public signing/notarization, broader language/debugger tests, premium agent/model
configuration, keyboard/screen-reader audits, live cross-provider failover,
primary restoration, interrupted-write reconciliation, routing, and complete
GitHub automation. Provider authorization, other OS environments and signing
credentials are external gates. The 100-commit development campaign and full
master specification remain incomplete.
