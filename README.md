# CODOVYN

**One IDE. Every Agent. Endless Flow.**

CODOVYN is an independent Code-OSS/VSCodium-based desktop IDE with a bundled Node runtime, native editor, Explorer, terminal, Git, and a local AI task workspace.

**v0.1.0-alpha is not released. Public launch is blocked.** The current installer is an ad-hoc signed, unnotarized development build. Real inference and Agent editing have not been verified under the current guarded runtime. There is no approved public download.

[Release readiness](docs/release/PUBLIC-ALPHA-READINESS.md) · [Installation](docs/release/INSTALLATION.md) · [Known issues](docs/release/KNOWN-ISSUES.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Current scope

The standalone Apple Silicon application has automated native coverage for editor/save, file search, Git, terminal, Java, Chat, queue/history and restoration. These are application/fixture checks, not human usability testing or proof of live AI coding.

The supported preparation path is **isolated Codex device sign-in followed by one separately reviewed read-only Calculator validation request**. Credentials remain in memory; no global credentials are imported. Model metadata is not authenticated inference access. General coding, Agent editing, automatic failover, live OpenCode and cross-provider ContextFlow remain gated. Their implementations and deterministic tests are preserved for development.

## Build locally

Development requires Node 26 (qualification pins 26.9.0), npm, Git and Xcode Command Line Tools on macOS ARM64:

```sh
npm ci --ignore-scripts
npm run check
npm run build:desktop
open dist/desktop/CODOVYN.app
```

The build downloads checksum-pinned VSCodium and Node artifacts. It replaces only `dist/desktop/CODOVYN.app`, never the installed application. Java/Maven are not bundled; the Java fixture targets Java 17 and uses cached Maven/JUnit dependencies. See [development setup](docs/release/DEVELOPMENT.md) and [platform scope](docs/release/SUPPORTED-PLATFORMS.md).

## Provider setup

Open Chat → Settings → **Sign in to isolated Codex**, or use the equivalent Command Palette command. Only the pinned official Codex 0.164.0 ARM64 executable is admitted; configure its absolute native path when detection does not match your installation. No login or inference occurs on IDE startup.

Sign-in uses the official device flow in the browser. It does not authorize inference. **Review one Codex Ask validation** presents the exact provider/model/effort, disposable workspace, prompt and quota warning in a native modal. The current validation entry refuses other projects, multiple requests, file tools and writes. Do not send a request until the owner has explicitly approved its campaign. See [Codex setup](docs/release/CODEX.md).

## Contribute

No provider account or paid inference is required for unit tests. Start with [CONTRIBUTING.md](CONTRIBUTING.md), the [architecture overview](docs/release/ARCHITECTURE.md), [curated backlog](docs/release/CONTRIBUTOR-BACKLOG.md), and existing issues. The repository's visibility remains owner-controlled; no public launch is implied by these documents.

CODOVYN-owned source retains the existing [Apache-2.0 license](LICENSE). Bundled upstream components retain separate notices and licenses; see [redistribution review](docs/release/REDISTRIBUTION.md). No claim is made that every third-party asset has completed release clearance.
