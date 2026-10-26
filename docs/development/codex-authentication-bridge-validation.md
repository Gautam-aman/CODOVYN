# Codex authentication-to-coding compatibility — 2026-10-26

## Result

**BLOCKED — no suitably isolated supported delegation interface was found in pinned Codex 0.164.0.** Persistent Keychain authentication is retained. Coding execution remains disabled. No token extraction, credential copying, custom credential format, plaintext fallback, Keychain grant to coding, auth-process coding execution or automatic inference was added.

This is a verified incompatibility under the requested constraints, **not a completed bridge**. Owner inference consent alone cannot resolve it. A future supported provider interface must delegate authenticated requests without exposing raw credentials or expanding the coding process's OS authority, followed by independent security qualification. No new spending approval is requested now.

Starting `main`: `32b3c1372bbbe010cc3ebcae44f18a6ef67ca76d`; tested implementation / clean installer source: `d650b8dab1bc7d48c3334cab56d28979d8e6a02b`. The documentation/evidence commit follows that implementation. The final remote SHA is verified after documentation push and reported in the handoff.

## Official interface and minimum trust boundary

The pinned native ARM64 executable is SHA-256 `d8990e3ee7acfbc26f91265b12a1a83f0fee40d0e0f8f1f40a37d4ec21f499cf`. Reviewed source is official commit `6aaac694803004a63c6f393d153c96d22521a6b9` (rust-v0.164.0).

- Managed ChatGPT sign-in persists/refreshes credentials in the SDK's auth manager using the isolated canonical CODEX_HOME and strict OS keyring. Normal execution uses that process's auth manager.
- `account/read` exposes account/status metadata, not a delegated credential handle. A successful account check is not a transferable execution capability or inference authorization.
- The external `chatgptAuthTokens` variant requires a client-supplied raw `accessToken` and account identifier. The pinned source explicitly marks it unstable/internal-only and experimental. Implementing it here would require the forbidden credential extraction/import path; it was rejected before dispatch.
- The native generator includes that variant in both default and experimental login schemas. Their presence and identical hashes do **not** establish stable support. Tests record this rather than falsely asserting that default schema entries are safe.
- The official Sign in with ChatGPT integration guide describes a separately host-managed OAuth/access-token lifecycle. It does not provide a credential-free handle to the existing isolated Codex Keychain login. Creating another OAuth/token-handling integration would not meet this task's constraint.
- The pinned official `codex-responses-api-proxy` was also reviewed. Its documented inputs are a raw API key via stdin or GitHub Actions OIDC credentials, not the isolated managed ChatGPT Keychain identity. It cannot bridge this account without adding a different credential source or forbidden extraction. No proxy was started.
- Reusing the auth-only process for coding would put execution inside its broader platform-authentication read/Keychain boundary. Granting Keychain access to coding would expand the verified coding sandbox. Both alternatives were rejected. No remote proxy, daemon, experimental API, unsupported RPC field or provider upgrade was introduced.

Sources: [official app-server documentation](https://learn.chatgpt.com/docs/app-server), [official integration guide](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server), [pinned account protocol](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server-protocol/src/protocol/v2/account.rs), [pinned account processor](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/request_processors/account_processor.rs), [pinned storage](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/login/src/auth/storage.rs), [pinned proxy documentation](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/responses-api-proxy/README.md). Reviewed file hashes accompany the evidence.

## Implemented security fixes

The account-context binding is now cleared before account metadata refresh and sign-out, on account-change notifications, and on failure/disposal. An account transition rotates the private nonce, so a previously approved account binding cannot be reused after switching away and back. A transition racing an account-read reply rejects the reply instead of restoring stale eligibility. Failed logout invalidates local eligibility even when provider-side logout is unconfirmed; it does not falsely claim that the stored login was removed.

The native controller invalidates its Signed in view after a provider account transition and requires an explicit status check. It never initiates login, token import or inference in response. The Ask diagnostic now states the pinned provider incompatibility. The authentication-only process still cannot bind TaskEngine execution, start threads, submit turns or grant tools. Unsupported login imports are rejected locally before dispatch.

The coding sandbox factory is byte-identical to the starting revision. Filesystem, shell, Git, network executable, credential and project-write restrictions remain unchanged. Persistent identity storage remains strict Keychain; ordinary cleanup retains it. No renderer, prompt, SQLite record, Git artifact or evidence receives credential material. Existing TaskEngine, SQLite consent/request accounting, one-use approvals and process ownership are reused unchanged; no second journal or scheduler exists.

## Reproducible non-inference OS witness

Run `node scripts/validate-codex-auth-bridge.js` with the qualified runtime on the supported Mac. It accepts no account, credential, model or prompt arguments.

1. Generate the actual pinned binary's default and experimental protocol schemas inside the unchanged coding profile.
2. Store a **public deliberately invalid synthetic API-key string** through the official CLI in a new disposable isolated Keychain namespace. This is not a real account/login or inference result.
3. Verify a fresh official process in the auth boundary restores that witness.
4. Attempt the same strict keyring identity with the coding profile. Even an explicit test-only HOME/CODEX_HOME/strict-keyring selection cannot restore it. The production factory is not changed to accept this selection.
5. Verify the witness remains readable in the auth boundary; verify authentication-only thread/turn/import guards and absence of plaintext auth.json.
6. Remove only the synthetic identity through official logout, certify all owned groups empty, and remove temporary state. Raw provider output is bounded/discarded.

**REAL OS VERIFIED:** the positive auth witness succeeds and the negative coding witness fails; provider/broker access was not broadened. The test passing means the incompatibility was reproduced safely, not that a bridge or real coding task succeeded.

## Qualification and evidence

- **399 passed, 0 failed/cancelled/skipped**, Node 26.12.1, 134554.772708 ms. Existing positive guarded-turn, cancellation, SQLite request-budget/replay, TaskEngine/ContextFlow, file mediation and Java draft regressions remain in this full total. Fixture turns are not inference.
- Focused auth/controller tests: 30 passed; these overlap the full total.
- Dependency installation, extension host, native Keychain witness, auth-worker restart/cancellation/termination, new bridge compatibility witness, restricted Codex metadata/thread startup and TaskEngine control checks passed.
- Clean desktop build, notices and development DMG packaging passed. **All 17 copied-DMG steps passed** sequentially: image integrity, read-only mount/detach, deep/strict signatures before/after, native host/Java/editor/search/Git/terminal, Chat, routing, restoration, provider/task controls, public Keychain witness, new bridge witness, native worker cleanup and Java draft workflow.
- Development DMG SHA-256: `b6f131c0df42a2fbae4e6bee8045b515b2ae0b0b54eb0afeeb08fb9fa0c88da8`. It embeds clean source `d650b8dab1bc7d48c3334cab56d28979d8e6a02b`, version 0.1.0-alpha, ad-hoc/unnotarized. No signing credentials were accessed.
- The current stable owner profile has zero tasks, events, campaign consents, requests and active leases. Its separate historical profile was not rewritten. The six Calculator file hashes match the prior checkpoint and its Git working tree remains clean.
- Test-owned groups were certified empty. The existing owner-controlled application was not closed or replaced. No browser sign-in, owner logout, model submission, consent creation or automatic retry was initiated.

See [qualification](../assets/codex-auth-bridge/qualification.json), [real protocol/OS witness](../assets/codex-auth-bridge/protocol-os-witness.json), [source provenance](../assets/codex-auth-bridge/source-review.json) and [copied-app screenshot](../assets/codex-auth-bridge/authentication-settings.png). The screenshot uses fixture-only authentication messages; it is not real account or inference evidence.

## Remaining gates

- **BLOCKED:** supported isolated authentication-to-coding delegation at this provider pin.
- **OWNER ACCOUNT UNVERIFIED:** synthetic Keychain tests do not prove the owner's actual ChatGPT account restart or entitlement. No owner sign-in or sign-out was initiated during this task; global credentials were not imported or modified.
- **LIVE INFERENCE NOT TESTED:** zero model submissions, Agent edits, ContextFlow transfers or automatic fallbacks. No spending consent was created, consumed or renewed. No inference proposal is actionable until the bridge/security boundary passes.
- Existing hosted-CI billing restrictions, issue #16, dependency findings, signing/notarization and release gates remain separate. Successful native runs do not close issue #16. The ad-hoc development installer was not published and `/Applications/CODOVYN.app` was not replaced.
