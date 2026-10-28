# First OpenCode Ask: non-inference failure investigation

Starting local and remote `main`: `14f874f3ecdd8c8291af7dae01a2588c492dd16a`.

The interrupted session's nine modified files were recovered intact and backed up before further edits. Implementation commit: `f580c312f28d73d85e37aae4e2c644e0ad1e3d17`; the final evidence commit/remote SHA is verified in the handoff. No worktree reset, cleanup, original-journal migration or model submission was performed. This report concerns the **original one-request attempt**, not a successful AI response.

## What the original evidence establishes

**PROVEN LOCAL FAILURE CLASS:** a surviving isolated OpenCode log has an ERROR from the server, at `2026-10-28T04:03:30.364Z`, with the exact static message `Failed to drain Session` and a `QuotaExceeded` cause marker. Its session identifier was compared privately with the original TaskEngine session event and matches exactly. Only the equality result, static marker and log checksum are published; no provider prose, account identifiers, credentials or raw log lines are included.

The log SHA-256 is `c01e5b876e1c84be9c63ddc839889743fcbf9c100193fc21ddf02bf6187570e4`. The pinned upstream [session executor](https://github.com/anomalyco/opencode/blob/a517687fde98a7329ada3ae644a01a9fc6c4e99e/packages/core/src/session/execution.ts) emits that static message when its session runner fails. The pinned [error conversion](https://github.com/anomalyco/opencode/blob/a517687fde98a7329ada3ae644a01a9fc6c4e99e/packages/core/src/session/to-session-error.ts) distinguishes quota errors from rate limits and authentication. This supports an OpenCode-local **quota-class session failure**. It does **not** prove which upstream limit applied, that the account has insufficient credits, whether an upstream model received the request, or whether a charge occurred.

| Stage | Independently observed result |
| --- | --- |
| Exact workspace / prompt / model | Approved Calculator, fixed prompt hash, `opencode/gpt-5.4-nano`, Provider Default |
| Native consent | One durable owner approval |
| Task admission / ownership | Execution lease acquired; provider and private child owned |
| ACP initialization / session / configuration | Completed; exact model recorded |
| MCP | Initialize / initialized / tools-list metadata only |
| Request reservation | One durable reservation |
| Submission intent | `submitting`, one attempted submission |
| Local `session/prompt` write | No historical write-enqueue receipt was recorded. Source places the call after submission intent. The matching OpenCode server-session error confirms local session processing, not upstream delivery. |
| Provider acceptance / response | Zero host acknowledgement records; zero text events; no verified model answer |
| Failure | Server session `QuotaExceeded` marker; request became `uncertain`, task `interrupted` |
| Deadline / cancellation | Reservation-to-uncertain wall-clock interval **571 ms**, inconsistent with an ordinary 120-second timeout. Historical monotonic/cancellation-source telemetry is unavailable. |
| Cleanup | Provider/child stopped events; lease released; recorded PIDs/process groups independently absent |
| Usage / billing | Unavailable; internal inference calls and charges remain unknown |

The last reliable local execution evidence is the matching OpenCode server-session failure after reservation/submission intent. **Do not equate local intent, local ACP processing, JSON-RPC error receipt and upstream model acknowledgement.** The original uncertain request remains spent. There is no retry, new spending consent, fallback, Agent edit or ContextFlow continuation.

## Competing explanations

- **Quota-class rejection:** supported by the exact session-matched `QuotaExceeded` marker. Exact quota, upstream HTTP response and billing are unproven.
- **Initial executable, authentication-metadata, sandbox, MCP or TaskEngine admission failure:** contradicted as the initial failing stage by successful owned session setup and reservation. Stored credentials and catalogue entries still do not prove authenticated model entitlement.
- **Authentication, unavailable model, upstream network denial or provider-internal process failure:** no independent typed evidence identifies these as the original cause. They are not silently ruled out merely from successful metadata.
- **120-second deadline or owner cancellation:** no supporting historical event; the wall-clock interval is 571 ms. No precise cancellation source was recorded for the original request.
- **Disconnect / malformed reply / event propagation:** original error details were discarded, so the exact ACP error/disconnect sequence cannot be reconstructed. New local fixtures cover these paths. A real missing-result correlation bug was found and fixed, but there is no evidence it caused the original quota-class failure.
- **UI “task-admission” warning:** misleading fallback classification, not proof that admission failed. The adapter wrapper now defaults post-adapter failures to the request stage and retains safe typed ACP categories.

## Implementation

- Bounded ACP diagnostics: at most 128 observations per connection, closed phase/method/category vocabularies, monotonic elapsed milliseconds, local write-enqueue versus response, accepted provider activity, cancellation source, process-exit class and cleanup result. An enqueue receipt does not prove delivery. The stream may exhaust the diagnostic cap; durable ownership/cleanup events remain separate evidence.
- The Ask worker writes those sanitized observations into the existing TaskStore event journal, with acknowledgement state. No second journal or scheduler, raw stderr capture, remote messages, error bodies, account identities, parameters, source contents or prompt text is introduced.
- Structured error categories use only pinned fields/codes; unknown prose stays unknown. The UI receives fixed descriptions for quota, authentication, disconnect, protocol failure, timeout and empty/incomplete response.
- Malformed responses are validated **before** clearing their correlation/timer; missing/contradictory results and invalid error envelopes reject the caller instead of leaving its promise unsettled.
- Input-stream errors fail closed. Intentional disposal is not mislabeled as an unexpected disconnect. Observer exceptions cannot change approval, submission or cleanup.
- Deadline, owner cancellation and authority revocation have distinct bounded cancellation labels. Existing reservation/uncertainty/replay rules and all sandbox permissions remain unchanged.

## Qualification

- Recovery focused suite: **52 passed, 0 failed/cancelled/skipped** (23826.334334 ms). It includes ACP, native consent, real TaskEngine/SQLite accounting and crash/reopen fixtures; not additive to the full count.
- Initial `npm run check`: **439 passed, 1 failed, 0 cancelled/skipped**, out of 440 (147267.537584 ms). The failure was the existing authentication-boundary test rejecting the globally upgraded Codex **0.165.0** hash. This is an environment mismatch, not evidence that OpenCode diagnostics broadened a permission.
- Qualified rerun: syntax checked **218 JavaScript files**; **440 passed, 0 failed/cancelled/skipped**, 146868.474083 ms. Command: `PATH=/private/tmp/codovyn-diagnose-runtime:$PATH CODOVYN_TEST_CODEX_EXECUTABLE=/private/tmp/codovyn-pinned-codex-0164/codex npm run check`. Paths shown are disposable test locations, not credential stores.
- The test-only Codex executable selector retains the production `verifyCodexControlExecutable` hash check. The official [0.164.0 release archive](https://github.com/openai/codex/releases/download/rust-v0.164.0/codex-aarch64-apple-darwin.tar.gz) supplied a separate binary; its SHA-256 matches the unchanged pin `d8990e3ee7acfbc26f91265b12a1a83f0fee40d0e0f8f1f40a37d4ec21f499cf`. The isolated authentication-boundary regression also passed independently (**1/1**); no sign-in/account request or global install replacement was performed.
- `npm run build:desktop`: **passed**, clean implementation commit `f580c312f28d73d85e37aae4e2c644e0ad1e3d17`, `sourceDirty: false`, version **0.1.0-alpha**. An independent disposable copy passed deep/strict signature verification. Ad-hoc signed and unnotarized; no public distribution claim and no new DMG was required for this investigation.
- On that copy, `npm run test:extension-host` (supported direct executable override), `test:desktop-host`, `test:desktop-chat`, `test:desktop-routing-ui` and `test:desktop-restoration` all **passed**. Chat and restoration exercised two launches. These native provider responses/history are deterministic fixtures, not a new live inference result.
- Two preliminary extension-host launches via an additional private shell wrapper failed the existing workspace-present assertion. Adding the CLI environment did not resolve it. Using the package's supported **direct copied-app executable override** passed unchanged assertions; the exact wrapper incompatibility was not investigated further or represented as a product regression fix. Other native suites already launch the executable directly. No failed launch was counted as a pass.
- Native lifecycle receipts have zero survivors/cleanup errors, and an independent process listing found no process using the copied app. The original live request's historical groups remain absent and its lease remains released. The installed `/Applications/CODOVYN.app` was not modified.

Deterministic coverage includes no acknowledgement/deadline, disconnect before acknowledgement, delayed acknowledgement, empty response, valid streamed text, typed quota error response, malformed envelopes, crash after partial text, cancellation racing with acknowledgement, database reopen/SIGKILL recovery, denied tool activity, consumed approval and duplicate dispatch. Unknown submissions remain spent/uncertain. Host acknowledgement means accepted ACP activity/final result, **not** an upstream billing receipt or measured internal inference count.

The owner journal's before/after logical SHA-256 is `a0bb3bb166f7164bba052670fd00860c59d9597655f3342592e008d1e92f0965`. Its **4 tasks, 1 consent, 1 request and 1 historical released lease** are unchanged; there are zero active leases and zero new owner consents/requests. See [sanitized investigation evidence](../assets/opencode-context-migration/first-ask-investigation.json).

All new prompt messages were synthetic local ACP fixture traffic. No real provider prompt, account login, spending consent, retry or model switch was performed during this investigation. The supported pinned Codex artifact was downloaded only for a non-inference boundary test; the global installation and runtime integrity pin were not changed.

The original Calculator still has baseline `ac00214528f004350bbd7b53349861726e270323`, source SHA-256 `dee76c8f9584ba9286e2bd67948499030760f3978bb6a3e4074cbcf731088c26`, and a clean Git worktree. Before/after read-only logical digests of the owner task/event/consent/request/lease tables match. No original database records were deleted, converted or reconciled. The prior first-attempt outcome artifact is preserved.

## Next non-inference gate

**A fresh live test is not currently admissible.** The global uncertain-request fence and spent reservation remain intact, and the relevant provider quota has not been independently established. The smallest next investigation is owner inspection of the isolated OpenCode account's official usage/limit/entitlement information, without purchasing credits or sending inference. Any later execution requires explicit reviewed handling of the existing uncertainty, fresh exact native consent and separate inference approval. Do not clear the fence, rewrite the outcome, switch models or fund the account automatically.

General coding execution, Agent mode, automatic failover and public-release readiness remain blocked. Hosted CI/billing and historical issue #16 are not declared resolved by these local tests.
