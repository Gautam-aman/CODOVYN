# CODOVYN Desktop development build

A pinned Code-OSS/VSCodium distribution with independent application identity, shared CODOVYN agent integration, bundled Node 26/npm, original icon, welcome screen and ten workbench themes. No installed VS Code is used.

On macOS arm64 with Node 26 and Xcode command-line tools:

```sh
npm ci --ignore-scripts
npm run build:desktop
open dist/desktop/CODOVYN.app
```

Downloads are checked against committed SHA-256 pins. Cache defaults to `~/Library/Caches/CODOVYN/build`; set `CODOVYN_ARTIFACT_CACHE` to override. Output is managed under `dist/desktop`. Builds replace only the previous generated application. Upstream MIT and third-party notices remain in the application; bundled Node retains its license.

The application is ad-hoc signed for local development, not notarized or approved for public distribution. macOS arm64 is the only assembly target currently implemented. Windows and Linux packages are not implemented or validated. Updates are disabled because upstream updates would replace the CODOVYN distribution. Open VSX provides compatible extensions; Microsoft Marketplace services are not configured.

The existing agent CLI authorization is separate. Install and authorize Codex or Claude Code through their documented interfaces. Real Codex edits were previously verified in the companion extension; this desktop build still needs its own live coding, diff acceptance, cancellation and restart validation. Simulated failover does not prove live cross-provider compatibility.

See [foundation decision](../../docs/architecture/0003-standalone-foundation.md). Startup debugging must use a disposable user-data directory; do not expose a remote-debugging port during normal use.
