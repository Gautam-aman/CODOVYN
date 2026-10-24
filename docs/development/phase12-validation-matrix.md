# Phase 12 validation matrix and recoverable checkpoint

Starting checkpoint: `c763f011c541316c57c1f98b2cf86f71b08a07b0`, clean `main`, correct remote, fetched with no divergence. Baseline dependency installation and 246 local tests passed. No inference is authorized by preparing this matrix or by detecting a CLI.

| Area | Evidence category | Current scope / remaining gate |
| --- | --- | --- |
| Codex model/default/High discovery | METADATA VERIFIED | Official CLI 0.164.0; default currently advertises High; session configured, inference access/quota unproven |
| OpenCode installation | METADATA VERIFIED | Official executable 2.1.2 on ARM64; version restriction preserved |
| OpenCode model discovery in new Git Java project | BLOCKED | Guarded `models --standalone` returns HTTP 500; own-context debug trace identifies denied `git rev-parse` process execution |
| ACP messages, cancellation, errors | DETERMINISTICALLY TESTED | Structured fixtures; a new failing cleanup regression exposed incorrect stopped evidence on cleanup failure |
| ContextFlow approval, fingerprint, queue, restart | DETERMINISTICALLY TESTED | Existing packet/engine/SQLite tests; real inference and correct destination work remain separate |
| Read-only, external paths, symlinks, shell restrictions | Real OS boundary tests | Existing macOS profile negative tests invoke actual denied operations; not proof of real-model compliance |
| Native Chat/history/queue/review | DETERMINISTICALLY TESTED in real app | Prior copied app/native fixtures passed; no fixture screenshot represents live AI |
| Disposable Java/JUnit project | Real host execution | Reproducible baseline and independent tests; no production project data |
| Codex/OpenCode inference and cross-provider continuation | BLOCKED | One bounded six-turn consent request pending; OpenCode readiness also blocked |
| Hosted workflows | External configuration | Previous zero-step billing/spending restriction; recheck current revision before report |
| Token/cost improvement | NOT IMPLEMENTED as a proven claim | Local serialization comparison exists; real matched provider telemetry/correctness comparison pending |

Campaign proposal: six turns maximum (Codex Ask/edit, OpenCode Ask/edit, Codex start + OpenCode continuation), 120 seconds and 12 observed tool starts per turn, no automatic inference retries. Existing owner Codex session and only CODOVYN's separate project-scoped OpenCode authentication context; exact costs unknown. Unsupported capability requests and unresolved actions stop execution. No global credentials/plugins will be imported; no process permission is widened to bypass discovery failure.

Controlled metadata experiment: the same path/context returned 10 models (`opencode/big-pickle` default, authentication unknown) without Git in 2,281 ms, then failed in 242 ms after Git initialization. A bounded own-context debug trace identified `EPERM posix_spawn git` during `/api/model` project discovery. The [pinned Git implementation](https://github.com/anomalyco/opencode/blob/v2.1.2/packages/core/src/git.ts) calls `rev-parse` after finding `.git`. This is an OpenCode integration compatibility blocker, **not** a cause of native workspace-search issue #16. No inference or credential transfer occurred.

## Reproducible independent Java checks (no inference)

```bash
node scripts/prepare-live-validation.js > /tmp/codovyn-validation.json
node scripts/verify-live-java.js /tmp/codovyn-validation.json baseline
node scripts/verify-live-java.js /tmp/codovyn-validation.json division
node scripts/self-test-java-oracle.js /tmp/codovyn-validation.json
```

Requirements: macOS ARM64, JDK 21, and the pinned public JUnit 5.11.4/Platform 1.11.4 dependencies already in the local Maven cache. Run `mvn -B -ntp test` in the generated disposable project first if those public artifacts need downloading. The validation commands do not contact a model or read provider authentication files.

The host oracle compiles bounded Java sources with annotation processing disabled, fixed local JUnit dependencies and host-owned requirement tests; it does not execute provider-modified Maven configuration. Child environments omit account credentials. Its process profile blocks project writes, ordinary private home/temp reads, shell execution and network; SDK/system reads are allowed. This is a targeted test boundary, not a general arbitrary-JVM security guarantee. Output/time are bounded and existing owned-group cleanup is independently audited. Source fingerprints must be unchanged after verification.

Observed controls: Maven baseline 3/3 passed; host baseline 7/7 passed (including four actual OS denial checks); division oracle 5/5 passed. The TaskService negative control correctly failed two missing-validation assertions; a **host-written** correct implementation in an isolated worktree passed 7/7 and was discarded, leaving the original unchanged. These controls test the oracle, not provider coding or live continuation. Real code correctness remains pending consent and provider readiness.
