# Development verification — 21 October 2026

This record describes observed behavior on development branch
`feat/codovyn-platform`, through implementation commit `0a3d5df`. It does not
establish production readiness or live compatibility with every supported CLI.

## Environment and checks

| Component | Observed version or result |
| --- | --- |
| Node.js | 26.9.0 on macOS |
| VS Code | Official 1.142.0, Extension Development Host |
| Codex CLI | 0.163.0, existing authorized local CLI login |
| Claude Code | Executable unavailable; no live authentication test |
| `npm run check` | 106 tests passed locally, no failures |
| `npm run package:extension` | Passed; local `codovyn-dev.vsix` produced |
| `npm run test:extension-host` | Activation and panel opening passed on the real VS Code host |
| Production dependency audit | `npm audit --omit=dev`: no vulnerabilities reported |

The [CI run for the implementation commit](https://github.com/Gautam-aman/CODOVYN/actions/runs/39578007947)
passed on Linux, macOS, and Windows. POSIX signal-specific tests are skipped on
Windows; process-tree tests exercise Windows cancellation separately.

## Live coding workflow

A fresh disposable Git repository contained a `greet()` function returning
`Hello`, a matching Node test, and an `npm test` script. From the rendered
CODOVYN panel, the task requested:

> Update greet() to return Hello CODOVYN, update its test, and run npm test.
> Keep changes limited to these files.

Observed task `d758256f-0524-4aab-8408-2809cca3b92b`:

1. Started one Codex edit task after the permission flow.
2. Created an isolated Git worktree while the original repository stayed clean.
3. Streamed command and file-edit activity into the panel.
4. Updated only `greet.js` and `greet.test.js`; Codex ran the fixture test.
5. Displayed the two-file draft diff in the panel.
6. Applied the reviewed patch through the panel's Apply flow.
7. Removed the draft worktree and retained the completed task history.
8. Passed `npm test` in VS Code's integrated terminal: one test, zero failures.
9. Passed an independent terminal rerun and `git diff --check` after application.

![Actual code, diff, and passing terminal test](../assets/vscode-live-coding-workflow.png)

The screenshot is from the real application. No simulated provider output was
substituted for this live Codex task. Earlier manual checks also verified demo
chat, saved-history selection, and history restoration after restarting VS Code.

## Reliability and appearance changes

- `27dece3` prevents repeated task starts while edit permission is pending.
- `53cc3d3` retains open-draft history during deletion and retention pruning.
- `dbc3d5c` locks the reviewed task and hash while apply/discard approval is pending.
- `9d32818` and `f494bbe` terminate and reap provider process trees before returning
  to checkpointing. Tests include a real child process attempting a delayed write
  after quota failure, cancellation, and stream completion.
- `0a3d5df` adds ten optional panel themes, local persistence, and live previews.
  Automated checks cover text/control contrast; a real host check verified rendered
  Warm Paper colors, saved selection, an Ocean preview, and restoration.

## Remaining release gates

- [Live Claude validation](https://github.com/Gautam-aman/CODOVYN/issues/6), including
  actual permission enforcement and cancellation with legitimate authentication.
- Live provider-to-provider failover. Current failure simulations verify ordered
  fallback and durable context before write-capable tool activity. No real quota
  exhaustion was induced or bypassed during validation.
- [Interrupted write reconciliation](https://github.com/Gautam-aman/CODOVYN/issues/9).
  Automatic continuation stops after write-capable activity rather than replaying
  ambiguous commands. Hard application crashes still need a stronger ownership
  and recovery design.
- Safe restoration to the preferred provider, model routing, and budget controls.
- [Broader host accessibility/platform validation](https://github.com/Gautam-aman/CODOVYN/issues/1),
  including cancellation/deletion journeys in graphical Windows and Linux hosts.
- [Font-size and density controls](https://github.com/Gautam-aman/CODOVYN/issues/10).

No PR, Marketplace publication, or public release was created during this work.
