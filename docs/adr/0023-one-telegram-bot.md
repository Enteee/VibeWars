# ADR-0023: One Telegram bot for the whole company

## Status

Accepted (2026-10-24). Amends [ADR-0014](0014-agent-coordination.md): one bot
instead of one per role, peer messages delivered locally, and a paced send
queue. ADR-0014's sandbox split (the token lives outside the jail; agents
only touch their inbox and outbox) stands.

## Context

ADR-0014 gave every role its own Telegram bot, created through the Managed
Bots flow, and had agents reach each other through the group: a bot that is
an admin sees other bots' messages there (bot-to-bot delivery, Bot API 10.0).

That cost more than it looked:

- **Hiring was rate-limited.** Each new role needed a managed bot, and
  BotFather's limit on creating them is what left five of the nine roles
  unhired for the whole first day.
- **Nine secrets.** Every role's token sat in `registry.json`.
- **Peer delivery depended on a group setting.** Until the operator enabled
  bot-to-bot communication (around 15:11 on 2026-10-24), not one agent's
  message to another arrived. About 65 messages, including every assignment
  the manager made, were lost without an error. The agents looked idle
  because they never received their work.

## Decision

**One bot, the existing manager bot, for every role.** Each message stays
prefixed `[role]`.

**One sidecar, not nine.** Telegram allows exactly one `getUpdates`
consumer per token; a second gets `409 Conflict`. So `link.mjs serve` is a
single process for the company, holding a lock, and any `claude-bot` may
try to start it. Each agent keeps a token-less `link.mjs presence <role>`
that keeps its roster entry fresh, which is what `tg roster` reads.

**Peer messages are delivered locally.** A bot never receives its own
messages, so with one bot, peer traffic cannot go through Telegram at all.
The sidecar drains each outbox straight into the recipients' inboxes: `to:
role` to that inbox, `to: all` to everyone else's. Telegram gets a copy for
the operator to read. An agent waiting in `tg wait` wakes as soon as the
file is written, not when Telegram gets round to it.

**Topics are routing.** An operator message in a role's topic goes to that
role only. In General it goes to everyone, unless it starts with
`<role>:` or `@<role>`. An unknown topic, or a prefix that is not a role,
goes to everyone, so nothing is silently dropped. Messages from bots are
ignored: the old per-role bots may still sit in the group, and a bot's
message read as human would carry the operator's `*` mark.

**The mirror is paced, agents are not.** One bot may post about 20
messages a minute into one group, and the company now shares that. The
sidecar queues the copies and sends 18 per rolling minute, at least 1.1 s
apart. When backlogged it joins consecutive messages to the same topic into
one, up to 4,096 characters. It never merges different topics, never
reorders, and honours `retry_after`.

**No provisioning.** The Managed Bots flow, per-role tokens, username
suggestions and the at-mention that got around privacy mode are deleted,
not kept alongside ([ADR-0016](0016-no-backwards-compatibility.md)).
`registry.json` is now `{ offset, roles: { <role>: { topicId } } }`. Any
other shape is refused with a one-line `jq` command that keeps the
existing topics. A role's topic is created the first time it is needed.

The token stays where it already was, in `vibewars.telegram.managerTokenFile`,
read at runtime. It is not copied into `registry.json`, which the sidecar
rewrites and which is easier to leak.

## Consequences

- Hiring a role is `claude-bot <role>`, with no Telegram step. `claude-llc`
  starts every role by default; `CLAUDE_LLC_ROLES` names a subset.
- Agents talk to each other even when Telegram is slow, rate-limited or
  down. Only the operator's copy waits.
- Per-role avatars and `@vw_<role>_bot` mentions are gone. The operator
  addresses a role by its topic or a `role:` prefix.
- `vibewars.telegram.managerUsername` and `usernamePrefix` are removed. A
  `devenv.local.nix` that still sets `managerUsername` (written by older
  `claude-bot-setup`) fails to evaluate until that line is deleted.
- After a burst, the operator sees joined messages and may lag behind the
  agents by a minute or two.
- The old role bots should be deleted in BotFather. Nothing uses them.

Verified by `link.test.mjs`: the real sidecar against a fake Bot API covers
local delivery and mirroring, routing by topic and by prefix, a 30-message
burst that reaches every inbox at once and the operator in far fewer sends,
topic creation, the not-running notice, the single-instance lock, and
refusal of the old registry. Not verifiable in CI: a real group, a real 429.
To check by hand with a few agents running: every message appears in
Telegram; a burst arrives joined with no 429; `tg wait` wakes on a peer
message at once.

## Alternatives Considered

**Keep one bot per role.** Rejected: the provisioning rate limit is what
kept the company understaffed, and the bot-to-bot dependency is what lost a
day of messages.

**A user account (userbot) instead of a bot.** No per-message limits worth
worrying about, but it puts a full account credential in the sidecar.
ADR-0014 already rejected it, and nothing here changes that.

**Peer messages through Telegram with one bot, by echoing them back.** A bot
does not receive its own messages, so this would need a second consumer and
brings back everything above.
