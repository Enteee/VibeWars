# ADR-0021: CI runs in the devenv shell, and runs every git hook

## Status

Accepted (2026-10-24). Amends [ADR-0007](0007-development-environment.md):
devenv is now also the CI environment. D3 amended (2026-10-25, #230).

## Context

CI installed Node and pnpm with `setup-node` and `pnpm/action-setup`, so it
ran a toolchain that only resembled the one `devenv.nix` pins. None of the
`git-hooks.hooks` ran in CI, so a commit made with `--no-verify`, or outside
the shell, skipped prettier's excludes, nixfmt, statix, shellcheck,
actionlint, the secret scanners and the rest unnoticed. `enterTest` ran
`test:e2e`; CI did not (#11).

## Decision

**D1. CI uses devenv itself.** `nixbuild/nix-quick-install-action` installs
Nix (single-user, so the store cache can be restored into it), the
devenv CLI is installed from the nixpkgs revision `devenv.lock` pins, and
every check runs as `devenv shell -- <cmd>`. The setup is the composite
action `.github/actions/devenv`. The agent tooling is left out of CI's shell
by `vibewars.claudeBot.enable = false`, written to the gitignored
`devenv.local.nix`.

**D2. Caching needs no secret.** `nix-community/cache-nix-action` caches
`/nix/store` in the normal Actions cache, keyed on `devenv.nix`,
`devenv.lock`, `devenv.yaml` and `nix/**`. Only the `git hooks` job
saves it; the others restore it. The pnpm store is cached on
`pnpm-lock.yaml`.

**D3. Every hook in one job.** The `git hooks` job enters the shell, which
writes `.pre-commit-config.yaml`, checks with `prek list` that at least one
hook is enabled, then runs `prek run --all-files` (`prek` is devenv's
default `git-hooks.package`). prek runs every hook even after one fails, and
names each one Passed or Failed. Adding a hook to `devenv.nix` runs it in
CI with no workflow edit. `git hooks` is required: `company-init.mjs` lists
it in `EXPECTED_CHECKS` for hubd and for the ruleset on `main`. Third-party
actions are pinned to a commit.

Until #230 this was a generated matrix: a `list git hooks` job and one
`hook (<id>)` job per hook. Each of those 12 jobs spent 40–60 s realising
the shell to run a hook of a few seconds, and 16 jobs per run queued behind
the account's concurrent-job limit, about 2.5 min per run. Pull request
runs now also cancel the run their next push supersedes.

**D4. The `enterTest` checks run as separate steps** of the
`format + lint + typecheck + test + build` job, in `enterTest`'s order,
ending with `test:e2e` against the shell's pinned Chromium. The list is
duplicated, with a comment on both sides; the job keeps its name because it
is the required status check.

## Consequences

- CI and a developer's shell run the same tools at the same versions, and a
  `devenv update` moves both.
- A hook failure turns `git hooks` red; its log names the hook that failed.
- A push to a pull request cancels the run it supersedes. Main runs are
  grouped by commit, so a merge never cancels or replaces another merge's run.
- The first run after a `devenv.lock` or `nix/**` change builds or downloads
  the shell; later runs restore it. The Actions cache is 10 GB per
  repository, and the shell (Chromium included) is a large share of it.
- The `enterTest` list exists twice. It changes rarely, and its order is
  load-bearing (build before e2e), which a generated matrix would lose.
- No job in this workflow `needs:` another job before the required check,
  because a required check skipped for a failed dependency counts as
  passing.
- The generated `.pre-commit-config.yaml` is not tracked. It is a
  machine-specific store path that devenv rewrites on every shell. While it
  was tracked, a hooks change left the operator's checkout permanently
  dirty, and every company reboot refused to fast-forward (#283). Bot
  worktrees get a link to the host's copy from `ensureWorktree`
  (`scripts/bots/worktree.mjs`), because the shared pre-commit hook reads it
  from whichever worktree commits.

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
