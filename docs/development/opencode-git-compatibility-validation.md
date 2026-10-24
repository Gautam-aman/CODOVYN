# OpenCode Git compatibility investigation

Phase 13, 2026-10-24. **In progress; no live inference authorized or performed.**

Starting source: `515767718b0248c7f172d949b9a8e2d1ee6a155c`, clean `main`, synchronized with `origin/main`. Dependency installation and baseline checks passed: **252 tests, zero failed/skipped**. No branch, PR, release, installed-app replacement, or security-setting change.

## Root cause and integration alternatives

The official macOS ARM64 OpenCode 2.1.2 executable starts its server during `models --standalone`, as well as during ACP initialization. Its project resolver walks upward for `.git`, then invokes literal `git` with `rev-parse --git-dir --git-common-dir --show-toplevel`, using the resolved repository directory as cwd. The child inherits CODOVYN's isolated provider environment. CODOVYN's Seatbelt profile allows only the pinned provider executable; `posix_spawn git` therefore fails with EPERM. This is an intentional process restriction, not an authentication error.

Pinned upstream sources inspected under tag `v2.1.2` in `anomalyco/opencode`:

| Source | SHA-256 |
| --- | --- |
| `packages/core/src/git.ts` | `bfbdc5ea5c8a2bd8c8913ca40c0c1f948f87ee6036d234a1441871622f402f24` |
| `packages/core/src/project.ts` | `73555039b0d9fc6987bf4292ff4b4f521cea32e17449ef93df5800ebaaadb9e0` |
| `packages/core/src/util/git-executable.ts` | `2911263cfeee6e27fee8c6f5a9e611ace97796e7a20f76f57effca20f691aaac` |

Source hashes were independently checked against the official tag on 2026-10-24. The first command is not the entire required interface: project identity can consult the origin remote and root commits, while session metadata can query HEAD and branch. Linked worktrees may require `worktree list --porcelain`. Git-directory and common-directory identity differ for linked worktrees. Commands prefixed with `--git-dir`/`--work-tree` also occur. Snapshot creation and other Git operations must remain disabled or denied, rather than accidentally gaining authority through a general Git exception.

1. **Official capability:** the documented ACP interface accepts a session cwd, not client-provided trusted Git identity. No supported repository-metadata injection or discovery bypass was found in the inspected 2.1.2 path. Hiding `.git` would change repository semantics and is rejected.
2. **Broker:** host-side metadata alone is insufficient; this OpenCode path does not consume it over ACP. Inventing a protocol field would not fix initialization.
3. **Fixed native shim:** an isolated feasibility experiment returned actual host-observed discovery/HEAD/branch/root-commit values from a compiled fixed-purpose executable. It executes no subprocess. With only that literal executable added to the experimental sandbox and a canonical PATH entry, real OpenCode model discovery succeeded in a disposable Git repository. Real Git and shells were not allowed. This establishes consumption feasibility, **not production security approval**.
4. **Pinned source patch:** replacing discovery could provide an explicit trusted interface, but would require maintained upstream changes, reproducible builds, binary provenance and separate review. No patched provider binary was installed or distributed.

The production Git-backed execution guard remains in place while the shim's authority, freshness, executable integrity, environment and linked-worktree boundaries are evaluated. A PATH change alone is not a sandbox. A host-side Git collector would itself need fixed commands, sanitized environment, helper denial, bounded output, safe path resolution and protection against repository-local configuration/includes. Disabling fsmonitor alone does not solve these requirements.

## Evidence categories

- **IMPLEMENTED AND VERIFIED:** existing fail-closed Git-backed execution guard; baseline tests.
- **METADATA VERIFIED:** preliminary native-shim model-discovery experiment, without `session/prompt`.
- **BLOCKED:** production shim/broker approval and Git-backed provider execution until the full boundary is demonstrated.
- **NOT IMPLEMENTED:** public patched-provider distribution, unrestricted Git permission, automatic handoff, or new inference authorization.

Final native/package results, measurements and remaining limitations will be appended after bounded validation.

## Reproducible probe and production decision

Run `node scripts/probe-opencode-git.js` on macOS ARM64 with Xcode Command Line Tools and official OpenCode 2.1.2 on PATH. The script accepts **no project arguments** and creates all repositories/configuration itself. It compiles/ad-hoc signs a research-only C shim, supplies fixed host-observed metadata, and uses the existing process manager and ACP transport. It does not import owner credentials/configuration, send `session/prompt`, alter the production sandbox, or enable any provider task. Evidence goes to ignored `dist/desktop/opencode-git-probe.json`; [the recorded result](opencode-git-probe-evidence.json) is retained for review.

**METADATA VERIFIED, experimental sandbox only:** ordinary and linked-worktree model discovery and real ACP `initialize` / `session/new` succeeded. Authentication remains unknown. No model inference, account entitlement or live ContextFlow continuation is established.

**DETERMINISTICALLY TESTED with actual native execution:** nine positive cases cover initialized/unborn, committed, feature branch, detached HEAD, linked worktree, spaces, nested directory, separate Git metadata, and non-Git discovery. The non-Git case uses the original production boundary. Fourteen negative groups cover strict command/argument denial, foreign cwd, symlink escape, environment redirection, uninvoked hook/fsmonitor/credential markers, and read-only/draft OS witnesses. Each OS witness denies shell/real Git/other executable invocation, external access, protected Git metadata writes, and shim mutation. A writable-project hardlink witness could neither link nor modify the outside shim. These are scoped experiment results, not proof that an arbitrary Git broker is secure.

**BLOCKED, with counterexamples:** the immutable-snapshot shim still returns stale branch metadata after an owner-side branch change; accepts a new nested repository as its ancestor; and accepts a new directory at the original pathname. These checks intentionally record unsafe feasibility results rather than passing them off as integration success. All three require a host-verified, race-resistant identity/freshness design before this approach can be considered for production. Further review remains necessary for an untrusted-repository collector, linked-common-directory authorization, executable/dynamic-loader integrity, lifecycle binding and installation/toolchain dependencies.

**Decision:** do not install this shim into the provider boundary. Keep Git-backed OpenCode execution blocked. Do not allow real Git, shells, hooks, credential helpers, fsmonitor, arbitrary provider commands or external metadata access. The script is a minimal reproducible research case, not an executable compatibility bypass exposed to the UI. A hardened broker/shim or a reviewed, reproducibly built upstream compatibility interface is **NOT IMPLEMENTED**. This phase has not resolved the production execution blocker.

## Readiness correction

A confirmed diagnostic defect was fixed: unsupported OpenCode versions previously inherited the project's independent `executionSupported` flag, which could be true outside Git. Status now requires both exact verified version and project compatibility. Separate version compatibility, project readiness and unverified metadata-initialization fields preserve authentication/availability uncertainty. A catalogue or executable presence cannot promote these facts. Native provider settings display the separate states and retain the Git blocker; previously cached model entries remain disabled. The real native Chat harness asserts these fields independently of its provider fixtures.

Source provenance: [pinned Git implementation](https://github.com/anomalyco/opencode/blob/v2.1.2/packages/core/src/git.ts), [pinned project resolver](https://github.com/anomalyco/opencode/blob/v2.1.2/packages/core/src/project.ts), [pinned executable resolver](https://github.com/anomalyco/opencode/blob/v2.1.2/packages/core/src/util/git-executable.ts). Official interfaces reviewed: [ACP](https://opencode.ai/docs/acp/), [CLI](https://opencode.ai/docs/cli/). No undocumented ACP metadata field or terminal-screen scraping was introduced.
