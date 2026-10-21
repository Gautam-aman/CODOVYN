# Contributing to CODOVYN

CODOVYN is in foundation development. Small, tested changes to the runtime,
documentation, and contributor setup are welcome. Check the issue tracker for
duplicates and describe the problem before starting a larger integration.

## Setup

Install Node.js 26 or newer and Git. Clone the repository, switch to `main`, run `npm ci --ignore-scripts`, then
`npm run check`. The core runtime tests use Node built-ins; extension packaging
and graphical host tests use the development dependencies. Use `node apps/cli/src/index.js demo . "Inspect"`
to exercise a handoff without provider credentials.

## Pull requests

Create a topic branch. Keep each change focused and add tests for behavior that
can fail in a meaningful way, especially task recovery or provider parsing.
Run `npm run check` and describe the exact result. Do not include API keys,
provider session files, personal task databases, or generated logs. Describe
provider checks as simulated or live with the method used.

Preserve users' repository changes. Agent integrations must use documented
provider interfaces and declare unsupported capabilities. Never infer quota
exhaustion from generic error text or silently retry an unfinished tool action.

The maintainers review and merge pull requests. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Standalone desktop development

On macOS arm64, install Xcode command-line tools, then run:

```sh
npm run build:desktop
open dist/desktop/CODOVYN.app
npm run test:desktop-host
npm run package:desktop
```

The build downloads pinned Code-OSS/VSCodium and Node artifacts. Native-host tests
use a disposable project/profile, edit a file, inspect Git, and run bundled Node
in the terminal. They do not contact an AI provider. `npm run check` stays usable
on supported Node platforms without a desktop build or paid provider account.
See [desktop build details](apps/desktop/README.md), [foundation decision](docs/architecture/0003-standalone-foundation.md),
and the [standalone campaign](docs/development/standalone-campaign.md).

For approachable desktop work, see [welcome shortcut hints (#12)](https://github.com/Gautam-aman/CODOVYN/issues/12)
and [appearance controls (#10)](https://github.com/Gautam-aman/CODOVYN/issues/10).
The two-launch restoration test (#13) is now implemented: run `npm run test:desktop-restoration`. Advanced provider contributors can help with [managed Gemini policy compatibility (#14)](https://github.com/Gautam-aman/CODOVYN/issues/14).
Check existing issues before opening another one. Windows/Linux installers and
public signing are not available yet. The repository is currently private;
external participation requires maintainer-provided access.

See the [Gemini integration guide](docs/agents/gemini.md) for deterministic tests and the current authentication blocker. Provider fixture tests require no paid account; never describe them as live compatibility evidence.

Recovery and routing contributors should start with the [recovery guide](docs/agents/recovery.md) and [routing guide](docs/agents/routing.md). The [accessible catalogue editor (#15)](https://github.com/Gautam-aman/CODOVYN/issues/15) is a bounded intermediate contribution. Crash/restore fixtures require no provider account; live provider validation remains separate.
