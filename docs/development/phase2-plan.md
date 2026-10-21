# Multi-agent campaign

Baseline: `e2664564f6dad2aff45bca45328264ea2ea3aab7`, clean synchronized main.
All 112 baseline tests passed. All twelve open issue descriptions were read.
Gemini CLI is not installed in this environment; live Gemini validation is blocked
until an authorized installation is available. Do not mark #2 complete prematurely.

The shared adapter registry, subprocess lifecycle, journal, worktree drafts and
pre-write failover can support Gemini directly. The desktop ships the same CLI
and webview, so extending these integrations reaches both products.

Current gaps: fallback order is hardcoded to Claude, no persisted project agent
policy, portable context contains only observable text and repository state,
write history blocks retry conservatively, and no supported primary availability
probe establishes quota recovery. Preserve these safety gates until tested
reconciliation exists. Never automatically treat CLI installation as quota or
authentication availability.

Implement in dependency order: bounded Gemini event normalization; restricted
headless subprocess execution and lifecycle tests; CLI and desktop selection;
local primary/fallback settings; deterministic Codex-to-Gemini integration;
portable context; explicit interrupted-draft reconciliation; safe-boundary
restoration only with verified availability; independent routing policies.

Official references checked 21 October 2026:
- https://geminicli.com/docs/cli/headless/
- https://geminicli.com/docs/reference/configuration/
- https://geminicli.com/docs/reference/policy-engine/
- https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/output/types.ts

The stream schema's final error has a type/message, not necessarily an HTTP
status. Unknown errors must remain fatal/unknown rather than guessed quota.
Supplemental admin policies are ignored when central policies exist; integrations
must detect this situation and refuse unsupported permission guarantees.

Count only commits after the baseline. No branches, PRs, releases or visibility
changes are authorized in this campaign. Push every verified logical step.
