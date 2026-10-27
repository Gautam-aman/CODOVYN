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
