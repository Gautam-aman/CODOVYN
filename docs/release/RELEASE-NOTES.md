# CODOVYN v0.1.0-alpha — candidate notes, not a published release

Independent Code-OSS/VSCodium desktop identity; Explorer/editor/Git/terminal; native Chat, compact model/effort controls, task history/queue, isolated drafts and explicit patch review.

This sprint adds isolated official Codex in-memory device authentication, native one-request consent review, guarded read-only `turn/start`, streaming/terminal decoding and durable request accounting. It does not establish successful authenticated inference or live Agent editing.

The bundled Node runtime now receives JIT-only hardened entitlements rather than retaining upstream debugging/DYLD allowances. Bundle minimum OS is raised to cover the actual runtime deployment target. The owner-only distribution command signs nested code, notarizes/staples app and DMG, verifies the mounted candidate and generates checksums; credentialed execution is not yet verified.

The first launch target is Apple Silicon only. Unsupported providers and cross-provider automation are gated. Auto-update and public download are disabled. Public release remains conditional on live-provider proof, CI, signing/notarization, license review and clean-Mac QA. See [readiness](PUBLIC-ALPHA-READINESS.md).
