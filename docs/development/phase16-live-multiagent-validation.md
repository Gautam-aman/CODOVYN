# Phase 16 — live campaign preparation and security gates

**PREPARED — NOT EXECUTED. Actual model requests: 0.**

**The preparation stage remains incomplete, and production OpenCode inference stays blocked.** This work does not claim live Codex coding, live OpenCode coding or live ContextFlow continuation. No spending consent was received or inferred. No `session/prompt` was sent to the installed OpenCode executable; the Codex probe sent only `initialize` and `model/list` plus the initialization notification.

## Repository

Started from clean local/remote `main` at `c023383b3d58d610f995122c06c9b7538fdcee59`, after fetch and fast-forward verification. Recoverable history was preserved without resets, new branches or stashes.

- `510faa6647dcf366056368217be4ebcad2ab4bd7` — bounded preparation policy, reproducible division fixture, offline correctness oracle, real Codex metadata probe and host-enforced eight-call MCP budget.
- `7ddd404d863d77ac7d3ebaab334cf57d5882d86b` — keep the same Agent permission scope across both proposed handoff segments. An Ask → Agent transition would improperly increase permissions.

- `abb6529bb7355d7ecdebfdd5d78f2c4e6f21783f` — reset provider readiness state when the native routing harness enters its existing fixture-only transport. This fixes a demonstrated capture-mode failure without altering production readiness.

All implementation/test commits were tested, pushed directly to `main`, and checked against `ls-remote`. Final tested source checkpoint is `abb6529`. The installer embeds clean source `7ddd404`; only the routing test script changed afterward, outside the application bundle. The subsequent evidence-only commit contains this report. Resolve its full SHA with `git log -1 --format=%H -- docs/development/phase16-live-multiagent-validation.md`; the final response records the verified remote SHA. No PR, release, installer upload or change to `/Applications/CODOVYN.app` occurred.

## Implemented preparation

`node scripts/inspect-codex-metadata.js` starts the installed app-server for bounded metadata only. It allows two request methods, a 15-second deadline, 256-KiB JSONL messages and 64 received messages. It discards stderr and unsolicited payloads, persists selected model fields only, terminates its owned process group and checks for survivors. It does not replace CODOVYN's execution adapter or grant inference consent.

`node scripts/prepare-phase16.js` creates disposable projects, runs Maven offline, proves the regression oracle, and writes `dist/desktop/phase16-preparation.json`. There is no execute/approve flag. `scripts/lib/phase16-campaign.js` records six proposed submissions, explicit approval boundaries and blocking observations. Even a synthetic green preflight cannot authorize execution. It is **not** a durable live campaign runner or an inference-request ledger.

The actual task-bound MCP bridge now reserves a call **before** any file operation, with a fixed ceiling of eight per execution authority. Invalid and denied active calls count. Calls after the ceiling return `-32004` before source access or mutation. Catalogue refresh, repeated initialization, a copied authority object or another endpoint cannot replenish the allowance. Existing kernel peer authentication, task lease checks, write intents, conflict detection, revocation and sandbox restrictions remain active. The OS-backed test verifies eight calls, a denied secret read, and subsequent rejections without additional file-access records or returned source.

This bounds MCP file actions, **not provider-internal model calls**, output tokens, price, every kind of provider tool event or the lifetime of every external service request. It does not activate live prompting.

## Provider observations

| Provider | Observation | Evidence category |
| --- | --- | --- |
| Codex | Installed CLI `0.164.0`; local app-server returned seven catalogue entries. Default `gpt-6.1-sol`, default effort Low; High appears among supported efforts. | METADATA only; no inference |
| Codex login | Official CLI reports ChatGPT login. Account identifiers, credential contents, entitlement and billing were not inspected. | Readiness observation, not authenticated inference proof |
| OpenCode | Official pinned macOS ARM64 `2.1.2`; SHA-256 `3f01e2ba8efd4242c638add9248b88696221d76588d9511e63cb2d727c278fcc`. | REAL ACP / metadata only |
| OpenCode catalogue | Ten entries in this campaign; ACP selected `opencode/big-pickle`. Presence/default selection does not establish auth, entitlement or free usage. | METADATA only |
| OpenCode authentication | Unknown; separate CODOVYN owner-only context. Global provider credentials/plugins/configuration were not imported. | BLOCKED for live verification |

The Codex launcher hash in the saved probe is for the npm entry script. Its resolved native ARM64 executable additionally hashed to `d8990e3ee7acfbc26f91265b12a1a83f0fee40d0e0f8f1f40a37d4ec21f499cf`; local signature inspection reports hardened runtime. This is provenance observation, not a complete supply-chain audit or inference authorization.

## Disposable Java fixture and independent oracle

The new `division` scenario fixes the unrelated legacy subtraction defect and deliberately returns zero for division by zero. Its documented contract requires `ArithmeticException`. Existing legacy fixtures and their baseline are unchanged. Git author/time/configuration and source bytes are deterministic; the two independently created division repositories have identical baseline commits and file hashes.

Java compilation targets release 17, with pinned JUnit `5.11.4`, compiler plugin `3.13.0` and Surefire `3.5.2`. This machine runs JDK **21.0.7**, not a verified Java 17 runtime, and Maven `3.9.11`. Cached dependencies support `mvn -o test`; the campaign does not need test-time network access. It does not claim an empty Maven cache works offline.

- Original disposable project: three tests, zero failures/errors/skips.
- Separate oracle repository: host adds the proposed zero-divisor regression; Maven exits nonzero with one expected failure.
- Host applies the reference fix in that separate repository: four tests, zero failures/errors/skips.
- No provider performed this repair. The prepared baseline remains unchanged. Source hashes, baseline SHA, paths and test exits are in the preparation JSON.

**DETERMINISTICALLY TESTED:** existing protected-adapter Java read/edit/test/review workflows pass accept and reject paths. Their fixed Node protocol actor is not an AI model. Each workflow produces two durable published write intents and four passing independent JUnit tests; original files remain unchanged before review. Rejection preserves the original, and acceptance applies the reviewed patch only.

## Exact proposed campaign — not approved

| Submission | Provider | Mode | Work |
| --- | --- | --- | --- |
| A | Codex | Ask | Explain division and recommend a minimal fix, no writes |
| B | Codex | Agent | Regression test plus minimal isolated fix |
| C | OpenCode | Ask | Invoke approved MCP source read and explain actual source |
| D | OpenCode | Agent | Use approved MCP read/write tools for the isolated fix |
| E1 | Codex | Agent | Inspect and plan under the same approved draft policy; no requested edits |
| E2 | OpenCode | Agent | Continue the same logical E task from its actual approved packet |

Candidates observed in metadata are Codex `gpt-6.1-sol` and OpenCode `opencode/big-pickle`; **neither is approved for spending**, and no claim is made that either is cheapest or entitled. Exact model/effort and account context must be confirmed with the owner. Costs, tokens, internal inference turn counts and subscription/quota impact are unknown. A real request may consume subscription quota or API credits. No price or savings estimate is fabricated.

Proposed outer limits are six sequential submissions, 120 seconds per request, eight tool actions, no retries, no fallback and no automatic patch application. **These are not all enforceable in the present combined pipeline:**

1. Codex's current execution adapter uses `exec --json`, not the probed app-server. Its command/file events are observations after actions start. It advertises shell capability, and a read-only filesystem sandbox does not itself disable shell execution or prove the required secret-read boundary. Eight-action pre-execution denial is not implemented for this path.
2. Codex's adapter does not currently supply the proposed per-request watchdog or the MCP pre-mutation write-intent interface. Existing cancellation/process-tree tests pass; they do not establish those missing campaign controls.
3. The MCP eight-call cap is now host-enforced for OpenCode, but agent `steps: 8` is not proof of exactly eight billable inference turns. Six submitted tasks can involve more than six internal model calls. A durable campaign-wide submission/consent ledger is **not implemented**.
4. OpenCode's inference guard remains enabled. Its live authentication/model entitlement has not been established, and a fresh explicit model choice is still required.
5. Agent execution and ContextFlow still need their normal native approvals. Campaign consent cannot authorize an unseen recipient-bound packet, expand its source scope or increase permissions.

**BLOCKED:** an execution authorization request is premature while these security prerequisites fail. The script deliberately reports `eligibleForApproval: false`. No model request may be launched from this preparation. Resolve these gates and present a revised exact campaign before asking for spending consent. No consent is implied by a future generic “continue”.

## Security, ACP and ContextFlow evidence

The repeated broker campaign completes seven real metadata-only ACP sessions and six repository transitions, including ordinary/linked/nested repositories, branch refresh, path substitution, revocation, process death and owned cleanup. It verifies same-task/recipient-bound packet properties with **deterministic continuation responses** after real ACP startup. That is not a live handoff.

The task-bound boundary harness completes two real ACP initializations with host-invoked file checks. The actual-adapter harness completes two secured Ask/Agent initializations, registers the MCP catalogue, then deliberately stops before file-tool activation or `session/prompt`. Both verify unchanged original repositories, released leases after verified cleanup and no write intents during metadata-only execution.

Full regression coverage retains actual OS denials for Git/shell/network executables, protected Git writes, external/private files, symlink/hardlink/path replacement, executable tampering, library injection, stale authority, broker failures, cancellation, SQLite intents and descriptor-lock crash recovery. No sandbox capability was broadened. Retained staged preimages and uncertain-write fences are not replayed automatically. A fixture success does not prove a provider can use the restricted tools.

Native screenshots below show actual application UI with **deterministic test content**, not real model responses. DOM focus remains unobservable in the existing isolated routing harness; keyboard assertions are distinct from native focus proof.

## Validation and installer

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Passed; two high development audit findings retained |
| Final `npm run check` at `abb6529` | 170 syntax files; **334 passed, 0 failed/cancelled/skipped**, 121.681 seconds |
| `npm run test:extension-host` | Passed, VS Code 1.143.1 extension-host process |
| `npm run build:desktop` | Passed; final embedded `7ddd404`, `sourceDirty: false` |
| Native host | Source and copied app passed original editor/search/Git/terminal/Node assertions |
| Native Chat | Source and copied app passed two launches; copied real OpenCode readiness stayed blocked/unverified |
| Native routing | Source passed; first copied capture run failed, corrected fixture-isolation repeat passed |
| Native restoration | Source and copied app passed both launches, saved content/theme/routing/local state |
| Copied Java editor/terminal | Java document language ID verified; independent offline Maven exits 0, three baseline tests pass |
| Broker campaign | Seven real metadata ACP sessions, six repository transitions; no prompts |
| Task boundary / actual adapter | Two real ACP sessions in each source harness; two additional copied-module actual-adapter sessions, no prompts |
| Protected draft workflow | Source and copied modules each pass accept/reject workflows; four JUnit tests per workflow; provider responses are fixtures |
| `npm run package:desktop` | Passed; fresh development DMG, image checksum verification passed |
| Mounted and copied signatures | Deep/strict verification passed before and after copied-app tests |

The copied routing failure was `provider: codex / reasoning: high` instead of the expected OpenCode fixture selection. Earlier real diagnostics correctly disabled OpenCode; switching transport to fixtures did not reset that provider state. The fix injects an explicit provider-state fixture **after** the existing fixture-only gate. The original assertion and the separate real `providerReadinessBlocked` assertions remain intact. The failed run's cancelled lifecycle has zero survivors. See [failure and correction](../assets/phase16-preflight/routing-isolation-regression.json).

The real host search completed in these bounded runs (including **171.090 ms** in the copied Java run). This does not explain or resolve historical issue #16, which was independently checked and remains **OPEN**. No timeout was increased.

The final read-only process check found **296 recorded provider/broker/fixture groups absent**, with zero survivors. Seven saved current native lifecycle records also have empty survivor lists, including the failed routing capture and the Java editor/terminal run. No unrelated process was signalled by this final check. [Cleanup evidence](../assets/phase16-preflight/cleanup-verification.json).

Installer:

- Local file: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`.
- SHA-256: `d8d354ed61f94d2c6915d1d833aecc523a7c23d0eff919523a2a342add21055a`.
- Embedded source: `7ddd404d863d77ac7d3ebaab334cf57d5882d86b`, clean build. The subsequent test-only fix is not part of the packaged application.
- Read-only image mount, mounted app signature, disposable copy, detach and copied post-test signature all passed. `hdiutil` emitted deprecation notices for attach/detach, without a failure.
- Disposable copy: `/private/tmp/codovyn-phase16-copy-_pmmhine/CODOVYN.app`.
- Ad-hoc signed, unnotarized development image. No public release, security bypass, Keychain change or `/Applications` overwrite.
- [Installer proof](../assets/phase16-preflight/installer-verification.json), [build provenance](../assets/phase16-preflight/build-provenance.json).

Screenshots are from the real copied standalone app:

- [Actual OpenCode readiness, inference blocked](../assets/phase16-preflight/copied-provider-readiness.png).
- [Composer — deterministic UI fixture](../assets/phase16-preflight/copied-fixture-composer-dark.png).
- [Model picker — deterministic UI fixture](../assets/phase16-preflight/copied-fixture-model-picker.png).
- [Effort menu — deterministic UI fixture](../assets/phase16-preflight/copied-fixture-reasoning-effort-menu.png).

[Prepared Java baseline/oracle and campaign](../assets/phase16-preflight/phase16-preparation.json), [Codex metadata-only probe](../assets/phase16-preflight/phase16-codex-metadata.json), [real broker campaign plus fixture ContextFlow](../assets/phase16-preflight/source-opencode-broker-validation.json), [copied draft workflow](../assets/phase16-preflight/copied-opencode-draft-workflow-validation.json), and [copied actual-adapter no-prompt evidence](../assets/phase16-preflight/copied-opencode-task-execution-validation.json) retain the distinctions above. Execution capability tokens are redacted in committed evidence; no credential or generated app/DMG is committed.

Latest inspected hosted [run 40205114146](https://github.com/Gautam-aman/CODOVYN/actions/runs/40205114146), for `abb6529`, failed all three jobs with **zero steps executed**. Its annotation says recent account payments failed or the spending limit needs increasing. The owner must resolve GitHub **Billing & plans** and rerun. Workflows and billing were untouched. **Local checks passed; hosted CI remains blocked by account configuration.**

Audit: installed development chain `@vscode/vsce@4.0.0 → @azure/identity@4.14.0 → @azure/msal-node@6.0.1`; two high findings, zero production-graph findings. Current audit reports `fixAvailable: true`; remediation compatibility has not been evaluated in this stabilization change. No unsupported override, suppression or dependency churn was applied. Other desktop platforms, Java 17 runtime behavior, authenticated inference and public distribution remain unverified.


## Status and remaining work

- **PREPARED — NOT EXECUTED:** six-submission plan, offline division project and failure oracle.
- **DETERMINISTICALLY TESTED:** campaign fail-closed policy, draft mutation/review, queue, recovery and ContextFlow regressions.
- **REAL PROVIDER EXECUTED:** only non-inference Codex metadata and OpenCode ACP startup; no model prompt.
- **LIVE CODING VERIFIED:** no.
- **LIVE CONTEXTFLOW VERIFIED:** no.
- **BLOCKED:** combined campaign admission, Codex pre-action restrictions/watchdog, durable campaign-wide consent/request accounting, exact model approval and live authentication/inference.

The new MCP limit is a security improvement. The proposed budget must not be presented as a billing guarantee. Phase 16 preparation and the live milestone are not declared complete.
