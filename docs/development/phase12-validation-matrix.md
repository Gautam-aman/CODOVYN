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
