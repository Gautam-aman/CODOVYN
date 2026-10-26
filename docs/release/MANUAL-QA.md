# Owner-operated manual QA

Automated native checks are recorded separately; fixture screenshots are not human usability testing. Use a disposable project and separate copy/profile. Never overwrite the owner's installed app or use private source for the first model validation.

- [ ] On a second clean Apple Silicon Mac, record exact OS/hardware, verify the approved signed DMG checksum, launch through normal Gatekeeper and record notarization/offline stapling behavior.
- [ ] Open project/folder paths with spaces, switch folders, create/save files, undo/redo, inspect syntax highlighting, tabs, unsaved-close dialog, search/replace, Explorer and Git changes.
- [ ] Open terminal in the project, run Java/Maven independently, inspect exit/output and close the terminal. Confirm no agent can execute these shell commands.
- [ ] Confirm provider absence/version errors and unauthenticated states. Use native isolated Codex device sign-in; cancel once, sign in, sign out, reauthenticate and close the app. Do not copy global credentials.
- [ ] Only after the exact single-request campaign is approved: run one read-only Ask, inspect real streaming, selected model/effort, persistent journal, deadline/cancellation, uncertainty and cleanup. Record account readiness without account identifiers or secrets.
- [ ] After separate approval: verify an actual isolated Agent edit, independent Maven regression, diff inspection, reject preserving original, and accept only the reviewed patch. Currently blocked; fixtures do not complete this item.
- [ ] Inspect History, queue pause/reorder/cancel, provider failures, restart and interrupted-task recovery. Ensure no ambiguous write or pending request replays.
- [ ] Check compact/large panels, high zoom, light/dark/high contrast, keyboard-only menus, focus return, VoiceOver announcements and reduced motion. Full screen-reader/focus qualification remains open (#15).
- [ ] Exercise upgrade using disposable old/new copies with a shared test profile, then remove only the test bundle. Confirm settings and task data survive; no owner data is removed.
- [ ] Inspect known limitations before approving release. Do not approve publication while real provider, signing, CI, licensing or clean-install gates remain blocked.

Report observed steps and failures, not inferred success. No extra model call/retry is authorized by a failed test.
