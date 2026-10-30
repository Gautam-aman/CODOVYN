# v0.1.0-alpha draft preparation — 2026-10-31

## Decision

**BLOCKED: draft only, no uploaded binary or public download.** Evaluated source is clean main `65da06ac4d56c7fcb53150a5d8dff5ad47e25efc`. No fresh candidate is assembled while mandatory distribution/security gates are unresolved. Current documentation changes do not qualify an old binary against this source. Publication requires a later exact packaged source commit and explicit owner approval.

## Existing artifacts — historical only

The local application build manifest embeds clean source `f99776d7c9c163f2fe21180ce04139f2043a6f83`, target `darwin-arm64`, VSCodium 1.140.06880 and separate Node 26.12.1. The pinned editor reports Electron 43.7.3 with embedded Node 24.21.0. Bundle short version is 0.1.0; its build identity records 0.1.0-alpha. Version alignment must be checked on the final public candidate.

Deep/strict signature verification passes, but the signature is **ad-hoc with no TeamIdentifier**. That is not Developer ID or notarization evidence.

The existing `CODOVYN-darwin-arm64-development.dmg` verifies with hdiutil and hashes to `33d6627a330b93178f0fa57e9736f5117b23be36f17f5bfaffe06bd55fe6e675`. This checksum identifies a historical development image, not a new candidate. It is not the same source as the current local app and must not be uploaded as this release. No current public installer checksum exists.

A narrow filename scan of the current Resources tree found no auth.json, tasks.sqlite, .env, .pem or .key matches. This is not a comprehensive secret/privacy or binary-content audit; final packaging must pass that gate independently.

## Security and distribution gates

- Qualify a trusted editor containing applicable runtime fixes. Official VSCodium latest-release metadata now offers 1.143.17232, published 2026-10-28; availability does not prove its embedded versions or safety. The pin remains unchanged pending independent qualification.
- Node's October 21 advisory includes high-severity issues in older 24.x. The separate Node 26.12.1 does not remediate Electron's embedded Node. Official Electron metadata lists 43.8.4 with Node 24.22.1; do not substitute Electron binaries inside the editor.
- Owner-provisioned Developer ID and notarization workflow authorization are absent. No credential access or signing identity query was performed. Use DISTRIBUTION.md only after explicit authorization.
- Retained upstream notices/assets and final extension inventory need owner redistribution review.
- Clean supported-Mac Gatekeeper, install, launch, upgrade and uninstall checks remain unperformed for a new candidate.
- Hosted CI is failing. Inspect exact job annotations before attributing a current failure to the historical billing restriction.
- No new inference or change to accounting fences is authorized. Live AI coding remains unverified.

## Release handling

Create an asset-free draft pre-release named “CODOVYN v0.1.0-alpha — First Developer Preview”. Draft source selection does not certify a packaged binary. Do not publish it, create a public download CTA, or upload the historical DMG. Reuse existing contributor testing issues linked in RELEASE-NOTES.md; no duplicate issues are needed.

## Primary references

- https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- https://releases.electronjs.org/release?channel=stable&major=v43
- https://github.com/VSCodium/vscodium/releases/tag/1.143.17232

## Fresh verification

`npm run check` on evaluated source using the bundled Node 26.12.1 copied into a space-free temporary runtime path: **447 tests, 444 passed, 3 failed, 0 cancelled/skipped**, 172772.907917 ms. Syntax checks completed. No real provider prompt was sent.

Failures:

1. `codex-auth-boundary.test.js`: installed default Codex executable rejected by the existing integrity pin (`Unsupported Codex executable hash`). The supported test-only binary override was not supplied; no global executable or production pin was changed.
2. `task-file-write-crash.test.js`, before-native-start: reconciliation refused because draft-write descriptor authority was still held.
3. Same crash suite, after-native-publication: the same fail-closed descriptor-authority refusal.

The crash-case cause has not been established and no passing rerun or cleanup certification is claimed. No assertions were relaxed or historical owner journals reconciled. These failures require focused investigation before release qualification. Fresh graphical extension-host/Chat/routing/restoration/native-host and copied-DMG tests were **not run**: preparation stopped at the draft gate rather than creating a candidate from a failing source/environment and unqualified runtime. Historical native successes are not promoted to this revision.

Fresh `npm audit`: **2 high, 0 critical**, in Azure Identity/MSAL Node via development tooling; the report advertises remediation, whose dependency compatibility remains unqualified. Do not treat an audit fix suggestion as a tested supported update. See advisory GHSA-xcx6-jx8p-x3h5. No dependency changes were made.

Draft release: https://github.com/Gautam-aman/CODOVYN/releases. API verification confirms draft=true, prerelease=true, target `65da06ac4d56c7fcb53150a5d8dff5ad47e25efc`, assets=[]. No publication or public tag/download claim is made.

## Owner-approved development artifact availability — 2026-10-31

After the owner was informed of the ad-hoc/unnotarized status and outstanding gates, the owner explicitly requested making the development DMG available. This supersedes the earlier no-attachment decision for this development-only artifact; it does not establish qualification as a standard public installer.

A fresh clean build from `86bbe8883cfd4391f6f2a90d0a79e77650c10fe6` produced `CODOVYN-darwin-arm64-development.dmg`, SHA-256 `e3a078e6390537e2eb12bdafa4b55945ff5ef105b5bbddc7fec0ed55b1cd1fb8`. Build, package, hdiutil integrity, deep/strict signature, native host and two-launch fixture Chat checks passed. Recorded native process survivors are empty. Signature remains ad-hoc; no notarization or clean-machine qualification is claimed. No full-regression rerun or additional inference occurred.

The development DMG and `SHA256SUMS-development.txt` are attached to the existing owner-published `v0.1.0-alpha` pre-release with prominent limitations. The release tag was not moved; notes explicitly identify the differing artifact source commit. Runtime security, three earlier regression failures, redistribution and other qualification blockers remain unresolved.
