# ADR-0044: The lock decides what runs; the checkout is the operator's

## Status

Accepted (2026-10-31). Issue #1861, requested by the operator. Supersedes
[ADR-0033](0033-company-commit-lock.md).

## Context

ADR-0033 pinned the company's commit in `.bots/company.lock`, but only as a
comparison: `claude-llc up` ran the code in the operator's checkout (the
devenv shell, nix's `${../scripts/bots}`, tmux `-c "$DEVENV_ROOT"`) and
refused unless the checkout's `HEAD` was the lock and the checkout was
clean. So a plain `git pull` in the operator's checkout stopped the
company:

```text
claude-llc: checkout HEAD fb15a33 is not the locked c9f0b10: something moved the checkout. Reset it to the lock, or run 'claude-llc lock' if you moved it on purpose
```

The checkout is the operator's to move. What the company runs should not
depend on it.

## Decision

The company runs a tree that holds exactly the lock's `sha`,
`.bots/company/<sha>/`, written from hubd's mirror. The checkout's `HEAD`,
branch and dirty state no longer matter to `up`.

- **The locked tree.** `company-lock.mjs`'s `lockedTree` writes the files
  with `GIT_DIR` the mirror and a scratch index (`read-tree`,
  `checkout-index`), so no object in the checkout's shared store can write
  one, then checks them against the mirror (`treeMismatches`, the
  `tamperedPaths` comparison without the second store). A tree that does
  not match is derived state: deleted and written again (ADR-0016). One
  that still differs refuses. Only the current sha's tree is kept. It gets
  a git repository of its own, files staged, no commit, as the reboot's
  build check does: devenv would otherwise install its hooks into the
  checkout's, and nix reads only tracked files. The operator's
  `devenv.local.nix`, which git ignores, is copied in from the checkout.
- **The re-exec.** `claude-llc up` in the checkout's shell reads the lock,
  fetches GitHub's `main` by URL into the mirror, checks the sha is on it,
  writes and checks the locked tree, prints a warning if the checkout is
  not the lock, then runs `devenv shell -- claude-llc up` in the locked
  tree with `VIBEWARS_LOCKED_SHA` and `VIBEWARS_REPO`. That claude-llc,
  built from the locked tree, checks the lock is still that sha and its
  tree is where it runs, and never re-executes. It sets `DEVENV_ROOT` back
  to the checkout, where the company's state is (`.bots`, the shared `.git`
  the jails bind), and exports `VIBEWARS_CODE`, the locked tree, for what
  reads code at run time: claude-bot's briefings, hubd's and the
  dashboard's `schedule.json`, the boot and build fingerprints, the tmux
  panes' directory. `boot.json`'s `sha` is the lock's.
- **The warning.** `claude-llc: warning: checkout HEAD fb15a33 is 63 commits
ahead of the locked c9f0b10; the company runs c9f0b10. 'claude-llc lock'
to move it`, with ahead, behind or diverged as `git rev-list --count`
  says.
- **Refusals that stay**: no lock or an unreadable one; a failed fetch; a
  lock not on GitHub's `main`; a locked tree that differs from the mirror
  even written again.
- **`claude-llc lock`** still pins the checkout's `HEAD` after today's
  checks on it (clean, on `main`, its files the mirror's) and a build.
- **A reboot** (`restart.mjs`) locks the approved commit once it built,
  writes its tree, and starts the locked tree's claude-llc directly. It no
  longer fast-forwards, resets or runs git in the operator's checkout.

## What was rejected, and what failed

- **Comparing `HEAD` with the lock** (ADR-0033). It stopped the company on
  every `git pull`, which is what the operator does to read the code.
- **A `git worktree` for the locked tree.** It goes through the shared
  `.git`, which every jail can write, and git does not hash the objects it
  checks out.
- **Pointing `DEVENV_ROOT` at the locked tree for the whole company.**
  Every jail bind, worktree and `.bots` path is spelled from `DEVENV_ROOT`;
  moving all of them to a new variable touches the jail's mounts for no
  gain. Code read at run time is the shorter list, so that one moved.
- **Fast-forwarding the checkout in a reboot**, as before. It needed a clean
  `main` and refused otherwise, so a reboot left the company on old code
  whenever the operator had local work.

## Consequences

- The operator can pull, branch and edit in the checkout while the company
  runs; `up` warns and runs the lock.
- The first `up` after this merges writes `.bots/company/<sha>/`, and every
  `up` checks it, which costs a hash of the tree.
- The checkout's own claude-llc still starts `up` and reads the lock, so a
  broken checkout can still stop `up` before the re-exec. The reboot does
  not go through it.
- `claude-llc status` compares the running build with the locked tree, not
  the checkout.
