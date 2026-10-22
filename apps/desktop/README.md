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

The existing agent CLI authorization is separate. Install and authorize Codex or Claude Code through their documented interfaces. A live Codex edit, streamed tool activity, hash-reviewed patch acceptance, passing tests and cancellation were also verified in the standalone macOS application. Automated native-host tests cover editing/saving, Git status, panel activation and bundled Node in the integrated terminal. A two-launch native test now verifies workspace, editor, theme and local state restoration (#13). Simulated failover does not prove live cross-provider compatibility.

See [foundation decision](../../docs/architecture/0003-standalone-foundation.md). Startup debugging must use a disposable user-data directory; do not expose a remote-debugging port during normal use.

Run `npm run test:desktop-host` after building. `CODOVYN_DESKTOP_APP=/absolute/path/CODOVYN.app npm run test:desktop-host` tests a copied installation. `npm run package:desktop` creates and verifies the development DMG; the image must still be mounted and its copied application exercised before claiming installation validation. CI runs the native workflow on macOS arm64 without provider credentials.

`npm run test:desktop-restoration` launches the normal application twice with one disposable profile. It saves a theme, workspace, editor and local extension state, quits normally, then verifies restoration without passing the project folder on the second launch. No provider account is used.

### Native test deadlines and diagnostics

Each host/restoration launch owns a new POSIX process group. The execution deadline
is 120 seconds, followed by at most 1.5 seconds of graceful termination and 2.5
seconds of forced-cleanup polling (individual process-table reads have a two-second
bound). Cleanup checks for live members even if the original parent exited first.
This is a macOS/POSIX test harness, not Windows process-ownership support.

A failed run retains its disposable directory and prints its location. It contains
phase traces, bounded application output, lifecycle results, and the isolated
editor logs/profile. Successful lifecycle summaries are copied to `dist/desktop`.
The default tests exclude globally installed Node from PATH. Neither a timeout
nor an unsuccessful cleanup counts as a passing native test.

Native tests isolate `--user-data-dir`, `--extensions-dir`, and the editor's
separate `--shared-data-dir`. A user-data override alone still shares the latter
with ordinary sessions. Repeated host/restart checks and copied-DMG results are
recorded in the [Phase 4 report](../../docs/development/phase4-validation-2026-10-22.md).
The original intermittent stall has not reproduced; passing reruns do not prove
its cause. Retain the failing directory and last pending phase when reporting it.
Do not delete a real user profile or terminate applications by executable name.
