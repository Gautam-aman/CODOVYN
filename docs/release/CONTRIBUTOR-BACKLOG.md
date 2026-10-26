# Curated contributor backlog

Existing issues were reviewed; no duplicate issues, labels, announcements or public security disclosures were posted. Preserve current good-first opportunities; consult the actual issue before claiming it.

| Existing issue | Work | Suggested labels / validation |
| --- | --- | --- |
| #17 | No-project empty state | good first issue, accessibility; open empty window, keyboard-accessible Open Project, native compact screenshot |
| #18 | Composer shortcut guidance | good first issue, accessibility; inspect current Enter/Shift+Enter/IME behavior first, update hints without changing submission safety |
| #19 | History loading/retry | good first issue, accessibility; deterministic loading/error states and preserved selected task |
| #20 | History pagination | help wanted, enhancement; bounded repository-scoped query, no lost identity or cursor duplicates |
| #15 | Routing accessibility | accessibility, help wanted; keyboard/VoiceOver/high zoom in actual native webview; do not close on DOM-only assertions |
| #16 | Search reliability | bug, platform:macos; preserve original search, bounded fresh/warm diagnostics and owned cleanup; causal evidence required |
| #6 | Live provider qualification | help wanted; owner-authorized bounded calls only, never fixture evidence as live results |

Draft future milestones for owner review, not newly posted issues:

- **Windows desktop feasibility** (`enhancement`, `platform:windows`): source `apps/desktop/build/macos.js` currently rejects non-ARM64 macOS. Inventory upstream/runtime artifacts and OS process/ACL boundaries; acceptance is a documented, separately tested build/cleanup plan before any installer claim. Not a beginner task.
- **Linux desktop feasibility** (`enhancement`, platform label to be created by owner): same entry point; qualify sandbox/process/filesystem equivalents, desktop identity and launch. No borrowed macOS security assertions. Deferred beyond alpha.
- **Java language-tooling setup guide** (`documentation`, `good first issue`): document a tested Open VSX language-server setup separately from the current editor/Java syntax/Maven smoke; disclose JDK/Maven prerequisites and exact native results.

Before opening a draft, check duplicates and current source behavior. Do not put exploit details, auth files, device codes, private project content or raw task databases in issues. External PRs become available only after the owner grants access or approves repository publication.
