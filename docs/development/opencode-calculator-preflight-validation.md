# Persistent Calculator recovery and OpenCode preflight

Starting remote: `900948064ffe74f1aa865c0178719a3d5564453e`. This work authorizes no inference, Agent editing or credential migration by implication. No existing spending approval is reused.

## Calculator — recovered, not regenerated

Persistent location: `~/Library/Application Support/CODOVYN Validation/Calculator` (product-specific disposable data, outside test-cleanup temporary roots). The destination parent is private/canonical and the recovery helper refuses any existing destination.

A bounded search of surviving CODOVYN validation fixtures found four object stores containing the approved commit. Recovery copied the **17 existing content-addressed objects**, verifying each object's Git hash, then reconstructed only the six approved files. No author, date, tree or commit metadata was generated to imitate history. The original physical directory and filesystem identity were not recovered; the restored workspace has a new identity and must receive fresh authorization.

- Actual baseline: `ac00214528f004350bbd7b53349861726e270323`.
- Calculator SHA-256: `dee76c8f9584ba9286e2bd67948499030760f3978bb6a3e4074cbcf731088c26` (229 bytes).
- Original fixed prompt SHA-256 remains `dfe2704168df0eb12655b1a5401b9b41aff59331519b03e4b0189c307f33cc96`.
- Git object verification and clean working-tree verification passed. No allowlist or baseline migration was necessary.
- All tracked files are the known public fixture: README, ignore rule, Maven manifest, two Java classes and one test class. No credentials, provider configuration, environment files or remote URL were copied.
- Actual Java 17 offline Maven/JUnit baseline: **3 tests, 0 failures, 0 errors, 0 skipped**, exit 0. The deliberate division-by-zero defect is preserved; this task does not edit it.

`recover-calculator.js` takes an existing public fixture object store and an exclusive new destination. It never restores credentials, execution leases or approval. The regression verifies exact commit-object bytes and source hashes, ignores dirty source working-tree files, and refuses to overwrite an existing destination.

## Startup investigation — bounded metadata only

Three sequential real OpenCode 2.1.2 metadata cycles against the recovered Git-backed repository succeeded, each returning **39 advertised models**, with repository/source and credential-metadata freshness unchanged and all recorded owned groups absent after cleanup. No prompt, tool execution or model-access claim follows from this result.

The new host-only inspection seam records a fixed, bounded vocabulary: repository reader, identity, broker build, sandbox admission, model catalogue, ACP ownership, initialize, session, configuration and cleanup. Only stage, status and elapsed milliseconds are emitted. No provider output, stderr, paths, account names, credentials or session IDs are forwarded. Observer failures cannot skip cleanup. Existing deadlines, sandbox grants, single-use approvals and request accounting are unchanged. The qualification harness stops at the first failure or uncertain cleanup rather than retrying.

The prior intermittent failure has **not reproduced** in these three cycles. Its historical root cause remains **unproven**. Successful repetitions are not a fix or a reliability guarantee. The ACP SDK's metadata-only session default is not a cost-based model selection or a proposed spending request; no supposedly free model was selected for a live review.

MCP catalogue initialization is not started by this catalogue-only path: task execution authority is not granted before native approval. Existing actual TaskEngine/MCP initialization regressions remain separate from this evidence.

## Authentication-context migration gate

The existing owner-only isolated context is bound to the vanished project's canonical pathname. The persistent recovered project resolves to a different context namespace. Its identical Git commit is **not** authority to silently move credentials or reuse approvals.

Owner approval has been requested to move the existing isolated Calculator context within the same private CODOVYN profile, without global credential import or model requests. Until that explicit decision arrives, the original context remains untouched. No credential values or account labels have been read. Native account-bound model selection and cancel-before-submission review cannot be claimed qualified until the intended context is legitimately associated with this workspace.

## Regression qualification

Final source `npm run check`: **420 passed, 0 failed, 0 cancelled, 0 skipped**, 129845.132167 ms, using the integrity-checked packaged Node 26.12.1 at a space-free path. Focused recovery/diagnostic/provider cases: **13 passed** (overlapping tests, not additive). A clean copied-app qualification follows this source checkpoint and is recorded below once complete.

**Inference submissions: 0. Native spending consent: not granted.** This report does not authorize a request. If the context migration or native review cannot be verified, the next owner gate remains preparation—not inference approval.

## Native and final qualification

Clean implementation source: `b36e47de4a5d5a2b18eb9a9206d72ee79959e6ef`. [Sanitized evidence](../assets/opencode-calculator-preflight/validation.json) includes every recovered file hash and the fixed prompt digest.

- Clean build, DMG verification/read-only mount/disposable copy, deep/strict signature, extension host and copied native host/Chat/routing/restoration: passed. The public installer and installed application were not modified.
- The latest copied app was also opened against the **actual persistent Calculator** and existing owner profile. Workspace Trust was initially restricted, then granted through native Workspace Trust UI for this exact known public fixture. The real extension API confirmed the correct root, enabled trust and source hash. The exact trusted URI persisted in the isolated machine-scoped shared store; no parent-folder trust was added.
- Actual Settings → Inspect installed agents → OpenCode Models displayed immediate loading and then **9 catalogue entries** for the new, unconfigured namespace. All **40 recorded metadata groups** were absent afterward. No fixture response or fabricated UI event supplied this catalogue.
- The already configured old context still has **2 integrations** and passed safe metadata validation; the new native context has **0**. Three host-only diagnostic cycles using the unchanged old context returned 39 entries. This distinction demonstrates namespace isolation; it is not model entitlement or successful native account migration. Passing a context to metadata diagnostics does not associate it with a workspace or grant task execution authority.
- Existing real TaskEngine/official-ACP metadata harness also passed both its read-only and draft-capable **initialization-only** cases: task-bound MCP `initialize`, `notifications/initialized`, `tools/list`, no prompt, no file mutation, released leases and verified cleanup. These use separate disposable journals, not the owner’s pending live campaign; they are not Agent coding tests.
- Intentional native shutdown certified cleanup of all **8 observed owned app processes**. The persistent disposable application was then relaunched normally and left open, without the observer/test extension or remote-debugging switches; the qualification debug port is closed.
- Final owner journal: **0 tasks, 0 consents, 0 campaign requests, 0 execution leases**. Every recovered source hash and the clean Git baseline remain unchanged. No inference, model tool call, sign-in, sign-out or credential migration was performed. Pre-existing unrelated OpenCode processes were not terminated.

The sandbox-admission observation represents host policy validation/construction; successful protected catalogue/ACP launches and the existing OS-denial regressions provide separate kernel-boundary evidence. Observation alone is not a new permission or proof of authenticated model access.

Development DMG source: `b36e47de4a5d5a2b18eb9a9206d72ee79959e6ef`; SHA-256 `8721a8353649b6c2476dccbfea9a3eec592ab6a0d90b02a03d05512e907acfc9`. Ad-hoc signed/unnotarized, not published. A final documentation-only commit follows; remote SHA is verified after push in the handoff.

## Remaining owner gate — context association, not spending

**BLOCKED:** awaiting the explicit context-migration decision already presented to the owner. No credential move was inferred from elapsed time or from the unchanged commit hash. Neither context currently has observed OpenCode file users; migration must recheck this and preserve the newly generated unconfigured cache rather than overwrite it.

After legitimate association, the remaining native qualification is: refresh the intended account’s catalogue, select an explicitly named discovered model without assuming any “free” label guarantees cost/access, inspect the exact native quota/limit/prompt review, **cancel before submission**, and verify the resulting cancelled-task record, zero consents/requests and process cleanup. This has not been claimed complete. The existing deterministic consent/cancellation regressions are not a substitute.

No exact live-model spending proposal is ready yet because that native account-bound selection/review is still pending. Once it passes, any live Ask requires fresh explicit approval. There is no inference approval in this task. Hosted CI billing, historical search issue #16, live provider access and public distribution gates remain unchanged.
