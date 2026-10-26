# Desktop session lifetime — non-inference qualification

## Result and scope

**Historical application-exit cause: UNPROVEN.** The previous owner profile only recorded extension-host exit code 0 at 2026-10-26 13:50:01 local time. There is no causal shutdown trace or matching crash report. Repeating the old UI keystroke sequence did not deterministically reproduce the exit. Do not call this a verified crash, parent-process kill, authentication failure, or a proven causal fix for that historical exit.

**Verified defects fixed:** the native controller discarded its session reference immediately after writing close, before observing worker/provider cleanup. The extension had no awaited `deactivate` hook. Together these prevented reliable cleanup certification and could permit overlapping replacement sessions. The previous manual launcher also omitted isolated shared storage and lacked a durable launch/ownership record. No evidence establishes that any of these caused the historical application exit.

Starting main: `56418e8bc8aa381138c720eab8547bb3e91c6bfa`. Implementation/build: `74876458b89e12ec99b1fc036e3ccd4971318c67`. The following harness correction activates the window before intentional native quit and avoids verbose environment logging. Final remote SHA is verified in the handoff; evidence commits follow the clean embedded build.

## Changes

- `apps/cli/src/codex-session.js`: one idempotent close promise; bounded structured closing/closed notifications include worker PID, provider group, timestamp and reason. `cleanupVerified` is emitted only after the existing managed provider disposal, engine settlement and private state cleanup succeed. Cancellation, host EOF, signal and provider expiration are distinguished.
- `apps/vscode-extension/codex-session.cjs`: cancellation and replacement await worker closure; unverified cleanup retains the session fence. Record bounded private lifecycle metadata and notify the owner of expiration. Do not log account identity, context digests, prompts, output, credentials or device codes.
- `apps/vscode-extension/extension.cjs`: export awaited deactivation using that same controller. Subscription disposal and deactivation share cleanup rather than dropping ownership.
- `scripts/launch-owner-validation.js`: short-lived Launch Services setup, separate profile/extensions/shared storage, clean app signature/provenance and exact unchanged Calculator checks. No test-runner flag, setup-exit cleanup, timer, native keyboard automation, authentication action or inference capability. It refuses a duplicate launch of the same copy. The owner's installed application is never used or replaced.
- `apps/desktop/host/session-lifecycle.cjs`, `scripts/validate-desktop-session-lifecycle.js`, `scripts/lib/native-window.swift`: disposable extension-host observer, real metadata worker and OS window/process inspection. Only metadata and cancel/close operations are sent. No login/prepare/approval/turn messages are sent. The observer is a test fixture, not a background service or production execution path.

## Actual evidence

See [native lifecycle events](../assets/desktop-session/native-lifecycle.json) and [qualification](../assets/desktop-session/qualification.json).

- **Full regression:** 382 passed, 0 failed/cancelled/skipped, Node 26.12.1, 122571.052875 ms. The two added regressions verify awaited certified cancellation and rejection of session replacement when cleanup is unverified. The earlier 380 tests remain.
- **Focused tests:** 30 passed before full regression. Syntax, extension-host check and clean application build passed. Focused counts overlap the full count and are not added to it.
- **REAL OS / COPIED APP:** two complete launch/shutdown cycles in the final campaign. In each, the short-lived setup helper exited normally while the Launch Services-owned GUI, extension host and real metadata worker stayed alive. Native CoreGraphics recorded a 1440×900 application window. Background windows are not claimed to be foreground at every sample.
- **REAL CODEX METADATA:** four actual isolated worker/provider sessions in that campaign, two per cycle. Worker parent PID matched the live extension host; provider group was captured from trusted native-worker IPC. Cancellation cleaned the first worker/provider groups while preserving GUI/extension host. A second worker was cleaned during intentional native quit. All recorded groups were independently checked empty, with deactivation completion recorded.
- **Additional native/security checks:** copied worker EOF/cleanup, Codex metadata/control and task policy, seven OpenCode broker metadata sessions, desktop host with Java, Chat, routing and restoration all passed sequentially. No security grants, timeouts or assertions were relaxed.
- **Integrity:** all six baseline fixture file hashes matched, Git remained clean, and the original SQLite tasks/events/campaign-consents/campaign-requests/execution-leases stayed at zero. Test-only journal counts also stayed zero. The original journal was not replaced or reset.
- **Owner gate:** a fresh copied application is launched separately after tests, using the owner launcher. Its setup helper has exited; the real extension host remains alive. A separate native activation check observed an on-screen window. No authentication was initiated by automation. The owner must use Chat → Settings → Sign in to isolated Codex.

## Failed experiment and limits

The first native lifecycle campaign hit its existing 15-second quit deadline while the renderer was backgrounded. The recorded extension host continued heartbeating; it was not a crash. Only the recorded disposable application and worker/provider groups were cleaned. Bringing the window forward before the native quit command made the repeated campaign pass without changing its deadline. This records a test orchestration failure and successful corrected repeats; it does not establish the historical owner-session exit cause. It is not evidence closing native search issue #16.

Verbose editor trace logging can include inherited environment values. The owner launcher uses information-level logging; only explicitly selected lifecycle metadata is committed. Raw editor traces and authentication context are not published.

Authentication during an actual browser/device flow remains owner-operated and unverified by this campaign. Existing login and idle deadlines remain; expiration closes the isolated session, reports a clear message, and does not command the IDE to quit. No timeout was removed to keep a provider indefinitely alive. Tests establish bounded observed lifetimes and cleanup; they do not prove indefinite reliability or every macOS shutdown case.

**Actual inference submissions: 0. Automated authentication starts: 0.** No campaign consent was created/recreated. The earlier chat authorization is not reactivated by this task. After manual sign-in, require a fresh exact owner authorization and native one-use consent before any model request. No Agent editing, provider fallback or ContextFlow continuation is authorized. Stop at the authentication gate.

No DMG was published or release work performed. The new copied build is ad-hoc signed; public-release and live-provider gates remain open.
