# Phase 4 stabilization verification — 22 October 2026

Phase 4 is **not complete**. Current native checks pass, but the historical indefinite stall has not been causally explained. Gemini authentication and hosted CI remain external blockers. No production-grade live multi-provider failover is claimed.

Machine-readable [verification evidence](phase4-evidence-2026-10-22.json) records the final artifact, lifecycle cleanup, repeated runs and test/provider distinctions.

## Repository

- Repository: https://github.com/Gautam-aman/CODOVYN; branch: `main`.
- Starting and safely synchronized remote SHA: `e57fe1c6275fdfb37a327d9db0434353a55c848e`.
- Verified implementation/test tip: `34cd0e810bf4f70cfdd743f92a60c394c613eaa0`.
- Six meaningful implementation/test commits, followed by this documentation update; seven new Phase 4 commits in total. The broader 100-commit target remains unmet. No existing historical commits are counted as new Phase 4 work.
- Each completed step was tested, committed and pushed directly to `origin/main`, with remote-SHA verification. Starting recovery bundle: `.git/checkpoints/codovyn-phase4-start.bundle`.
- No PR, release, repository visibility change, force push, reset, or unrelated-history rewrite.

## Issue #16: findings and limits

The first instrumented run used the original launch behavior against the previously failing app. Both extensions activated successfully; the first workspace-search IPC completed after approximately eight seconds, then the original native assertions passed. Consequently, the old indefinite stall was **not reproduced** and must not be reported as a diagnosed activation deadlock.

The comparison from `b2b00d2` to the reported failing implementation found no desktop activation change. The later runtime guard only changes Windows recovery eligibility. New traces identify pending/completed native operations, and failures retain their disposable profile/editor logs. A later freshly rebuilt app took approximately 51 seconds for the complete host test, with a long first-search wait; it completed successfully. This is an observed test duration, not a startup benchmark or a proven explanation of the historical stall.

Two concrete defects were corrected:

1. The old harness sent SIGTERM once and waited indefinitely. Native tests now create an explicitly owned POSIX process group, apply a 120-second execution deadline, then a 1.5-second TERM grace and 2.5-second KILL verification window. Process-table reads are independently bounded at two seconds. Live group members are checked even after the parent exits. Failure to prove cleanup fails the test. Ctrl-C/SIGTERM of the runner follows the same cleanup path.
2. `--user-data-dir` did not isolate this editor's separate shared-storage directory. Tests now also use a disposable `--shared-data-dir`, in addition to isolated settings and extensions. The shipped editor source verifies this behavior. This fixes a real isolation gap; it does **not** prove shared-storage contention caused the earlier stall.

The five deterministic harness tests cover a TERM-resistant owned tree, an unrelated surviving process, parent exit with surviving descendants, cancellation/pre-cancellation, missing executable and nonzero exits, pending-phase diagnostics, and portable profile arguments. They retain real process behavior rather than mock native editor assertions.

[#16](https://github.com/Gautam-aman/CODOVYN/issues/16) remains open. The passing isolated launch procedure is a bounded, tested operating procedure, not proof that the underlying intermittent editor/environment problem is eliminated. No major routing UI or provider expansion was started while that investigation remains unresolved.

## Desktop validation and installation

The Code-OSS/VSCodium foundation, terminal, editor, agent engine and themes were preserved.

Clean-source `81f34c869d80066225765e91f03e053539462b3e` app:

- Three consecutive native-host runs passed: actual file search, edit/save, Git status, agent-panel open/reuse, terminal execution and bundled Node.
- Three two-launch restoration runs passed: real saved file content, workspace/editor, Warm Paper theme, extension local state and resource-scoped routing preferences. Fixture catalogue values never triggered a provider request.
- Its mounted, signature-verified development DMG was copied to a temporary installation; native host and two-launch restoration passed there too.
- A separate CODOVYN sentinel instance remained alive across all six repeated commands and the copied-DMG checks. No native-test processes remained afterward. The sentinel was then explicitly cleaned up through its own recorded PID/group and unique profile; no broad executable matching was used for termination.

The final artifact was subsequently rebuilt from clean source `34cd0e810bf4f70cfdd743f92a60c394c613eaa0`. Its native-host and two-launch restoration checks passed before packaging. Final copied-DMG verification: passed against the mounted, signature-verified DMG copied to a new disposable installation. Both native-host and two-launch restoration exited zero; all three recorded groups had zero live survivors. The final copied-app host lifecycle took 7,417 ms, restoration write 3,496 ms and restoration read 1,559 ms, including assertions and cleanup; these are test durations, not startup benchmarks.

- Application: `dist/desktop/CODOVYN.app`.
- DMG: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`.
- SHA-256: `c5e3102c464771ed2717c5c56d52ffbf33769fe15db834fd220d6ed1cd313b81`.
- Bundled runtime: Node 26.9.0; desktop foundation: 1.140.0 on macOS ARM64.
- Ad-hoc signed, unnotarized development package; no public release.

Commands exercised: `npm run check`, `npm run build:desktop`, `npm run test:desktop-host`, `npm run test:desktop-restoration`, `npm run package:desktop`, `npm run test:extension-host`, and `npm run package:extension`. For a relocated installation, set `CODOVYN_DESKTOP_APP` to its `.app` path before the two native tests. Tests exclude global Node from PATH.

These are same-machine temporary-profile/installation checks. A clean macOS VM, Apple signing/notarization, and installed Windows/Linux builds were not tested. No new screenshot was generated; prior real application captures remain historical evidence, not proof of a new UI change.

## Agents and handoff

A fresh authorized local Codex task, `389ebdd7-dbe0-4a70-badc-5b93cc9a0e65`, changed only `answer.cjs` and `answer.test.cjs` in an isolated disposable worktree. The original repository stayed protected until its inspected two-file patch was explicitly accepted. Independent `node --test` passed one test after application. Provider cleanup preceded task completion in the journal.

Reviewed patch SHA-256: `ad7bb01b40edfc5963e61cc1932973bb07a0fdb20c071e3abc692644397db27b`. Authentication used the existing official Codex CLI session; no credentials were extracted. This was a shared-runtime CLI verification, not a newly claimed native-panel task journey.

Gemini CLI 0.65.0 remains available in a temporary installation, but is not on the default application PATH. Version detection was repeated without a provider request. The last real invocation's authentication exit 41 remains unresolved; no repeated known-failing request was submitted. Owner action is to install/expose the intended official CLI and complete its supported authentication flow locally. See the updated [Gemini setup guide](../agents/gemini.md) and official references linked there. Do not send credentials in chat.

Live Gemini read/edit/cancellation, authenticated Codex-to-Gemini continuation, and live preferred-agent restoration remain **blocked/unverified**. Claude live validation also remains unverified. Existing deterministic adapter/handoff/recovery tests pass, including injected quota failures and actual isolated repository edits. These are fixtures, not naturally occurring quota exhaustion or live cross-provider evidence. Ambiguous writes still cannot be automatically replayed; Windows orphan uncertainty remains conservatively blocked.

## Routing and budgets

All existing Auto, Economy, Balanced, Performance and Custom policies are preserved. Native restart tests now verify local routing preferences persist. The accessible catalogue form (#15), actual billing settlement and accounting retention remain unfinished. No new catalogue UI or fabricated model access/prices were added. Local estimate reservations remain distinct from provider charges and unobservable external spending; hard provider spending caps are not guaranteed.

## Quality and hosted CI

- Local suite: **175 tests, 175 passed, zero failures, zero skips on macOS**; syntax validation passed.
- Companion extension host passed on VS Code 1.143.0; upstream shutdown diagnostic warnings were present and are not hidden as an absence of errors.
- Extension VSIX packaging passed.
- `npm audit --audit-level=high`: zero findings. This does not certify the entire editor/Electron dependency distribution or eliminate security risk.
- No startup, memory, throughput or cross-platform performance benchmark is claimed.

Implementation-tip hosted [CI run 39721565595](https://github.com/Gautam-aman/CODOVYN/actions/runs/39721565595) concluded failure without starting its jobs. The annotations still report account payment/spending restrictions; a separate macOS arm64 capacity notice exists. No billing settings were modified. **Local validation passed; hosted CI remains blocked by the account configuration.**

Owner remediation: open the billed GitHub account's “Billing & plans” settings named in the annotation, resolve the failed payment or spending-limit restriction, then rerun the current workflows and inspect actual job results. Capacity warnings do not establish code failure, and local macOS tests do not replace hosted Windows/Linux checks.

## Community and remaining work

All open issue descriptions were reviewed. #16 received a detailed evidence update and remains open; no issue was closed without verified criteria. No new good-first/help-wanted issue was manufactured: the existing #12, #15 and other bounded contributions remain useful. README, desktop test troubleshooting, and Gemini authentication instructions were updated.

Next priority remains reproducing and explaining the intermittent native stall using the retained IPC phases and isolated profiles. Then complete authorized Gemini read/edit/cancel validation and a safe live cross-provider continuation. Keep Windows orphan handling conservative, finish accessible catalogue configuration, verify provider accounting where observable, and rerun hosted validation after owner-side billing remediation. This phase does not claim daily-use production readiness.
