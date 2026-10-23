# OpenCode integration validation — 2026-10-23

The guarded OpenCode integration, automatic model catalogue, provider connections and existing queue pipeline are implemented and locally verified. **The full live-provider milestone remains incomplete.** No paid inference was authorized or run in this campaign turn. Fixtures, real metadata inspection, operating-system permission tests and real native UI evidence are distinct below.

## Repository and provenance

- Starting/recoverable checkpoint: `aacbb7f0d79ee4cf880766a56ef428e78b6e58e7`.
- Final implementation and installer source: `c3b77a7987607cfb5c42d0f2515277a01e816b5a`. Embedded `sourceDirty: false` was verified in both the build and copied app.
- `origin/main` was verified at this implementation SHA; the source worktree was clean before building. This reporting/screenshot commit follows the implementation; its final repository SHA and clean remote status are supplied in the completion message. Resolve it locally with `git log -1 --format=%H -- docs/development/opencode-integration-validation.md`.
- Nine meaningful commits after the starting checkpoint; 146 campaign commits since `e2664564` at the artifact source. The report/assets add one documentation commit afterward.
- Work remained on `main`. No branch, PR, release, visibility change, history rewrite or generated-installer upload was performed. `/Applications/CODOVYN.app`, existing projects and user settings were not overwritten.

- `0ef8eda` feat(agents): add bounded owned ACP transport and integration audit
- `48c584d` feat(opencode): add guarded ACP execution and bounded model discovery
- `5ee5bc5` feat(providers): integrate discovered models, guarded setup and queued OpenCode tasks
- `8bbb748` fix(agents): bound signal-denial retries before child exit notification
- `6695d7f` fix(opencode): own metadata processes and confirm final model configuration
- `4c063ff` test(desktop): isolate provider fixtures and verify OpenCode queue restoration
- `fe1ba76` docs(providers): document guarded OpenCode setup and model discovery limits
- `f804647` fix(models): preserve discovered effort while restart metadata is pending
- `c3b77a7` fix(opencode): stop tasks requesting unadvertised client capabilities

## Provider architecture and ACP

`packages/agent-adapters/src/acp.js` implements owned JSON-RPC stdio transport; `opencode.js` implements the provider contract. The existing registry, TaskEngine, SQLite journal, queue and Git worktree/review pipeline are reused. No second scheduler or tool loop was introduced.

The installed official executable was `/opt/homebrew/Cellar/opencode/2.1.2/bin/opencode`. Only **2.1.2** is accepted. ACP protocol version 1 is initialized with client filesystem and terminal capabilities disabled. Sessions receive no MCP servers. Model, provider-specific effort variant and plan/build mode are set through advertised configuration options and checked again before prompting. Session identity and normalized text/tool/permission events are journaled. Hidden reasoning is ignored.

Transport limits include 1 MiB messages, 8 MiB total stdout, 1 MiB stderr, 32 pending requests, bounded event/action collections and 120-second prompt deadlines. IDs correlate responses; duplicate/foreign-session/malformed messages fail closed. Raw stderr and remote error bodies do not enter Chat. Standard authentication/cancellation codes are classified; arbitrary errors are not assumed to prove quota exhaustion. Disconnects and unresolved tools require review, with no reconnect or action replay.

Cancellation sends `session/cancel`, then uses existing owned process-group cleanup. Version/model probes also use owned process management. A targeted regression demonstrated a signal-denial race before Node delivers child exit: the previous cleanup could fail before observing group disappearance. Bounded retries now tolerate that ordering, while persistent denial still fails cleanup. The new regression failed before the fix and passed afterward. This is **not** a causal explanation of issue #16.

Official interfaces reviewed: [OpenCode ACP](https://docs.opencode.ai/docs/acp/), [CLI](https://docs.opencode.ai/docs/cli/), [models](https://docs.opencode.ai/docs/models/), [permissions](https://docs.opencode.ai/docs/permissions/) and the [pinned 2.1.2 source](https://github.com/anomalyco/opencode/tree/v2.1.2). Codex discovery uses documented [`model/list` and `config/read`](https://learn.chatgpt.com/docs/app-server); catalogue presence is not an entitlement check.

## Discovery, preferences and provider connections

A real, non-inference OpenCode inspection on a disposable project returned **10 models**, default `opencode/big-pickle`, with authentication **unknown**. No `session/prompt` was sent. The documented plain `models --standalone` format is parsed with strict identifiers, byte/count bounds and ANSI rejection. ACP metadata supplies the selected model's variants; absent capabilities leave Auto only.

Metadata inspection observed 4,885 ms initially, 1,805 ms on another initialized-context run and 2320 ms on the final source. These are individual observations, not a controlled before/after benchmark; the last ran alongside a build. No inference cost, throughput, FPS or token-savings claim follows from them.

Discovery is lazy, cached for five minutes with explicit refresh, and bounded to two concurrent host requests. Codex and OpenCode discovered IDs join the existing searchable picker; favorites/recents and exact model/variant preferences persist per project. Dispatch refreshes trusted metadata instead of trusting renderer entries. Missing or incompatible selections are refused. Auto routing remains restricted to the existing approved catalogue: automatic OpenCode fallback is not enabled.

Provider cards show detection/version, executable, default model when known, unknown authentication/access, capability limits and setup diagnostics. An application-scoped absolute CLI path can be selected through native Settings. Webview messages cannot supply an arbitrary executable or command. OpenCode Setup requires native confirmation and opens a fixed, shell-quoted official login command in a strict-environment terminal. Credentials are never returned to the renderer.

A real restart check found that a discovered variant could be lost before metadata arrived. A disabled checking choice now preserves the saved value; refreshed capabilities restore it when supported. Unsupported efforts produce an explicit reset notice. Accepted and queued policies remain immutable.

## Enforced security and deliberate restrictions

- macOS filesystem/process profiles deny original-project writes in Ask/Plan. Agent requires the existing native write approval and isolated Git worktree; patch review/application remains explicit.
- Scoped permission requests verify real paths, including symlinks. Shell execution, external-directory access, nested agents, MCP, uncontrolled network tools and unadvertised client filesystem/terminal capabilities are refused. A denied capability stops the task.
- OS negative tests actually rejected external reads/writes, symlink escapes, `.env` reads, Git metadata writes and shell execution. A scoped draft file write was allowed only in write mode. Protocol fixtures separately tested permission refusal and attempted capability escalation.
- A separate owner-only provider context per project avoids importing global credentials/plugins. Projects or managed/private contexts with custom OpenCode configuration are refused rather than overriding policy. Setup must authenticate that context through official OpenCode mechanisms.
- The profile permits provider network traffic and the owned private OpenCode server. It is not a general network isolation environment or an assurance for arbitrary binaries. Only trusted official executables are intended. Source content can still contain sensitive information and requires appropriate provider authorization.
- Windows/Linux execution is disabled because no equivalent boundary was verified. Intel macOS was not tested. No cross-platform orphan-process safety is claimed.

See the [setup guide](../agents/opencode.md). Session resume, automatic cross-provider handoff, provider-reported usage and exact cost settlement remain unsupported/unverified for OpenCode. Usage is reported as unknown rather than invented.

## Queue, drafts and Codex

Deterministic host/CLI tests dispatch OpenCode through the existing task engine, preserving one durable task identity, exact model/variant, intent and policy snapshot. Duplicate admission does not run twice. Policy changes prevent dispatch. Existing trust, fingerprint, budget, ownership and draft-review checks remain in force. Restart leaves queued requests inert until reviewed dispatch.

A deterministic edit integration exercised a real Git worktree and journal: the original remained unchanged before approval, review produced a patch and explicit acceptance applied it. This proves engine integration with a fixture adapter, not a live OpenCode edit.

Codex installation/authentication status inspection succeeded without displaying credentials. Existing tests cover Provider Default + High and explicit model CLI arguments, streaming, permission boundaries, cancellation, queue and draft review. **No fresh live Codex Ask/edit/cancellation/queue inference was run:** the bounded chargeable-execution consent question was unanswered. OpenCode live read/edit also remains unverified and requires its separate official setup plus consent. Gemini and Claude live tasks were not rerun. No real cross-provider continuation is claimed; existing deterministic handoff/recovery tests remain passing.

## Automated and native results

Environment: Apple M2, 8 GiB RAM, macOS 27.0.1 ARM64, Node 26.9.0. Standalone editor reports 1.140.0; companion extension host tested on cached VS Code 1.143.1.

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Passed at baseline |
| Baseline `npm run check` | 207 passed |
| Final `npm run check` | **225 passed, 0 failed, 0 skipped**; 112 JavaScript files syntax checked |
| `npm run test:extension-host` | Passed |
| `npm run build:desktop` | Passed from clean source |
| Native full host, rebuilt app | Passed real search, editor/save, Git, terminal, bundled Node and panel assertions |
| Native Chat, rebuilt app | Passed two launches and effective variant/queue restoration |
| Two-launch restoration, rebuilt app | Passed workspace, editor, theme, content and routing preferences |
| Copied-DMG full host | Passed |
| Copied-DMG native Chat | Passed both launches |
| Copied-DMG routing/model UI | Passed actual webview assertions and persisted settings |
| Copied-DMG two-launch restoration | Passed |

Native Chat verifies prompt acknowledgement/clearing, text ordering and safety, Activity separation, scrolling, navigation, cancellation/error presentation, SQLite transcript restoration, model search, variant compatibility and queue persistence. Provider responses are explicitly fixtures; the host queue/preferences/journal persistence is real.

Early native fixture attempts failed because asynchronous real metadata responses removed the synthetic model's variants. The test-only transport gate is registered before workspace listeners, with marked fixtures. The combined routing/activity smoke now uses the same isolation principle after its real host persistence assertions. Normal production webviews have no gate or harness; unit tests verify their absence. No privileged production message path was relaxed. Additional preliminary failures included a restart fixture search matching two providers and the process-exit race described above; assertions were corrected or the underlying cleanup fixed, then rerun successfully.

Issue [#16](https://github.com/Gautam-aman/CODOVYN/issues/16) remains **open**. Search on the final rebuilt app took 102.161 ms, the plain copied-app run 99.820 ms and the copied routing host 354.336 ms. Passing bounded repetitions do not explain the historical 120-second stall. The original recursive `workspace.findFiles` assertion and timeout diagnostics remain intact. Native DOM focus observability was limited in the routing harness; full screen-reader accessibility closure is not claimed.

## Installer, copied launch and cleanup

- Installer: `dist/desktop/CODOVYN-darwin-arm64-development.dmg` (approximately 352 MiB).
- SHA-256: `f82aa7c1968f6df66f40d2a720ca56ce745d3a4eb2390d90f5339d62413730b9`.
- `hdiutil verify` passed. The image mounted read-only and was copied to `/tmp/codovyn-phase10-install.aXJf3B/CODOVYN.app`; the mount was detached successfully.
- `codesign --verify --deep --strict` passed before packaging and on the copied bundle. Identity is `org.codovyn.desktop`, ARM64, **ad-hoc**, with no TeamIdentifier. This is not a public production installer.
- `stapler validate` exited **65**; no valid CODOVYN notarization was established. Bundle stapling metadata is not treated as proof of notarization. No Gatekeeper policy, quarantine or security setting was bypassed.
- macOS 27 emitted deprecation warnings for `hdiutil attach/detach`; both operations succeeded. Upstream workbench AgentHost/unknown-channel warnings appeared in some logs without failing the required assertions.
- Recorded copied-app lifecycle reports ended with code 0 and `survivors: []`. Chat launch lifecycles were 15,758/19,854 ms and restoration 4,988/2,014 ms. The routing host lifecycle was 41,674 ms including its intentional 30-second inspection hold; these are test lifecycles, not startup performance benchmarks.
- No unrelated installed CODOVYN process was present in the pre-copy snapshot. The deterministic process-ownership test independently verified an unrelated sentinel survived cleanup. No broad executable-name termination was used. The copied test app exited; the disposable copy remains available. The owner's installed app was not replaced.

## Genuine application screenshots

These are captures of the **copied standalone application** with clearly synthetic task/model data. They are native UI evidence, not authenticated inference evidence.

- [OpenCode model search](../assets/opencode/opencode-model-picker.png)
- [Selected model and provider-specific variant](../assets/opencode/opencode-composer.png)
- [Durable queue controls](../assets/opencode/task-queue.png)

## Hosted CI and remaining gates

GitHub Actions run [39955236245](https://github.com/Gautam-aman/CODOVYN/actions/runs/39955236245) at the implementation SHA failed **before executing steps** on macOS, Ubuntu and Windows. Its annotation reports failed account payments or spending limits, plus macOS ARM64 runner capacity constraints. Workflow definitions were not disabled or changed to hide this.

**Local checks passed; hosted CI remains blocked by account configuration.** The owner must review GitHub Settings → Billing & plans, resolve failed payment/spending restrictions as appropriate, then rerun the current core/desktop workflows. No billing/account settings were modified.

The full milestone still requires consented live Codex tests, official authentication in the isolated OpenCode context, live OpenCode read/edit/permission/cancellation checks and actual provider continuation at a verified safe boundary. Public signing/notarization and non-ARM64/platform validation remain separate release gates. No production-readiness or live two-provider success is claimed.
