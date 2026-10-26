# Installation and removal — v0.1.0-alpha preparation

No public signed installer is approved. Do not enable a website Download button or distribute the development DMG as a public installer.

## Development copy

Build using the root README. `npm run package:desktop` generates `dist/desktop/CODOVYN-darwin-arm64-development.dmg`. Verify `hdiutil verify` and `codesign --verify --deep --strict`, mount read-only, and copy the app into a new disposable directory. Launch that copy. Never overwrite `/Applications/CODOVYN.app` without explicit owner approval; never bypass Gatekeeper, remove quarantine or change system security settings. Ad-hoc signature validity does not establish notarization or clean-machine acceptance.

The final qualification checksum/source are recorded in [readiness](PUBLIC-ALPHA-READINESS.md). Development checksums change with new builds; do not reuse an old checksum or call it a public release checksum.

## Future approved public installer

Before installation, compare SHA-256 against the owner-approved release manifest, verify Developer ID/notarization and confirm the architecture/version. Mount the approved DMG, copy the app to Applications only after reviewing any replacement, eject the image and launch normally. A rejection by macOS is a support issue, not a reason to disable Gatekeeper.

CODOVYN's bundle ID is `org.codovyn.desktop`. Auto-update is disabled. Manual upgrades must preserve settings and task data; compatibility must be qualified using disposable profiles first. Close an active IDE/task and resolve drafts before replacing a copy. Do not auto-resume an interrupted write.

Removing the application bundle does not remove project files, credentials in other providers, settings or task history. Do not delete `~/Library/Application Support/CODOVYN` or `.codovyn-desktop*` data merely to uninstall/reinstall. Explicitly export/resolve tasks and obtain approval before any data removal. The isolated Codex sign-in is memory-only and ends with its process.
