# Persistent isolated Codex authentication — 2026-10-26

## Result

**IMPLEMENTED / REAL OS KEYCHAIN VERIFIED WITH SYNTHETIC WITNESSES:** stable isolated identity, strict `keyring`, fresh-process credential restoration, namespace-specific logout, plaintext-file rejection, and certified process cleanup.

**OWNER ACCOUNT AUTHENTICATION / RESTART: NOT YET VERIFIED.** No browser login was started by automation. The official CLI stored deliberately invalid public API-key strings for the storage tests; those are not a genuine account, entitlement or inference result.

**CODING EXECUTION: BLOCKED.** The persistent authentication component cannot start threads/turns, bind TaskEngine authority, grant tools or accept inference consent. A credential bridge into the unchanged restricted coding runtime is **not implemented**. The new persistent identity must not silently re-enable the old memory-only Ask path. No model request, Agent edit or ContextFlow transfer was performed.

Starting main: `b7d3c28182d4e0c74f5da8847afeed97dfaeedf4`. Implementation: `d244c76` and `2018d71493793993d76a6c009396b01d78205e83`. The clean application/DMG embeds the latter SHA. The final documentation/evidence commit follows it; final remote SHA is reported after push.

## Verified cause and remaining uncertainty

The former `cli_auth_credentials_store="ephemeral"` deliberately kept authentication inside one process. Its `CODEX_HOME` was below a fresh temporary runtime, and ordinary cleanup deleted that runtime. A later worker therefore had neither the same identity nor stored credentials. The owner launcher also created a new temporary editor profile on each invocation, which would change a path-derived Keychain identity even after changing the storage setting.

The old controller could replace a worker when Sign in was clicked again. Its generic error cleanup could be labelled `owner-cancel`, so that old reason does not prove the owner deliberately cancelled. Browser completion was never independently confirmed in those sessions. The previous application exit is still **unproven**, not relabelled as a crash.

The new lifecycle separates these observations: owner authentication requested, validated device flow started, matched provider completion success/failure, official account confirmation, credential-store verification, explicit cancellation/dismissal, handler error, deadlines and certified cleanup. Events contain phases/booleans/PIDs, not device codes, account addresses, login IDs, tokens or raw provider errors.

## Official compatibility and identity

The pinned official ARM64 Codex is **0.164.0**, SHA-256 `d8990e3ee7acfbc26f91265b12a1a83f0fee40d0e0f8f1f40a37d4ec21f499cf`. Upstream tag source resolves to commit `6aaac694803004a63c6f393d153c96d22521a6b9`.

Official authentication documentation describes strict `keyring` as failing when secure storage is unavailable; `auto` can fall back to a file, and `ephemeral` is process-local. The pinned macOS direct backend derives its Keychain namespace from canonical `CODEX_HOME`. CODOVYN uses the official storage implementation, not a custom credential format.

Sources: [authentication](https://learn.chatgpt.com/docs/auth), [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference), [pinned storage source](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/login/src/auth/storage.rs), [pinned backend selection](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/config/auth_keyring.rs).

`CODEX_HOME` is now `<editor-profile>/User/globalStorage/codovyn-local.codovyn/private/codex-identity`. It stays in place across worker cleanup. The owner validation launcher uses **Application Support/CODOVYN Owner Validation** consistently; CI/disposable test profiles remain separate. Reopen an owner validation copy through the same launcher/profile, not a new arbitrary profile. Normal IDE profiles have separate accounts by design.

Identity/configuration are owner-only, canonical and checked for replacement, symlinks, hardlinks, permission changes, plaintext `auth.json` and modified storage policy. Invalid live identities are revoked. Global `~/.codex` is rejected, never imported. Temporary runtime, SQLite and log directories are separate and cleaned after shutdown; the persistent identity is retained. Sign Out uses the official scoped account logout rather than deleting another CLI's credentials.

## Security boundary

The coding sandbox factory remains byte-for-byte unchanged, SHA-256 `dfb8100baaea3874eaf38b06520ad426c563a7f6994da47e5ae3e80a560d9c18`. No Keychain grant was added to coding execution.

The **trusted authentication-only SDK process** has a separate OS profile. It permits the platform Keychain I/O needed by the official SDK, its private runtime and identity; it denies general writes elsewhere, subprocess forks, shell/Git/helper execution and plaintext authentication-cache writes. Known raw credential files and global `.codex*` directories remain denied. The authentication profile has broader read access for platform authentication than the coding sandbox. This is not a grant to an untrusted model: the process receives no project/source request and exposes no coding/thread/tool interface.

OS enforcement is **not per Keychain item**. The pinned SDK, immutable configuration and canonical `CODEX_HOME` bind the logical namespace. Those trusted-authentication assumptions are explicit; do not describe the profile as a general-purpose per-item Keychain sandbox. The SDK must not be given task execution authority. Guards reject model/thread requests, experimental API activation, execution binding, forged authentication boundaries and `runApproved` before any dispatch.

Strict plaintext protection is enforced before mutation: even a counterfactual CLI override to `file` fails to create `auth.json`. Official source at the pin uses that direct file path; unsupported binary hashes are refused. A public credential witness was absent from all bounded scanned SDK state/log files. This is targeted evidence, not perfect secret detection or a complete vendor audit.

The host never forwards credential contents to the renderer or journals. Official CLI status output is bounded in private memory, classified and discarded; it is not logged. Provider stdout/stderr and Keychain contents are not published. The native UI shows the short-lived device code only during explicit owner sign-in. No global Keychain search-list/default/ACL setting, Gatekeeper setting or signing credential was changed by the implementation. Test items were created and removed by the official CLI in dedicated synthetic namespaces.

## Session UX

- Sign in requires a native owner confirmation. A second click cannot replace an in-progress flow.
- Initial account metadata plus official CLI storage status distinguishes stored sign-in from an empty/unavailable store. Secure-store errors fail closed, not as a fabricated Signed in state.
- Device sign-in has a visible five-minute local window. Existing coding request limits are unchanged.
- Owner status refresh starts a fresh worker and uses the official account refresh metadata, bounded to 15 seconds. CLI storage checks have a five-second guard. Authentication network refresh is not model inference.
- Worker idle expiration closes its processes but preserves the identity. Refresh can restore a valid stored account without another browser login.
- Signed in means a stored account and official metadata were verified, not model access or billing entitlement. Keychain/account/refresh failures remain blocked and actionable.
- Explicit Sign Out has native confirmation and removes only this isolated identity. Cancel stops the worker without intentionally logging out a saved account.
- The Settings status region is accessible, with Not signed in, Signing in, Signed in, Session expired and Authentication failed states. Ask remains disabled even if a fixture renderer message says Signed in.

## Qualification

See [machine-readable evidence](../assets/codex-keyring/qualification.json), [Keychain witness](../assets/codex-keyring/keyring-witness.json), [worker restart evidence](../assets/codex-keyring/worker-restarts.json) and [native Settings capture](../assets/codex-keyring/authentication-settings.png).

- **393 tests passed**, 0 failed/cancelled/skipped, Node 26.12.1; 117269.671958 ms. The original regression/security tests remain. Focused test counts overlap this total.
- Dependencies, extension-host, clean desktop build, notices and development packaging passed sequentially.
- **Real OS Keychain:** official CLI stored two public invalid witnesses. Fresh official processes restored one; logout removed it while preserving the second namespace, followed by cleanup of that second item. No plaintext fallback appeared. Matching outside controls succeeded while the auth profile rejected shell, Git and security-helper execution. A forced file-store override was denied before credential publication.
- **Real worker:** three empty-identity lifetimes/two restarts, including hard worker termination and native stdin-EOF provider exit. Identity inode/configuration survived; all recorded provider/worker/CLI groups were checked empty. Actual OAuth/browser cancellation uses deterministic protocol actors; it is not a completed owner login.
- **Copied DMG:** all **16** qualification steps passed: read-only image integrity/mount, deep/strict pre/post signatures, host/Java, Chat, routing, restoration, legacy security probes, actual packaged Keychain/auth-worker checks, Java draft fixture, and notice inventory. The five native authentication UI states use explicitly labelled fixture messages, not genuine account data. No native test clicked Sign in.
- **Integrity/accounting:** all six Calculator file hashes still match and Git is unchanged. The prior owner journal's one unrelated interrupted task/six events remain; campaign consents/requests and active leases remain zero. No inference consent was recreated or consumed.

Development DMG: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`, SHA-256 `4dddb268129a065285c93594041ed201754ac67e584ee6edea823e7e6a56fbf9`. Source `2018d71493793993d76a6c009396b01d78205e83`, clean provenance, ad-hoc signed/unnotarized. It is not a public installer. `/Applications/CODOVYN.app` was untouched. No release was published.

## Owner authentication gate and remaining work

The new copied application is left open with the stable private validation profile. Automated browser logins and actual model submissions in this task: **zero**.

1. In that new build, open Chat → Settings → Sign in to isolated Codex. Its native confirmation must explicitly mention strict macOS Keychain storage. Complete the official browser flow yourself; do not paste codes or credentials into Chat.
2. Wait until CODOVYN reports **Signed in — Keychain stored**. Do not cancel an in-progress flow merely because the browser page completed.
3. Use **Refresh sign-in status**. It restarts the worker and should restore the same stored account without another browser login. This real ChatGPT-account persistence check remains **PENDING OWNER ACTION**.
4. Sign Out is available for the separately intended logout check. It intentionally removes the isolated saved login; it does not affect the global CLI account.

**NOT IMPLEMENTED:** a verified credential handoff from this Keychain component to the restricted coding runtime. The documented external-token mode is experimental and was not enabled. Do not weaken the coding sandbox or expose refresh tokens to work around that gap. Only after that boundary and a real account restart are verified should a fresh bounded Ask proposal/native consent be requested. No Agent, ContextFlow, fallback, retry or inference is authorized by this authentication task.

Hosted CI billing, issue #16, dependency findings and public signing/notarization remain separately documented release blockers. This authentication evidence does not close them or establish public-release readiness.
