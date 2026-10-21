# ADR 0003: independently branded Code-OSS distribution

Status: accepted for the first desktop alpha; installed workflow verification is
required before calling the alpha complete.

## Decision

Produce CODOVYN Desktop from pinned, checksum-verified VSCodium builds of
Code-OSS, with an explicit distribution overlay maintained in `apps/desktop`.
Bundle the existing CODOVYN integration and a separate Node 26 runtime. Users
install CODOVYN itself; no installed VS Code or global Node is a dependency.
The overlay owns branding, application identifiers, storage identity, welcome,
workbench defaults, themes, update policy, provenance, and packaging.

This is a complete editor distribution, not a launcher for another installed
editor. Preserve editor functionality and maintain upstream notices. Do not
redistribute Microsoft's proprietary Visual Studio Code application or use its
Marketplace endpoints. The existing VS Code extension remains an optional
companion built from the same runtime and panel code.

## Alternatives

| Criterion | Code-OSS via pinned VSCodium build | Eclipse Theia 1.76 | Custom Electron/Monaco |
| --- | --- | --- | --- |
| Existing validated integration | Direct API reuse | Compatible API subset; revalidation needed | Rewrite platform integration |
| Editing, search, tabs, language services | Mature built-in services | Mature platform modules | Must compose and maintain |
| Terminal, Git, debugging | Existing native/editor services | Existing platform modules | Significant new implementation |
| Customization | Product overlay and built-in extensions; source patches when needed | Designed for composition and custom workbench | Full control with highest maintenance cost |
| Packaging | Established platform artifacts; our overlay invalidates upstream signatures | Own Electron application build | Own Electron and native PTY builds |
| Extensions | Open VSX and compatible VSIX, subject to individual licenses | Open VSX; API coverage differs | New compatibility architecture |
| Security | Retain upstream renderer/extension boundaries; audit our built-ins | Frontend/backend/plugin boundaries | Must design every boundary |
| Upstream work | Pin, verify, audit and regularly update editor artifacts | Update platform and application dependencies | Maintain editor services plus shell |
| Startup/memory | Must measure actual CODOVYN build | Not measured locally | No meaningful comparable implementation |

Theia is a credible alternative, but adapting the validated extension and
establishing a second build/runtime integration adds risk without a required
capability advantage for this alpha. A custom shell is rejected because it
would reinvent core IDE behavior. No performance superiority is claimed.

## Evidence and constraints

- [Code-OSS](https://github.com/microsoft/vscode) is MIT-licensed source;
  Microsoft's distribution has separate customizations and licensing.
- [VSCodium](https://github.com/VSCodium/vscodium) publishes MIT-licensed builds
  from that source, with Open VSX and without Microsoft-specific branding.
  Its build scripts and artifact source remain linked in our provenance record.
- [Theia composition](https://theia-ide.org/docs/composing_applications/) and
  [extension support](https://theia-ide.org/docs/extensions/) provide mature IDE
  modules and a compatible extension API; npm reports current packages 1.76.0.
- Initial feasibility target: VSCodium 1.140.06880, macOS arm64; Node 26.9.0.
  Check the real package before broadening platform claims. Windows and Linux
  packaging must remain explicitly unverified until exercised.
- Rebranding invalidates the upstream application signature. Development builds
  require local ad-hoc signing and must be labeled unnotarized. Public distribution
  needs separate signing/notarization credentials and approval.
- Automatic upstream binary updates must be disabled: they would replace CODOVYN
  branding and integration. No custom update service is implemented yet.
- Build feasibility is bounded by local disk capacity (about 15 GiB available at
  audit). Avoid source checkouts and native builds unrelated to the chosen path.

## Shared architecture

The editor launches the bundled CODOVYN integration. Its host-side adapter invokes
the bundled Node runtime and existing CLI. The CLI uses the same agent adapters,
task engine, SQLite journal, worktree draft checks, Git, and GitHub services as the
companion extension. Provider credentials remain owned by supported CLIs and never
enter the webview. Desktop-specific welcome/settings/branding stay outside the
shared task engine. Future routing remains a platform-independent package.
