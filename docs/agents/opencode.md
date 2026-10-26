# OpenCode connection

**Current validation path:** a native-reviewed **single Calculator Ask** transport is prepared, with durable task-bound consent and request accounting. It permits one outer prompt, Provider Default reasoning, a 120-second local deadline, zero tools/MCP tool calls/project writes and no host retries/fallback. Open **Chat → Settings → Review one OpenCode Calculator Ask** only after configuring the isolated context below. It presents an exact discovered model and prompt for fresh native approval. No live inference has been verified, and no previous Codex approval applies. General coding, Agent and ContextFlow remain blocked. See [current qualification](../development/first-provider-transport-validation.md). Earlier phase sections below describe their historical checkpoints; the metadata-only default guard remains active outside this narrowly reviewed entry.

CODOVYN's guarded OpenCode adapter targets **OpenCode 2.1.2 on macOS ARM64**. Other versions and non-macOS execution are refused until independently verified. Intel macOS has not been tested. It uses the documented ACP stdio interface, not an embedded terminal UI.

Open **Settings → AI Providers and backups** and inspect providers. If the executable is outside the app's PATH, choose **Configure path** and set the application-level `codovyn.opencodeCliPath` to its absolute path. Workspace content cannot set that trusted executable.

Choose **Models** to query `models --standalone` and initialize an ACP metadata session. This starts no prompt or inference turn. The picker labels catalogue entries as access unverified. Authentication, entitlement and quota are not established by catalogue presence. Discovery is lazy and bounded. OpenCode inspections acquire fresh repository authorization instead of trusting the five-minute catalogue cache. **Models** refreshes the current observation; metadata entries remain execution-disabled while the production guard is active.

## Separate authentication context

OpenCode can load plugins, external tools and permissive configuration. CODOVYN therefore uses a separate, owner-only provider context per project. It does **not** import your global OpenCode credentials, plugins or configuration.

**Setup** requests native confirmation, then opens an integrated terminal in that context with a fixed `opencode auth login --standalone` command. Complete the official provider authentication there. Credentials remain managed by OpenCode; they never enter Chat or CODOVYN journals. Authentication remains unknown until an actual authorized task establishes a result. Installation alone does not authorize spending.

Guarded execution refuses projects containing `opencode.json`, `opencode.jsonc` or `.opencode`, and refuses custom/managed configuration in its private context. It does not override enterprise policy. Use a clean disposable project to evaluate this experimental integration.

## Models, variants and execution

Select **OpenCode → Provider Default** or a discovered `provider/model` entry. A selected model is confirmed with ACP before submitting a prompt. Only variants advertised for that selected model appear in Effort. Raw variant identity is preserved; **Auto** omits the override. A removed model or incompatible variant fails before inference.

Ask and Plan run with project writes denied by a macOS filesystem/process profile. Agent requires native approval and the existing isolated Git worktree; the original repository remains protected until explicit patch review and application. Tool policy denies shell commands, nested agents, MCP, external tools and external-directory access. Permission requests are checked against real project paths and approved scope. A refused capability stops execution rather than retrying.

The process boundary permits provider network traffic and OpenCode's owned private server. It is not a general network isolation environment or a security claim for arbitrary binaries. Use only an official trusted executable. Projects with secrets in ordinary source files still require careful provider consent. `.env` and provider configuration reads are denied; no general secret scanner is claimed.

Queued requests keep the provider, stable model ID, exact variant, permission and project snapshot. **Review & run next** revalidates metadata, policies and the repository baseline. Restart never automatically dispatches queued work. Cancellation terminates only owned processes. Ambiguous actions require review and are not replayed.

Automatic OpenCode execution, session resume, provider-reported usage and Windows/Linux execution remain disabled or unverified. ContextFlow review is implemented, but actual Git-backed OpenCode continuation is blocked as described above. Live authenticated read/edit validation is a separate gate; deterministic tests do not satisfy it.

Official interfaces: [ACP](https://docs.opencode.ai/docs/acp/), [CLI](https://docs.opencode.ai/docs/cli/), [models](https://docs.opencode.ai/docs/models/), [permissions](https://docs.opencode.ai/docs/permissions/).

### Git discovery compatibility research

OpenCode 2.1.2's Git-backed execution remains **blocked**. Its project resolver
starts Git subprocesses; permitting unrestricted Git or a shell would weaken the
verified execution boundary. CLI installation, a model catalogue and successful
metadata-only ACP initialization do not establish safe task execution or account
access.

Maintainers can reproduce the isolated, non-inference feasibility experiment with
`node scripts/probe-opencode-git.js` on macOS ARM64 with Xcode Command Line Tools
and the pinned CLI. It accepts no existing-project arguments. The research-only
native shim has known identity/freshness failures and is **never installed into
the production adapter**. Do not use it to bypass the execution guard. See the
[security investigation and evidence](../development/opencode-git-compatibility-validation.md)
for the supported experiment cases, rejected operations and outstanding review.


### Descriptor-authority broker scope

The Phase 13 immutable shim remains rejected. The replacement is a host-controlled,
versioned IPC broker plus hardened native client; it never runs Git or evaluates
Git configuration/helpers. It pins filesystem identity through descriptor reads,
checks current HEAD/refs and metadata pointers, and validates expiring metadata
leases. It denies unapproved nested repositories, external paths and path reuse.

Current requirements: macOS ARM64, Xcode Command Line Tools, the pinned OpenCode
2.1.2 artifact, local filesystems, bounded ASCII branch names and a bounded loose
commit-object graph. Packed refs are supported; packed commit objects are refused.
External/separate Git stores and linked worktrees require explicit trusted host
metadata scope; ordinary model-picker requests cannot supply arbitrary Git paths.
No general Git fallback exists.

Run `node scripts/validate-opencode-broker.js` for the bounded actual-ACP campaign.
It creates disposable Java projects, sends no prompt, checks transitions/cleanup,
and labels the final ContextFlow response fixture separately from real metadata.
See [Phase 14 evidence and remaining gates](../development/opencode-production-compatibility-validation.md).

The metadata sandbox permits directory discovery but denies regular project-file
contents and all project writes. File watchers and FFF indexing are disabled using
the pinned release's supported flags. Four filesystem descriptors remain pinned
for the authorization lifetime; an invalid identity permanently revokes that
lease. A host-issued authority can bind only one broker. Provider startup and
shutdown also track OpenCode's separate private `serve --stdio` process group.
The upstream stdin lease closes that server on owner death; the integration
checks both client and server groups rather than assuming one group contains all
owned processes. A missing or surviving server fails the metadata inspection.

### Task-bound host reads (Phase 15)

The TaskEngine now issues non-transferable per-segment execution authorities. A
separate host-only file-read service checks that authority, the live process,
accepted policy, executable and repository identity before returning bounded text.
Native traversal rejects symlinks/hardlinks and known sensitive/hidden paths.
Allowed ordinary source files may still contain sensitive data; reviewing the
scope and obtaining provider-transfer consent remain necessary. No perfect secret
classification is claimed.

This service does **not** yet mediate OpenCode 2.1.2's built-in tools. The provider
retains the metadata-only OS profile: direct project-file access and all project
writes remain denied. Client ACP file capabilities stay false. Agent writes stay
blocked; neither CLI detection nor authentication can remove that restriction.
See [task execution boundary evidence](../development/opencode-task-execution-validation.md).

A later Phase 15 continuation is testing a narrowly scoped **read-only MCP**
bridge with native task-process socket checks and a task-specific TLS endpoint.
It adds no direct project-file, shell or Git rights to the provider. Only a
public certificate becomes readable in its sandbox; the private key stays in
host-only temporary storage. This bridge is experimental, is not enabled by the
normal coding adapter, and does not yet provide safe Agent writes. Metadata
registration and fixture tool calls are not live model execution.

## Task-bound draft file tools

The protected adapter now composes the existing repository broker with a
process-bound TLS MCP server. It uses the pinned 2.1.2 typed `mcp.servers`,
`permissions`, and `agents` configuration. The file server sets `codemode:false`;
Code Mode, native file tools, shells, subagents and other MCP tools stay denied.
The provider still has no direct project-file access, including in Agent mode.

`read_project_text` returns bounded UTF-8 text and an opaque file version.
`write_project_text` requires that version to modify an existing draft file;
`null` permits creation only. Ask/Plan expose no write tool. The host commits a
SQLite write intent before mutation, preserves the displaced preimage in private
staging, detects conflicts, and requires normal patch review. Ordinary permitted
source files can still contain sensitive information; path filtering is not
perfect secret detection. Authorize project sharing accordingly.

Cancellation or a crash never causes automatic write replay or rollback over
another edit. Incomplete operations fence the task and repository. Explicit
`draft-inspect` / `draft-reconcile` verify repository state and native writer
ownership, including inherited descriptor-lock quiescence, before recording a
reviewed outcome. Retained preimages are diagnostic/review evidence, not a retry
queue. An unverifiable lock, process or identity keeps the operation blocked.

Real pinned OpenCode initialization and scoped MCP catalogue loading can be
validated without inference:

```sh
node scripts/validate-opencode-task-execution.js
```

The deterministic Java workflow uses the **actual adapter with a fixed local
Node ACP fixture**, real SQLite/file operations, offline Maven/JUnit, and reviewed
accept/reject. It does not contact a model:

```sh
node scripts/validate-opencode-draft-workflow.js
```

Development validation requires the supported macOS ARM64 environment, CLT,
Java/Maven, and cached JUnit dependencies for `mvn -o test`. The copied-app variant
must run with the copied app's bundled Node and `CODOVYN_DESKTOP_APP`.

**Live inference remains disabled in the normal adapter.** Metadata initializes
with file execution inactive; no `session/prompt` is sent to real OpenCode. The
local fixture is explicitly constrained to the current Node executable and cannot
be selected through renderer messages, project configuration or environment flags.
Real authenticated coding/ContextFlow continuation still requires separate owner
consent and validation. Provider readiness must continue to show this distinction.
