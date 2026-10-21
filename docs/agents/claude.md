# Claude Code adapter

CODOVYN can run a task through an existing Claude Code CLI installation and authentication. Install and sign in using [Claude Code's instructions](https://code.claude.com/docs/en/cli-reference), then run:

```sh
claude auth status
node apps/cli/src/index.js claude . "Explain this repository"
```

The adapter requires a current Claude Code CLI that supports `--permission-prompts none` (v2.1.259 or later, per the [CLI reference](https://code.claude.com/docs/en/cli-reference)). This environment has no Claude Code executable, so live authentication, cost, and provider behavior have not been verified. Automated tests use a local process that emits representative `stream-json` events.

The read-only adapter starts a noninteractive `claude -p` session with `--bare`, `--permission-mode plan`, `--permission-prompts none`, `--tools Read,Glob,Grep`, and `--no-session-persistence`. [Claude Code documents](https://code.claude.com/docs/en/cli-reference) these flags. Bare mode skips discovered hooks, plugins, MCP servers, and `CLAUDE.md`. CODOVYN supplies the saved task request, observable progress, and verified Git state over stdin. It does not import private reasoning or read provider credentials.

For an explicitly approved edit draft, run `node apps/cli/src/index.js claude-edit . "Describe a small change" --allow-writes`. CODOVYN creates a separate worktree and invokes Claude Code with `--permission-mode acceptEdits`, `--tools Read,Glob,Grep,Edit,Write`, and `--disallowedTools mcp__*`. Shell execution is unavailable in this mode. Review with `draft-review TASK_ID .`, then apply the displayed patch hash using `draft-accept TASK_ID . PATCH_HASH --yes` or discard it using `draft-reject TASK_ID . --yes`. The open repository must have a clean committed base before starting.

The adapter exposes streamed text and the CLI's reported usage and cost estimate when present. It does not claim quota-reset times or classify free-form failure text as a confirmed rate limit. Failures from Claude currently interrupt the task. In `auto` and `auto-edit` modes, Codex is primary and Claude is the fallback after Codex becomes unavailable or reports an eligible structured failure. After a write-capable tool action, CODOVYN stops for reconciliation rather than risking duplicate work. Live Claude authentication, editing, and failover checks remain outstanding because the CLI was unavailable in the development environment.
