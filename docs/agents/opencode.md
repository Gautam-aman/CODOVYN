# OpenCode connection

CODOVYN's guarded OpenCode adapter targets **OpenCode 2.1.2 on macOS ARM64**. Other versions and non-macOS execution are refused until independently verified. Intel macOS has not been tested. It uses the documented ACP stdio interface, not an embedded terminal UI.

Open **Settings → AI Providers and backups** and inspect providers. If the executable is outside the app's PATH, choose **Configure path** and set the application-level `codovyn.opencodeCliPath` to its absolute path. Workspace content cannot set that trusted executable.

Choose **Models** to query `models --standalone` and initialize an ACP metadata session. This starts no prompt or inference turn. The picker labels catalogue entries as access unverified. Authentication, entitlement and quota are not established by catalogue presence. Discovery is lazy, bounded and cached for five minutes; **Refresh models** refreshes the current selection.

## Separate authentication context

OpenCode can load plugins, external tools and permissive configuration. CODOVYN therefore uses a separate, owner-only provider context per project. It does **not** import your global OpenCode credentials, plugins or configuration.

**Setup** requests native confirmation, then opens an integrated terminal in that context with a fixed `opencode auth login --standalone` command. Complete the official provider authentication there. Credentials remain managed by OpenCode; they never enter Chat or CODOVYN journals. Authentication remains unknown until an actual authorized task establishes a result. Installation alone does not authorize spending.

Guarded execution refuses projects containing `opencode.json`, `opencode.jsonc` or `.opencode`, and refuses custom/managed configuration in its private context. It does not override enterprise policy. Use a clean disposable project to evaluate this experimental integration.

## Models, variants and execution

Select **OpenCode → Provider Default** or a discovered `provider/model` entry. A selected model is confirmed with ACP before submitting a prompt. Only variants advertised for that selected model appear in Effort. Raw variant identity is preserved; **Auto** omits the override. A removed model or incompatible variant fails before inference.

Ask and Plan run with project writes denied by a macOS filesystem/process profile. Agent requires native approval and the existing isolated Git worktree; the original repository remains protected until explicit patch review and application. Tool policy denies shell commands, nested agents, MCP, external tools and external-directory access. Permission requests are checked against real project paths and approved scope. A refused capability stops execution rather than retrying.

The process boundary permits provider network traffic and OpenCode's owned private server. It is not a general network isolation environment or a security claim for arbitrary binaries. Use only an official trusted executable. Projects with secrets in ordinary source files still require careful provider consent. `.env` and provider configuration reads are denied; no general secret scanner is claimed.

Queued requests keep the provider, stable model ID, exact variant, permission and project snapshot. **Review & run next** revalidates metadata, policies and the repository baseline. Restart never automatically dispatches queued work. Cancellation terminates only owned processes. Ambiguous actions require review and are not replayed.

Automatic OpenCode fallback, cross-provider continuation, session resume, provider-reported usage and Windows/Linux execution remain disabled or unverified. Live authenticated read/edit validation is a separate gate; deterministic tests do not satisfy it.

Official interfaces: [ACP](https://docs.opencode.ai/docs/acp/), [CLI](https://docs.opencode.ai/docs/cli/), [models](https://docs.opencode.ai/docs/models/), [permissions](https://docs.opencode.ai/docs/permissions/).
