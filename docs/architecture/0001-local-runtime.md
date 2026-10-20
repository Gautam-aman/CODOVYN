# ADR 0001: Local-first agent runtime

Status: accepted for the foundation milestone

CODOVYN begins with a local runtime that owns task state, agent selection, and
handoffs. The editor and any future desktop shell are clients of this runtime.
An account or hosted service is never required to run a local task.

## Boundaries

- An adapter declares capabilities and implements start, resume, cancel, and
  availability operations. A feature is available only when its adapter declares it.
- The task engine persists state before invoking an adapter. Tool actions are
  identified so an interrupted action cannot silently run twice.
- A handoff includes the user request, durable progress, and independently
  observed repository state. It never claims to transfer private model reasoning.
- Credentials stay with the host process. Renderer-facing messages contain no
  secrets. Provider auth is separate from any future CODOVYN account.
- Git and GitHub mutations require their own permission path.

## Initial implementation choice

The first package uses Node's built-in test runner and file APIs to keep the
local engine executable without a registry download. JavaScript modules carry
the runtime implementation; TypeScript adoption is tracked as an explicit
follow-up. This is a foundation, not a declaration that the release is ready.

## Desktop decision gate

Before selecting a desktop foundation, compare a VS Code OSS derivative,
Electron with a real editor and language services, and other maintained shells
for license terms, update cost, extension compatibility, terminal isolation,
Git integration, and reproducible packaging. A web-only editor mock does not
meet the product requirement.
