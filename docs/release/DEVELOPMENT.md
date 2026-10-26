# Development setup

Install Node 26.9.0/npm, Git and Xcode Command Line Tools on Apple Silicon. Java/Maven are needed only for Java workflow qualification; prepare the pinned dependencies before offline tests. Do not install or authenticate a provider merely to run unit tests.

```sh
npm ci --ignore-scripts
npm run check
npm run test:extension-host
npm run build:desktop
CODOVYN_HOST_JAVA_VALIDATION=1 npm run test:desktop-host
npm run test:desktop-chat
npm run test:desktop-routing-ui
npm run test:desktop-restoration
npm run package:desktop
```

Run major native suites sequentially. Use isolated profiles/shared storage and recorded process groups. Preserve a failed run's diagnostics; redact secrets before sharing. Never kill by executable name, overwrite an installed app, increase timeouts to hide a failure, or confuse fixtures with real inference.

Metadata-only provider checks: `node scripts/validate-codex-auth.js`, `node scripts/validate-codex-native-worker.js`, and existing OpenCode broker/task initialization harnesses. They do not start sign-in or submit a model prompt. Live tests need a separate approved campaign.

Build artifacts and journals stay out of Git. See [architecture](ARCHITECTURE.md), [distribution](DISTRIBUTION.md), [security](../../SECURITY.md) and the [contributor backlog](CONTRIBUTOR-BACKLOG.md). Maintainers use direct main commits in the current campaign; external contributors should open reviewed PRs once repository access is granted.
