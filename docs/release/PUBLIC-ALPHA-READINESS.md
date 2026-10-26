# CODOVYN Public Alpha Readiness

**BLOCKED — CRITICAL GATES REMAIN**

Target: **v0.1.0-alpha**, Apple Silicon macOS only. There is no deadline override. This is a release-preparation report, not publication approval.

## Repository and source

Sprint starting SHA: `f009b9e64c15381c65a562499f201c17483180e4`, clean local/remote `main`. Work remains on main; no branches, PRs, release, visibility change or website deployment was created.

- `b9442d37223763922efd2c4261cbf735e5e6a5b2`: isolated official memory-only sign-in, private guarded turn transport, native one-request consent and protocol/SQLite tests.
- `b87fbbd1bc8b2cc19380c1d1eb367081c9b74ddf`: runtime hardening, version/minimum-OS correction, deferred-provider gates, owner-only distribution and qualification workflow, native editor/upgrade assertions.
- The subsequent source/documentation checkpoint adds contributor/release documentation and required notice packaging. Final implementation/build/evidence SHAs and remote verification are recorded with the qualification evidence below; the final response gives the final evidence commit's full remote SHA.

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
| Publication | No approved public binary, tag/release or visibility change | Request final explicit release/publication approval only after all gates pass | Yes | Verified immutable artifact/manifest, approvals and clean-install evidence; no automatic upload |

## Qualification evidence

Material-change full qualification is recorded here after execution. Until then, do not describe the new build as passed based on the previous checkpoint. Results must distinguish real OS/process checks, metadata-only ACP/auth, fixed protocol actors and paid inference. Actual live model requests in this sprint: **0**. Actual account-specific sign-in requests initiated by the engineering agent: **0**.

Development artifact: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`. It is not the public `CODOVYN-0.1.0-alpha-darwin-arm64.dmg`. Do not publish it or enable downloads. Source SHA/checksum and copied qualification results will be attached after the clean build; all apps are disposable copies, never `/Applications/CODOVYN.app`.

## Exact first Ask proposal — pending explicit approval

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
