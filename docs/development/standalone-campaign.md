# Standalone desktop campaign

Starting commit: `f8eccc0f5791553a764295f49c2f96f8ee03135d` on `main`.
The previous extension campaign is merged. Only commits after this checkpoint
count toward this campaign's target of 100 meaningful changes.

A verified full-history Git bundle is stored locally at
`.git/checkpoints/codovyn-standalone-start.bundle`. It is a recovery artifact,
not an additional branch. Authentication was checked with GitHub CLI; the
maintainer has repository administration permission and push dry-run succeeded.
Each actual push must still respect branch protection and concurrent changes.

## Audit

- `packages/agent-core`, `agent-adapters`, `task-engine`, `storage`, `git-engine`,
  and `github-integration` use Node APIs, not the VS Code API. Preserve these
  packages and the validated worktree edit/review/application flow.
- `apps/cli` is the existing runtime process boundary. Node 26 supplies SQLite.
  A desktop distribution must bundle this runtime rather than require global Node.
- `apps/vscode-extension/extension.cjs` owns VS Code panels, confirmations, workspace
  selection, and settings. Its vanilla web UI and theme tokens can be reused in a
  Code-OSS-based workbench; platform-specific dependencies stay in this layer.
- The current CI runs checks and VSIX packaging on Linux, macOS, and Windows.
  It does not yet build or exercise an independent desktop package.
- Live Codex coding, review, application, terminal testing, persistence, and
  cancellation were previously verified on macOS. Claude and live cross-provider
  failover remain unverified. See the prior validation record.
- All ten open issues (#1–#10) were read. None satisfies every acceptance criterion
  yet. #8 covers foundation selection; #9 recovery, #5 routing, #10 appearance,
  and #7 webhook security remain relevant. Several descriptions still refer to
  the extension-only phase and will be updated as desktop behavior is verified.
- The repository is private. Contributor issues cannot attract outside participants
  until maintainers choose to make the project accessible. Visibility stays unchanged.

## Dependency-aware implementation

First select and exercise a mature editor foundation. Then establish pinned,
verified downloads, independent branding and user-data identity, bundled runtime,
built-in CODOVYN integration, and a working macOS application. Verify filesystem,
terminal, Git, language tooling, and the live agent workflow before adding hosted
bots or optimizing routing.

The commit roadmap follows the requested twelve milestones. Each contains real
independent work: artifact verification; platform manifests; native metadata;
icons; licensing; embedded runtime; extension packaging; welcome/navigation;
settings; workbench themes; startup/shutdown; workspace restoration; agent UI;
permissions; recovery; Git/GitHub commands; routing policy; deterministic tests;
graphical integration checks; installers; supply-chain checks; accessibility;
platform testing; contributor documentation and issue organization. Commit these
only when implemented and verified; never create filler to reach the target.

Record actual campaign progress with:

```sh
git rev-list --count f8eccc0f5791553a764295f49c2f96f8ee03135d..HEAD
```
