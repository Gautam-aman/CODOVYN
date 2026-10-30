## Experimental development download — owner approved

The attached **CODOVYN-darwin-arm64-development.dmg** is available for voluntary developer testing on **Apple Silicon macOS only**. It is **ad-hoc signed and unnotarized**, not a qualified public installer. Known regression, embedded-runtime security, redistribution and clean-machine qualification gates remain unresolved. Do not disable macOS security protections to launch it.

- Artifact source: `86bbe8883cfd4391f6f2a90d0a79e77650c10fe6`, clean build provenance. This differs from the existing release tag target; the tag has not been moved.
- SHA-256: `e3a078e6390537e2eb12bdafa4b55945ff5ef105b5bbddc7fec0ed55b1cd1fb8` (also in `SHA256SUMS-development.txt`).
- Fresh build/package, DMG integrity, deep/strict ad-hoc signature, native host and two-launch fixture Chat checks passed. Test-owned process groups were empty after cleanup.
- Prior full regression: 444 passed, 3 failed. No successful live AI response, live Agent editing or cross-provider continuation is claimed.
- No inference is authorized by this download; provider execution and accounting safeguards remain active.

[Installation guidance](https://github.com/Gautam-aman/CODOVYN/blob/main/docs/release/INSTALLATION.md) · [Known issues](https://github.com/Gautam-aman/CODOVYN/blob/main/docs/release/KNOWN-ISSUES.md)

---

# CODOVYN v0.1.0-alpha — First Developer Preview

**Experimental developer preview. No qualified installer is attached.**

CODOVYN is a standalone Code-OSS/VSCodium-based desktop IDE combining an editor, Explorer, Git, terminal and a local AI task workspace. This preview is intended for developers who want to explore, test and contribute to an experimental project.

## What contributors can explore

- The desktop workspace, Chat interface and provider/model controls.
- Persistent task history, queue and restoration infrastructure.
- Deterministic task execution, cancellation and failure diagnostics.
- Isolated draft editing and explicit diff review infrastructure.
- Experimental ContextFlow packets and reviewed provider-continuation infrastructure.

These implementation and fixture results do not establish successful live AI coding or live cross-provider continuation.

## Platform and installation

The desktop assembly target is **macOS Apple Silicon (ARM64)**. Intel macOS, Windows and Linux installers are not qualified. The recorded local qualification environment is Apple M2 on macOS 27.0.1; a broader supported OS range and clean-machine installation remain unverified.

A development-only DMG is attached under the explicit owner approval described above. A qualified public installer still requires source provenance, regression/native checks, security and redistribution review, Developer ID signing, notarization/stapling, and clean-Mac Gatekeeper validation.

Until then, contributors can follow [source development instructions](https://github.com/Gautam-aman/CODOVYN/blob/main/docs/release/DEVELOPMENT.md). Local development DMGs are ad-hoc signed and unnotarized. Do not disable system security protections to launch them. See [installation guidance](https://github.com/Gautam-aman/CODOVYN/blob/main/docs/release/INSTALLATION.md).

## AI provider restrictions

Provider accounts and CLIs are separate installations. Authentication and model catalogue discovery do not authorize inference, establish entitlement or guarantee free usage.

No successful live response or live Agent editing is verified under the current guarded runtime. The first approved OpenCode Ask received HTTP 402 / insufficient account funds; its historical request remains uncertain and spent, with additional submission fenced. General live execution, automatic fallback and live ContextFlow remain gated. Codex isolated Keychain authentication is implemented, but its supported credential bridge to coding remains blocked.

No inference, paid test, automatic follow-up or Agent editing is authorized by installing this preview or reading these notes.

## Known blockers

- Fresh preparation regression: **444 passed, 3 failed, 0 skipped**. The installed Codex binary failed integrity admission, and two crash-recovery tests refused while write descriptor authority remained held. Candidate qualification is blocked pending investigation.

- Pinned editor runtime security fix coverage is not qualified. Updating the separate Node runtime does not update Electron's embedded Node.
- Developer ID signing, notarization/stapling, clean-machine installation and upgrade/removal qualification are incomplete.
- Third-party notice, asset and redistribution approval is outstanding.
- Hosted CI is failing; local qualification does not establish passing hosted checks.
- Native search issue #16 remains open; successful reruns do not establish its root cause.
- Development dependency findings and current provider/accounting restrictions remain documented.

See [readiness](https://github.com/Gautam-aman/CODOVYN/blob/main/docs/release/PUBLIC-ALPHA-READINESS.md), [known issues](https://github.com/Gautam-aman/CODOVYN/blob/main/docs/release/KNOWN-ISSUES.md) and [redistribution review](https://github.com/Gautam-aman/CODOVYN/blob/main/docs/release/REDISTRIBUTION.md).

## Contributor testing checklist

Use a disposable application copy, profile and non-sensitive project. Never overwrite an existing CODOVYN installation during qualification.

- [ ] Record the source commit, exact artifact checksum, hardware and OS.
- [ ] Check first launch, workspace opening, editor save/undo, search, Git and terminal.
- [ ] Check provider-unavailable states and model-picker keyboard usability without inference.
- [ ] Exercise fixture task cancellation, history, queue and two-launch restoration.
- [ ] Check keyboard navigation, focus, zoom, contrast and VoiceOver.
- [ ] Record exact steps and observed outcomes; omit credentials, raw private logs and task databases.

Existing testing opportunities: [desktop qualification #27](https://github.com/Gautam-aman/CODOVYN/issues/27), [workspace trust #30](https://github.com/Gautam-aman/CODOVYN/issues/30), [model-picker accessibility #32](https://github.com/Gautam-aman/CODOVYN/issues/32), and [screen-reader QA #25](https://github.com/Gautam-aman/CODOVYN/issues/25). Restoration coverage exists; do not duplicate closed issue #13.

[Report a bug](https://github.com/Gautam-aman/CODOVYN/issues/new?template=bug_report.yml) · [Contribute](https://github.com/Gautam-aman/CODOVYN/blob/main/CONTRIBUTING.md) · [Manual QA](https://github.com/Gautam-aman/CODOVYN/blob/main/docs/release/MANUAL-QA.md)

Private security reports should follow [SECURITY.md](https://github.com/Gautam-aman/CODOVYN/blob/main/SECURITY.md). CODOVYN-owned source is Apache-2.0; bundled upstream components retain separate licenses.
