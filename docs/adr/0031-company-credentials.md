# ADR-0031: The company authenticates as itself

## Status

Accepted (2026-10-27). Issues #855 (parent), #864, #865. GitHub's section is
added by #866.

## Context

The nine agents ran on whatever the operator was logged into: the jail bound
`~/.claude/.credentials.json`, the operator's own Claude login, into every
role's box. A compromised or confused agent, a usage limit and a banned
account all landed on the operator's personal account.

## Decision

- The company has its own Claude account, in a config directory of its own,
  `<credentials>/claude/` (a `CLAUDE_CONFIG_DIR`). One copy, not nine: every
  jail binds that one `.credentials.json` and nothing of the operator's
  `~/.claude`.
- `claude-llc-init` provisions: it reads the account, refuses one that is
  the operator's or cannot be told apart from it, and prints the sign-in
  command (`CLAUDE_CONFIG_DIR=<credentials>/claude claude`, then `/login`,
  as a separate account).
- `claude-llc` enforces: it exits before the hub window unless the same
  check passes (`claude-check.mjs`). A doubt is a no.
- One explicit way round the refusal, for now: the operator creates the empty
  file `<credentials>/allow-operator-claude`. No jail binds the credential
  home, so no agent can. Boot, init and doctor then warn that the company runs
  on the operator's account, and the refusal returns the day the file goes.
  A missing sign-in is still refused.
- The per-role `claude.json` records onboarding, trust and the account it
  saw. When the company's account differs from the one recorded in
  `<credentials>/claude-identity`, init deletes every box's `claude.json`
  once and says so. Nothing of the old account is migrated (ADR-0016).

## Mechanism

The file mechanism: the jail binds the company's `.credentials.json`, as it
bound the operator's before. A long-lived `claude setup-token` token handed
in as an environment variable (no credential file in the jail) is the
alternative the issue asked to spike. It was not tried: the spike needs the
company's account and a live turn, and no agent can sign in to it. If the
spike shows it works with the rate-limit events `claude-usage.mjs` reads, it
replaces the bind in a card of its own.

## Consequences

Merging this makes the company refuse to boot until the company's Claude
account is signed in. Per-role accounts and renewal are out of scope.
