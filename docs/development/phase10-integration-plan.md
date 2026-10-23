# Phase 10 — integration audit and implementation boundaries

Starting main: `aacbb7f0d79ee4cf880766a56ef428e78b6e58e7`. Baseline dependency installation and 207 local tests passed.

The existing adapter async iterator, AgentRegistry, TaskEngine action ledger/execution ownership, SQLite queue, repository fingerprints, isolated drafts and patch review are the integration points. No second scheduler, storage backend or tool loop is needed. The composer already persists immutable task configuration; discovered models can use provider-specific IDs without changing existing catalogue records.

The installed Homebrew OpenCode is 2.1.2 from anomalyco/opencode. Its pinned ACP handler starts an owned standalone server and exchanges newline-delimited JSON-RPC. `models --standalone` prints documented provider/model lines; plain `models` can attach to a shared service and is unsuitable for owned execution. ACP session config options advertise actual model/effort IDs. Version changes must fail closed until tested.

Provider allow/ask/deny rules are insufficient by themselves: project/global configuration, plugins, nested agents, shell and external directories can widen behavior. Initial execution must use isolated provider configuration/state, an OS filesystem/process boundary on verified macOS hosts, no client terminal/MCP capability, strict permission requests and reviewed drafts. Other platforms remain disabled until equivalent containment is demonstrated. Normal OpenCode global configuration must not be rewritten or credentials copied. Reusing an installation does not imply importing its global authentication or allowing its plugins.

Implementation sequence: bounded ACP transport; containment and protocol adapter; bounded metadata/discovery and host/provider setup; immutable task/queue integration; deterministic and native tests; copied development-DMG verification. Automatic OpenCode failover is excluded until continuation semantics are verified. Reasoning variants are accepted only when session metadata advertises an enforceable selector.

Codex login status reports an authenticated CLI session, but no inference was issued. Live Codex/OpenCode requests require the separate requested consent; metadata and fixture tests continue independently. Java SDKs are installed. No credentials were read or exported.

References: [OpenCode ACP](https://docs.opencode.ai/docs/acp/), [CLI](https://docs.opencode.ai/docs/cli/), [permissions](https://docs.opencode.ai/docs/permissions/), [ACP initialization](https://agentclientprotocol.com/protocol/v1/initialization), and the [pinned 2.1.2 ACP handler](https://github.com/anomalyco/opencode/blob/v2.1.2/packages/cli/src/commands/handlers/acp.ts).
