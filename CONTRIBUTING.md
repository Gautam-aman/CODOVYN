# Contributing to CODOVYN

CODOVYN is in foundation development. Small, tested changes to the runtime,
documentation, and contributor setup are welcome. Check the issue tracker for
duplicates and describe the problem before starting a larger integration.

## Setup

Install Node.js 26 or newer and Git. Clone the repository, switch to the active
development branch, and run `npm run check`. No npm install is needed for the
current dependency-free workspace. Use `node apps/cli/src/index.js demo . "Inspect"`
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
