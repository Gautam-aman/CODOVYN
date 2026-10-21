# Interrupted-task recovery

Recovery uses the existing SQLite journal and isolated Git worktrees. It never
expires an execution owner merely because a timestamp is old. Atomic leases have
per-execution tokens; another executor cannot acquire an unreleased task. Each
real adapter records launch intent, PID/process group and successful cleanup.
Failed cleanup retains ownership and blocks reuse.

## Inspect, preserve, review

Open task history and choose **Inspect recovery state**. Inspection validates the
worktree's repository/base and fingerprints current tracked/untracked changes.
It does not stage files, change task status or start a provider.

Recovery is allowed only after recorded cleanup, or after the owner and all
recorded POSIX provider groups are absent on the same host. Permission errors,
live/reused PIDs, foreign hosts, missing registration records and legacy unknown
ownership block recovery. No process is killed based solely on a stale PID.
An externally detached daemon is outside a process-group proof; trust installed
CLIs and review command effects. Windows orphan-group verification is unsupported.

When eligible, **Preserve for review** records the inspected fingerprint and
changes a crashed running task to interrupted. **Abandon execution, keep draft**
cancels execution while retaining files for review. Neither means a missing tool
completion succeeded. Ambiguous outcomes remain unknown in the portable packet.
The usual patch review/apply/discard flow remains separate and requires approval.
Applying still checks the original clean base and the exact reviewed patch hash.

CLI equivalents (replace placeholders with actual inspection results):

```sh
node apps/cli/src/index.js draft-inspect TASK_ID /path/to/project
node apps/cli/src/index.js draft-reconcile TASK_ID /path/to/project FINGERPRINT --yes
node apps/cli/src/index.js draft-review TASK_ID /path/to/project
# Alternative to preserve: cancel execution without deleting its worktree.
node apps/cli/src/index.js draft-abandon TASK_ID /path/to/project FINGERPRINT --yes
```

If a recorded provider still runs, stop/inspect it externally before retrying
inspection. CODOVYN does not automatically signal an unverifiable process. Legacy
Phase 2 tasks have no durable ownership evidence and remain blocked; a successful
new execution must not conceal a potentially running legacy provider.

## Explicit file-only continuation

After preservation, inspect again. **Continue with file-only project primary**
uses the saved primary (Gemini or Claude), the existing draft and original request.
A native confirmation explicitly authorizes sending context and writing the draft.
It starts one selected provider, never silently falls back, and consumes approval
once. A changed fingerprint or another failed attempt requires fresh inspection
and reconciliation. Unresolved historical actions remain in the handoff as unknown;
there is no mechanical replay of the action log.

```sh
node apps/cli/src/index.js draft-continue TASK_ID /path/to/project FINGERPRINT gemini --yes
```

Command-enabled Codex recovery is refused: ambiguous commands must not be replayed
by a resumed agent. Normal Codex tasks remain supported. File-only restrictions
come from trusted adapter capabilities and the existing CLI permission policies;
fixtures do not prove authenticated Gemini policy enforcement. Gemini live tests
remain blocked by authentication. Review agent output and patches normally.

Routed tasks require a new budget admission and currently cannot use this recovery
continuation. This prevents silently bypassing their original spending policy.

## Read-only resume and preferred restoration

Interrupted tasks without drafts or routing decisions offer **Resume safe read
task**. Native confirmation is required, and existing fingerprint/action guards
still apply. Unknown processes and any write-capable history block this path.

```sh
node apps/cli/src/index.js resume TASK_ID /path/to/project --yes
```

**Restore primary** is optional in project agent preferences. It applies only at
this verified retry boundary, never mid-stream or during pending operations. The
engine uses a newer successful task for that primary in the same repository as
cached availability evidence, not CLI installation or a guessed quota reset.
The default cooldown is 60 seconds and evidence expires after 120 seconds. A newer
failure invalidates success evidence. Candidates are attempted at most once in an
execution. No paid recovery probes run. Current provider-default configuration
must remain applicable; these observations are not guarantees of future quota or
model access. Live restoration across authenticated Codex/Gemini remains unverified.

## Verification and limitations

Tests kill actual fixture task-owner processes before actions, during/after writes,
after completion reporting and during shutdown. Recovery refuses live provider
groups, preserves partial files, and then performs explicit fixture Gemini
continuation plus patch review/apply. Unit tests cover registration gaps, unknown
owners, stale fingerprints, one-use consent, command-capability refusal and
restoration evidence/cooldown. These are deterministic tests, not live provider
quota failures or a native desktop crash certification.

[Issue #9](https://github.com/Gautam-aman/CODOVYN/issues/9) remains relevant to
verified orphan stopping, legacy-task migration and broader recovery validation.
Keep task data outside the repository; journal writes inside a worktree change its
fingerprint and correctly prevent recovery. No user files are reset by recovery.
