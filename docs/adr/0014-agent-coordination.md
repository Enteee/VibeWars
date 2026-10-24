# ADR-0014: Multi-Agent Coordination over Telegram

## Status

Accepted (2026-10-24). Amended by
[ADR-0023](0023-one-telegram-bot.md): one bot for the whole company instead
of one per role, peer messages delivered locally, and a paced send queue.
The Managed Bots provisioning and bot-to-bot delivery described below are
gone; the sandbox split stands.

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

**Isolation.** Each role works in a `git worktree` detached at `main`; work
happens on `bot/<role>/<topic>` branches. `$DEVENV_ROOT` inside the jail is a
tmpfs with only the worktree, the role's bus directory, and `.git` bound into
it; the operator's checkout is not mounted at all.

**Interactive, not a daemon.** `claude-bot` opens the Claude TUI. An agent
parks on a peer with `tg wait` rather than being driven by an event loop.

## Consequences

- Per new role, a human does exactly two taps, once ever: confirm the creation
  button, then add the new bot to the group. Everything else — token
  retrieval, promotion to admin, topic creation, the worktree — is automatic,
  and `provision` is resumable, so an interrupted setup continues where it
  stopped rather than restarting.
- The `t.me/newbot/...` link resolves to a `tg://` URL and so does nothing on a
  desktop with no native client registered for that scheme. The primary route
  is therefore a `request_managed_bot` keyboard button, which works in every
  client including the web one. Telegram permits that button _in private chats
  only_, so it cannot be posted to the swarm group; the operator's private
  chat id is remembered on first contact so later roles get the button without
  having to start a new conversation. Its prefill fields are
  `suggested_username` and `suggested_name` — Telegram silently ignores
  unknown fields in that object, so a wrong spelling prefills nothing and
  reports no error.
- The managed-bot methods take `user_id`, not `bot_id`. Same trap: an unknown
  parameter is ignored rather than rejected, and the resulting error names the
  parameter that is now missing rather than the one that was wrong.
- Admin rights are granted to every role bot because that is what Bot API 10.0
  requires for peer visibility. The side effect is that each agent can delete
  messages and manage topics in the group. Acceptable for a development swarm;
  it would not be for a public group.
- **Group privacy mode cannot be changed over the API, and this ADR originally
  claimed otherwise.** The claim was that `setManagedBotAccessSettings` (Bot
  API 10.0) could disable privacy mode and enable bot-to-bot mode on a managed
  bot. It cannot: `getManagedBotAccessSettings` returns
  `{is_access_restricted: false}`, which is about who may _use_ the bot and has
  nothing to do with which messages it receives. The privacy toggle is
  BotFather-only, with no API at all. Every role bot therefore has
  `can_read_all_group_messages: false`, and provisioning now reports that
  position and names the manual toggle instead of pretending to have handled
  it. The design survives because admin rights are the other half of Bot API
  10.0's condition for peer visibility, and because directed messages
  at-mention their recipient, which privacy mode never filters. Whether
  messages from _humans_ in a topic reach an agent is the one claim still
  unproven; if they do not, it is one BotFather toggle per bot.
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
  appears to do nothing. The company reboot (#21), written later, hit the
  same cache: it came back up on the old scripts after a merge that changed
  only `.mjs` files, and reported the new commit as loaded. Its restarter now
  runs `devenv shell --refresh-eval-cache` (making the scripts a tracked
  input does not work: devenv 2.1.2 records neither a path literal, nor
  `builtins.path`, nor `builtins.hashFile` as an input), and every
  `claude-llc` boot compares the staged scripts with the checkout's
  (`boot-check.mjs`) and, if they differ, says so in the note the manager
  is given in place of what the boot claims to have loaded.
- `devenv.yaml` gained `permittedUnfreePackages: [claude-code]`. devenv
  evaluates its own nixpkgs, so the host system's `allowUnfree` does not
  apply, and `claude-code` is unfree.
- Outbound messages are rate-limited to one per 3.1s per role, under
  Telegram's ~20/minute group ceiling. An undeliverable message is reported
  into the agent's own inbox and dropped rather than retried forever, because
  an agent that is never told its message failed will wait on a reply that
  cannot come.

## What running it actually taught us

Six defects in the implementation were found by provisioning against a real
account, and none of them by reading the code. Three were API shapes inferred
from the changelog rather than probed — the `user_id` parameter, the
`suggested_*` prefill fields, and the access-settings claim above — and
Telegram's habit of ignoring unknown fields meant all three failed silently or
with a misleading message. The lesson recorded here for next time: probe an
undocumented method before building on its shape, because a wrong guess does
not announce itself.

The other three are worth naming because they are design-level, not typos:

- **A destructive read with a late write.** `getUpdates` confirms updates and
  Telegram will not reliably replay them. Provisioning discovered a new bot's
  id and then stored it only _after_ fetching its token, so a failure in
  between left a real bot in the operator's account that nothing could name
  again. The id is now written the instant it arrives.
- **A recovery mechanism that corrupted what it was meant to protect.** The
  fix for the above was to rewind the getUpdates offset. A rewind replays
  _every_ retained update, including the one that created a different role's
  bot — so the second role was provisioned as the first bot, two roles sharing
  one identity and one token, and it reported success. The rewind is now
  scoped to the case where there is something to recover, and a bot already
  claimed by another role is refused outright (`acceptsManagedBot`, tested).
- **No transport-level retry.** Provisioning long-polls for as long as a human
  takes to tap a button, so a dropped connection is routine rather than
  exceptional; an `ECONNRESET` killed the process. Network failures now retry
  with backoff while Telegram-level errors still propagate.

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
