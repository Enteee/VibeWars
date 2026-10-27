# ADR-0033: A host-only lock pins the commit the company runs

## Status

Accepted (2026-10-27). Issue #897, requested by the operator.

## Context

The operator wants the company to start on one known commit, and every
increment to arrive through the full pipeline: reviewed, CI-green,
merged to `main`, built by a reboot. Nothing enforced that. `claude-llc up`
ran whatever the checkout held. The checkout shares its `.git` with every
agent's worktree, and `refs/heads/main` is writable from a jail
(ADR-0015), so a moved ref moved a symbolic `HEAD` and the next boot ran
code nobody had merged.

## Decision

`.bots/company.lock` holds `{ schemaVersion, sha, lockedAt, by }`.

- `claude-llc up` refuses to start unless the lock parses, the checkout's
  `HEAD` is the lock's `sha`, the checkout is clean, and the `sha` is an
  ancestor of GitHub's `main`, fetched by URL into hubd's mirror. A failed
  fetch refuses too. There is no override flag.
- The tracked files must also equal the commit's content in hubd's mirror
  (`checkout-verify.mjs`: the mirror's tree read into a scratch index,
  compared to the working files). Jails share the checkout's
  `.git/objects` and git does not hash an object it checks out, so a
  swapped tree object leaves `HEAD` and `git status` agreeing with the
  sha. The restarter makes the same comparison right after its
  fast-forward, locks nothing on a difference and alarms the operator on
  Telegram with the paths. Files the commit lacks count too; ignored paths
  (`node_modules`, `.bots`) do not, as the commit's own root `.gitignore` from the mirror
  names them; a nested `.gitignore` in the checkout is not read, since a
  planted one could hide a planted package. A listing of the commit through the
  checkout's store (`ls-tree -r`) is also diffed against the mirror's, which
  catches a planted subtree inside an ignored directory.
  nix reads `scripts/bots` and `nix/` as paths (`${../scripts/bots}`) from
  the working tree, which is what is verified. This was read from the nix
  files, not run under a tampered checkout.
  Rejected: read-only `.git/objects` in jails (agents must commit),
  `git fsck` on every boot (slow, and alternates bypass it), checking out
  from the mirror directly (goes through the checkout's index and config).
- The lock advances only in a reboot, after the restarter built `main` in
  the mirror and fast-forwarded the checkout to it, and in
  `claude-llc lock`, which the operator runs on the host after the same
  checks and the same build.
- A reboot that does not build or fast-forward leaves the lock where it was,
  so the company comes back on the locked commit.
- A lock in another shape is refused as unreadable, never adapted
  (ADR-0016).

## Where, and what was rejected

`.bots/` is host-only and gitignored: no jail mounts it, so no agent can
write or read the lock.

- **A tracked lock file.** A pull request, so an agent, would write it, and
  a commit cannot name its own sha.
- **Trusting `boot.json`.** It records boots, not intent, and is written
  after the fact; the two stay separate.
- **A warning, like `boot-check.mjs`.** A warning is what the operator
  scrolled past; the point is that nothing else starts.
- **An offline override.** The ancestor check is the whole value; an escape
  hatch that skips it is the hole.

## Consequences

- The first start after this merges has no lock and refuses. The operator
  runs `claude-llc lock` once.
- A force-pushed `main` that drops the locked commit stops the next boot
  until the operator decides and re-pins.
- Moving the checkout by hand needs `claude-llc lock` afterwards.
