# ADR-0025: Support's jail holds no secret and can write nothing shared

## Status

Accepted (2026-10-28). Issue #148, a prerequisite of #131 (the support
role). Operator decisions Q14 and Q15; the credential is the company's
since ADR-0031.

## Context

Support answers people outside the company in the Support topic. It reads
their text, so it has to be assumed prompt-injected, and anything it can
read can end up in a public Telegram reply or an issue body. Restricting
network egress alone does not help: the agent can paste a secret into a
reply.

Every other jail breaks that rule five ways: the company's Claude
credential is bound in read-write, the shared `.git` is writable, the whole
bus (every inbox) and hub are mounted, the operator's `~/.config/git` is
mounted, and the network is shared.

## Decision

Support gets a jail of its own, in which it holds no secret and writes
nothing another agent reads:

- **Source:** no `.git` and no worktree. Before every turn the host exports
  main with `git archive` from hubd's mirror (`support-src.mjs`), never from
  the shared repository's refs, into `.bots/support-src/<employee>/<sha>/`,
  and deletes that seat's older exports; each seat has its own, so one
  seat never deletes the tree another's turn runs in. That tree,
  read-only, is the working directory, and `VIBEWARS_SOURCE_SHA` names its
  commit so answers can cite it.
- **Bus and hub:** only `bus/<employee>` and `hub/<employee>`, and the
  `_alive/` directories beside them that hold the sidecar's and hubd's
  heartbeats. Those moved there from the roots so that a jail can bind them
  alone: each is replaced by rename, and a file bind would pin the first.
- **No** `~/.config/git`, no skills, no peek.
- **Network:** `--unshare-all`, without `--share-net`. Claude reaches the
  API through `support-proxy.mjs`, a proxy on the host listening on a unix
  socket whose directory is bound in. Inside, socat serves it on loopback
  and `ANTHROPIC_BASE_URL` points there. The proxy forwards
  only `POST /v1/messages` and `POST /v1/messages/count_tokens` to
  `api.anthropic.com`, exact paths, since a pattern lets `/v1/../`
  through. It drops any credential header the jail sends, so the jail
  cannot pick the account, and adds the company's OAuth token,
  read from its `.credentials.json` on every request. It never writes or
  refreshes that file: the other jails' sessions keep it fresh, and it
  keeps one writer. An expired token answers 503 and pauses
  support until they do. Claude in the jail sends a placeholder token,
  `support-proxy`, which is not a credential.
- **Budget:** the proxy refuses over `supportRequestsPerHour` requests an
  hour (`company.json`, 200 by default) with 429. A login has no per-key
  spend limit, so this is the only cap on what an injected support can
  spend. Each support seat runs its own proxy, so the budget is per
  seat. One proxy serves every turn of its seat: a second start finds it
  answering and exits.
- **Sidecar:** support's `tg send` reaches only the manager; any other
  role, employee or a broadcast is refused. `tg reply` stays Support-topic
  only.

Support's bubblewrap arguments are built by `jail-args.mjs`, not written
out in `nix/claude-bot.nix` as every other role's are. CI's shell has no
`claude-bot`, so arguments that exist only in the script could not be
tested; `jail-args.test.mjs` asserts they name no `.git`, no
`.credentials.json`, no `.config/git`, no other bus or hub path and no
`--share-net`. `claude-bot --smoke support` checks the same from inside a
running jail, and that the proxy refuses anything but the API.

## Alternatives rejected

- **A normal jail with egress filtering.** The secrets are still in the
  jail, and a reply carries them out.
- **A read-only bind of the shared `.git`.** Refs and objects are still
  readable, and so is every branch.
- **The credentials file bound read-only.** A stolen token is still a
  stolen token.
- **The operator's own Claude login behind the proxy** (Q15, before
  ADR-0031). The company has its own account now; support spends it like
  every other role.

## Consequences

- A token stolen through support is impossible. An injected support can
  still spend the company's usage, up to the hourly budget, and do what its
  hub policy allows.
- Support sees main as of hubd's last fetch, at the start of its turn, and
  never a branch.
- `tg roster` in support's jail lists nobody: the roster is in the bus
  root.
- Support's arguments and everyone else's live in two places. A change to
  what every jail gets has to be made in both.
