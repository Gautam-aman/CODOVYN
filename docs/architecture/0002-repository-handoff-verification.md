# ADR 0002: Verify repository state at agent boundaries

Status: accepted for the local runtime foundation

Automatic failover and restart recovery must not replay an operation against a
repository that changed without a recorded tool event. The runtime records a
snapshot before an agent starts, checkpoints after a failure, and compares the
checkpoint again immediately before a fallback starts. A process restart
compares the current repository with the recorded agent-start snapshot before
resuming a running task. A mismatch leaves the task interrupted. A later retry
can proceed if the original repository state has been restored and no tool
action was observed.

The snapshot contains the canonical repository root, branch, HEAD commit,
Git's changed-path list, and a SHA-256 fingerprint of the staged raw diff and
the contents or symlink targets of changed working-tree paths. It includes
individual untracked files. It does not cover ignored files, changes outside
the repository, or an external write that races with snapshot creation. A
large staged diff can exceed the Git subprocess output limit; verification
then fails closed and the task remains interrupted.

Even when repository state matches, an observed tool action blocks automatic
retry and handoff. Matching files do not prove that a command had no external
effects. Read-only adapters are the current default; permission-aware write
operations will need explicit reconciliation rules before they can use this
handoff path.
