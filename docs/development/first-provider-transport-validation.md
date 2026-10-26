# Selected alpha provider transport — protected OpenCode Ask

**PREPARED — NOT LIVE VERIFIED.** Starting main: `39cca12c5f3263225b3a72b1cd6a82981fdc579a`. Tested implementation and clean development installer: `3953f079befbca785374ed0aa2ee3d1230e04b53`. A documentation/evidence commit follows; final remote SHA is verified after its push.

## Decision

| Path | Official interface and credential boundary | Enforcement / maintenance / alpha fit | Decision |
| --- | --- | --- | --- |
| A: authenticated Codex transport | Official app-server and existing isolated Keychain login; model/tool runtime shares SDK auth manager | A new profile would need Keychain/platform authority while denying every native tool and project read. Existing auth-only process has broader platform reads and cannot execute turns. Those grants must not silently become coding grants. Additional boundary design, owner approval and OS qualification would be required. | Not implemented. Do not repeat token delegation experiments or enable the auth-only process for coding. |
| B: provider API SDK | Official Responses/function-calling supports host-owned tools; requires separately configured API credentials and secure host storage | Viable design, but adds credential onboarding, Keychain/SDK integration, another adapter and independent API billing. ChatGPT subscription quotas cannot be assumed to pay API charges. More new code/packaging surface than reusing the current protected adapter. | Deferred. No SDK/dependency/account/key was installed or obtained. |
| C: pinned OpenCode ACP | Official 2.1.2 ACP stdio, isolated provider-managed authentication, existing task-bound MCP/file services | Existing sandbox, broker, TaskEngine, SQLite, process ownership and draft machinery. No new OS grants or credential bridge. Add only exact native consent and accounted single Ask transport. Provider cost depends on the chosen provider/model and account. Existing macOS ARM64 packaging suffices. | **Selected and implemented for controlled zero-tool Ask validation only.** |

Official references: [OpenCode ACP](https://docs.opencode.ai/docs/acp/), [CLI/auth](https://docs.opencode.ai/docs/cli/), [permissions](https://docs.opencode.ai/docs/permissions/), [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Responses function calling](https://developers.openai.com/api/docs/guides/function-calling). Current documentation does not override the pinned executable/version tests.

No new daemon, scheduler, journal, native helper, dependency or global credential import was added. The OpenCode and Codex OS sandbox factories are unchanged. A future Codex transport with extra Keychain/filesystem authority still requires a concrete policy review and explicit owner approval before implementation.

## Implemented path

1. **Chat → Settings → Review one OpenCode Calculator Ask** launches an owned worker. It accepts only project/private-state/pinned-executable arguments, never a prompt, key or renderer consent.
2. Verify the native artifact (`3f01e2ba8efd4242c638add9248b88696221d76588d9511e63cb2d727c278fcc`), isolated context metadata, real model catalogue and the unchanged disposable Calculator baseline. Missing setup fails before creating a task or consent. No browser login starts automatically.
3. Owner selects an actual discovered `provider/model`. Reasoning is Provider Default. A native modal displays that exact model, workspace, the fixed prompt, quota warning and limits. The renderer cannot approve, expand or replay it. Cancellation ends the worker and cancels an unsubmitted prepared task.
4. Existing host-only review/approval capabilities commit consent in the same SQLite TaskStore. TaskEngine creates its ordinary execution lease/segment and starts the actual protected adapter.
5. Actual ACP initializes; selected model and read-only plan mode must be confirmed. Repository identity, scope, executable, task configuration and the isolated credential-file metadata must still match.
6. The adapter issues a private, single-use prompt transport. The same campaign dispatcher FULL-sync reserves the request and marks `submitting` **before** the only `session/prompt`. No arbitrary live callback is admitted. A matching stream event or final ACP response provides acknowledgement; failures/interruptions conservatively retain `uncertain` and spent reservation. There is no reconnect, retry or fallback.
7. Text streams into native Chat and ordinary task history. Local cancellation/deadline closes only owned processes, including OpenCode's private server. Unverified cleanup retains ownership fences. Normal provider tasks, Agent, ContextFlow and automatic switching remain guarded.

### Credential and tool boundary

`openCodeAccountContext` uses strictly canonical path (including rejection of symlinked context roots), filesystem identity, owner/mode/link checks and credential-file size/timestamps. **It never reads credential contents.** Ordinary runtime directory changes do not invalidate it; credential replacement or modification does. This binds a particular isolated credential-store state, not a proven account name, entitlement or valid token. Provider refresh may invalidate review; that fails closed without an automatic new approval or request. Authenticated startup/refresh with the owner's actual account remains untested.

The official OpenCode SDK continues to manage its own credentials inside the existing owner-only per-project context. This is not Codex Keychain delegation or a new Keychain-backed OpenCode store. No key reaches renderer, source excerpt, task journal or file broker. The underlying provider/account must be configured by the owner using **OpenCode Setup**, and its costs must be reviewed separately. The current owner context has no credential-file metadata; real authentication is **BLOCKED — OWNER SETUP REQUIRED**.

This first campaign never activates MCP file execution. Metadata `initialize`/`tools/list` still occur, but **zero MCP tool calls** are allowed. All provider permission/tool requests are refused and stop the campaign. Source/project reads and writes stay denied by the unchanged OS boundary; only the approved public source excerpt is supplied as prompt text. SDK private state and trusted SQLite journals still write normally; “zero writes” refers to provider source/project mutation, not those required state records. API/network SDK behavior is not simulated as a secure general coding success.

## Exact future Ask scope — not authorization

- Provider: **OpenCode 2.1.2**, macOS ARM64, fixed native artifact above.
- Underlying model: **not yet selected**. Owner must configure the isolated provider and select an advertised exact `provider/model`; catalogue presence is not entitlement. No automatic cheapest-model guess or substitution.
- Account: owner-configured isolated project context; actual identity and access unverified. No imported global/Codex account.
- Reasoning: **Provider Default**, no invented variant.
- Source: existing **229-byte Calculator excerpt**, baseline commit `ac00214528f004350bbd7b53349861726e270323`; fixed prompt SHA-256 **`dfe2704168df0eb12655b1a5401b9b41aff59331519b03e4b0189c307f33cc96`**. Exact text is displayed in the native review and preserved in the existing readiness report.
- Limits: **one outer ACP prompt submission**, **120-second local deadline**, **zero allowed tools/MCP tool calls/project writes**, no host retry, parallel request, follow-up, model fallback, Agent edit or ContextFlow transfer.
- The submission cap does **not** cap provider-internal inference calls/retries, tokens or total cost. MCP metadata messages are separate from tool calls. This adapter does not report invented token usage. Subscription/API quota impact and exact cost remain unknown until the selected provider/account exposes them.

**Not ready for an exact spending approval yet:** the owner's isolated provider setup and model choice are missing. Once those non-inference gates pass, the native review can present the fully bound proposal for fresh explicit approval. Earlier Codex approvals cannot authorize OpenCode. No such approval was created or consumed in this task.

## Qualification

- **411 passed, 0 failed/cancelled/skipped**, Node 26.12.1, 162904.971125 ms. The 399-test baseline is retained. New deterministic checks cover native decline/expansion/model/prompt rejection, durable request-before-submit, success, missing consent, timeout, disconnect, tool denial and cleanup. Existing SQLite crash/restart/replay/expired-consent and ContextFlow regressions remain in the total.
- Real empty-context owner-worker preflight: startup/shutdown and certified process cleanup; **zero tasks, consents, model requests or source changes**. It does not prove authenticated model access.
- Real pinned ACP Ask/Agent metadata initialization, MCP catalogue, repository boundary and process ownership probes passed without `session/prompt`. Existing OS denial tests and deterministic Java accept/reject workflows passed; their generated responses are fixtures.
- Source dependencies, syntax, extension host, Keychain/auth-worker, Codex controls, build, notice inventory and packaging passed sequentially.
- **18 copied-DMG steps passed**: read-only image/mounted-copy integrity, deep/strict pre/post signatures, native host/Java/editor/Git/search/terminal, Chat, routing, restoration, provider/security probes, the new empty-auth owner-worker preflight and deterministic Java workflow.
- Clean development source `3953f079befbca785374ed0aa2ee3d1230e04b53`, version `0.1.0-alpha`, ad-hoc/unnotarized. DMG SHA-256 **`ef76d371a3164edf16eaaf948a143c8ca5064b3df553181e5cb713e1a00d076b`**. No public installer or release was published. `/Applications/CODOVYN.app` was not changed.

[Machine-readable evidence](../assets/opencode-ask/qualification.json), [empty-auth worker result](../assets/opencode-ask/empty-auth-preflight.json), [actual copied Settings screenshot](../assets/opencode-ask/settings.png). The screenshot uses clearly labelled fixture authentication messages, not a genuine account or live AI response. Automated desktop checks are not a human usability test.

**Actual model submissions: zero. Real Ask, coding, usage/cost and ContextFlow success: unverified.**

## Independent release work

The official latest-release API now advertises **VSCodium 1.143.17183** (2026-10-26), with an ARM64 archive SHA-256. Two bounded download attempts timed out; partial data was never accepted/executed, and the known pinned editor was retained. A new candidate exists, so the next step is verified archive acquisition and full native runtime qualification, not assuming that upstream has no newer build.

The existing embedded Electron 43.7.3 / Node 24.21.0 remains below the October 21 Node 24.22.1 security release. The separately observed Electron 43.8.3 reports Node 24.22.0 and alone is not proof of October 21 fix coverage. No Electron component was manually swapped. [Official Node security release](https://nodejs.org/en/blog/release/v24.22.1), [Electron version metadata](https://releases.electronjs.org/release/v43.8.3), [captured candidate metadata](../assets/opencode-ask/editor-security.json).

Signing/notarization readiness, contributor templates/backlog and public-release checks already exist and were preserved. Signing credentials, billing settings, repository visibility, releases and the website were not accessed or changed. Hosted CI billing restrictions, embedded-runtime qualification, issue #16, two documented development dependency findings, real Ask/Agent testing, rights review and clean-machine/human QA still block a public alpha. **ALPHA BLOCKED — CRITICAL GATES REMAIN.**
