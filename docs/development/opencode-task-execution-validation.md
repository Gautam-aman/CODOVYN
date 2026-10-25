# Phase 15 — journaled, task-bound OpenCode draft execution

**PRODUCTION OPENCODE CODING EXECUTION: BLOCKED — live inference deliberately disabled.**

The five requested infrastructure changes are implemented and tested: durable
write intents, versioned existing-file edits, non-replaying recovery, integration
into the actual OpenCode adapter, and independent Java test/review validation.
This is new implementation after `0e63581`, not the preceding read-only checkpoint.
Phase 15 is **not declared complete**: authenticated provider coding and live
ContextFlow continuation have not been authorized or tested.

## Repository and implementation commits

Starting local/remote `main`: `0e63581faf1b73bc82790fc9d46be4b20022a068`, clean after
fetch. No branch, stash, destructive synchronization, history rewrite, PR or release.

- `39efe369ea62bced2ef974b1fa2aa3d56cafc6db`: FULL-sync SQLite write intents and
  execution/repository fences before mutation.
- `1c9d737425bae095e9b55befd4c7d39c8294c45d`: conflict-checked native publication,
  isolated draft review, process-kill and cancellation regressions.
- `4cc151008cf71c17f6ab76b0e965e793c54bf79b`: actual adapter/MCP composition,
  typed provider policy, descriptor-lock recovery, deterministic Java workflow,
  readiness diagnostics and bounded startup correction.

Each implementation commit was pushed to `origin/main` and its exact SHA checked.
The application/installer embeds clean source `4cc1510`. A later evidence-only
commit contains this report; the completion message records that final remote SHA.
No application source changed after the clean build.

[Machine-readable summary](../assets/opencode-task-execution/coding-boundary/validation-summary.json)
and [embedded provenance](../assets/opencode-task-execution/coding-boundary/build-provenance.json).

## 1. Durable SQLite write intent

`TaskStore` now persists versioned `draft_write_intents` under WAL with
`synchronous=FULL`. One transaction commits the intent and unsafe tool-start
record **before** the caller can start a native draft mutation. Records bind the
logical task, execution token/segment, configuration digest, repository identity,
relative path, before/after hashes, bounded byte count and private staging/lock
identity. Raw file contents are not stored in this table or file-access audit.

Outcome transitions are fenced by token and segment and cannot be acknowledged
twice. Completion evidence commits atomically with the published/aborted state.
Prepared, uncertain and conflicting operations block ordinary task admission,
conflicting repository execution and ContextFlow preparation. The ownership SQL
contains the unresolved-write predicate inside the atomic admission statement.
There is no second scheduler or journal.

Tests verify visibility across SQLite connections, rollback on journal failure,
wrong-token/segment rejection, reopening pending states, and rejection before any
native writer launch when intent persistence fails.

## 2. Existing draft modification and conflict handling

The host-only native publisher stages bounded content outside the worktree.
Existing-file writes require the opaque version returned by a descriptor-safe
read; the version binds content and filesystem metadata. The native leaf checks
identity, link count, preimage bytes and parent/root identity before publication.
It uses `RENAME_EXCL` for creation and `RENAME_SWAP` for replacement.

The displaced object stays in private staging. After exchange, its identity and
contents are checked against the approved preimage. A concurrent replacement or
edit is not silently reported as successful: it creates an unresolved conflict,
revokes authority and requires review. A conflict can leave proposed content in
the **draft**, with the displaced contents preserved; it never automatically
rolls back over another writer. Host verification and durable completion precede
the tool acknowledgement.

The provider's OS profile remains source-blind and denies project writes, even in
Agent mode. Only the separately scoped native host leaf can mutate the approved
draft. Protected Git/common directories, sensitive/hidden paths, traversal,
symlinks, multiply linked files, nested repositories and cross-device traversal
remain denied. Original-project writes require the existing separate reviewed
patch approval. No shell, unrestricted Git, network executable, MCP extension,
nested-agent or automatic apply capability was added.

Actual macOS witnesses cover successful modification/creation, stale versions,
recreated files, pre-publication conflict, concurrent preimage capture, symlink
substitution, pinned-parent relocation, sensitive/metadata/external path denial,
and unchanged original/external witness files. These are finite controlled race
tests, not a claim of universal resistance to hostile host filesystem activity.

## 3. Crash/cancellation recovery without replay

Every native mutation process is durably registered before receiving `START` or
`COMMIT`. It inherits a task-private descriptor lock that remains held until the
publisher exits. A fresh trusted recovery helper verifies the exact lock object
and kernel lock quiescence. This closes the intent-to-PID-registration crash gap
without guessing safety from a pathname, callback, expired timeout or renderer
boolean. Recovery evidence is host-issued, non-serializable and lease-bound.

Explicit `draft-inspect`/`draft-reconcile` verify process ownership, descriptor
quiescence and the current repository fingerprint before recording reconciliation.
They preserve current draft/preimage contents; they do not repeat or roll back an
ambiguous action. New private OpenCode child groups also have durable ownership
and stop records. Failed/unverified cleanup retains the relevant execution fence.

Three actual `SIGKILL` campaigns stop the owner before native launch, before
native start, and after publication but before journal completion. All preserve
the intent and original repository; explicit reconciliation preserves the
observed draft. Actual lock probes reject a live publisher and succeed after its
exit. Cancellation before commit denies publication; uncertain cancellation
remains reviewable rather than being relabelled as “nothing happened.”

## 4. Actual adapter integration and provider policy

The normal `createOpenCodeAdapter` composes TaskEngine authority, the existing
repository broker, isolated worktree validation, native file services, a
kernel-peer-verified TLS MCP endpoint, ACP and owned cleanup. Ask/Plan advertise
only `read_project_text`; Agent also advertises `write_project_text` after approved
draft admission. Calls are bounded, versioned, serialized for writes and audited.
Direct provider filesystem access remains denied.

Pinned OpenCode source established that the required configuration is the typed
`mcp.servers`, `permissions` and `agents` layout. The file server explicitly sets
`codemode:false`; wildcard denial plus exact MCP rules keep Code Mode, native
file tools and other capabilities denied. ACP registration does not overwrite
this setting. The briefly investigated empty-bootstrap approach was removed.
Source: [pinned MCP configuration](https://github.com/anomalyco/opencode/blob/a517687fde98a7329ada3ae644a01a9fc6c4e99e/packages/core/src/config/plugin/mcp.ts),
[pinned tool exposure](https://github.com/anomalyco/opencode/blob/a517687fde98a7329ada3ae644a01a9fc6c4e99e/packages/core/src/tool.ts).

Catalogue loading is not file-execution authorization. The endpoint rejects file
calls before host activation; tests exercise this over actual TLS/MCP. The normal
adapter never activates file execution or sends `session/prompt` to real OpenCode
in this milestone. A bounded outbound-method ledger independently records that
absence. The deterministic prompt transport is constrained to the current local
Node executable and has no renderer/project/environment opt-in.

The startup regression now distinguishes a verified owned `sandbox-exec` launcher
from an identity mismatch while waiting for exec. UID, parent and birth identity
stay pinned; only the initial verified transition is polled within the existing
1.5-second budget. Replacement after binding still revokes authority. A controlled
FIFO-profile witness proves this transition; deadlines were not enlarged.

ContextFlow binding now covers the adapter, MCP/TLS/peer code, native readers and
publisher, task/recovery authority, journal and draft engine. Old approvals cannot
silently survive an implementation change. Existing one-use, recipient-bound,
same-task, queue and restoration regressions remain intact. No automatic fallback
or live cross-provider continuation was enabled.

## 5. Independent Java read → edit → test → review

A reusable harness drives the **actual adapter** with a fixed local Node ACP/MCP
fixture inside the real provider sandbox. It reads Calculator and its JUnit file,
modifies both through host file tools, persists two published write intents,
checks the unchanged original, runs `mvn -o test` independently, and reviews the
actual Git patch. Acceptance applies only that patch; rejection preserves the
original. Each decision runs **four JUnit tests, exit 0**.

Both decisions passed from source and again using the **copied app's bundled
Node and packaged modules/native sources**. The fixture additionally witnesses
denial of direct source reads/writes, shell and real Git execution. Ask/Plan
cannot obtain the write tool; unsupported tool requests interrupt execution.
These are real OS/file/SQLite/Java/Git results with deterministic provider
responses, **not** authenticated inference or provider self-reported tests.

[Source Java evidence](../assets/opencode-task-execution/coding-boundary/source-opencode-draft-workflow-validation.json),
[copied Java evidence](../assets/opencode-task-execution/coding-boundary/copied-opencode-draft-workflow-validation.json).
Fixture execution-fence tokens are redacted in committed evidence.

## Verification results

Environment: Apple M2, 8 GiB, macOS 27.0.1 ARM64, Node 26.9.0, CLT installed.
Heavy native checks ran sequentially.

| Evidence class | Result |
| --- | --- |
| **REAL OS SECURITY VERIFIED** | Native read/write/lock/denial/race witnesses; existing Git/shell/helper/injection restrictions preserved. |
| **TASK AUTHORITY VERIFIED** | Actual SQLite leases/segments, task-bound file service, revocation, crash fencing and explicit recovery. |
| **REAL ACP VERIFIED** | Real official OpenCode 2.1.2 Ask/Agent initialization from source and copied runtime; scoped MCP catalogue loaded, prompt blocked, original unchanged, cleanup verified. |
| **DETERMINISTICALLY TESTED** | **330 passed, zero failed/cancelled/skipped**, syntax checked 166 JS files; Java accept/reject and Ask/Plan/tool-denial workflows. |
| **LIVE INFERENCE UNVERIFIED** | Zero real prompts; authentication, entitlement, coding responses, live handoff, token/cost savings unverified. |

Real executable SHA-256:
`3f01e2ba8efd4242c638add9248b88696221d76588d9511e63cb2d727c278fcc`.
[Source actual-adapter trace](../assets/opencode-task-execution/coding-boundary/source-opencode-task-execution-validation.json)
and [copied trace](../assets/opencode-task-execution/coding-boundary/copied-opencode-task-execution-validation.json)
contain only `initialize`, `session/new` and `session/set_config_option` outbound
methods. Validation tasks intentionally end interrupted by the live-prompt guard,
not as successful coding tasks. Copied traces separately record documentation-dirty
outer harness state and clean embedded build provenance.

An earlier parallel full-suite trial had one crash-fixture deadline failure.
The fixture lacked complete cleanup if preflight failed before its forced-kill
point; that path now cleans all owned resources and preserves error diagnostics.
The original preflight failure itself was not conclusively reproduced and is not
attributed to the unrelated workspace-search issue.
OS-heavy tests are serialized for this Mac. The final 330-test run passed in
123.36 seconds; no timeout, assertion or security test was weakened or skipped.

Commands executed successfully: `npm ci --ignore-scripts`, `npm run check`,
`npm run test:extension-host` (VS Code 1.143.1), `npm run build:desktop`, all four
native host/Chat/routing/restoration scripts, and `npm run package:desktop`.
All four native suites passed again against the copied DMG. Native host Java
validation separately passed three baseline tests. Chat verified queue,
ContextFlow review, persisted model/effort state and actual metadata-only provider
readiness over two launches. Routing still reports DOM focus observability
unavailable; no broader accessibility certification is claimed.

[Actual copied provider-settings screenshot](../assets/opencode-task-execution/coding-boundary/copied-provider-readiness.png)
shows the implemented draft boundary and explicit inference block. It is not live
Chat evidence. Issue [#16](https://github.com/Gautam-aman/CODOVYN/issues/16) remains
open; successful search regressions do not establish its root cause.

## Fresh installer and cleanup

- Image: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`.
- Embedded source: `4cc151008cf71c17f6ab76b0e965e793c54bf79b`; `sourceDirty:false`.
- SHA-256: `3353b9ab650589f5e17c831989e913fa168415b0a19846070ad62de43c8d048c`.
- Independent integrity verification, read-only mount, mounted-bundle deep/strict
  signature check, disposable copy, detach and copied signature check passed.
- Copy: `/private/tmp/codovyn-coding-copy-n9fey0gz/CODOVYN.app`.
- Copied adapter/Java workflows and native suites passed; deep/strict verification
  passed again after testing. Ad-hoc signed; `stapler validate` exited 65.
- [Cleanup evidence](../assets/opencode-task-execution/coding-boundary/cleanup-verification.json):
  **30 recorded process groups checked, zero survivors**; ten saved native
  lifecycles exited 0 with empty survivor arrays. No unrelated process was signalled.
- [Image/provenance evidence](../assets/opencode-task-execution/coding-boundary/image-verification.json).

`/Applications/CODOVYN.app`, owner settings/projects, Keychain and Gatekeeper were
not modified. No generated installer or credential was committed; no feature branch, PR or
public release was created.

## Remaining gates and limitations

The new execution boundary is verified for the tested deterministic and metadata
scenarios. **Production live coding remains blocked**, as explicitly requested.
Authenticated OpenCode/Codex coding and live ContextFlow require separate owner
consent and independent correctness checks; Phase 15 is not declared complete.

The file interface is bounded UTF-8 in existing directories, not a general
filesystem/shell service. It rejects unsupported filesystem cases rather than
expanding permissions. Same-filesystem staging and CLT helper provisioning are
currently required; Java validation requires Java/Maven and cached pinned offline
dependencies. Staged preimages remain private review evidence; this milestone does
not add general storage-retention policy or prove every hostile-host race or
physical power-loss outcome. Other platforms and public distribution are unverified.

The fresh dependency audit still has two high development findings and zero
production-graph findings; no suppression/unsupported override was applied.
Hosted [run 40170788581](https://github.com/Gautam-aman/CODOVYN/actions/runs/40170788581)
failed all three jobs with **zero steps executed**. Its annotation cites failed
recent payments/spending limits. Resolve GitHub Billing & plans and rerun; local
passes are not hosted CI verification. Workflows and billing were unchanged.
