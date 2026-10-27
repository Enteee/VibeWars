# ADR-0031: The company authenticates as itself

## Status

Accepted (2026-10-27). Issues #855 (parent), #864, #865, #866.

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
- `claude-llc-init` provisions: it reads the account, refuses one that is not
  signed in, and prints the sign-in command
  (`CLAUDE_CONFIG_DIR=<credentials>/claude claude`, then `/login`).
  Whether that is a separate account from the operator's is the operator's
  setup, not checked (the operator's decision); `claude-llc doctor` shows it.
- `claude-llc` enforces: it exits before the hub window unless the same
  check passes (`claude-check.mjs`).
- The per-role `claude.json` records onboarding, trust and the account it
  saw. When the company's account differs from the one recorded in
  `<credentials>/claude-identity`, init deletes every box's `claude.json`
  once and says so. Nothing of the old account is migrated (ADR-0016).

### GitHub (#866)

- Init is the operator's authority, once; runtime is the company's, always.
  `claude-llc-init` keeps running as the operator for what needs an admin,
  the board and the ruleset. Everything the company does on GitHub after
  that is done as its machine account.
- The API: hubd runs every `gh` with `GH_CONFIG_DIR=<credentials>/gh`, and
  drops `GH_TOKEN` and its kin from its environment at start, since a token
  variable beats the directory. Its start line names the login it works as.
- Pushes and fetches: hubd's mirror and the restarter's fetch of main run
  git with `core.sshCommand` set to
  `ssh -F /dev/null -i <credentials>/ssh/id_ed25519 -o IdentitiesOnly=yes -o IdentityAgent=none`
  (`remoteHardening` in `git-hardening.mjs`), so nothing of the
  operator's ssh config or agent is offered.
- `claude-llc-init` step 0 checks the account (`github`), its `project`
  scope, and the push key, generating it if absent and waiting until GitHub
  greets it as that same login. After the board step it checks the
  account can see the board (`github project access`): a user project is
  not reached by repository access. Whose account it is, is not compared
  with the operator's (the operator's decision); the doctor shows it.
- `claude-llc` refuses to boot when the company's `gh` holds no readable
  token or the push key is missing (`github-check.mjs`). The check is
  local, so a boot without the network is not told "not set up".

`GH_CONFIG_DIR` was chosen over a `GH_TOKEN` read from a file. The board is
a user-owned Projects board, which a fine-grained token cannot reach, so the
token is a classic one either way. `gh auth login --insecure-storage` keeps
it in `<credentials>/gh/hosts.yml`, mode 0600, where `githubIdentity` and
the doctor already read it (#864), and `gh auth refresh` adds a scope
without a hand-made token.

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
account is signed in, and its GitHub machine account is signed in with a
push key GitHub knows (#866). Per-role accounts and renewal are out of
scope, and so are admin rights for the machine account: it gets Write on the
repository and the board, never the ruleset.
