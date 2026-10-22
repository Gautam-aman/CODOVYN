# Phase 5 engineering checkpoint — 22 October 2026

CODOVYN remains an independently launchable macOS arm64 development IDE. This
checkpoint fixes a real routing-panel failure and adds a usable local model
catalogue form. Phase 5 is **not complete**: authenticated Gemini work, a live
Codex-to-Gemini continuation, and hosted CI remain unverified or blocked.

## Repository and changes

- Repository: https://github.com/Gautam-aman/CODOVYN (private); branch: `main`.
- Starting SHA: `827c218cb64dbdfac134d878bca944483f97e8ee`.
- Clean desktop package source: `d2c9ca208df8b5de92c1cf0d530babfc1858c67c`.
- Eleven meaningful Phase 5 commits through the routing-preview screenshot
  commit `4e21311ac100ad6fb17b7c57667ecd7a683b3431`; this report and README
  correction form the twelfth documentation commit. Each implementation step was pushed to
  `origin/main` and the remote ref checked. No PR, release, visibility change,
  force-push or branch switch occurred.
- Git history counts **73** commits after the documented standalone-campaign
  baseline `e2664564f6dad2aff45bca45328264ea2ea3aab7` including this report.
  The prompt's 78-commit estimate does not match this explicit Git range. The
  100-commit target is unmet; no commits were padded to reach it.

## Desktop reliability and real UI journey

The clean-source app built from `d2c9ca2` passed the native host test (editor
open/edit/save, search, Git, agent-panel activation/reuse, terminal, bundled Node
and a **bundled CLI route command**) and the two-launch restoration test (file,
workspace/editor, Warm Paper theme, local state and routing preferences).

An ad-hoc-signed, unnotarized development DMG was built, checksum-verified,
mounted, copied to a disposable location and signature-verified. Both native
tests passed against that copied installation. Final copied-app lifecycle files
reported zero surviving test-owned processes: host 13.1 seconds, restoration
write 5.5 seconds and restoration read 6.3 seconds. These are observed test
durations, not startup or performance benchmarks. The copied-app tests use an
isolated user profile and shared-storage directory; no unrelated process was
targeted for termination.

Artifact: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`.
SHA-256: `5bf1d59536d0857b9d0d597c53ef2dcef27a9944c6ea7eb43f672f6b24d3a4f5`.
The package is a development artifact, not a notarized public release. Windows
and Linux installed-app behavior was not tested.

The panel now saves and restores a project-scoped catalogue, adds/edits/removes
local model entries, selects five modes, captures reasoning/capability fields,
and accepts user-estimated prices, token counts and local budget limits. Preview
shows candidate admission and rejection reasons without a provider request.
An actual copied-app panel journey saved a **fixture** model and displayed its
saved-policy preview. [Form capture](../assets/desktop-phase5-routing.png) and
[preview capture](../assets/desktop-phase5-routing-preview.png) are genuine
macOS application screenshots, not evidence of model access.

That journey revealed a real failure: VS Code returned a routing configuration
object that could not be `structuredClone`d. Preview failed even after the form
reported a successful save. The extension now takes a bounded JSON snapshot
before host validation and routed execution. A regression test supplies a
non-cloneable configuration proxy. Separately, the CLI now recognizes direct
invocation through symlinked installation paths; a subprocess test covers this
and native host tests exercise the bundled CLI from the app path. The real
panel save/preview journey passed after the fix.

The historical intermittent native-host stall from [#16](https://github.com/Gautam-aman/CODOVYN/issues/16)
did not recur. Its root cause remains unknown, so #16 remains open.

## Agents, routing and safety

- Existing authorized Codex read/edit and isolated reviewed-patch behavior was
  preserved; no new paid Codex coding task was needed for this checkpoint.
- Gemini CLI 0.65.0 was detected through an explicit, application-level absolute
  executable path pointing to the temporary development prefix. Detection used
  CLI help, made no paid request, and reported authentication and availability
  as **unknown**. The prior live invocation failed authentication with exit 41.
  No new live Gemini read, edit, cancellation or provider-to-provider handoff was
  attempted while that prerequisite remains unresolved. See [#2](https://github.com/Gautam-aman/CODOVYN/issues/2).
- Existing deterministic handoff, interrupted-write blocking and primary
  restoration gates still pass. No naturally occurring quota failure or live
  two-provider continuation was verified. [#9](https://github.com/Gautam-aman/CODOVYN/issues/9)
  remains open for orphan and broader crash recovery.
- The five routing modes remain local deterministic policies. Catalogue scores,
  availability and pricing are user inputs; preview eligibility is not live
  authorization. SQLite reservations are estimates, not exact provider billing
  or hard account-wide caps. Usage settlement remains open under [#5](https://github.com/Gautam-aman/CODOVYN/issues/5).

## Quality, CI and community

- `npm run check`: **179 tests passed, zero failed/skipped** on local macOS;
  syntax checks passed. The symlinked CLI test and routing host tests are new.
- `npm run test:desktop-host` and `npm run test:desktop-restoration`: passed for
  both the assembled app and the copied final DMG app.
- `npm audit --audit-level=high`: zero package-audit findings; this does not
  certify the entire Electron/editor distribution.
- Companion extension-host smoke passed on VS Code 1.143.0. Upstream host
  diagnostic warnings appeared; a zero exit is not an absence of warnings.
  No Windows/Linux graphical validation is claimed.
- Latest observed hosted [CI run 39735527772](https://github.com/Gautam-aman/CODOVYN/actions/runs/39735527772)
  failed before any job steps started. GitHub's annotation says recent account
  payments failed or the spending limit needs increasing; an arm64 capacity
  notice is separate. No billing settings were changed. The owner must resolve
  the account restriction in GitHub **Billing & plans**, then rerun and inspect
  the current workflows. **Local validation passed; hosted CI remains blocked
  by the account configuration.**
- All open issue descriptions were reviewed. Progress was posted on [#2](https://github.com/Gautam-aman/CODOVYN/issues/2),
  [#5](https://github.com/Gautam-aman/CODOVYN/issues/5), [#15](https://github.com/Gautam-aman/CODOVYN/issues/15)
  and [#16](https://github.com/Gautam-aman/CODOVYN/issues/16). None was closed:
  their remaining acceptance criteria are real. No duplicate or filler issue
  was created; existing good-first and help-wanted issues remain available to
  invited contributors while the repository is private.

## Next verified gates

The catalogue editor still needs field-specific errors, deterministic
keyboard/cancellation tests, and high-contrast/narrow/zoom checks before #15
can close. Gemini needs an official authenticated local session, then bounded
read/edit/cancellation tests and a reviewed real safe-boundary Codex-to-Gemini
continuation. Hosted CI needs owner-side billing remediation. The intermittent
native stall needs a reproducible trace or defensible external explanation.
