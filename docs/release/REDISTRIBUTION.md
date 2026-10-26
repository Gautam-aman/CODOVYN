# Redistribution and dependency review

The existing repository license is Apache-2.0; it is preserved, not replaced. This is not an ownership opinion or legal clearance. Owner approval is required for unresolved rights and the final distribution inventory.

- VSCodium/Code-OSS is a separately licensed upstream distribution, pinned in `apps/desktop/artifacts.json`. Preserve its `app/LICENSE.txt`, `app/ThirdPartyNotices.txt` and Chromium `LICENSES.chromium.html`.
- Bundled Node retains `runtime/LICENSE` and its third-party notices. CODOVYN's extension retains its own LICENSE. The build must fail if required notices are absent.
- `node scripts/inventory-desktop-licenses.js` records notice hashes and every bundled extension's declared license/local notice files. Missing package metadata is not a grant or proof of violation; compare it with upstream consolidated notices before approving redistribution.
- The CODOVYN icon is generated from repository Swift source; themes and branding are repository code. Retained third-party fonts/codicons/upstream assets still need notice coverage. No permission is inferred from an attractive screenshot or MIT licensing elsewhere.
- Open VSX is configured; Microsoft Marketplace/proprietary Copilot services are not configured. Third-party extensions installed later by users have independent licenses. Provider CLIs, their models and accounts are separate installations, not bundled inference entitlements.
- Review OpenAI's current local/open-source authentication terms before product distribution and any future commercial/hosted service. The code does not use experimental externally supplied ChatGPT tokens or copy a user's global auth cache.

Current development dependency findings: `@vscode/vsce@4.0.0 → @azure/identity@4.14.0 → @azure/msal-node@6.0.1`. The installed Identity range requires MSAL `^6.0.0`; available fixed MSAL 7.1.1 is outside it. The current VSCE/Identity versions expose no compatible fix. Do not override to a new major merely to hide audit findings. These dependencies run in development/VSIX tooling and are excluded from the assembled CODOVYN extension's node_modules payload. That does not audit the pinned upstream Electron distribution or prove development machines are immune. No VSCE publish/authentication is performed by release qualification.

Owner gate: inspect the generated extension/notice inventory, confirm the intended Apache-2.0 ownership and upstream redistribution/asset obligations, and approve retained notices. Never change repository visibility or publish until that review and the remaining security gates pass.
