# Claude Code adapter

CODOVYN can run a task through an existing Claude Code CLI installation and authentication. Install and sign in using [Claude Code's instructions](https://code.claude.com/docs/en/cli-reference), then run:

```sh
claude auth status
node apps/cli/src/index.js claude . "Explain this repository"
```

The adapter requires a current Claude Code CLI that supports `--permission-prompts none` (v2.1.259 or later, per the [CLI reference](https://code.claude.com/docs/en/cli-reference)). This environment has no Claude Code executable, so live authentication, cost, and provider behavior have not been verified. Automated tests use a local process that emits representative `stream-json` events.

The adapter starts a noninteractive `claude -p` session with `--bare`, `--permission-mode plan`, `--permission-prompts none`, `--tools Read,Glob,Grep`, and `--no-session-persistence`. [Claude Code documents](https://code.claude.com/docs/en/cli-reference) these flags: the tool list allows file reading and search but excludes editing and shell commands, while bare mode skips discovered hooks, plugins, MCP servers, and `CLAUDE.md`. CODOVYN supplies the saved task request, observable progress, and verified Git state over stdin. It does not import private reasoning or read provider credentials.

The adapter exposes streamed text and the CLI's reported usage and cost estimate when present. It does not claim quota-reset times or classify free-form failure text as a confirmed rate limit. Failures from Claude currently interrupt the task. In `auto` mode, Codex is primary and Claude is the fallback after Codex becomes unavailable or reports an eligible structured failure. The two CLI adapters run in read-only mode, so this flow does not write code. Session resume, editing permissions, and live integration checks remain future work.
