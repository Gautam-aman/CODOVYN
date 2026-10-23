# Chat, model selection, and queued tasks

Open **CODOVYN: Open Chat** from the command palette or the Chat icon in the native editor title bar. Chat keeps advanced controls in Settings so you can begin with a provider's default model without entering a model ID.

## Choose a model

The model chip opens a searchable, keyboard-accessible popover. Arrow keys move between choices, Enter selects, and Escape closes the menu and returns focus. Favorite and recent choices are stored by the host for the project and restored after restart.

- **Provider Default** delegates model choice to the installed Codex, Gemini, or Claude CLI. No model override is supplied.
- **Auto** uses the project's saved routing policy. It requires eligible catalogue entries and does not invent model access, pricing, or quality evidence.
- **Configured models** come from the saved local catalogue in **Manage models…**. Codex and Gemini overrides reach their existing CLI selectors. Explicit Claude model overrides remain disabled because this adapter does not implement them.
- A detected CLI is not proof of authentication or quota. Opening the picker can inspect CLI installation through the existing bounded diagnostics; it does not issue an inference request.
- Missing or unavailable selections are shown explicitly. The host validates every task and rejects unsupported combinations.

CODOVYN does not scrape a CLI's interactive model menu or extract credentials. OpenCode and OpenRouter are not integrated in this build, so they are not presented as connected providers. Manually entered catalogue IDs remain an advanced option, not a prerequisite for Provider Default.

## Choose a mode

| Mode | Enforced execution scope |
| --- | --- |
| Ask | Existing adapter read-only mode; inspect and explain without file modifications. |
| Agent | Request a native approval for an isolated edit draft. Review a patch before applying it to the original repository. |
| Plan | Existing adapter read-only mode plus explicit planning instructions. The original request is preserved in the journal. |

Mode and permission combinations are validated in the host and CLI. Ask and Plan cannot request write permission. Agent never silently bypasses approval, repository checks, execution ownership, or patch review. Advanced routing, provider preferences, fallback consent, and existing estimate budgets remain in Settings. Reasoning effort is also available beside Model in Chat.

## Choose reasoning effort

Choose **Codex → Provider Default → High** directly in Chat. A catalogue entry is not required. The Effort chip opens a keyboard-accessible menu; Auto / Default omits the override and preserves the CLI configuration. This does not run a task classifier.

For Provider Default, CODOVYN reads the installed Codex app-server's documented `model/list` and `config/read` metadata. It starts no thread or inference turn. Only model IDs and advertised effort levels leave the inspector; raw configuration and credentials are never sent to the webview. This catalogue is not proof of authentication, access or quota. If inspection fails or the configured model is absent, only Auto remains available. Restart Chat's application session after changing an external CLI installation/configuration to refresh this metadata.

Configured Codex models use their declared catalogue effort list. Minimal and Extra High (`xhigh`) appear only when supported metadata lists them; other advertised levels retain their actual names. Gemini and Claude expose only Auto because these adapters cannot enforce an effort override. OpenCode/OpenRouter remain unimplemented.

Selections are saved per project/model. Switching to an unsupported provider resets the active effort to Auto; returning to a supported model restores its saved choice. Accepted and queued tasks keep their original settings. Changing the picker affects future requests. Default-model capabilities are checked again at dispatch; a changed or unsupported explicit choice fails before inference rather than being silently ignored. The Codex adapter passes `--config model_reasoning_effort="high"` independently of `--model`, while preserving the existing sandbox and approvals. Task Activity/history labels this as the requested effort, not provider-reported reasoning usage.

See the [native validation report](../development/reasoning-effort-validation.md) and [real application menu capture](../assets/reasoning-effort/reasoning-effort-menu.png).

## Send and keep working

Enter sends; Shift+Enter adds a newline; Cmd/Ctrl+Enter also submits. IME composition does not submit. The composer clears only after durable task acknowledgement and keeps your draft if admission is refused. While a task runs, Enter queues the next instruction. The Queue control is also available beside Send. Cancellation affects the active task and preserves a draft for the next task.

## Queue safely

The Queue popover supports adding the current draft, reordering, pausing/resuming, cancelling, and **Review & run next**. Requests are stored locally in the existing SQLite database with a stable task identity and configuration/policy snapshot.

Dispatch is explicit and serial. It rechecks workspace trust, repository fingerprint, saved policies, current routing/budget admission, and native approvals. Pending drafts and unresolved ownership block dispatch. A changed baseline or provider policy requires fresh review and re-enqueueing; no ambiguous operation is replayed. The runtime verifies the expected baseline again immediately before execution.

Queued tasks survive restart but do not execute automatically. A record interrupted during dispatch remains blocked for reconciliation. Review completed edit drafts before dispatching another task against that repository. Queue state does not authorize unrestricted shell execution, external directories, new providers, or spending outside the approved task policy.

## Evidence and limits

Deterministic tests exercise the real task engine and SQLite queue without paid provider access. Native checks exercise the actual desktop webview and persist queued tasks and favorites across two normal application launches. Fixture text in screenshots is UI test evidence, not a live provider response. Screen-reader speech, broad model discovery, automatic queue dispatch, and real cross-provider continuation have separate validation requirements.
