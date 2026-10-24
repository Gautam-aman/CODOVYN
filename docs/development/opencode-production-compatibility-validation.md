# Phase 14 — secure repository broker validation

Validated on 2026-10-24, Apple M2 / ARM64 / 8 GiB RAM, macOS, Node 26.9.0 and Xcode Command Line Tools. Builds and native suites ran sequentially. **Metadata compatibility is verified within the limits below. Production Git-backed OpenCode task execution remains blocked. No inference was authorized or performed. Phase 14's full production-execution acceptance gate is not complete.**

## Repository and provenance

- Starting checkpoint: `6c8f2faefdb5e3861851711af2f46ed09d05c687`, clean `main`, same local/remote SHA after fetch. The existing commit provided the recoverable checkpoint; no reset/stash/history rewrite.
- Final implementation, clean-source campaign and installer: `5aa34769979dc61dbac6630c9b72ee07a67d2fd0`. Pushed to `origin/main` and independently verified with `git ls-remote`.
- Implementation commits: `adf36d6f7c848697a5da234f516f25174e05723c` (descriptor authority), `06833b381c24802320954b30af0f6fd64afb3c3c` (hardened broker client), `5c35822df44cfb9bfc42238dd03c227c412f78f1` (metadata/readiness integration), `5aa34769979dc61dbac6630c9b72ee07a67d2fd0` (persistent invalidation and lifecycle hardening).
- This report and evidence follow in a documentation-only commit. Its exact final remote SHA is reported in the completion message; the embedded installer SHA above deliberately identifies the tested application source, rather than a later reporting commit.
- No branch, PR, release, visibility change, generated installer commit, credential export or installed-app replacement. `/Applications/CODOVYN.app` was untouched.

## Evidence classification

| Classification | Result and scope |
| --- | --- |
| **SECURITY BOUNDARY VERIFIED** | Actual macOS denial witnesses for metadata-only process/filesystem restrictions, hardened-client injection resistance, descriptor identity/freshness and controlled races. Scope is the tested pinned binary and local metadata boundary, not unrestricted production coding. |
| **REAL ACP INITIALIZATION VERIFIED** | Seven successful clean-source campaign sessions, plus protocol-only shutdown/owner-death witnesses and real metadata inspection in source/copied native Chat launches. No `session/prompt`. |
| **DETERMINISTICALLY TESTED** | Same-task ContextFlow destination output, queue, approvals, recovery, streaming, permission and admission regressions. These do not prove authenticated model execution. |
| **METADATA VERIFIED** | OpenCode 2.1.2 installation, artifact identity, catalogue and ACP configuration; Codex CLI 0.164.0 model/configuration metadata. Catalogue presence does not prove account access. |
| **LIVE INFERENCE NOT TESTED** | Codex and OpenCode authentication/entitlement, real coding and real cross-provider continuation remain unverified. Zero inference requests. |
| **BLOCKED** | Production Git-backed OpenCode task admission/continuation; hosted CI billing; valid CODOVYN notarization; unsupported object storage/platforms and the remaining execution-boundary gates below. |

## Architecture decision and upstream inventory

The Phase 13 immutable-response shim remains rejected. Choose a host-controlled broker with a native descriptor reader and fixed-purpose native client. The client contains lease/socket scope, **not cached Git responses**. No general Git interpreter or command proxy is introduced.

Official OpenCode 2.1.2 source is pinned at `a517687fde98a7329ada3ae644a01a9fc6c4e99e`. Relevant paths include `packages/cli/src/core/project.ts`, `core/git.ts`, `util/git-executable.ts`, `commands/handlers/acp.ts`, `server-process.ts` and `services/standalone.ts`. The tested official installed artifact is `/opt/homebrew/Cellar/opencode/2.1.2/bin/opencode`, SHA-256:

```text
3f01e2ba8efd4242c638add9248b88696221d76588d9511e63cb2d727c278fcc
```

The digest pins the tested local artifact; it is not a new vendor attestation. The adapter checks the digest before and after inspection. Other artifacts/versions are refused for this broker path.

ACP has no documented client field that supplies this repository identity. The client therefore implements an explicitly maintained, version-pinned executable ABI used by the pinned provider's subprocess calls; it does not invent an ACP capability. A source patch was considered but would still need the same authority model, reproducible provider build and distribution review. Upstream requests Bun 1.4.2; this machine's inspected Bun was 1.3.11. No patched provider was built, shipped or substituted for the owner's executable.

| Actual upstream operation | Role | Broker behavior |
| --- | --- | --- |
| `rev-parse --git-dir --git-common-dir --show-toplevel` | Project discovery | Fresh authorized root/Git/common paths |
| `rev-parse HEAD` | Current commit | Fresh loose/packed-ref resolution; explicit unborn state |
| `symbolic-ref --quiet --short HEAD` | Branch | Fresh branch, detached state exits without fabricated branch |
| `rev-list --max-parents=0 HEAD` | Root-commit identity | Bounded, content-hash-verified loose commit graph |
| `remote get-url origin` | Optional remote identity | Denied; actual root commits remain available |
| `worktree list --porcelain` | Optional main-worktree canonicalization | Denied; current authorized worktree/common identity stays distinct |
| Remote symbolic refs, arbitrary flags/subcommands | Optional/unsupported | Denied |
| Clone/fetch/checkout/reset/commit/push, worktree mutation | Mutating VCS features | Denied |
| Index refresh/write-tree/diff/restore/packing | Provider Git snapshots | Snapshot policy disabled; commands denied |
| ACP initialize, session/new, model/config/mode metadata | Metadata startup | Supported without prompt; client FS/terminal capabilities unavailable |
| Provider session persistence | Private provider state | Existing isolated owner-only context only |

Exact `--git-dir`/`--work-tree` prefixes must match authorized values. Real Git, shell and arbitrary executable fallback are never permitted.

## Descriptor authority and freshness

`repository-identity.js` issues only expiring **metadata-only** authorities. A branded, frozen host object can bind one broker; reconstructed renderer objects and duplicate broker binding fail. This lease is not a TaskEngine execution lease.

The native reader opens paths using directory descriptors, `openat` and no-follow traversal. Root, Git directory, common directory and `.git` marker filesystem identities are verified. Four host descriptors stay open for the whole lease, preventing deleted inode recycling into an existing authorization. Revocation/expiry closes them and aborts pending reads. Helpers must live outside project/Git scope.

Stable filesystem identity is separate from mutable HEAD/branch. Each request reads current HEAD, loose refs or packed refs; roots traverse bounded loose commit objects whose Git content hashes are checked. The reader rechecks metadata and pointer contents as well as path identity. A changed branch refreshes metadata; a replaced root, changed Git pointer, deleted repository or newly encountered nested repository revokes authority. Restoring a pathname does not revive the old lease.

The broker authenticates a version-1 capability frame, accepts only four read opcodes and a scoped UTF-8 cwd, and revalidates before response. Owner-only directories/socket, four clients, 128 queries, 512 inspections, 16 KiB frames/responses, 2-second framing deadline, 9-second query deadline and bounded reader/tool output limit resources. Metadata wrappers use a 45-second authority; the campaign has a 180-second overall deadline. No Git config/include/hook/helper is evaluated.

Controlled native barriers tested root replacement after descriptor validation and in-place Git pointer mutation before use. Both fail closed. These are demonstrated race cases, **not a claim of complete resistance to every filesystem scheduling race**. Task-time direct provider filesystem access and execution-lease binding remain separate unverified requirements.

## macOS process and executable boundary

The provider may execute only its pinned OpenCode binary and the fixed hardened native client. The host reader/compiler are not executable from the provider context. Helpers compile with stack protection/FORTIFY/warnings-as-errors, are ad-hoc signed with hardened runtime, hashed, and stored in protected private directories. The provider cannot modify the client, its directory or socket.

Metadata inspection permits directory discovery but denies regular project-file contents and all project writes, even if a base write-capable profile is supplied. The pinned release's file watcher and FFF indexer are disabled. Private provider state remains writable; existing approved provider network behavior is unchanged. No general network-isolation claim is made. The threat boundary is the sandboxed provider; this is not protection against an already compromised unconfined owner account or privileged host.

Actual OS witnesses denied real Git, shell, curl, host-reader execution, external private reads/writes, protected `.git` writes, project source reads/writes and client/socket tampering. Strict client argument parsing denied push, commit, reset, config, unexpected flags/arguments and cross-project queries. Malicious Git config contained fsmonitor/credential-helper paths; the reader never evaluated them and their marker stayed absent. No arbitrary executable path exists for hooks/helpers or nested-agent launches.

A harmless injected dynamic library exits 77 in the unhardened control. The hardened client still returns correct metadata under the provider sandbox when the same library is explicitly readable. This positive control prevents treating an ineffective injection attempt as a security success. Git/DYLD/socket environment redirection did not redirect authority.

## Repeated real ACP and repository transitions

Reproduce on the supported Mac with CLT and the pinned executable:

```bash
node scripts/validate-opencode-broker.js
```

The script accepts no owner-project input, creates disposable Java repositories and never sends a prompt. [Clean-source campaign evidence](../assets/opencode-broker/real-acp-campaign.json) records all session hashes, identities, timings, owned groups and cleanup assertions.

| Case | Actual result |
| --- | --- |
| Ordinary committed repository | initialize, session/new, model configuration and metadata succeed |
| Trusted branch transition | `main` → `phase14/fresh` is freshly observed; stable repository identity remains; old session/authority disposed |
| Repeated explicit selection | New session hash, requested advertised model confirmed |
| Linked worktree | `phase14/linked`, distinct worktree Git directory and shared common directory; requires trusted explicit metadata scope |
| Unauthorized sibling | Cross-project query rejected; stale/revoked authority unusable |
| Nested repository | New `.git` invalidates parent-scoped query; a new explicit owner authorization initializes the nested project with unborn HEAD |
| Path replacement | Old filesystem identity rejected before provider execution registration; no provider task starts |
| Broker shutdown | A real protocol session loses broker authority; no later authorized operation |
| ACP startup cancellation | Actual initialization request cancelled, owned launcher cleaned up |
| Abrupt owner death | Test-owned Node owner SIGKILL; actual ACP client and private server exit through lease EOF; groups empty |

Additional native-reader tests cover detached HEAD, spaces, empty/unborn repositories, nested directories, separate Git stores, packed refs, symlink refusal, deletion, corrupted/packed objects, expired leases and both controlled races.

Seven full clean-source metadata inspections took **2,117–7,850 ms** (M2 / 8 GiB, includes local helper compilation, catalogue and ACP). Ordinary inspection: 4,018 ms; linked worktree: 2,566 ms. The ordinary session used eight broker queries and 32 native inspections. Ten catalogue entries were observed; no inference entitlement is inferred. These are observations, not a before/after performance or memory improvement claim. Memory delta was not measured.

## Process lifecycle and recovery

OpenCode 2.1.2 launches one direct private `serve --stdio` child in its **own process group**. Checking only the ACP launch group was insufficient. Pinned upstream `server-process.ts` binds that server to stdin closure; ACP connection shutdown also terminates its client.

The integration observes the exact executable/direct-child topology and verifies both client and private-server groups disappear. It never signals a PID found by a process-name scan. Unexpected topology, missing server or surviving server fails the inspection. Unit witnesses cover normal lease EOF and a deliberately broken server; the latter correctly raises “cleanup unverified; retain execution ownership.” A real abrupt owning-host witness separately verified both OpenCode groups disappear.

Broker close revokes authority, closes sockets, awaits pending inspection work and checks descriptor cleanup. Stalled ownership validation is bounded and revokes; abandoned/reused clients, oversized IPC and duplicate authority binding fail closed. [Final campaign group check](../assets/opencode-broker/acp-process-cleanup.json): **276 recorded groups, zero live survivors**. Native source and copied-app lifecycle reports also contain empty survivor arrays.

Existing task-engine tests retain ownership on failed provider cleanup, reject ambiguous write replay, reconcile interrupted leases on restart and reject duplicate dispatch. Some recovery failures are deterministic fixtures rather than actual OS crashes. No claim is made that every possible host/kernel crash interleaving has been tested.

The disposable Java-project builder also now sanitizes inherited Git environment and disables configured helpers. A regression sets hostile `GIT_DIR`/`GIT_WORK_TREE` values pointing to a second disposable repository and verifies fixture creation leaves that repository unchanged. No owner project is used as a negative-test target.

## ContextFlow, queue and admission

The CLI rejects metadata-only OpenCode task admission before creating a task. ContextFlow checks consumed/expired reviews before starting discovery, then revalidates the recipient/binary, broker implementation/source digests, repository identity/state and packet. Observed recipient/repository/source changes now **durably expire** the review; reverting the change cannot resurrect approval. Queue ownership, one-use authorization, exact packet identity, isolated drafts and unresolved-operation checks remain in the existing engine.

The integration campaign uses real Git-backed ACP startup for destination metadata, then an explicitly labelled deterministic destination adapter for output. It verifies the same logical task, separate provider segments, the exact approved packet and one-use rejection. **That fixture adapter is not a production override and is not evidence of live continuation.** The real metadata result always asserts `executionSupported:false`.

## Provider readiness and native application

Provider installation/version, repository compatibility, experimental broker observation, ACP metadata verification, authentication, inference and execution support remain separate facts. OpenCode discovery bypasses the five-minute provider catalogue cache. A Models refresh clears the old verified UI observation while the new check is pending; failure cannot leave the previous positive readiness text. Saved model/effort preferences remain intact. Executable hash mismatch cannot display an older metadata observation as current. Model selections and ContextFlow Continue remain execution-disabled when the host reports the production blocker.

[Copied application screenshot](../assets/opencode-broker/copied-app-provider-readiness.png) shows **ACP compatible (metadata only), authentication unknown, inference unverified, execution blocked**, with timestamp/branch and actual catalogue default. It is a real standalone window capture from the copied app. There is no live-provider Chat claim.

Native Chat validates actual metadata startup on both launches as well as fixture-rendered streaming/text safety, navigation, effort controls, queue persistence, ContextFlow review/rejection and journal restoration. Native fixture traffic is isolated until the final real-readiness stage. The normal application has no native test harness or new privileged public message path. [Copied Chat results](../assets/opencode-broker/copied-chat-results.json).

## Validation results

| Command/check | Source application | Disposable DMG copy |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Passed | Not applicable |
| `npm run check` | **280 passed, 0 failed, 0 skipped**; baseline 255 | Shared source suite |
| `npm run test:extension-host` | Passed, VS Code 1.143.1 | Not applicable |
| `npm run build:desktop` | Passed, clean provenance | Same copied bundle |
| `npm run test:desktop-host` | Passed editor/search/Git/terminal/bundled Node | Passed; Java editor plus **3 Maven/JUnit tests, exit 0** through integrated terminal |
| `npm run test:desktop-chat` | Two launches passed, real metadata readiness enabled | Two launches passed, real metadata readiness enabled |
| `npm run test:desktop-routing-ui` | Passed routing save/discard/validation, activity follow and filters | Passed same assertions |
| `npm run test:desktop-restoration` | Two launches passed | Two launches passed |
| `npm run package:desktop` | Passed | Image mounted read-only, copied, detached |
| Native owned-process lifecycle | No survivors | No survivors |

Baseline source host search took 110.6 ms; copied Java host search took 176.3 ms with the explicit readiness gate. The original `**/desktop-smoke.txt` assertion remained intact. Issue [#16](https://github.com/Gautam-aman/CODOVYN/issues/16) remains **OPEN**: these successful bounded runs do not explain or eliminate its historical intermittent stall. Routing harness reports that DOM focus observability is unavailable; passing keyboard/event assertions do not establish every accessibility criterion.

[Source native lifecycles](../assets/opencode-broker/source-native-lifecycles.json), [copied native lifecycles](../assets/opencode-broker/copied-native-lifecycles.json), [copied restoration](../assets/opencode-broker/copied-restoration-result.json). The copied routing smoke itself includes another full native host run; its lifecycle occupies the final host entry. Java test evidence was independently asserted in the preceding copied Java host run, not reported by an AI provider.

## Codex and live-inference gates

A separate bounded non-inference Codex probe used official app-server model/config metadata. Codex CLI **0.164.0**, observed default **gpt-6.1-sol**, seven models and advertised efforts including High were observed. No thread/turn, private authentication file, token or raw configuration was recorded. [Sanitized metadata evidence](../assets/opencode-broker/codex-metadata.json). Official interface: [Codex app-server documentation](https://developers.openai.com/codex/app-server/).

Both providers' authenticated execution remains unknown. A future separately approved campaign can start with two small Codex turns (Ask architecture; Agent one draft JUnit test), Provider Default and High only after capability refresh, isolated Java repository, fixed deadlines/tool bounds, no commit/push, reviewed patch only and owned cleanup. Exact cost/quota use is unknown. OpenCode inference must additionally wait for the execution-boundary gates below. This phase requests no live calls and grants no spending authorization.

Proposed future limits: at most two Codex requests, 120 seconds per request and eight tool actions per request, with a cancellation/cleanup deadline and independent file hashes. The live harness must establish that those bounds can be enforced before requesting consent; these are proposed limits, not evidence of executed live tests.

## Dependency and hosted-CI findings

`npm audit` reports two high development findings in `@vscode/vsce → @azure/identity → @azure/msal-node`. Installed versions: vsce 4.0.0, identity 4.14.0, msal-node 6.0.1. [GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5) is fixed in msal-node 7.1.0, outside identity's current `^6.0.0` range. Inspected current upstream vsce/identity releases offered no supported semver-compatible fix; no forced major override or lockfile churn was applied.

The affected authentication path is used by vsce's Azure token/publishing support, not the local packaging command used here. Development node_modules are excluded from the assembled application; `npm audit --omit=dev` reports zero findings for this repository graph. This is not an audit of every upstream editor component. Keep the development advisory open pending a supported upstream fix.

Hosted [run 40089560046](https://github.com/Gautam-aman/CODOVYN/actions/runs/40089560046), implementation SHA `5aa3476`, failed with **zero job steps**. The annotation explicitly reports failed account payments or a spending limit needing increase, plus macOS ARM64 capacity warnings. Owner action: resolve the account's GitHub Billing & plans restriction, then rerun workflows. No workflow/billing settings were changed. Local passes are not hosted verification; later documentation-only pushes can create separate runs.

## Development installer

- Artifact: `dist/desktop/CODOVYN-darwin-arm64-development.dmg`.
- Embedded source: `5aa34769979dc61dbac6630c9b72ee07a67d2fd0`, **sourceDirty: false**. [Build provenance](../assets/opencode-broker/installer-build-provenance.json).
- SHA-256: `b978e407e4acdae5d661622f9cd3f03fef63857352545e6268586110999c3a64`.
- `hdiutil verify`: passed during packaging and independently before mounting. Read-only image mounted, app copied to `/private/tmp/codovyn-phase14-copied-70zuRv/CODOVYN.app`, then image detached.
- `codesign --verify --deep --strict`: passed on the staged app and disposable image copy, and again after copied native tests.
- Signature is **ad hoc**, no CODOVYN team identity. `xcrun stapler validate` exited **65**: no valid CODOVYN notarization established. An inherited upstream ticket shown by signature inspection does not notarize this modified CODOVYN bundle.
- Source/copied Chat, routing, host and restoration checks passed as above. No Gatekeeper, Keychain or global security setting was changed. No installer or provider binary was published or committed.

## Remaining production blockers

1. A metadata lease is deliberately not a TaskEngine execution lease. The broker has not been promoted to a task-bound coding authority with all policy/ownership gates verified.
2. Real tool/file access across repository replacement/nested transitions requires separate lifetime-bound validation; the metadata sandbox currently denies project source contents and writes. Removing that denial to run coding tasks would be a new security decision, not a model-picker switch.
3. Linked/external Git stores require trusted explicit scope. Packed commit objects, arbitrary object alternates/configuration, nonlocal filesystems and unsupported path/ref encodings fail closed. No unrestricted Git fallback.
4. Real authenticated Codex/OpenCode inference, quota access, draft coding and live same-task handoff are **not tested**. No token/cost savings or live success is claimed.
5. Exhaustive host-crash/TOCTOU coverage, broader OS/platform verification, issue #16's root cause, hosted CI, development dependency remediation and valid distribution signing/notarization remain separate gates.

The verified outcome is a fresh, descriptor-authorized, source-blind metadata path with repeated real ACP startup and tested cleanup, integrated into truthful native readiness. **The production execution guard remains in place.**
