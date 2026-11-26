# ADR-0007: Development Environment

## Status

Accepted (2026-10-23).

## Context

The brief mandates `devenv.nix` as the reproducible environment, with
`git-hooks.nix`-based hooks and a `devenv container build` production image
(§27–§29, §45). `devenv 2.1.2` and `nix 2.34.8` are available in this
environment (`devenv version` / `nix --version`, checked directly).

A real constraint was found and must be stated honestly rather than glossed
over: **in the sandbox this project is currently being built in,
`devenv shell` (and therefore `devenv test`/`devenv container build`) cannot
be _realized_.** Nix _evaluation_ works — `devenv.yaml`'s inputs resolve and
`devenv.lock` is produced normally — but the actual build/realization step
fails with `error: getting attributes of path "/run/binfmt"`, because this
host's `/etc/nix/nix.conf` sets `extra-sandbox-paths = /run/binfmt` globally,
and `/run/binfmt` does not exist inside this particular container. This is an
artifact of the _sandbox this agent runs in_, not of the `devenv.nix`
configuration itself — a normal NixOS/devenv machine with `/run/binfmt`
present (or without that global sandbox-path override) does not hit this.

## Decision

- `devenv.nix` is written and maintained as the single source of truth for
  the dev environment (Node 24 via `languages.javascript`, pnpm via its
  `pnpm.enable`/`pnpm.install.enable` options, later: git hooks and
  container definitions), on the assumption it will be _run_ on a normal
  devenv-capable machine, not on this sandbox.
- Every capability `devenv.nix` would provide (`node`, `pnpm`, lint, test,
  build, container build) has a **plain `pnpm` script equivalent** in the
  root `package.json` (`pnpm run lint|test|typecheck|build|ci`), so that:
  (a) CI, which also may not have a Nix sandbox with matching
  `extra-sandbox-paths`, can run the same checks directly, and (b) this
  sandbox's verification work (every check reported as passing in Sprint 0's
  report) is done through that same pnpm surface, honestly labeled as such
  rather than claimed as a `devenv shell` run that did not actually happen.
- This limitation and its workaround are recorded in project memory (outside
  this ADR) so future sessions in the same sandbox do not re-discover it from
  scratch.

## Consequences

- Every sprint's "acceptance criteria" claim in this sandbox is stated
  precisely as _what was actually run_ (pnpm scripts against a real Node 24 +
  pnpm 10 toolchain, with real network I/O against a real Colyseus server —
  not mocked), with `devenv shell`'s realization step explicitly flagged as
  unverified-here rather than silently assumed to pass.
- A developer on a normal machine gets the full `devenv shell` experience as
  designed; nothing in `devenv.nix` is written _around_ this sandbox's
  limitation (e.g. no sandbox-specific flags baked into the committed Nix
  config).
- `devenv container build prod` was attempted directly against the finished
  `devenv.nix` (including the `containers.prod`, `git-hooks.hooks`, and
  `enterTest` additions from the Sprint 0/1 repository-foundation work). It
  got through Nix's flake-input resolution — bootstrap lib, lock-file
  resolution, `builtins.fetchTree` — with no attribute or syntax error from
  our configuration, and failed only at the same underlying wall as
  `devenv shell` (`opening lock file "...": Read-only file system`, a write
  into the read-only `/nix/store`). `devenv.nix`'s own syntax was separately
  confirmed with `nix-instantiate --parse`. This is evidence the
  configuration itself is sound, not proof the container builds — that still
  requires a real devenv-capable machine.

## Alternatives Considered

- **Work around the sandbox with a bubblewrap-based writable store overlay.**
  Attempted; blocked by this environment's own permission policy (not a
  technical dead end, but an explicit operator-side boundary) and abandoned
  rather than circumvented.
- **Silently claim `devenv test` passed.** Rejected outright — the brief's
  core engineering rule is "never claim a feature is complete if it is only
  mocked or partially implemented" (§45), and reporting an unrun command as
  run is a sharper version of the same failure.
