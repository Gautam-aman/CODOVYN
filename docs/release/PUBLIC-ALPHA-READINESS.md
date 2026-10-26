# CODOVYN Public Alpha Readiness

**BLOCKED — CRITICAL GATES REMAIN**

Target: **v0.1.0-alpha**, Apple Silicon macOS only. There is no deadline override. This is a release-preparation report, not publication approval.

## Repository and source

Sprint starting SHA: `f009b9e64c15381c65a562499f201c17483180e4`, clean local/remote `main`. Work remains on main; no branches, PRs, release, visibility change or website deployment was created.

| Commit | Tested implementation |
| --- | --- |
| [`b9442d3`](https://github.com/Gautam-aman/CODOVYN/commit/b9442d37223763922efd2c4261cbf735e5e6a5b2) | feat(codex): add isolated sign-in and consent-bound Ask turns |
| [`b87fbbd`](https://github.com/Gautam-aman/CODOVYN/commit/b87fbbd1bc8b2cc19380c1d1eb367081c9b74ddf) | feat(release): harden alpha runtime and gate public distribution |
| [`52465de`](https://github.com/Gautam-aman/CODOVYN/commit/52465de663baf33e08552e564e862041a17fde09) | docs(release): prepare alpha gates, onboarding and contributor guidance |
| [`cb3a3b5`](https://github.com/Gautam-aman/CODOVYN/commit/cb3a3b535952615a00fd7ce4d14c5ea30d5cc069) | fix(packaging): smoke-test runtime after sealing the application |
| [`08fe51d`](https://github.com/Gautam-aman/CODOVYN/commit/08fe51d85ad3f7e7e89da577cb7c030fab4453dd) | fix(codex): reconcile final message snapshots without duplicate text |
| [`7499994`](https://github.com/Gautam-aman/CODOVYN/commit/7499994bca6536d5a898025f64a38b5392c481e3) | test(desktop): await document state after undo and redo |
| [`18ea1bd`](https://github.com/Gautam-aman/CODOVYN/commit/18ea1bd79b8eaf1cfd5f1eb8c5b8065f4ea15ee7) | fix(packaging): retain licenses for the native integration extension |
| [`67850aa`](https://github.com/Gautam-aman/CODOVYN/commit/67850aa50f75c7c060ab294729b3414b538a856a) | fix(chat): preserve UTF-8 across native worker stream chunks |
| [`0500389`](https://github.com/Gautam-aman/CODOVYN/commit/05003899e0fb8a7195c7a53dde927a0471844619) | test(security): bound all remaining native race barriers |
| [`004896d`](https://github.com/Gautam-aman/CODOVYN/commit/004896decd0608b0ff575617c1bca8c92bc53f1c) | fix(security): pin the patched standalone Node runtime |
| [`1356a75`](https://github.com/Gautam-aman/CODOVYN/commit/1356a7544cc14cd3c44c3a214fc7969c3dc61e40) | fix(onboarding): state live coding gates in the empty Chat view |

The evidence/documentation commit follows this implementation. Its final remote SHA is reported after push; the embedded build SHA remains unchanged.

## Minimum release scope

Required: native editor/Explorer/workspaces/search/Git/terminal, persistence, clear onboarding, one authenticated live Codex Ask path, safe separately approved Agent edits, real diff accept/reject, history, cancellation/recovery, truthful diagnostics, properly signed/notarized installer and qualified installation.

Deferred: OpenCode coding, Claude/Gemini live execution, automatic provider failover, live cross-provider ContextFlow, unattended agents, unsupported MCP capabilities, Intel/Windows/Linux. Keep implementations, fixtures and one-use transfer protections; do not advertise them as live support.

## READY — independently verified components

- Existing native desktop/editor/Java/Git/terminal/Chat/history/queue/restoration foundation; previous clean-source qualification had 357 passing tests. Current material changes are requalified below, not assumed to inherit those results.
- Existing isolated draft, fingerprint, file mediation, durable write-intent and review architecture with deterministic Java accept/reject evidence. No claim of model-generated edits.
- Durable SQLite consent/reservation/outcome accounting; uncertain submissions stay spent/fenced, no automatic retry. Request submissions, provider-internal calls, MCP attempts and token usage remain distinct.
- Real non-inference Codex probe verifies the official pinned executable accepts `ephemeral` storage, reports unauthenticated, requires owner initiation and can log out without auth files. Real native-worker bootstrap/EOF cleanup passed without starting login or inference.
- Targeted protocol fixtures verify selected model/effort, acknowledgement, early streaming events, terminal failure, disconnect, cancellation/interrupt, no tool grants, duplicate refusal and TaskEngine/SQLite lifecycle. Native-dialog fixtures verify dismissal sends no approval and the exact digest is used.
- Real disposable hardened Node/JIT/SQLite smoke passed after removing upstream debug/DYLD allowances. Unit policy tests reject public readiness for ad-hoc, dirty or unstapled artifacts.
- Existing LICENSE/CONTRIBUTING/CODE_OF_CONDUCT/SECURITY and issue/PR templates are preserved/improved; feature template, setup/architecture/platform/installation/manual-QA/redistribution/backlog guides and NOTICE are prepared. No license change or public issue publication.

## IN PROGRESS — not public release evidence

- The native isolated validation path is implemented, but actual owner sign-in and live inference are not verified. The general composer remains guarded; only the reviewed unchanged disposable Calculator is eligible for this first validation.
- Agent editing remains blocked. Existing file/draft safety fixtures cannot substitute for the separately approved real coding workflow. After the first Ask is verified, integrate/qualify the provider's restricted edit operation with the existing draft/file service and obtain separate live-test consent. Do not enable shell or direct provider project writes.
- Public distribution code is prepared: nested Developer ID signing, safe entitlements, app+DMG notarization/stapling, mounted-image/CDHash verification, Gatekeeper, provenance and checksums. Only policy/guard/inventory behavior can be tested without credentials. Credentialed execution is not verified.
- Native quality additions cover undo/redo, unsaved disk isolation, multiple tabs, Explorer/Git views and a disposable old/new restoration option. Automation is not human usability testing.

## BLOCKED — mandatory gates

| Gate | Exact missing evidence / source | Concrete next action | Owner input? | Verification criterion |
| --- | --- | --- | --- | --- |
| Real Codex authentication | `apps/cli/src/codex-session.js`, native device workflow; account starts unauthenticated | Owner opens the disposable Calculator and uses Settings → isolated sign-in, entering the official device code in the browser | Yes, account-specific sign-in | Official authenticated account state in the private memory-only process; cancellation/logout work; no global credential import |
| First real Ask | New private `runApproved`/native modal; **zero live requests** | Approve the exact one-request proposal below, then execute once through TaskEngine and independently inspect response/journal/cleanup | Yes, quota/credit consent | Correct model/effort, one durable submission, real streamed answer, unchanged source, explicit terminal outcome and no survivors |
| Real Agent coding / ordinary product path | Current native validation is read-only; general coding stays guarded | After Ask, complete/qualify scoped draft edit integration and separately approve one real Java edit, tests and diff review | Yes for live test; engineering and verification still required | Original unchanged before review; model-generated patch; independent tests; reject/accept; no ambiguous replay |
| Public signing/notarization | `distribution.js` is prepared; no signing identity/profile has been accessed | Owner provisions and authorizes Developer ID Application identity and notary profile on the protected runner/local Mac; qualify signed candidate | Yes, credentials/Apple account | Nested signature/runtime/entitlement checks, app+DMG tickets/stapling, Gatekeeper and copied signed-app suites pass |
| Hosted CI | GitHub jobs previously had zero steps due to payment/spending restriction | Owner resolves Billing & plans and reruns required workflows | Yes | Real hosted jobs execute and pass; no disabled checks or billing bypass |
| OS/clean install/accessibility | Only this M2/macOS 27.0.1 has local evidence; #15 remains open | Complete MANUAL-QA on second clean Mac and declared OS range; inspect VoiceOver/high zoom/focus | Yes, human/device access | Actual Gatekeeper install, upgrade/removal/preserved data and accessible essential flows |
| Search reliability #16 | Historical intermittent `workspace.findFiles` stall is unexplained | Retain original assertion, fresh/warm profile traces and bounded cleanup; investigate reproduction if observed | Not for local engineering; human evidence may help | Causal fix/regression or explicitly justified release-risk decision; successful repeats alone do not close it |
| Redistribution/ownership | Bundled extension/asset rights need final comparison with consolidated notices | Inspect generated license inventory and confirm existing Apache-2.0 ownership/upstream distribution obligations | Yes, rights approval where unresolved | Required notices retained, no unauthorized proprietary assets/services, owner clearance |
| Embedded editor runtime | Electron 43.7.3 / embedded Node 24.21.0 precede October 21 security fixes; latest verified VSCodium artifact is unchanged | Qualify an official upstream fixed artifact or audited source build; do not swap binaries | Upstream dependency; no credentials required | Demonstrated fix coverage and full native qualification |
| Publication | No approved public binary, tag/release or visibility change | Request final explicit release/publication approval only after all gates pass | Yes | Verified immutable artifact/manifest, approvals and clean-install evidence; no automatic upload |

## Qualification evidence

Qualification uses real OS/process probes, metadata-only ACP/authentication, deterministic protocol actors and native app automation as separate evidence categories. **Actual live requests: 0. Account-specific sign-in requests initiated: 0.**

- Full regression: **380 passed, 0 failed, 0 cancelled, 0 skipped**, under isolated Node **26.12.1**, 107276.581666 ms. This includes SQLite consent/request accounting, task leases, OS-denial witnesses, write-intent recovery, ContextFlow and provider fixtures. It is not 380 live-provider tests.
- Final onboarding text change: **45 extension tests passed, 0 failed/skipped**, plus syntax check. These overlap the 380 and are not added to that count.
- Real source probes: isolated Codex auth/read/logout (no login), native worker EOF, Codex pre-action/task controls; OpenCode broker **7 actual metadata sessions / 6 transitions**, task-adapter **2 actual metadata sessions**; deterministic Java accept/reject and independent offline Maven oracle; extension-host check. All passed. No `session/prompt` or live `turn/start` was sent.
- Final clean application/DMG embeds implementation SHA **`1356a7544cc14cd3c44c3a214fc7969c3dc61e40`**, version **0.1.0-alpha**, bundle build **2**, `sourceDirty: false`. The final evidence/documentation commit follows this build and is not claimed as its embedded source. Final remote SHA is verified in the handoff; avoid a self-referential commit hash inside this file.
- Mounted-image/copy qualification and checksum: see [evidence](../assets/public-alpha/qualification.json). All 14 copied qualification steps passed, including read-only mount, pre/post deep/strict signature, Java native host, Chat/routing, old-to-new restoration, provider probes and Java draft workflow. The disposable copy is separate from `/Applications/CODOVYN.app`. Some probe headers record the host checkout as dirty while report text was prepared; their imports point to the copied bundle, whose embedded clean-source provenance is separately verified.
- Required notice inventory: **8** hashed notices, **96** bundled extension entries; [inventory](../assets/public-alpha/license-inventory.json). This is evidence preservation, not legal clearance.

Observed failures fixed during qualification: runtime smoke ran before the outer bundle was sealed and was killed; the unchanged smoke now runs after full signing/verification. Undo/redo completion raced document propagation; native assertions now await the document event without weakening contents or search deadlines. Final-only/duplicate message snapshots and split UTF-8 stream chunks have focused regressions. Two native race barriers could hang after signal exit; existing deadlines now also observe signals and expiry, with the same assertions. The initial runtime test interrupted by that harness defect is not reported as a passing run.

The separate Node update is pinned to the official security archive and tested without replacing the owner's global Node. A harmless local TLS identity witness rejected the noncanonical IP under 26.12.1 where 26.9.0 did not. **Electron's embedded Node remains a separate unresolved release gate.** The two high npm development-chain findings remain; no unsupported major override was applied.

Hosted CI at [004896d](https://github.com/Gautam-aman/CODOVYN/actions/runs/40287034122) completed with **three failed jobs, zero executed steps**. Its annotation says recent account payments failed or the spending limit needs increase. Owner action: resolve **Billing & plans**, then rerun CI. Local passes are not hosted CI passes. Issue #16 remains OPEN; passing source fresh/warm and copied search checks do not identify a cause. Issue #15 still needs independent accessibility QA.

Development artifact: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`. SHA-256: `958c2c71c4be9742f0ed3d041fe48be1d50916b01998c93802507b3e34ff1160`. Signature: **ad-hoc hardened development**, not Developer ID/notarized. The read-only public verifier correctly rejected it for lacking the intended Developer ID/Hardened Runtime nested signature. Public installer/download fields remain null/disabled. No signing credentials, Gatekeeper settings, release, website, account billing or repository visibility were changed. No app/DMG is committed.

## Desktop session follow-up — no inference

The [lifecycle investigation](../development/desktop-session-lifecycle-validation.md) fixes verified cleanup/ownership defects, adds private sanitized PID/group lifecycle evidence, and provides a Launch Services owner launcher without test-runner shutdown hooks or keyboard automation. The historical owner-app exit cause remains **unproven** and is not relabelled a crash. Full regression: **382 passed, 0 failed/skipped**. Two repeated copied-app cycles, four actual metadata-only worker sessions, cancellation, intentional shutdown and recorded process-group cleanup passed. Native host/Java, Chat, routing, restoration and provider/security checks passed sequentially. A fresh copied app is left open for manual owner authentication. Zero authentication starts or inference submissions were initiated by this task. After sign-in, require fresh exact owner approval and native one-use consent; do not reactivate prior approval automatically. The earlier DMG/provenance/checksum above remains historical and was not republished.

## Keychain authentication follow-up — current implementation

See [persistent authentication qualification](../development/codex-persistent-authentication-validation.md). The stable profile identity now uses strict OS **keyring**, separate from temporary runtime state and from the unchanged coding sandbox. Official-CLI public invalid witnesses passed native Keychain storage, fresh-process restore, scoped logout and plaintext rejection. Three actual empty-identity worker lifetimes/two restarts and all **16 copied-DMG checks** passed. Full regression: **393 passed, 0 failed/skipped**. These are not genuine ChatGPT-account authentication or inference results; owner login/refresh confirmation is pending.

**New explicit coding gate:** the Keychain authentication component cannot start threads/turns or bind execution, and a credential bridge to the restricted coding process is **not implemented**. Ask is disabled. Earlier memory-only transport/proposal descriptions are historical preparation, not a currently executable path for the persistent identity. Do not request or consume spending consent until this boundary and real account restoration are verified. No earlier approval was recreated/consumed. This task sent **zero model requests** and started **zero real browser logins**.

Current clean development artifact embeds `2018d71493793993d76a6c009396b01d78205e83`; DMG SHA-256 `4dddb268129a065285c93594041ed201754ac67e584ee6edea823e7e6a56fbf9`. It remains ad-hoc signed/unnotarized and was not published. The earlier checksum sections remain historical evidence of their own builds. The new copied app is left open using the stable **CODOVYN Owner Validation** profile for manual sign-in.

## Pinned authentication bridge qualification — current execution blocker

[Bridge validation](../development/codex-authentication-bridge-validation.md) reproduces the incompatibility against the official installed **Codex 0.164.0** without inference. Its managed Keychain identity restores in the authentication-only boundary and fails to restore in the unchanged coding sandbox. The pinned external `chatgptAuthTokens` path requires raw token import and is marked unstable/internal-only; it was rejected. Account metadata supplies no delegation handle. No safe supported bridge was found; production coding and the Ask control remain **BLOCKED**. Additional spending consent does not remove this technical gate.

Tested fix `d650b8dab1bc7d48c3334cab56d28979d8e6a02b` revokes account bindings before refresh/sign-out, on account changes and disposal; rejects racing stale replies; invalidates native Signed in status without automatic login or retry. Previous account-bound approval cannot authorize a switched account. Strict Keychain storage and the original coding sandbox are preserved.

**399 tests passed, 0 failed/skipped; all 17 copied-DMG steps passed.** These include actual OS/protocol witnesses, native host/Java, Chat/routing/restoration and deterministic task/SQLite/security controls. **Zero inference submissions and zero owner authentication starts.** The current owner profile has zero campaign consents/requests/active leases; Calculator hashes/Git remain unchanged. No credential material is published. Real owner-account restoration and live inference are not claimed.

Clean development DMG source: `d650b8dab1bc7d48c3334cab56d28979d8e6a02b`; SHA-256 `b6f131c0df42a2fbae4e6bee8045b515b2ae0b0b54eb0afeeb08fb9fa0c88da8`. Ad-hoc signed/unnotarized, copied-app verified, not published. `/Applications/CODOVYN.app` is unchanged. Final remote SHA is verified after this documentation commit and included in the handoff. **ALPHA BLOCKED — CRITICAL GATES REMAIN.**

## Selected alpha path — guarded OpenCode Ask preparation

The [three-path decision and qualification](../development/first-provider-transport-validation.md) selects the existing pinned **OpenCode 2.1.2 ACP adapter**, retaining its current OS/MCP boundary. Codex's Keychain/auth-only process remains untouched and blocked for coding. A separate API SDK/credential integration was deferred. No extra filesystem, Keychain, shell, Git or tool grant was introduced.

Implementation `3953f079befbca785374ed0aa2ee3d1230e04b53` adds a private single-use ACP Ask transport, existing SQLite reservation/accounting, exact model/prompt native review, cancellation/uncertain-outcome handling and Settings actions. Normal composer/provider coding, Agent and ContextFlow remain gated. Only the unchanged public Calculator can use the new native validation entry, after fresh explicit approval. Earlier Codex consent never authorizes this provider.

**411 tests passed, 0 failed/skipped; all 18 copied-DMG steps passed. Actual inference submissions: 0.** The real owner-worker empty-context preflight certifies cleanup and creates no task/consent/request. Source and copied actual ACP/MCP initialization passed without a prompt. Native Settings includes **Review one OpenCode Calculator Ask** and cancel controls; the capture uses labelled UI fixtures, not live AI.

**Current owner gate:** OpenCode authentication is not configured in the isolated project context. Complete **OpenCode Setup** yourself, then select an actual discovered exact `provider/model` in the review flow. Account identity/access and costs are unverified; do not infer API coverage from a ChatGPT subscription. Only then can an exact model/account-bound spending proposal be approved. No login or inference was initiated automatically.

Future scope: fixed 229-byte Calculator and prompt SHA `dfe2704168df0eb12655b1a5401b9b41aff59331519b03e4b0189c307f33cc96`; Provider Default reasoning; one outer submission; 120-second local deadline; zero tools/MCP tool calls/project changes; no host retries/fallback, Agent or handoff. Metadata MCP initialization/listing is separate. Internal SDK/model retries/calls, tokens, quota and exact cost are unknown and not bounded by that submission cap. An actual selected model is still required; **no complete spending proposal is being approved by this report**.

Clean development DMG source: `3953f079befbca785374ed0aa2ee3d1230e04b53`; SHA-256 `ef76d371a3164edf16eaaf948a143c8ca5064b3df553181e5cb713e1a00d076b`. Ad-hoc/unnotarized, copied-app verified, not published. `/Applications/CODOVYN.app` remains unchanged. Final remote SHA is verified after documentation push and included in the handoff.

Independent runtime investigation found official **VSCodium 1.143.17183**, published October 26. Bounded archive downloads timed out; its embedded fix coverage remains unqualified. Preserve the pinned editor until a complete checksum-verified candidate passes native qualification. Do not assume that no newer upstream build exists, or that Node 24.22.0 establishes October 21 fix coverage. [Captured upstream metadata](../assets/opencode-ask/editor-security.json). Signing/notarization, hosted CI billing, real Ask/Agent, issue #16, dependency/rights and clean-machine/human QA gates remain. **ALPHA BLOCKED — CRITICAL GATES REMAIN.**

## Historical first Ask proposal — blocked by current credential bridge

Provider: official pinned Codex CLI **0.164.0**, native SHA `d8990e3ee7acfbc26f91265b12a1a83f0fee40d0e0f8f1f40a37d4ec21f499cf`. Model: **gpt-6.1-sol**, effort **Low**, subject to a fresh advertised capability check. Account: owner-initiated separate memory-only Codex context; no global credentials imported; authentication unverified until the owner signs in.

Scope: only `src/main/java/dev/codovyn/Calculator.java` from the unchanged disposable division fixture, baseline `ac00214528f004350bbd7b53349861726e270323`. The 229-byte excerpt hash is `dee76c8f9584ba9286e2bd67948499030760f3978bb6a3e4074cbcf731088c26`.

Exact prompt:

```text
Explain the division-by-zero behavior in the following approved Java excerpt and recommend the smallest safe correction. Do not call tools or modify files.

File: src/main/java/dev/codovyn/Calculator.java
package dev.codovyn;
public final class Calculator {
    public int add(int a, int b) { return a + b; }
    public int subtract(int a, int b) { return a - b; }
    public int divide(int a, int b) { return b == 0 ? 0 : a / b; }
}
```

Including its final newline, prompt SHA-256 is `dfe2704168df0eb12655b1a5401b9b41aff59331519b03e4b0189c307f33cc96`. Limits: **one outer submission, 120-second local deadline, zero tools/MCP actions/writes, no host retry/fallback/parallelism**. A durable request precedes `turn/start`. Uncertain outcomes cannot be replayed. Provider-internal calls/retries, tokens and exact billing remain unknown; a request may consume subscription quota or paid API credits. Cancellation does not guarantee immediate remote billing termination.

This report is not consent. Owner sign-in is not spending consent. A separate explicit owner response approving this identified campaign is required before the engineering agent sends a request. The native app also requires its one-use review. Agent edits, another recipient/model/account or additional calls need new approval.

## Independent release preparation

See [CODEX](CODEX.md), [MANUAL-QA](MANUAL-QA.md), [INSTALLATION](INSTALLATION.md), [KNOWN-ISSUES](KNOWN-ISSUES.md), [RELEASE-NOTES](RELEASE-NOTES.md), [DISTRIBUTION](DISTRIBUTION.md), [REDISTRIBUTION](REDISTRIBUTION.md) and [CONTRIBUTOR-BACKLOG](CONTRIBUTOR-BACKLOG.md). The existing Phase 16 evidence remains historical and is supplemented, not relabelled as live validation.

**Release verdict: BLOCKED — CRITICAL GATES REMAIN.**
