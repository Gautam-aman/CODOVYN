# Isolated OpenCode context migration and cancelled native Ask qualification

Starting remote: `cf9978ae1f128383ebdd4668271656a3380ebf1f`.

Implementation commits:

- `67a5b818d25037c27cebf70ee1e298d6a8bc894c` (full SHA in the [evidence](../assets/opencode-context-migration/validation.json)): private-context preservation and submission-disabled qualification.
- `db4f25060373ebe2e40b7ce127dbacedac62c059`: durable cancellation of never-admitted Ask preparations.

A final evidence/documentation commit follows; its remote SHA is verified after push in the handoff. **Actual inference submissions: 0. No inference, Agent editing, fallback or publication was authorized or performed.**

## Authorized migration — verified

The owner explicitly approved moving the previous Calculator’s existing isolated OpenCode identity into the namespace for `~/Library/Application Support/CODOVYN Validation/Calculator`. This did not authorize global credential import or spending.

The operator-only helper is under `scripts/lib`, is not bundled into the provider runtime and has no renderer/MCP endpoint. Its local review capability is single-use and grants no TaskEngine or inference authority. It reuses the existing read-only authentication metadata validator.

Before publication, the operation checked canonical paths, common namespace parent, ownership, safe modes, absence of ACL grants, regular files/directories, no symlinks/hardlinks, bounds, quiescent app/provider use and an empty campaign/lease journal. The bounded opaque copy remained inside the owner-private authentication namespace. The migration helper never decoded credential payload bytes, selected their SQL values, logged them or exported them outside the approved authentication namespace. Transient integrity hashes and copy buffers were not recorded in artifacts; buffers were cleared.

The source remained intact. The destination’s original directory was renamed intact to a private preservation location before the copied identity was published; configuration/cache files were not merged, truncated or overwritten. File snapshots, descriptor checks, byte-copy verification and rollback checks protect this quiescent host operation. This is not a claim of complete race resistance against unrestricted same-user host malware. Observed identity/version changes or unknown cleanup fail closed; failed staged data is not automatically replayed.

**Result:** original stored integrations **2**, restored active stored integrations **2**, matching non-secret identity/selection/revision metadata, a fresh filesystem/account-context binding and no inherited spending authority. The source identity and prior destination cache remain private for rollback. Retained authentication data is not a test artifact; do not assume signing out of the active context deletes the retained source.

One initial preflight stopped before staging or namespace publication: a second read-only SQLite metadata query changed its shared-memory coordination file and invalidated the strict snapshot. Read-only does not mean SQLite never updates SHM read marks. The corrected sequence validates metadata once, freezes the full filesystem snapshot, and rechecks that snapshot without reopening the source database. It does not ignore credential-file or WAL changes. WAL-backed, payload-change, link, refusal, single-use and rollback regressions pass. No ambiguous migration or model operation was automatically retried.

## Model and native review — verified without inference

Official pinned OpenCode **2.1.2**, native SHA-256 `3f01e2ba8efd4242c638add9248b88696221d76588d9511e63cb2d727c278fcc`.

- The migrated context returned **39 advertised model entries**. No catalogue entry is treated as proof of entitlement, funds or successful inference.
- Explicit selection **`opencode/gpt-5.4-nano`** was independently advertised and accepted by real ACP session configuration. Reasoning remains **Provider Default**. No free-labelled model was selected for the review.
- Real standalone Settings → OpenCode Models displayed loading and 39 entries.
- The actual native quick picker selected that exact model. The main workbench modal showed the correct provider, persistent Calculator workspace, fixed prompt, one-submission limit, 120-second deadline, zero tools/MCP calls/writes, no host retry/fallback and quota/cost uncertainty. It also warned that a ChatGPT subscription must not be assumed to cover this provider.
- Qualification used a host-only review-only switch. Both the native controller and worker reject submission in this mode, even if an approval action is accidentally returned. The actual worker flag was verified. This removes authority; it does not widen any sandbox permission.
- **Cancel was clicked in the real dialog.** The latest task transitioned normally to `cancelled` in SQLite. The preparer PID disappeared, the journal had no open worker and there was no execution lease or campaign reservation.

The owner’s macOS-native dialog style was not visually exposed to the automation during an earlier attempt; this is not proof it crashed or failed to display. The supported workbench-dialog style was temporarily used for the inspectable native API modal. The original effective **native** preference was then restored through the settings API, and the app was relaunched normally without the observer, test arguments or remote debug endpoint. The successful workbench-modal qualification does not claim automated visual coverage of macOS NSAlert.

## Cancellation defect found and fixed

The old worker called `TaskStore.update` with only a status, although that API also requires active-agent and step fields. This necessarily failed for a prepared task and could leave it pending without a cleanup receipt. The actual exit trigger of the first preparer was not established; it is not labelled a crash.

The fix uses the existing strict TaskStore API with complete state. Cancellation is limited to a pending preparation with no execution lease and only preparation history. Ambiguous/admitted history is rejected; no model action is replayed or campaign budget reset. Real SQLite regressions cover successful cancellation and refusal of execution history.

The earlier orphan preparation was reconciled only after confirming the preparer was absent, no journal handle remained, and no request/consent/lease existed. Its reconciliation event remains in history. The later successful native cancellation required no such repair. Both records are retained:

| Owner journal item | Final result |
| --- | --- |
| Prepared task records | **2, both cancelled** |
| Spending consents | **0** |
| Campaign requests / attempted submissions | **0** |
| Execution leases | **0** |
| Actual model responses / Agent edits | **0** |

## Repository, security and packaging

- Calculator baseline remains `ac00214528f004350bbd7b53349861726e270323`, clean after qualification.
- All six recovered file hashes remain unchanged. Calculator remains **229 bytes**, SHA-256 `dee76c8f9584ba9286e2bd67948499030760f3978bb6a3e4074cbcf731088c26`.
- Actual Java 17 offline Maven/JUnit: **3 passed, 0 failures/errors/skips**.
- Final full regression: **428 passed, 0 failed, 0 cancelled, 0 skipped**, 123760.876792 ms, packaged Node 26.12.1 at an integrity-checked space-free path. Focused runs overlap this count and are not additive.
- Fresh clean build/package, read-only DMG mount/copy, image integrity and deep/strict copied signature checks passed. Extension-host and copied standalone host, Chat, routing and restoration suites passed sequentially.
- Model metadata processes and the selected-model preflight certified owned-group cleanup; the cancelled preparer’s PID and journal handles were independently checked absent. No unrelated user process was terminated. The final GUI is intentionally open on the persistent Calculator.
- Existing file, shell, Git, MCP, credential and original-project restrictions remain unchanged. General Chat coding, Agent execution and automatic switching were not enabled. `/Applications/CODOVYN.app` is untouched.

Development installer: **0.1.0-alpha**, clean source `db4f25060373ebe2e40b7ce127dbacedac62c059`, SHA-256 `33d6627a330b93178f0fa57e9736f5117b23be36f17f5bfaffe06bd55fe6e675`. Ad-hoc signed and unnotarized; not published.

Historical intermittent metadata startup failure remains **unproven/unreproduced**, not declared fixed. Hosted CI billing restrictions and issue #16 are not resolved by these passing local checks. Live inference and public-release readiness remain unverified.

## Proposed next Ask — separate owner authorization required

| Binding | Proposed value |
| --- | --- |
| Provider / executable | OpenCode 2.1.2, existing pinned native binary |
| Model | **`opencode/gpt-5.4-nano`**, explicitly discovered and ACP-selectable |
| Reasoning | Provider Default |
| Account | Migrated existing owner-configured isolated context; no global import; account identity/balance/entitlement not exposed or proven by metadata |
| Workspace | Persistent public Calculator, unchanged approved baseline |
| Source scope | Only the approved 229-byte Calculator excerpt |
| Exact prompt | [calculator-ask.txt](../assets/opencode-context-migration/calculator-ask.txt), SHA-256 `dfe2704168df0eb12655b1a5401b9b41aff59331519b03e4b0189c307f33cc96` |
| Budget | **1 outer submission**, **120-second local deadline**, **0 model tools/MCP calls/writes** |
| Other limits | No host retry, fallback, parallelism, follow-up, Agent editing or handoff |
| Native consent | Fresh exact one-use review required; the cancelled review is not reusable. Use the verified workbench modal for automated inspection, restoring the owner’s preference afterward. |

OpenCode’s [official pricing](https://opencode.ai/v2/docs/console/models/#pricing), checked 2026-10-27, lists this model at **$0.20 per million input tokens** and **$1.25 per million output tokens**. These are reference rates, not a bill estimate or currency cap. Actual total, applicable account quota and internal/auxiliary SDK calls are unknown; title generation can involve other models. One host submission does not cap internal turns, tokens or total spending. A local timeout does not guarantee remote billing stops immediately. No credits were bought or billing settings changed.

**Awaiting fresh explicit inference approval. No request is authorized or submitted by this report.**
