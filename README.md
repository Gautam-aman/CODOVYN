# CODOVYN

**One IDE. Every Agent. Endless Flow.**

CODOVYN is an independent desktop IDE built on Code-OSS/VSCodium. It brings an editor, terminal, Git and AI task workspace together, with a focus on developer approval, isolated changes and recoverable task history.

> **Pre-release:** There is no approved public installer yet. The desktop workspace has been tested locally, but a successful live AI response and live agent coding have not yet been verified. General provider execution remains restricted. See [release readiness](docs/release/PUBLIC-ALPHA-READINESS.md) for current blockers.

## What CODOVYN offers

- **A standalone workspace:** Code editor, file explorer, search, terminal and Git, with a native Chat interface.
- **Model controls:** Provider and model selection, discovery, favorites and reasoning controls where supported. A listed model does not guarantee account access.
- **Task management:** A persistent queue, activity timeline, task history and recovery after interruptions.
- **Reviewable changes:** Infrastructure for isolated draft worktrees, diff inspection and explicit patch approval. Live agent editing remains unverified.
- **ContextFlow:** Experimental infrastructure for transferring reviewed task context between agents. Live cross-provider continuation is not yet verified.
- **Permission controls:** Provider-specific execution restrictions, native approvals and durable request accounting. Uncertain requests are not automatically retried.

Codex, OpenCode, Claude and Gemini adapter foundations are present. Their capabilities and readiness differ; see the [provider guides](docs/agents/model-picker.md) before configuring one.

## Build from source

The current desktop development target is **Apple Silicon macOS**. You need Node.js **26.12.1 or newer**, npm, Git and Xcode Command Line Tools. The build downloads checksum-pinned VSCodium and Node artifacts.

```sh
git clone https://github.com/Gautam-aman/CODOVYN.git
cd CODOVYN
npm ci --ignore-scripts
npm run check
npm run build:desktop
open dist/desktop/CODOVYN.app
```

To create a development DMG:

```sh
npm run package:desktop
```

The generated DMG is **ad-hoc signed and unnotarized**; it is not an approved public installer. Intel macOS, Windows and Linux desktop builds have not been qualified. See [development setup](docs/release/DEVELOPMENT.md), [installation](docs/release/INSTALLATION.md) and [platform scope](docs/release/SUPPORTED-PLATFORMS.md).

## Getting started

1. Launch the development app and open a project you trust.
2. Open CODOVYN Chat and explore its settings, model picker and task history.
3. To configure a provider, follow its setup guide and review the requested permissions. Authentication and model discovery do not authorize inference or guarantee quota.
4. Review any task approval carefully. Agent changes are designed to stay in a draft until separately reviewed and applied.

The current restricted OpenCode Calculator validation cannot start another request while its previous uncertain request remains fenced. General Chat execution, live Agent editing and provider switching remain gated. See [current readiness](docs/release/PUBLIC-ALPHA-READINESS.md) for the latest details.

## How it works

The desktop workbench connects to a shared task engine through the extension host. The task engine manages approvals, provider adapters, task history and repository ownership. Git worktrees and review controls support isolated changes; SQLite records task and request state.

```text
Developer → Review and approval → Task engine → Provider adapter
                                         ↓
                               Draft changes → Diff review
```

This describes the architecture, not a claim that every provider can execute live tasks today. Read the [architecture overview](docs/release/ARCHITECTURE.md), [security policy](SECURITY.md) and [ContextFlow guide](docs/agents/contextflow.md) for details.

## Development and testing

The main regression command is `npm run check`. On a supported macOS development machine, desktop checks include:

```sh
npm run test:extension-host
npm run test:desktop-host
npm run test:desktop-chat
npm run test:desktop-routing-ui
npm run test:desktop-restoration
```

Run native tests sequentially and use disposable application profiles. Provider fixtures do not require paid inference. Hosted GitHub Actions have been blocked by account billing restrictions; local test results and hosted CI are reported separately in [release readiness](docs/release/PUBLIC-ALPHA-READINESS.md).

## Roadmap

The immediate priorities are validating one real provider safely, completing a reviewed coding workflow, resolving release-critical issues and preparing a signed, notarized macOS installer. Broader provider support, live ContextFlow and other platforms remain future work. See [known issues](docs/release/KNOWN-ISSUES.md).

## Contributing

See the [contributor bot guide](docs/community/BOTS.md) for issue claiming and Guardian review-readiness guidance.

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), browse the [contributor backlog](docs/release/CONTRIBUTOR-BACKLOG.md), or report a problem through the [issue tracker](https://github.com/Gautam-aman/CODOVYN/issues). Keep changes focused, include relevant tests and distinguish simulated provider results from live validation.

For security reports, use the private reporting process in [SECURITY.md](SECURITY.md). Please do not include credentials or private logs in public issues.

## License

CODOVYN-owned source is licensed under [Apache 2.0](LICENSE). Code-OSS/VSCodium, Electron, Chromium, Node.js and other bundled components retain their own licenses and notices. See [NOTICE](NOTICE) and the [redistribution review](docs/release/REDISTRIBUTION.md).
