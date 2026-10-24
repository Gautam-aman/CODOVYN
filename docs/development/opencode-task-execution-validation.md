# Phase 15 — task-bound OpenCode execution boundary

**PRODUCTION OPENCODE CODING EXECUTION: BLOCKED**

Phase 15 is **partially implemented**, not complete. Task-bound host source reads, real task/ACP initialization and their security regressions are verified. OpenCode's built-in tools do not consume the new host service; descriptor-safe draft writes are not implemented. No live inference occurred, and the production guard remains active.

## Repository and artifacts

- Starting checkpoint: clean `main` at `5589a77ed11ef2b7a3daecf02b7471e56fe81ca1`, synchronized with the same `origin/main` after fetch. The commit is the recoverable checkpoint; no reset/stash/history rewrite.
- Implementation and clean-source installer SHA: `b2a37ef45c8267e356a596080e11c58f696dff4b`, pushed and independently verified against `origin/main`.
- `a54d248e548aa33b3f1ebd2d0491b6adafac4b67`: TaskEngine execution authority, native host reader, adversarial tests, real task/ACP validation entry point and precise blocked-state diagnostic.
- `b2a37ef45c8267e356a596080e11c58f696dff4b`: permanent revocation on executable loss/integrity failure, including a disposable executable deletion/restoration regression.
- This report/evidence follows in a documentation-only commit; its final remote SHA is reported in the completion message. The application retains the exact tested implementation SHA above.
- No branch, PR, release, visibility change, credential export, generated installer commit or `/Applications/CODOVYN.app` replacement.

Environment: Apple M2 / ARM64 / 8 GiB RAM, macOS 27.0.1, Node 26.9.0 and Xcode Command Line Tools. Heavy native suites/builds ran sequentially.

## Evidence classifications

| Classification | Verified scope |
| --- | --- |
| **REAL OS SECURITY VERIFIED** | macOS sandbox denies direct project reads/writes, protected Git writes, real Git, shell and execution of the new host file helper. Existing Phase 14 hardened-client/process restrictions still pass. |
| **REAL ACP VERIFIED** | Two real task-bound sessions from source, two from packaged modules/bundled Node, and the existing seven-session broker campaign. All metadata/configuration only; no `session/prompt`. |
| **TASK AUTHORITY VERIFIED** | Real TaskEngine SQLite leases, distinct segments, owned ChildProcess binding, accepted policy checks, revocation and cleanup in the tested validation pipeline. This is not completed production adapter admission. |
| **FILE-ACCESS VERIFIED** | Host-invoked bounded UTF-8 reads under Ask/Plan policy and from an approved Agent draft; actual native descriptor traversal and denial/race tests. Not provider-native file-tool execution. |
| **DETERMINISTICALLY TESTED** | Provider output/streaming, ContextFlow continuation, queue, recovery, approvals and independent host patch-review regressions. |
| **LIVE INFERENCE UNVERIFIED** | Authentication, entitlement, actual model responses and live coding/continuation were not tested. Zero inference requests. |
| **BLOCKED** | Provider-consumed file mediation, Agent draft writes and therefore production OpenCode coding/continuation. Hosted CI and public distribution gates also remain blocked. |

## Architecture and trust model

Preserve the Phase 14 metadata authority, broker and hardened client. Compose them with a separate TaskEngine-issued execution authority and a native host file-read leaf. No second scheduler, task journal or public privileged filesystem IPC was introduced.

`TaskEngine` issues an in-memory authority for a single candidate execution segment, after acquiring its existing durable execution lease and obtaining the host repository snapshot. It contains a unique segment identity, task/provider/workspace, immutable accepted-policy digest and a maximum 120-second lifetime. The lease token stays private to trusted host code; a task ID or serialized object is not a capability.

The authority checks the actual SQLite lease token, owner PID/hostname, release state, active task/provider and policy on use. ContextFlow selects the approved destination configuration rather than silently inheriting the source provider's policy. An accepted policy change permanently revokes authority. Legacy tasks lacking an explicit supported policy cannot claim new file access merely because they have a task ID; existing adapters that do not use this seam retain their previous behavior.

One live Node ChildProcess object can bind once and cannot move into a second authority. Its recorded launch must match the declared executable directly or the existing fixed sandbox launcher envelope. The file service additionally verifies the executable's bytes against the bound digest at creation and checks device/inode/size/mtime/ctime before each read. The real OpenCode validation factory independently checks version 2.1.2 and the exact Phase 14 artifact digest. The generic TaskEngine authority alone is not a replacement for provider-specific version/provenance checks.

Task completion, cancellation, process exit, expiry, lease change, policy change and observed repository/executable integrity failure deny further reads. Restoring a removed executable or repository path cannot resurrect an observed revoked authority. Revocation never releases the SQLite ownership fence. The trusted adapter remains responsible for awaiting file-reader close, provider disposal and private-server cleanup before recording `provider-stopped`; the validation adapter does so. A cleanup attempt or authority expiry is not proof that a process is absent.

## File-access policy and native leaf

The new `task-file-access.js` interface is host-only. It requires both branded TaskEngine execution authority and the existing branded repository authority, verifies matching canonical workspace identity, and pins a root descriptor. Each operation revalidates live task/process/policy, executable identity and fresh repository metadata before and after the native read.

`native/task-file-reader.c` receives the root descriptor explicitly, traverses directory components without following symlinks, refuses nested `.git` boundaries and requires regular files with exactly one hardlink. It buffers at most 64 KiB, checks identity/timestamps/link count and reopens the complete parent chain before output. Parent death/root replacement or file substitution fails without returning content. Production builds contain no test pause hook; deterministic race barriers require a separate test-only compiler definition.

The service accepts at most four concurrent reads and 128 read attempts per instance, with a three-second reader deadline, bounded hex stdout/stderr and strict UTF-8 text decoding. It does not implement directory listing, binary/PDF/image reads, ACP line-range semantics or writes. Cleanup aborts/drains owned readers before closing the root descriptor; cleanup failures are latched so a later close cannot erase them.

Hidden path components and known credential/token/key/secret names are denied. This conservatively rejects some ordinary files too. Symlinks, hardlinks, traversal, protected `.git` paths and cross-project access are denied. **This is not perfect secret classification:** allowed ordinary source files can contain sensitive information. Future provider transfer must visibly disclose that risk and require appropriate consent. This phase transferred no project source into a model prompt.

Allowed reads require a durable sanitized audit before content is returned. Audit fields include logical task/segment/provider, repository identity, bounded relative path, operation, decision and measured duration. No source contents, credentials or hidden reasoning are journaled. Failed audit persistence revokes authority and withholds otherwise allowed content.

| Mode | Implemented access | Remaining restriction |
| --- | --- | --- |
| Ask | Host service reads Java, manifests and ordinary documentation | Provider-native reads remain denied; no writes/shell/Git/tools |
| Plan | Same bounded host reads | Read-only; no provider tool bridge or side effects |
| Agent | Host service reads the approved isolated draft | `write()` always rejects; native provider project writes remain denied |

A `read-write` accepted policy does not manufacture a functioning write implementation. No patch was created by OpenCode in this phase.

## Exact provider compatibility blocker

Official OpenCode 2.1.2 source at `a517687fde98a7329ada3ae644a01a9fc6c4e99e` was inspected through its pinned Git tree/blob API. Nine files were content-hash checked against the Git blob IDs: [source inventory](../assets/opencode-task-execution/pinned-provider-source.json).

- `packages/cli/src/acp/capabilities.ts` parses child updates, elicitation and compaction, not a client filesystem bridge.
- `packages/cli/src/acp/connection.ts` exposes session updates, permission requests, extension notifications, elicitation and response settlement; no filesystem forwarding methods.
- `packages/cli/src/acp/turn.ts` forwards prompt execution to OpenCode's private server.
- `packages/core/src/tool/plugin/read.ts` and `tool/read-filesystem.ts` use OpenCode filesystem/environment services.
- `packages/core/src/tool/plugin/write.ts` and `edit.ts` perform provider-side filesystem mutation through its permission/environment services.

[Official ACP documentation](https://docs.opencode.ai/docs/acp/) describes stdio ACP and native tools. It does not establish a client file-service integration for this pinned binary. CODOVYN still advertises `fs.readTextFile:false`, `fs.writeTextFile:false` and no terminal capability. No unsupported ACP field or fabricated tool result was added.

**OpenCode's built-in tools cannot currently consume this host service.** The real initialization probe invokes the service from the trusted test host, not from the model/provider. Broad direct project read/write grants would bypass the new descriptor boundary, so they were not enabled.

A separately validated integration interface—potentially a tightly controlled tool integration—or an explicitly maintained provider compatibility patch is still required. Such alternatives have not been implemented or verified here; lack of the client-FS seam is not a claim that every possible future integration is impossible. Safe descriptor-relative draft mutation/conflict handling must also be implemented and tested. No provider binary was modified, replaced or distributed.

## Real task/ACP validation

```bash
node scripts/validate-opencode-task-boundary.js
```

The script accepts no owner-project arguments. It builds a disposable Java/JUnit repository and runs validation objectives through real TaskEngine tasks and SQLite leases. Ask uses the ordinary repository; Agent uses the existing Git-engine-created isolated draft after trusted draft validation and explicit test-scope authorization. It checks the pinned official binary, starts actual ACP, verifies initialization/session/model/mode configuration, invokes two host reads, checks denial of secrets/Git metadata/writes, and verifies original repository identity/state remains unchanged.

The OpenCode artifact remains the Phase 14 supported macOS ARM64 2.1.2 binary, SHA-256 `3f01e2ba8efd4242c638add9248b88696221d76588d9511e63cb2d727c278fcc`.

[Source task probe](../assets/opencode-task-execution/source-task-probe.json): two sessions passed from clean implementation `b2a37ef`, real leases held, distinct segment IDs, Java/pom hashes recorded, cleanup verified, authority revoked after each validation task. The validation task completes its **metadata/host-read objective**, not an AI coding request. `providerFileToolInvocations:0`, `inferenceRequests:0`.

[Packaged task probe](../assets/opencode-task-execution/packaged-task-probe.json): the same two scenarios passed using the copied app's bundled Node and packaged TaskEngine/storage/adapter/native-reader sources. The external test driver reused the existing script with 15 relative imports resolved to packaged modules or unchanged test utilities. It did not alter the signed app. [Driver provenance](../assets/opencode-task-execution/packaged-probe-driver.json).

The [seven-session Phase 14 campaign](../assets/opencode-task-execution/broker-contextflow-regression.json) also passed from this implementation. It retains branch freshness, linked/nested repositories, path replacement, actual owner-death cleanup and real ACP metadata followed by explicitly labelled deterministic ContextFlow output. It is not live continuation.

## Adversarial and failure results

Twelve new tests add to the 280-test baseline:

- Actual TaskEngine/SQLite ownership plus native Ask/Plan Java, Maven and README reads; sanitized durable audit assertions.
- Forged/serialized authority rejection, duplicate child binding rejection, wrong task/token rejection and conflicting repository lease rejection.
- Policy-change, task cancellation and short explicit lifetime expiry; revocation does not release the SQLite fence.
- Unsupported mode/permission combinations and unrelated executable launch identity rejection.
- Real symlink and hardlink witnesses, sensitive/traversal paths, nested Git repositories and protected metadata denial.
- Root pathname replacement and restoration rejection.
- Disposable executable removal/restoration permanently revokes access; no installed executable was changed.
- Failed audit persistence prevents content return.
- Real sandbox witness denies direct Java reads, source writes, `.git` writes, real Git, shell and host file-helper execution. Source witness remains unchanged.
- Controlled native barriers reject file replacement after opening and root relocation before use, with no file bytes returned.

The corresponding tests are `packages/task-engine/test/execution-authority.test.js` and `packages/agent-adapters/test/task-file-access.test.js`. They propagate callback assertion failures and require completed validation status; an interrupted fixture is not treated as a passing positive read.

These are demonstrated race cases, not complete proof against every filesystem interleaving or a compromised unconfined owner account/kernel. There are no Agent writes to test for crash-atomic mutation yet. Cross-process filesystem IPC authentication and complete ACP filesystem semantics are not implemented by this host-only API.

## ContextFlow, queue and recovery

Existing same-task transfer, recipient binding, packet integrity, one-use/expired approval, fresh fingerprints, draft reconciliation and queue ownership regressions pass. TaskEngine makes the effective continuation policy available to its per-segment authority after the existing ContextFlow lease claim. Changing accepted task policy or lease prevents file access.

The production CLI continues rejecting metadata-only OpenCode admission/continuation. A successful ACP initialization cannot bypass that guard. Existing queue admission/reorder/pause/cancel/restart tests and failed-cleanup/reconciliation tests remain intact; restart cannot recover a serialized in-memory authority or automatically replay an ambiguous write.

This is **regression compatibility**, not completed integration of provider file tools with ContextFlow/queue execution. The seven-session hybrid continuation uses deterministic provider output. New live adapter file-service consumption, write recovery and end-to-end authenticated queue/continuation remain blocked. Generic adapters must still obey the trusted cleanup contract; the new authority does not turn a callback into independent kernel proof of process absence.

## Native application and regression results

| Check | Clean source/development app | Disposable copied DMG app |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Passed; two existing high development advisories reported | Not applicable |
| `npm run check` | **292 passed, 0 failed, 0 skipped** | Shared source suite |
| `npm run test:extension-host` | Passed, VS Code 1.143.1 | Not applicable |
| `npm run build:desktop` | Passed, embedded clean source `b2a37ef` | Same copied bundle |
| Task-bound ACP probe | Two configurations passed | Two configurations passed using bundled modules/Node |
| Existing broker/ContextFlow probe | Seven real metadata sessions passed | Native metadata checks below |
| `npm run test:desktop-host` | Passed editor/search/Git/terminal/bundled Node | Passed plus Java editor and **3 Maven/JUnit tests, exit 0** |
| `npm run test:desktop-chat` | Two launches passed, real metadata-only readiness | Two launches passed, real metadata-only readiness |
| `npm run test:desktop-routing-ui` | Passed routing save/discard/validation, activity/filters | Passed same assertions |
| `npm run test:desktop-restoration` | Two launches passed | Two launches passed |
| `npm run package:desktop` | Passed, image independently verified | Read-only mount/copy/detach and launch checks passed |

[Copied Java host result](../assets/opencode-task-execution/copied-java-host.json), [Java lifecycle](../assets/opencode-task-execution/copied-java-lifecycle.json), [copied Chat](../assets/opencode-task-execution/copied-chat.json), [source native lifecycles](../assets/opencode-task-execution/source-native-lifecycles.json), [copied native lifecycles](../assets/opencode-task-execution/copied-native-lifecycles.json), [copied restoration](../assets/opencode-task-execution/copied-restoration.json).

Native Chat preserves model/effort selection, mode controls, keyboard/scroll behavior, queue and history persistence, text-safe fixture streaming and ContextFlow review/rejection. The provider settings diagnostic now explains that host reads exist but provider-native mediation and Agent writes are blocked. Model entries/continuation remain disabled. No new composer controls or whole-IDE redesign.

[Actual copied-app screenshot](../assets/opencode-task-execution/copied-provider-readiness.png) shows the current blocked-state explanation and real metadata-only observation. It is not a screenshot of live AI output. Routing harness still reports DOM focus observability unavailable; do not infer a complete accessibility certification from event assertions.

Source host search took 112.2 ms; copied Java host search took 267.4 ms with the explicit readiness gate. The original `**/desktop-smoke.txt` operation/assertion remained intact. [Issue #16](https://github.com/Gautam-aman/CODOVYN/issues/16) stays open: successful bounded runs do not explain the historical intermittent stall. No timeout was raised to hide a failure. No comparative CPU/memory/token saving claim is made.

## Process ownership and cleanup

The task probe links ACP cancellation to the execution authority signal. It closes/drains file readers, disposes ACP, verifies the separate pinned private-server group, closes/revokes the metadata broker and checks owned groups before recording `provider-stopped`. The original repository remains unchanged, and the final TaskEngine authority is revoked. Cleanup failure throws instead of reporting a stopped provider.

Existing real abrupt-owner-death and hardened-client injection controls remain in the Phase 14 campaign/security suite. [Final group check](../assets/opencode-task-execution/provider-cleanup.json): **284 recorded broker/task campaign groups, zero live survivors**. Source/copied native lifecycle reports also have empty survivor arrays. Only recorded owned groups were checked/signalled; unrelated owner processes were untouched.

## Dependency, CI and distribution status

`npm audit` again reports two high development findings; `npm audit --omit=dev` reports zero for this repository graph. The Phase 14 `@vscode/vsce → @azure/identity → @azure/msal-node` advisory findings remain documented. No unsupported major override, lockfile churn or suppression was introduced. This is not a fresh audit of every upstream editor component.

Hosted [implementation run 40095828908](https://github.com/Gautam-aman/CODOVYN/actions/runs/40095828908) failed before steps executed (macOS/Linux/Windows jobs had empty step lists). Its annotation reports failed recent payments/spending limit and ARM64 runner capacity warnings. Owner action remains GitHub Billing & plans resolution followed by workflow rerun. No billing or workflow settings were changed. Later documentation pushes may create separate runs; no hosted pass is claimed.

## Development DMG

- `dist/desktop/CODOVYN-darwin-arm64-development.dmg`.
- Embedded source: `b2a37ef45c8267e356a596080e11c58f696dff4b`; `sourceDirty:false`. [Build provenance](../assets/opencode-task-execution/build-provenance.json).
- SHA-256: `ad9e088433fb50bf7a9303fe3bb389a43463d18bc8b994c3516195e3282e8856`.
- `hdiutil verify` passed during packaging and independently before mounting. The image was mounted read-only, copied to `/private/tmp/codovyn-phase15-copied-6XBGt8/CODOVYN.app` and detached.
- `codesign --verify --deep --strict` passed on staged/copy bundles and again after copied native tests.
- Ad-hoc signature, no CODOVYN team identity. `stapler validate` exited 65: no valid CODOVYN notarization established; inherited upstream ticket metadata does not notarize the modified bundle.
- No Gatekeeper/Keychain change, installed-app overwrite or release publication. Intel macOS/Windows/Linux native support remains unverified.

## Live-test proposal and remaining gates

No authorization for inference was requested or inferred. No provider credentials, authentication files, passwords or raw account configuration were read/exported. Metadata presence does not establish authentication, quota or billing access. Codex live behavior was not retested; its existing deterministic compatibility tests passed.

Only **after** the missing execution boundary is implemented and independently verified, a separately approved campaign could use at most six turns: Codex Ask; Codex one JUnit draft edit; OpenCode Ask; OpenCode one draft edit; Codex task start; OpenCode reviewed ContextFlow continuation. Proposed models are Provider Default after fresh metadata/capability confirmation (High only where advertised). Codex would use the owner's explicitly authorized official CLI context; OpenCode must use CODOVYN's separate owner-only context. Access/authentication and exact costs remain unknown.

Proposed limits: one request per scenario, no automatic paid retry, 120 seconds and eight tool actions per request, isolated Java repository, no shell/Git/network tools/deployment, normal Agent and one-use ContextFlow approvals, independent file hashes/tests and bounded owned cleanup. The future live harness must prove these limits enforceable before asking for consent. None of those turns was run.

Remaining production gates:

1. Implement and validate a provider-consumed, narrow file-tool integration; keep direct source permissions denied until it exists.
2. Implement safe isolated-draft writes, conflict handling, revocation/crash semantics and adversarial OS witnesses. Host patch-review tests passing is not evidence that OpenCode can edit safely.
3. Connect that validated boundary to real task admission, queued execution and ContextFlow while rechecking complete lease/approval/model/executable scope and cleanup ownership.
4. Verify genuine authenticated inference only under separate owner consent; no live coding, cost/token or continuation success claim yet.
5. Retain issue #16, hosted CI, development dependency, broader platform and distribution-signing gates.

The delivered result is a tested task-bound **host read foundation**, real task/ACP initialization evidence and a verified development artifact. It does not satisfy Phase 15's complete coding-execution definition of done. **Production execution remains blocked.**

## Post-checkpoint continuation — experimental task read MCP bridge

After the `b2a37ef` installer/evidence checkpoint above, continuation implemented a
narrow supported MCP read path. The checkpoint DMG predates these new modules and
is **not** evidence for this continuation; fresh native/artifact verification is
still required after the remaining work.

The pinned OpenCode ACP `session/new` supports a remote HTTP MCP descriptor. A
new host-only TLS endpoint exposes exactly `read_project_text`, backed by the
existing task/file authorities and native reader. It implements no writes,
shell, general filesystem, resources or sampling service. Protocol bodies,
connections, method IDs, response sizes and operations are bounded; repeated IDs,
unknown tools, extra arguments, foreign origins and sensitive paths are rejected.

The endpoint independently verifies the TCP socket belongs to the designated
bound task process/private server using macOS `proc_pidinfo`/`proc_pidfdinfo`:
executable path, UID, parent, process birth identity, loopback tuple and socket
generation. It rechecks ownership before returning data. Caller-supplied PIDs or
bearer strings do not authorize access. Unknown/replaced processes revoke the
scope; unrelated local sockets fail without exposing source.

A temporary task-specific TLS certificate authenticates the endpoint to the
provider, preventing an unrelated server from impersonating a reused port. Only
the public certificate is readable inside the provider sandbox. The host key
stays outside approved provider scopes. Scoped `SSL_CERT_FILE` / `NODE_EXTRA_CA_CERTS`
trust is used; system trust stores and certificate-verification settings are not
weakened. Actual OpenCode 2.1.2 metadata sessions successfully initialize and list
the tool over TLS. MCP tool invocations in deterministic OS fixtures read real
fixture files; **real OpenCode inference/tool invocation remains untested**.

Eight additional tests cover kernel peer identity, a foreign caller possessing
the public certificate, forged services, malformed/replayed operations,
revocation, a certificate-rejected impostor endpoint and OS denial of key reads
and public-certificate writes. The complete local suite reached **300 passing,
zero failed/skipped** at this development checkpoint. Production coding remains
blocked: the normal adapter/workflow has not yet adopted this experimental bridge
and safe Agent writes are still missing.

Two early combined runs saw helper startup/read denials. They failed closed;
sanitized lifecycle causes were added without changing existing error messages.
An explicit native identity readiness check precedes endpoint exposure; the
per-request inspection deadline remains 1.5 seconds. Later combined tests and
five fresh helper builds passed. The initial intermittent cause is **not proven**;
these observations are not a claim that every startup stall is resolved.

References: [OpenCode MCP](https://docs.opencode.ai/docs/mcp-servers/),
[MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[Bun scoped CA environment](https://bun.sh/docs/runtime/environment-variables).

## Continued hardening — accepted repository identity and draft publication

**TASK AUTHORITY VERIFIED / DETERMINISTICALLY TESTED:** `00511ef` adds the
root device/inode identity to host repository snapshots and recovery/ContextFlow
fingerprints. TaskEngine pins that accepted root for each execution segment.
File-service initialization must bind the repository broker identity to the
accepted root; a newly issued broker for another repository at the same pathname
cannot adopt the task. Observed replacement permanently revokes authority, even
if the original directory is restored. Legacy saved approvals lacking this new
identity cannot match a freshly inspected repository and require fresh review.
This does not claim complete race resistance across all host filesystem activity.

**FILE-ACCESS VERIFIED:** separate non-hidden Git/common directories are excluded
from ordinary source reads. The native source reader also rejects nested bare
Git stores (HEAD/objects layouts), cross-device traversal inside the authorized
root, symlinks and multiply linked files. Root replacement and detected nested
Git boundaries revoke the grant. Tests cover initial separate-store exclusion,
changed broker identity rejection, copied content at a replaced pathname,
revocation and continued ordinary Java/manifest reads. The checkpoint full suite
passed **305 tests, zero failed/skipped**; the focused identity/read/MCP/recovery
run passed **26 tests**.

**REAL OS SECURITY VERIFIED — experimental create-only primitive:**
`native/task-file-create.c` stages at most 64 KiB in a private same-filesystem
host directory. It publishes only a new file using macOS `RENAME_EXCL` after an
explicit commit signal. Existing targets, including symlinks and hardlinks, are
never overwritten. There is no shell, Git, network, directory-creation or
existing-file edit interface. The helper has no provider entry point and is not
wired into the normal adapter, MCP tools or TaskEngine write journal.

Five actual macOS tests compile/sign the helper and verify successful sandboxed
creation, unchanged original/Git witness files, sensitive/traversal/nested-store
rejection, abandoned staging without publication, and a concurrently inserted
target remaining unchanged. A deterministic barrier moves the pinned target
root outside the sandbox scope immediately before atomic rename. Sandboxed
publication is denied; the identical unsandboxed control publishes into the
moved directory and exits with an ambiguous-identity error. This validates the
specific kernel rename boundary; it is not a proof of every possible write race.

**BLOCKED:** task-journal write intent/completion, task-bound draft admission,
revocation during publication, crash reconciliation, existing-file modification,
concurrent nested-repository creation at the commit boundary, and complete
provider-tool policy integration still require independent validation. The
experimental create primitive must not be exposed as a safe general write tool.
The existing production coding guard remains enforced. No live inference was
performed or authorized by these tests.

With the five publication tests included, `npm run check` passed **310 tests,
zero failed, cancelled or skipped**, after syntax checking 155 JavaScript files.
