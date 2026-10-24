# ADR-0021: CI runs in the devenv shell, and runs every git hook

## Status

Accepted (2026-10-24). Amends [ADR-0007](0007-development-environment.md):
devenv is now also the CI environment.

## Context

CI installed Node and pnpm with `setup-node` and `pnpm/action-setup`, so it
ran a toolchain that only resembled the one `devenv.nix` pins. None of the
`git-hooks.hooks` ran in CI, so a commit made with `--no-verify`, or outside
the shell, skipped prettier's excludes, nixfmt, statix, shellcheck,
actionlint, the secret scanners and the rest unnoticed. `enterTest` ran
`test:e2e`; CI did not (#11).

## Decision

**D1. CI uses devenv itself.** `cachix/install-nix-action` installs Nix, the
devenv CLI is installed from the nixpkgs revision `devenv.lock` pins, and
every check runs as `devenv shell -- <cmd>`. The setup is the composite
action `.github/actions/devenv`. The agent tooling is left out of CI's shell
by `vibewars.claudeBot.enable = false`, written to the gitignored
`devenv.local.nix`.

**D2. Caching needs no secret.** `nix-community/cache-nix-action` caches
`/nix/store` in the normal Actions cache, keyed on `devenv.nix`,
`devenv.lock`, `devenv.yaml` and `nix/**`. Only the `list git hooks` job
saves it; the others restore it. The pnpm store is cached on
`pnpm-lock.yaml`.

**D3. One job per hook, from a generated matrix.** The `list git hooks` job
enters the shell, which writes `.pre-commit-config.yaml`, asks `prek list`
for the enabled hook ids and emits them as a JSON matrix. The `hook (<id>)`
jobs run `prek run <id> --all-files` (`prek` is devenv's default
`git-hooks.package`). Adding a hook to `devenv.nix` adds a CI job for it
with no workflow edit. The `git hooks` job is green only if every hook job
was, which gives branch protection one fixed name to require.

**D4. The `enterTest` checks run as separate steps** of the
`format + lint + typecheck + test + build` job, in `enterTest`'s order,
ending with `test:e2e` against the shell's pinned Chromium. The list is
duplicated, with a comment on both sides; the job keeps its name because it
is the required status check.

## Consequences

- CI and a developer's shell run the same tools at the same versions, and a
  `devenv update` moves both.
- A hook failure is its own red job in the Actions UI.
- The first run after a `devenv.lock` or `nix/**` change builds or downloads
  the shell; later runs restore it. The Actions cache is 10 GB per
  repository, and the shell (Chromium included) is a large share of it.
- The `enterTest` list exists twice. It changes rarely, and its order is
  load-bearing (build before e2e), which a generated matrix would lose.
- No job in this workflow `needs:` another job before the required check,
  because a required check skipped for a failed dependency counts as
  passing.

## Alternatives Considered

- **A container image of the shell, built and published, with jobs running
  in it.** A second artefact to build, publish and invalidate, for the same
  result.
- **Cachix with an auth token.** Faster and larger than the Actions cache,
  but needs a secret from the operator. The fallback if the Actions cache
  proves too slow or too small.
- **One `devenv test` step.** Simplest, but one red step for any failure,
  which is what the split steps exist to avoid.
- **A hand-written job per hook.** A second list of hooks to keep in step
  with `devenv.nix`, which is the drift this ADR removes.
