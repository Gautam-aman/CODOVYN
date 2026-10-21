# Transparent local model routing

The shared `packages/agent-router` policy is deterministic and requires no account.
It selects from an explicitly supplied model catalogue; it does not invent model
access, prices, quality scores, reasoning support or subscription quota.

## Modes

All modes reject missing capabilities, unsupported requested reasoning, unavailable
candidates and inadequate configured quality scores (simple: 0, moderate: 50,
complex: 80). Complexity can be overridden; otherwise a small documented keyword
classifier treats architecture/security/concurrency as complex, implementation and
debugging as moderate, and remaining requests as simple. This is a policy heuristic,
not an evaluated classifier or a security boundary.

- **Auto:** prioritize configured reliability, then estimated cost among adequate models.
- **Economy:** minimize known estimated cost among adequate models.
- **Balanced:** prefer quality nearest the configured policy target of 80, then reliability.
- **Performance:** prefer quality, then reliability.
- **Custom:** select the specified catalogue entry while retaining safety/budget gates.

Provider preferences and stable IDs resolve ties. Quality/reliability are user
catalogue policy inputs, not CODOVYN benchmarks or automatically learned outcomes.
Unknown availability is excluded unless explicitly allowed. That override does
not claim authentication or available quota.

## Configure and preview

Use native Settings JSON, resource-scoped `codovyn.routingPolicy`, then select
**Model routing · read only** or **Model routing · edit draft** in the CODOVYN panel.
A preview shows considered candidates and rejection reasons. Native confirmation
names the selected provider/model and estimated cost before execution. Edit mode
also retains worktree permission and patch approval. The policy is frozen before
confirmation; the renderer cannot replace it.

Example configuration (replace the placeholder with an actually authorized model):

```json
{
  "codovyn.routingPolicy": {
    "mode": "balanced",
    "allowUnknownAvailability": true,
    "models": [{
      "id": "my-model",
      "provider": "codex",
      "model": "YOUR_AUTHORIZED_MODEL",
      "capabilities": ["streaming", "tools", "writes"],
      "reasoning": [],
      "quality": 80,
      "reliability": 0.8,
      "availability": "unknown",
      "price": null
    }]
  }
}
```

These scores are example policy inputs, not a claim about any real model. Price
`null` means unknown. Do not put credentials in this setting. There is no automatic
provider fallback in routed modes; another request needs another admission.

CLI uses the same object **without** the `codovyn.routingPolicy` wrapper in the
`CODOVYN_ROUTING_POLICY` environment variable:

```sh
node apps/cli/src/index.js route /path/to/project 'Explain the code'
node apps/cli/src/index.js routed /path/to/project 'Explain the code'
node apps/cli/src/index.js routed-edit /path/to/project 'Make a change' --allow-writes
```

`route` is preview-only. A valid policy preview exits successfully even when
`selected` is null, so inspect its decision. `routed` refuses execution and records
a failed task if no model qualifies. Decisions are persisted before provider
execution and appear in the task timeline. Invalid configuration does not become
an implicit default provider request.

## Provider-specific selectors

Codex uses documented `--model` and `--config model_reasoning_effort=...`; Gemini
uses its documented `--model`. The model's catalogue reasoning list must contain
an explicitly requested effort, and only Codex currently applies reasoning
selection. This does not prove the chosen model accepts the setting; the CLI/provider
must still validate account and model capability. Claude model routing is refused
until its selector is integrated/validated, while its existing direct adapter stays.

Codex's supported effort values depend on the model/client, as described in the
[official OpenAI configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
No global effort or price table is assumed. Gemini reasoning selection is not
exposed by this integration. Processing/speed modes are not implemented.

## Cost estimates and budget limitations

Optional `tokens: {"input": 1000, "output": 1000}` is an explicit estimate.
`price` may contain `inputPerMillionUsd`, `outputPerMillionUsd` and a bounded
`source` label identifying the user's price evidence. No prices are bundled.
Estimated cost is the weighted token estimate; it is never provider-reported usage.

Optional `budget` supports `taskUsd`, `sessionUsd`, `monthUsd`, `sessionSpentUsd`
and `monthSpentUsd`. Finite limits reject unknown estimated cost; session/month
limits also reject unknown consumed amounts. Null/missing limits are unbounded.
Known costs exceeding the supplied remaining budget are rejected before requests.
The runtime adds required tool/write capabilities, which cannot be removed by settings.

**This is admission against estimates, not a hard spending cap.** CLI generation
may exceed estimated tokens and may not expose exact cost. Supplied consumed
amounts are user-maintained snapshots, not an atomic multi-task reservation ledger
or account-wide billing monitor. Concurrent requests and external provider usage
are not coordinated. Routing reports `hardSpendingGuarantee: false` and unknown
usage; it does not silently promise session/month enforcement. Full local budget
reservations and usage settlement remain unfinished under
[#5](https://github.com/Gautam-aman/CODOVYN/issues/5). Recovery continuation of routed
tasks is blocked until a new admission is available.
