# Phase 3 verification — 22 October 2026

This is an incremental reliability campaign for the existing standalone CODOVYN IDE. It does not certify Phase 3 complete: authenticated Gemini continuation and hosted CI remain blocked.

## Repository and scope

Repository: https://github.com/Gautam-aman/CODOVYN. Work continued directly on `main`, without a PR, release, visibility change, rewritten history, or force push.

Phase 3 baseline: `6960d17a59267f72573b870742f937972fcbb7f7`. This continuation began at `aa93aa0aa86951cb958912a5c9c701046a600f84`. Verified implementation tip: `a2a72a78d9ec4a839feba7878f465af421824dba`, pushed and confirmed through the remote ref. That is 26 meaningful new commits since the Phase 3 baseline; this report adds one documentation commit. The requested 100-commit campaign target has not been reached.

## Delivered behavior

- Durable, token-fenced execution ownership; provider registration precedes dispatch, and ownership is released only after confirmed process cleanup. Legacy unknown owners and surviving processes prevent continuation.
- Read-only draft inspection, repository fingerprints, explicit preserve/abandon reconciliation, and native confirmation controls. Ambiguous actions remain unknown and are never automatically replayed.
- One-use, explicitly approved continuation in the preserved worktree with a file-only provider. Command-enabled Codex continuation is refused; normal Codex coding remains available. Routed draft continuation requires a new budget admission and is currently refused.
- Crash fixtures exercise before-action, partial-write, completed-write, missing-completion, and shutdown boundaries using real Git repositories and killed fixture processes. These are deterministic provider fixtures, not authenticated cross-provider evidence or a native application crash certification.
- Optional preferred-agent restoration only between safe read-task retry boundaries, using fresh successful-task evidence, repository verification, cooldown, and no unresolved writes. No paid availability probes or guessed quota resets.
- Deterministic Auto, Economy, Balanced, Performance, and Custom routing; capability/reasoning gates, explicit local model catalogue, selection explanations, native approval, and actual model argument forwarding. Quality/reliability inputs are policy values, not measured model benchmarks.
- Atomic SQLite reservations prevent competing routed requests from consuming the same estimated task/session/month headroom. Unknown estimates remain unknown and block finite windows. History deletion does not refund a reservation. Only a proven unstarted task can void one. External spending baselines must be supplied separately.
- Codex/Claude byte-bounded structured streams; completion waits for successful process exit and cleanup. Gemini retains bounded validation, tool restrictions, cancellation and structured failure classification.
- Agent preferences, recovery controls, read-task resume, routing previews, streaming and cancellation remain integrated into the existing desktop/companion panel.

These reservations are conservative local estimates, not an exact provider billing cap. Provider settlement, accounting retention controls, historical routing feedback, and a model-catalogue form remain unfinished. Windows cannot currently prove orphan-tree absence after a provider parent exits; explicit recovery is blocked even after a released execution lease. No unsupported platform is certified.

See [recovery](../agents/recovery.md) and [routing](../agents/routing.md) for commands, permissions, and limitations.

## Real provider evidence

An authenticated local Codex CLI coding task completed on 22 October: `3d86ea65-48d3-465f-b3de-ecc248e54b70`. In an isolated worktree it changed a disposable CommonJS answer and its test from 0 to 42. The two-file patch was independently inspected, explicitly applied to the disposable original repository, and independently passed `node --test` (one test). Provider shutdown preceded task completion in the journal.

Reviewed patch SHA-256: `87f575714d6af022565c3016247d23764bd729e91871441f285ac329c07f7e0b`.

Gemini CLI 0.65.0 was installed in a temporary prefix. A real read-only adapter request failed authentication before emitting events. No authenticated Gemini read/edit/cancel or Codex-to-Gemini continuation is claimed. Claude was not available for live validation. No credential extraction, subscription bypass, or naturally occurring quota failover was performed. The successful handoff/restoration tests use deterministic provider fixtures.

## Local quality checks

`npm run check` passed: **170 tests, 170 passing, zero failures, zero skips**, plus syntax validation. Tests include concurrent budget admission, unknown costs, ownership fencing, crash recovery, stream errors, cancellation, and simulated handoffs.

`npm run package:extension` passed and produced `codovyn-dev.vsix`. The companion extension host passed on actual VS Code 1.143.0. Upstream editor diagnostic warnings are not represented as test failures or as an absence of warnings.

`npm audit --audit-level=high` reported zero findings. This does not audit the entire bundled editor/Electron distribution or establish that the application is vulnerability-free. No new performance benchmark is claimed.

## Desktop evidence and artifacts

The existing VSCodium/Code-OSS foundation and bundled Node runtime were preserved. The clean-source macOS ARM64 application and development DMG were rebuilt from `a2a72a78d9ec4a839feba7878f465af421824dba`.

- Application: `dist/desktop/CODOVYN.app`.
- DMG: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`.
- DMG SHA-256: `82f77b18db37b634371a36ce6f7ee333010913b2bf2f7cd0e043f2f261b21d48`.
- Build commands: `npm ci`, `npm run check`, `npm run build:desktop`, `npm run test:desktop-host`, `npm run test:desktop-restoration`, `npm run package:desktop`.

The earlier clean-source `b2b00d2` artifact passed native edit/save, project search, Git, terminal and bundled-runtime checks, two normal launches restoring workspace/editor/theme/local state, and a mounted-DMG relocated-copy host test with global Node excluded from PATH. These are same-machine macOS checks, not a disposable OS/VM certification. Final rebuilt-artifact checks did **not** pass: the native host test and restoration write phase stalled after startup. A serial host retry also stalled. Their SIGTERM deadline failed to fully terminate the child, requiring explicit cleanup of only the disposable test processes. A freshly mounted, signature-verified DMG was copied to a temporary installation path; its host rerun also stalled after activation. The new DMG therefore has a verified build/signature/image, but is **not runtime-validated**. This unresolved regression/environment problem and the harness timeout weakness are tracked in [#16](https://github.com/Gautam-aman/CODOVYN/issues/16). Earlier successful checks must not be treated as a pass for this final rebuild.

The real [application screenshot](../assets/desktop-phase3-agent-controls.png) shows saved Codex/Gemini preferences beside the file produced by the authorized coding task. It does not prove live Gemini execution or that the coding task was submitted through that pictured panel. The screenshot profile was not seeded with synthetic history.

Packages are ad-hoc signed development artifacts, not notarized public installers. Windows/Linux installed applications and a clean macOS VM were not validated. No package was published.

## Hosted CI and issues

Implementation-tip CI run [39717867493](https://github.com/Gautam-aman/CODOVYN/actions/runs/39717867493) concluded failure before its jobs started (empty step lists). The macOS check annotation says recent account payments failed or the spending limit needs increasing; a separate arm64 capacity notice is also present. Billing settings were not changed. Local results do not substitute for hosted Windows/Linux runs.

Existing issues #9 (recovery), #5 (routing/budgets), and #2 (Gemini) were updated and remain open because their remaining criteria are not verified. After duplicate review, [#15](https://github.com/Gautam-aman/CODOVYN/issues/15) was created for an accessible local routing-catalogue editor, labelled `help wanted`, `enhancement`, and `accessibility`. It is intermediate work. [#16](https://github.com/Gautam-aman/CODOVYN/issues/16) records the newly observed native-host stall and bounded-cleanup work, labelled `bug`, `testing`, and `help wanted`. Two genuine help-wanted issues were created this phase; no new good-first issues or issue closures were manufactured to satisfy numerical targets.

Next priorities are diagnosis of the final native-host stall, official Gemini authentication and live two-provider continuation; safe orphan recovery/Windows ownership evidence; provider accounting settlement and retention; a usable catalogue form; and hosted cross-platform validation once the owner resolves the billing restriction. These require the stated verification before the product can be described as fully reliable across providers.
