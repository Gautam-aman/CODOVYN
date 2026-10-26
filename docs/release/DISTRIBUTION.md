# Owner-operated public distribution

`npm run build:desktop` and `npm run package:desktop` remain development-only. No signing identity is queried or private credential accessed during ordinary builds/tests.

A new **prepared, credential-unverified** public path is:

```sh
node apps/desktop/build/distribution.js \
  --authorize-signing --authorize-notarization \
  --identity PUBLIC_CERTIFICATE_SHA1 --team APPLE_TEAM_ID \
  --notary-profile EXISTING_OWNER_KEYCHAIN_PROFILE
```

Do not run this until the owner authorizes signing and both notarization submissions, provisions the official Developer ID Application identity/profile outside Git, resolves live/CI/license gates and has a clean current-source development build. These arguments are metadata, never private keys/passwords. The command refuses absent authorization, dirty/stale provenance or an existing output candidate.

The implementation copies into `dist/release/0.1.0-alpha`, inventories code without external symlink traversal, signs nested Mach-O/bundles inside-out with Hardened Runtime and secure timestamps, removes debug/DYLD entitlements, verifies the intended Developer ID/team and tests bundled Node. It notarizes/staples the app first, then creates/signs/notarizes/staples the DMG. It verifies image integrity, Gatekeeper, the read-only mounted application and matching candidate CDHash/source, then writes SHA256SUMS and release metadata with `publicationApproved:false`. No release API/upload exists.

This is a reproducible procedure with source/artifact provenance, not a promise of bit-identical Apple timestamps or DMG images. Credentialed nested signing, Apple acceptance, clean-machine launch and upgrade/uninstall must still be independently qualified. Do not label the prepared path verified because its argument/policy tests pass.

`node scripts/verify-public-alpha.js APP DMG TEAMID` performs read-only public checks. An ad-hoc build must fail. No Gatekeeper, SIP or Keychain protection is disabled.

The manual-only `alpha-qualification.yml` runs sequential unsigned qualification without uploading binaries. Optional signing requires explicit manual input and the protected `alpha-signing` environment on an owner-provisioned signing runner. Configure environment reviewers before enabling it. It is not a billing workaround; hosted CI must still be restored and pass. No automatic public publication is configured.

Official references: [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [GitHub runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Signing/notarization does not replace live-provider or security validation.
