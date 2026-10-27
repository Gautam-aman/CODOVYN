# OpenCode Ask failure investigation

Starting remote: `e7f01e696a5d66324480db2588ab4f7dc16cb25b`. Authentication and UI fix: `8e010662b59b2fdc4d8ae1cdad97272148a96836`. This investigation sends **no inference** and does not create spending approval.

## Verified failures and changes

1. **Authentication-context validation, before TaskEngine admission.** The worker required legacy `data/opencode/auth.json`. Official pinned OpenCode 2.1.2 instead persists integration credentials in `opencode.db`. The isolated owner context has two stored integration records and no legacy file. The old requirement rejected completed setup; this was not evidence of failed authentication. The fixed read-only metadata check passes against that context.
2. **Models feedback.** Discovery was asynchronous while feedback appeared in a remote global status area. Provider Settings now immediately shows local, accessible loading, completion and stage-specific error feedback and disables duplicate refresh while pending. Catalogue presence is not entitlement or authenticated-inference proof.
3. **Vanished disposable workspace.** On resuming validation, the original temporary Calculator directory is absent. The Ask bootstrap previously threw before its error handler. It now emits a fixed repository-identity diagnostic and certifies that no provider, store or helper was opened. General discovery rejects missing, non-directory and aliased workspaces before executable startup. This does not relax repository authorization or recreate the old fixture/consent.

The exact official source inspected was OpenCode commit `a517687fde98a7329ada3ae644a01a9fc6c4e99e`, credential schema and auth handlers. Supported binary SHA-256 remains `3f01e2ba8efd4242c638add9248b88696221d76588d9511e63cb2d727c278fcc`.

## Credential and diagnostic boundary

The database is opened read-only, extensions disabled, trusted schema off, query-only and a bounded busy timeout. Fixed queries inspect visible schema and non-secret credential identity/selection/revision columns only. Credential values and account labels are never selected. Canonical directory ownership, permissions, regular-file/link checks and filesystem identity are revalidated. No migration, global import, provider configuration rewrite or credential-format decoding occurs. Ordinary SDK cache writes do not invalidate consent; credential metadata revision/selection changes do. Stored configuration does not prove valid authentication, quota or account identity.

Public diagnostics use a closed host-owned vocabulary: executable, authentication context, catalogue/selection, repository baseline/identity, sandbox startup, ACP, MCP, task admission, consent and cleanup. Arbitrary provider stderr, exception messages, private paths, account labels and IPC error text are not rendered. Failed/uncertain request accounting remains visible and never triggers an automatic retry. Existing OS grants, process ownership, native one-use review and submission reservation remain unchanged.

## Accounting and non-inference evidence

The existing owner TaskStore was inspected read-only before further checks: tasks **0**, campaign consents **0**, campaign requests **0**, execution leases **0**. No uncertain submission exists. No `prepare`, approval or prompt was issued by this investigation. The original Calculator path is absent; its current file integrity cannot be re-certified and it was not recreated or modified. The installed application was not replaced.

Earlier checkpoint validation reproduced the old generic failure, then obtained 39 advertised models through the fixed source worker. A subsequent packaged owner-context probe reported sandbox startup failure and retained its cleanup fence. Its underlying exception was not retained in the surviving temporary evidence; its precise cause remains **unproven**, not silently resolved.

After resuming, a new disposable Git-backed Java project was used only for metadata discovery with the existing isolated provider context. One packaged metadata attempt failed; a second explicit diagnostic attempt completed with **39 models**. No `session/prompt` was sent. This proves a successful metadata path, not consistent startup, authenticated access, real AI, or coding readiness. No inference retry occurred.

## Qualification

Current full `npm run check`: **418 passed, 0 failed, 0 cancelled, 0 skipped**, 125390.038708 ms, Node 26.12.1. Focused authentication/consent/diagnostic tests: **17 passed**; additional workspace/CLI run: **5 passed**. Counts overlap and must not be added.

The first full run was **414 passed, 3 failed, 1 cancelled**: shutdown fixture readiness timeout, Java accept Maven timeout, Java reject timeout, and version-diagnostic fixture startup. The version fixture embeds `process.execPath` in a shebang, which fails when that executable path contains spaces. Qualification used an integrity-checked byte-identical copy of packaged Node at a space-free temporary path; its code signature was verified. All four failures then passed unchanged in isolation, followed by the clean full run above. No assertion, production permission or timeout was relaxed. The precise cause of the first run’s timing failures remains unproven.

 Historical checkpoint: 416 unit/integration tests and 18 copied-DMG steps passed, including UI fixture assertions; these are not live inference evidence. The owner-specific packaged failure above is separate from those fixtures. No sandbox restriction or failing assertion was removed.

## Remaining gates

- Restore/open an owner-approved disposable Calculator through the normal host workflow; the vanished pathname cannot retain authorization.
- If sandbox startup fails again, preserve safe substage/lifecycle evidence before closing; keep the execution fence if cleanup is unverified.
- No request is authorized by this debugging task. Fresh exact provider/model native review and explicit spending approval remain required before any inference.
- Agent execution, ContextFlow live continuation and public release remain blocked. Ad-hoc development signing is not notarization. Historical issue #16 and hosted CI billing restrictions are not resolved here.
