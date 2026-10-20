# CODOVYN

**One IDE. Every Agent. Endless Flow.**

CODOVYN is an open-source project building a local-first development environment that can preserve task context when a coding agent becomes unavailable. **Your code never stops when your agent does** is the product goal; the current repository is an early runtime foundation, not a finished IDE.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE) [![CI](https://github.com/Gautam-aman/CODOVYN/actions/workflows/ci.yml/badge.svg?branch=feat%2Fcodovyn-platform)](https://github.com/Gautam-aman/CODOVYN/actions/workflows/ci.yml)

## What works today

- A local SQLite task journal stores requests, agent events, checkpoints, and handoff history.
- A task engine switches to an ordered fallback after a structured quota or temporary failure. It stops if a tool action has no recorded completion.
- Restart recovery resumes a task with no unfinished tool action. Repository checkpoints record the real branch, commit, and changed paths.
- A read-only Codex CLI adapter consumes JSONL events using the user's existing Codex installation and authentication. Its live provider path has **not** been exercised in CI.
- A deterministic demo flow lets contributors inspect a simulated quota handoff without provider credentials or code edits.
- A CLI opens real Git repositories and displays saved task history.

No screenshots are included because there is no application interface to capture yet. The VS Code extension, desktop IDE, GitHub bots, routing UI, and website remain planned work.

## Quick start

Requirements: Node.js 26 or newer and Git. These commands were verified on macOS with Node 26.9.0.

```sh
git clone https://github.com/Gautam-aman/CODOVYN.git
cd CODOVYN
git switch feat/codovyn-platform
npm run check
node apps/cli/src/index.js demo . "Inspect this repository"
```

The demo creates a local task record in `~/.codovyn/tasks.sqlite` and prints the task ID. Inspect it with:

```sh
node apps/cli/src/index.js history TASK_ID
```

For an installed and authenticated Codex CLI, a read-only task can be started with:

```sh
node apps/cli/src/index.js codex . "Explain the task engine"
```

The Codex command is intentionally read-only and may use the provider account configured in the Codex CLI. CODOVYN does not provide model access or an API entitlement. No CODOVYN account is needed.

## Agent compatibility

| Agent | Authentication | Current behavior | Status |
| --- | --- | --- | --- |
| Deterministic demo agents | None | Simulated quota event and continuation, no edits | Tested locally |
| OpenAI Codex CLI | Existing CLI authentication | Read-only JSONL task execution; no session resume | Adapter tested with simulated CLI output; live run unverified |
| Claude Code, Gemini CLI, OpenCode, ACP, local providers | Provider-specific | None yet | Planned |

The [Codex CLI reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli) documents `codex exec --json` and read-only sandbox mode. The current adapter never assumes that an unstructured error message proves quota exhaustion.

## Architecture

`packages/agent-core` defines the adapter registry and failure categories. `packages/agent-adapters` contains the Codex CLI bridge. `packages/storage` owns durable SQLite state. `packages/task-engine` coordinates runs and handoffs. `packages/git-engine` reads repository state. `apps/cli` provides the first executable interface.

The [architecture decision](docs/architecture/0001-local-runtime.md) explains the local runtime boundary. The [roadmap](docs/development/roadmap.md) records dependencies and the requested 100-commit target. Current progress must be read from Git history.

## Development

```sh
npm test
npm run check
```

The project currently has no third-party npm dependencies. Node 26 supplies the SQLite module and test runner. Tests include a real temporary Git repository and a simulated CLI process; they do not spend provider quota. The CI workflow is configured for Linux, macOS, and Windows, but platform results must be checked in GitHub Actions.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution steps and [SECURITY.md](SECURITY.md) for vulnerability reporting. Good first issues will be labeled in the [issue tracker](https://github.com/Gautam-aman/CODOVYN/issues).

## Roadmap

The next release gates are a VS Code extension with a real workspace UI, a second supported agent integration, permission-aware editing, primary-agent restoration, complete Git/GitHub workflows, and security and accessibility verification. A standalone desktop application and optional cloud services follow a separate technical evaluation. The current runtime must not be described as release-ready.

## License

Apache License 2.0. See [LICENSE](LICENSE).
