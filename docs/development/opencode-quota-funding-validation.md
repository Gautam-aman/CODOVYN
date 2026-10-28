# OpenCode quota blocker: funding rejection identified, owner action required

Implementation commit: `f99776d7c9c163f2fe21180ce04139f2043a6f83`; final documentation/remote commit is verified in the handoff.

Starting local/remote `main`: `9a93c2e80a43b3d886203444b74cb1b4bedce108`. Worktree clean at start. No real inference, retry, new owner spending consent, provider/model switch, account change or sandbox expansion is authorized or performed in this investigation.

## New evidence and causal conclusion

**PROVIDER-REPORTED REJECTION VERIFIED. FUNDING CONDITION NOT RESOLVED.** Beyond the earlier `QuotaExceeded` log marker, the existing isolated OpenCode SQLite store retains two failure records for the exact session recorded in the original TaskEngine journal:

| Existing record | Safely extracted evidence |
| --- | --- |
| Assistant failure | `error.type = provider.quota`; HTTP **402**; error message and parsed response-body message both match the documented insufficient-account-funds error; assistant content empty |
| Terminal idle record | Same error type, status and message matches; failed outcome |

Inspection used canonical, owner-controlled context paths and a read-only SQLite connection with `query_only` and `trusted_schema=OFF`. Only the session identifier from the original task was used to locate rows. Credential payloads, labels, keys, cookies and browser storage were not selected. No raw response bodies, session identifiers or account details are published. [Sanitized evidence](../assets/opencode-context-migration/quota-funding-investigation.json) records equality/category results rather than provider prose.

This supports a **funding rejection reported by the OpenCode gateway**, rather than just an unspecified usage limit. It does not independently verify the current account balance, credit agreement, invoice state, actual upstream network delivery, internal model activity or billing. No live test has succeeded. Do not turn the original `uncertain` accounting record into `failed` to bypass its fence.

## Pinned source versus current Console documentation

Pinned official source commit: `a517687fde98a7329ada3ae644a01a9fc6c4e99e`, used for supported OpenCode **2.1.2**. The [AI error classifier](https://github.com/anomalyco/opencode/blob/a517687fde98a7329ada3ae644a01a9fc6c4e99e/packages/ai/src/provider-error.ts) maps HTTP 402, recognized quota codes, and certain 429 quota messages to `QuotaExceeded`; other 429 throttles are distinct. The [session conversion](https://github.com/anomalyco/opencode/blob/a517687fde98a7329ada3ae644a01a9fc6c4e99e/packages/core/src/session/to-session-error.ts) preserves the HTTP status and error response and maps the class to `provider.quota` (or its dedicated free-limit category). A `QuotaExceeded` name alone therefore never proves an empty balance.

Current official Console documentation checked 2026-10-28:

| Possible restriction | Documented check | Evidence for this attempt |
| --- | --- | --- |
| Prepaid funds / invoiced credit | [Billing](https://opencode.ai/v2/docs/console/billing/): paid requests can fail with 402 for exhausted prepaid funds, a reached credit limit or an overdue invoice. Inspect Settings > Billing. | **402 plus the exact insufficient-funds message is persisted locally.** Current balance and account policy are not accessible here. |
| Workspace/member/service-account budget | [Budgets](https://opencode.ai/v2/docs/console/budgets/): all applicable budgets constrain spend; policy-budget rejection is 429. Activity > Logs identifies the blocking policy. | No policy-budget evidence in the two matched failure records. Other policies may still apply. |
| Upstream provider quota | [Provider connections](https://opencode.ai/v2/docs/console/providers/) distinguish Console-provided models from linked providers billed by the provider. | No upstream billing/account access; do not infer another provider's quota. |
| Model access / key permissions | [API permissions](https://opencode.ai/v2/docs/console/api/): model listing and requesting are separate permissions; keys belong to a specific workspace. Inspect Models, Controls and the existing account's permissions without revealing keys. | 39 discovered models were metadata only. This attempt's funding error does not independently certify every entitlement. |
| Subscription / allowance | [Go](https://opencode.ai/v2/docs/console/go/) has model-specific allowances, distinct from Console credits. Do not assume another subscription covers the selected model. | No plan/allowance information was inspected; no subscription was started or changed. |

`opencode/gpt-5.4-nano` is a Console model listed in the [official model catalogue](https://opencode.ai/v2/docs/console/models/), not proof of a free or entitled account. Current reference rates are $0.20/M input and $1.25/M output tokens. They are not this request's bill or a future dollar cap.

These public pages describe current service behavior; the pinned source and original persisted records establish what the local supported CLI actually observed. Do not retroactively assume every current Console feature existed identically at execution time.

## Read-only account access boundary

The running browser had **zero OpenCode Console/non-documentation tabs**; no explicitly available authenticated Console view was found. No login was initiated and no cookie/token/credential extraction was attempted. Official API documentation describes read-only permissions for billing and usage, but no existing approved read-only API connection is available to CODOVYN. No endpoint was guessed and no key was created or retrieved. CLI authentication listings and local usage statistics do not prove remote account balance or final billing.

### Exact owner checks — do not change settings in this review

1. Open [OpenCode Console](https://opencode.ai/console/) manually. Select the **same workspace/account used by the migrated isolated OpenCode context**, not an unrelated funded workspace. Keep identifiers and keys private.
2. In **Settings > Billing**, inspect the credit balance and whether the account uses invoiced credit. Check for an exhausted credit line or overdue/failed invoice. The persisted failure is insufficient account funds; this is the first corrective gate. No payment, top-up, auto-recharge or subscription action has been taken.
3. In **Activity > Logs**, locate the `gpt-5.4-nano` attempt around **2026-10-28 04:03:29–04:03:30 UTC** (**09:33:29–09:33:30 IST**). Inspect its status, rejection reason and any recorded usage/charge. Absence from a filtered view is not proof of zero cost. In Activity > Usage, inspect the same interval/model if available.
4. In **Controls**, inspect every applicable workspace/member/service-account/model budget and provider/model policy. Inspect model availability and the existing account/key's permission to request models without revealing or copying the key.
5. Report only non-secret findings: whether the intended balance/credit is sufficient, whether an overdue invoice or policy block exists, and whether a request/charge is recorded. Do not paste keys, account identifiers or private response bodies.

If funds are indeed missing, **only the owner may decide whether/how to fund that exact account or address its billing agreement**. This task does not authorize that action. If funds are sufficient but the rejection persists, the next non-inference step is official provider support using the owner's private request identifiers. Do not test by sending another prompt or changing the model.

## Original request and accounting

The last independently confirmed stages remain successful admission/ACP/MCP metadata configuration, one durable reservation and submission intent, followed by the session-correlated local funding rejection. No historical local write-enqueue receipt was recorded. The stored HTTP/error response establishes a provider-reported rejection; it is not an independent network capture or proof that an upstream model accepted the prompt. There are zero host acknowledgement records and no model text, token usage or invoice receipt in TaskEngine.

The original request is **uncertain and spent**, its task interrupted, with one consent, one request, zero acknowledgements/tools and a released historical lease. The before/after owner-journal logical digest remains `a0bb3bb166f7164bba052670fd00860c59d9597655f3342592e008d1e92f0965`. No old rows, approvals or outcomes are rewritten. Rejection evidence does not authorize a retry.

## Relevant UX and safety changes

- Existing TaskStore now exposes a small read-only global submission-gate summary (pending/uncertain), with no task/account identities or secret data. The **same** predicate remains inside the atomic reservation transaction; an old clear preflight cannot bypass a later reservation.
- The single-Ask worker checks the existing fence **before provider discovery**, before preparing a task/review, and before consuming native consent. A blocked startup emits a safe request-accounting diagnostic and closes without launching a provider, creating a task or issuing consent. Later checks can cancel an already prepared, never-admitted task if a concurrent request established a fence after startup. Models/settings metadata inspection remains separate.
- Quota guidance points to Billing, Activity logs and Controls without asserting that every quota error is a funds error or changing account settings. Authentication, quota, request rejection, disconnect and timeout remain distinct.
- The pinned invalid-model ACP reply is recognized by its structured invalid-params provider/model fields, without logging either identity or matching arbitrary provider prose.
- Native copied-app Chat tests verify the actual packaged quota/authentication/fence messages render literally in an accessible status region. They remain synthetic diagnostics, not model responses.

## Qualification

- Focused non-inference tests: **54 passed, 0 failed/cancelled/skipped**, 21679.178292 ms. Includes quota/auth/model/request-error/disconnect/deadline/delayed/synthetic-success fixtures, immutable read-only gate summaries, cross-connection duplicate protection, actual worker refusal before executable discovery, and native-controller secret masking. Focused counts overlap the full suite.
- `npm run check`: **447 passed, 0 failed/cancelled/skipped**, 138020.589208 ms, using the integrity-checked packaged Node 26.12.1 and explicit verified Codex 0.164.0 **test-only** executable path. The existing production executable pin remains unchanged; no global Codex replacement or account access occurred.
- `npm run build:desktop`: **passed** from clean implementation commit `f99776d7c9c163f2fe21180ce04139f2043a6f83`, `sourceDirty: false`, version **0.1.0-alpha**. A separate copy passed deep/strict signature verification before and after tests. Ad-hoc signed and unnotarized; no public installer claim or release.
- On that copy, `npm run test:extension-host` (supported direct executable override), `test:desktop-host`, `test:desktop-chat`, `test:desktop-routing-ui`, and `test:desktop-restoration`: **all passed**. The extension-host run took **201663 ms** without changing its outer test budget; the cause of that slow activation remains unproven. No timeout was increased to hide it. This is not proof that historical search issue #16 is resolved.
- Both native Chat launches verified the **packaged** quota/authentication/fenced-request diagnostics, literal text rendering and accessible status announcements. Their responses and review state are synthetic fixtures, not live provider inference.
- The **actual packaged worker**, pointed at the unchanged original owner journal with an executable-must-not-run witness, returned only `REQUEST_FENCED` and certified close **before executable resolution/discovery, model review, consent or task creation**. It exited 0 and its owned group was absent. It did not send `session/prompt` or contact a provider.
- Original owner TaskStore logical digest and all task/consent/request/lease counts are identical before/after. The two original provider failure records are unchanged as well. Model requests and owner spending consents added: **0**. Historical lease released; original groups absent; all copied-app processes absent; native lifecycle receipts have zero survivors/cleanup errors.
- No dependency, OS sandbox, provider credential, account-policy, GitHub billing, installed-application or public-release changes were made. Hosted CI was not run or represented as passing. No new DMG was needed for these copied-app checks.

Calculator's Git baseline remains `ac00214528f004350bbd7b53349861726e270323`, source SHA-256 `dee76c8f9584ba9286e2bd67948499030760f3978bb6a3e4074cbcf731088c26`, and tracked worktree clean. Original provider groups and all test-owned copied-app processes are absent after cleanup. The installed `/Applications/CODOVYN.app` was not modified. No new inference, owner spending consent, Agent work, provider/model switch or account mutation occurred.

## Next authorization gate

**NOT READY for a distinct live request.** The funding condition has been identified but not independently resolved in the account. Separately, the current architecture deliberately blocks every new reservation while an uncertain request exists. Restored funds and fresh approval do not remove that guard.

A future test requires (1) owner-verified resolution of the funding condition, (2) a separately reviewed and explicitly authorized append-only handling/reconciliation design for historical uncertainty, which preserves the original spent record and is **not implemented by this task**, and (3) fresh exact one-use inference consent. There is no automatic/unattended reconciliation or retry. No executable proposal or spending consent is created now. Keep the same provider/model and exact Calculator scope if a later proposal is authorized; do not use an account issue as grounds for fallback.
