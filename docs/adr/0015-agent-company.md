# ADR-0015: The agent company's GitHub boundary

## Status

Accepted (2026-10-24). Complements [ADR-0014](0014-agent-coordination.md),
which covers how agents talk; this covers how they reach GitHub.

## Context

Nine agents run in bubblewrap jails on one machine and share one GitHub
identity. GitHub cannot tell them apart, so it cannot enforce who merges,
who approves or who restructures the board. Whatever enforces that has to
sit between the agents and the credential.

The first version (#12) did, but the reviews of it found four ways through
(#26): `hubd`, which holds the credential and runs unjailed, ran git in the
agents' own writable repository (their hooks and config ran with its
authority); `gh` flags such as `--body-file` read files on the host; the
merge guard and `gh` could disagree about which pull request a merge was
for; and `--as` named any reviewer seat.

## Decision

Agents never hold a credential and never run `gh` or an authenticated git.
They write requests to a spool; `hubd` on the host decides each one with a
pure, tested policy (`scripts/bots/hub-policy.mjs`) and runs it. In
particular:

- **hubd runs git only in its own bare mirror** (`.bots/hub/.git-mirror`),
  inside a directory the jails see read-only. A push fetches the branch by
  name from the shared repository into the mirror and pushes it to the
  company's repository by URL. Every git it runs carries `-c` settings that
  make hooks, fsmonitor, SSH and proxy commands, credential and askpass
  helpers, external diffs and `ext::` inert, and no system or global config.
- **gh runs in an empty directory hubd owns**, with the repository and owner
  always pinned by hubd and never taken from the request.
- **No gh flag that reads a file is allowed**, in any spelling gh's parser
  accepts, including short flags clustered behind booleans. `hub` reads
  `--body-file` inside the jail and sends `--body`.
- **A merge is exactly one pull request by number**, squashed, pinned with
  `--match-head-commit` to the head the approvals and checks were checked
  against.
- **A verdict names the commit it reviewed** (`--sha`), is refused if the
  head has moved, and is cast only for the role's own seat or one it is
  covering.

## Consequences

- An agent can still write anything into the shared repository's `.git`,
  including its config and hooks. That now only affects the agents
  themselves; the read-only binds #26 suggested would also stop devenv
  reinstalling the pre-commit hook it keeps there, and the mirror makes
  them unnecessary.
- hubd no longer sets an upstream in the agent's repository on push, and the
  agent's `origin/<branch>` does not move. Agents compare against the branch
  on GitHub when they need to.
- Every new `gh` subcommand an agent needs is a policy change with a test.
  That is the point, and also the cost.

## Alternatives Considered

- **One GitHub identity per role.** Would let GitHub's own branch rules do
  most of this, but means nine accounts and tokens to keep, and it still
  would not stop host file reads through `gh`.
- **Hardening git in the agents' repository instead of a mirror.** The
  stopgap that shipped first. It cannot stop a remote pointing elsewhere,
  and every new git setting that runs a command reopens it.
