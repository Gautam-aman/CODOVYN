# Known issues — v0.1.0-alpha preparation

- **Release blocker:** no authorized live model request or live Agent edit has passed the current guarded path. General composer execution is blocked. The new native first-Ask validation is limited to the unchanged disposable Calculator.
- **Release blocker:** public Developer ID signing, notarization/stapling and clean-machine installation have not been performed. Development signatures are ad-hoc.
- **Release blocker:** hosted GitHub Actions cannot start because account billing/spending configuration blocks jobs; local checks are separate.
- **Reliability:** #16 records an intermittent native `workspace.findFiles` stall. Bounded fresh/warm/copied runs do not establish a cause. Search cancellation, deadlines and owned cleanup remain enforced; do not close the issue on successful repeats.
- **Accessibility:** #15 still needs independent screen-reader/high-zoom/native focus qualification. Existing routing harness cannot observe every focus transition.
- **Provider scope:** OpenCode coding, Claude/Gemini execution, automatic failover and live ContextFlow remain deferred/gated. Metadata does not establish authentication, entitlement or free inference.
- **Dependencies:** two high development-chain findings remain in VSCE → Azure Identity → MSAL Node. No compatible upstream remediation is currently available; see redistribution/security review. Development packaging dependencies are excluded from the CODOVYN extension payload, but this is not a complete Electron/upstream vulnerability audit.
- **Platform scope:** only Apple Silicon is built. This Mac/OS is tested; older macOS, other hardware, Intel, Windows and Linux are not qualified. The bundle's declared minimum is derived from the embedded runtime and is not a compatibility certification.

- **Upstream runtime release blocker:** the pinned VSCodium 1.140.06880 contains Electron 43.7.3; its official release metadata lists embedded Node 24.21.0. The October 21 Node security release fixes high-severity issues in that line. Updating CODOVYN’s separate Node does not patch Electron’s embedded runtime. The latest verified VSCodium release still matches the pin. Await and qualify a trusted upstream fixed artifact or an audited source build; do not swap Electron binaries ad hoc.
