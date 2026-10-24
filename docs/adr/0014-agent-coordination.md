# ADR-0012: Multi-Agent Coordination over Telegram

## Status

Accepted (2026-10-24).

## Context

Development on this repository is done by Claude agents. Until now that meant
one agent at a time, in one sandbox (`claude-box`, from the operator's NixOS
configuration): a bubblewrap jail with a tmpfs `$HOME`, the project directory
bound read-write, and the Claude OAuth credential as the only secret inside.
Two agents could be started, but they had no way to know the other existed,
no way to divide work, and no way for a human to watch or steer them without
sitting at both terminals.

What was needed: several role-scoped agents running at once, able to message
each other, observable and interruptible from a phone, and isolated from each
other's edits and from the operator's working tree.

Telegram supplies three of those properties at once — a durable multi-party
bus, a human-readable log, and a remote control surface — so the question was
whether the Bot API could actually carry agent-to-agent traffic.

Two things that were true for most of the Bot API's history would have made
the answer no:

- **Bots could not be created programmatically.** Only @BotFather, driven by a
  human user account, could mint a token.
- **Bots never received other bots' messages.** Updates for messages authored
  by a bot were not delivered to bots, at any privacy setting. Agents in one
  group would have been deaf to each other.

Both changed in 2026, and this design depends on both:

- **Managed Bots, Bot API 9.6 (2026-04-03).** A bot with Bot Management Mode
  enabled (set once in the BotFather mini app, which flips `can_manage_bots`)
  can own child bots. A link of the form
  `https://t.me/newbot/{manager}/{suggested}?name={name}` opens a pre-filled
  creation screen; once a human confirms it, the manager receives a
  `managed_bot` update and calls `getManagedBotToken` to obtain the child's
  token. `replaceManagedBotToken` rotates it.
- **Bot-to-bot communication, Bot API 10.0 (2026-05-08).** A bot now receives
  messages sent by another bot in a group when it has admin rights there, or
  has group privacy mode disabled.

One limitation did **not** change, and is load-bearing for the setup flow:
**there is no Bot API method that adds a bot to a group.** Guest Mode (10.0)
is not a substitute — a non-member bot receives an update only when it is
mentioned or replied to, and may issue exactly one reply.

## Decision

`claude-bot <role>` in `devenv.nix` (implemented in `nix/claude-bot.nix`).

**Identity.** Each role is a real, separate Telegram bot with its own name and
avatar, provisioned on demand through the Managed Bots flow. One manager-bot
token is configured in `devenv.local.nix`; every role token after that is
obtained programmatically and stored in `.bots/registry.json` (mode 0600,
gitignored). Suggested usernames carry a random 4-hex suffix because Telegram
usernames are global.

**Subchannels are forum topics.** The swarm lives in one supergroup with
Topics enabled. Each role creates a topic named after itself with
`createForumTopic` and owns it; General carries broadcasts and operator
directives. Directed messages go into the recipient's topic and at-mention the
recipient's bot, so delivery does not depend on privacy mode being off.

**The token stays outside the jail.** A sidecar (`scripts/bots/link.mjs`) runs
unsandboxed per role and is the only process holding that role's token. It
long-polls `getUpdates` into `inbox.jsonl` and drains an `outbox/` directory
via `sendMessage`. Inside the jail, `tg` (`scripts/bots/tg.mjs`) only reads and
writes those two directories — it has no HTTP client and no credential.

**Isolation.** Each role works in a `git worktree` on branch `bot/<role>`.
`$DEVENV_ROOT` inside the jail is a tmpfs with only the worktree, the role's
bus directory, and `.git` bound into it; the operator's checkout is not
mounted at all.

**Interactive, not a daemon.** `claude-bot` opens the Claude TUI. An agent
parks on a peer with `tg wait` rather than being driven by an event loop.

## Consequences

- Per new role, a human does exactly two taps, once ever: confirm the creation
  link, then add the new bot to the group. Everything else — token retrieval,
  promotion to admin, access settings, topic creation, the worktree — is
  automatic, and `provision` is resumable, so an interrupted setup continues
  where it stopped rather than restarting.
- Admin rights are granted to every role bot because that is what Bot API 10.0
  requires for peer visibility. The side effect is that each agent can delete
  messages and manage topics in the group. Acceptable for a development swarm;
  it would not be for a public group.
- `getManagedBotAccessSettings` / `setManagedBotAccessSettings` exist as of
  10.0 but the `BotAccessSettings` field names are not in the public
  reference. `configureAccess` therefore reads the settings back and flips the
  keys that match, and on any failure prints the BotFather fallback rather
  than reporting success it cannot verify. Admin rights already cover the
  functional need, so this is an optimisation, not a dependency.
- Committing from a worktree needs the shared `.git` bound read-write, so an
  agent could in principle delete a branch. It cannot touch the operator's
  working tree, which is the property that actually matters. A per-role `git
clone` would close the remaining gap at the cost of a full checkout each.
- `tg` and `link.mjs` are copied into the Nix store rather than read from the
  checkout, because an agent's branch is not guaranteed to contain a working
  copy of the script it is handed, and because an agent should not be able to
  rewrite what its own sidecar runs. The cost is that editing them requires
  `rm .devenv/nix-eval-cache.db` and a fresh shell — devenv's evaluation cache
  keys on `.nix` files, so a changed `.mjs` is not noticed on its own.
  `claude-bot` compares the checkout against the staged copy on startup and
  warns when they differ, because the failure mode otherwise is an edit that
  appears to do nothing.
- `devenv.yaml` gained `permittedUnfreePackages: [claude-code]`. devenv
  evaluates its own nixpkgs, so the host system's `allowUnfree` does not
  apply, and `claude-code` is unfree.
- Outbound messages are rate-limited to one per 3.1s per role, under
  Telegram's ~20/minute group ceiling. An undeliverable message is reported
  into the agent's own inbox and dropped rather than retried forever, because
  an agent that is never told its message failed will wait on a reply that
  cannot come.

## Alternatives Considered

- **One shared bot token, all roles posting through it.** Simpler to
  provision, but every agent appears under the same name, which makes the
  Telegram log — the main reason to use Telegram — much harder for a human to
  read. It also puts every role on one `getUpdates` stream, which only one
  process may consume.
- **A local message bus as the real transport, with Telegram as a mirror.**
  This was the design before the Bot API 10.0 finding, and would have been
  mandatory under the old bot-to-bot restriction. Rejected once direct
  delivery was confirmed available: a second transport that must be kept
  consistent with the first is a source of divergence, and the mirror would
  lie whenever a send failed.
- **Driving @BotFather over MTProto with a user session** (telethon, api_id,
  phone number) to create bots fully unattended. Would remove one of the two
  taps. Rejected: it puts a full Telegram account credential into the
  development environment and is ToS-adjacent, to save a one-time action.
- **Headless agents driven by incoming messages** (`claude -p --resume` per
  message). A genuinely always-on swarm, but it removes the ability to sit
  down at an agent and work with it, and makes every permission decision
  either automatic or blocking. Interactive first; this stays open.

## Verification

The pure half of the bridge — Telegram update to inbox line, outbox file to
`sendMessage` parameters, cursor arithmetic — is covered by
`scripts/bots/protocol.test.mjs` and runs in `pnpm run test`. The half that
needs a token and a socket cannot be tested in CI without a live bot, a live
supergroup and two human taps, and is therefore verified by hand:

1. `claude-bot architect`, tap the link, add the bot: expect a token in
   `.bots/registry.json` and an `architect` topic in the group.
2. `claude-bot qa` in a second terminal: expect independent provisioning, and
   both roles listed by `tg roster`.
3. `tg send qa "ping"` from architect: expect it in the `qa` topic on a phone
   **and** in `tg inbox` inside the qa jail. This is the assertion that proves
   bot-to-bot delivery works; nothing else in the suite can.
4. Reply from the phone in the `qa` topic: expect `tg wait` to unblock.
5. In a jail: `cat ~/.ssh/id_*` fails, `env` contains no token, and the
   operator's checkout is absent while the worktree is writable.
