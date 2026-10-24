# ADR-0024: Four Telegram topics: General, Bots, Manager, Operator

## Status

Accepted (2026-10-24, #85). Amends [ADR-0023](0023-one-telegram-bot.md):
replaces its per-role topics, their routing ("Topics are routing") and its
registry shape. The rest of ADR-0023 stands: one bot, local peer delivery,
a paced mirror, and the Operator topic for `tg ask`.

## Context

ADR-0023 gave every role a forum topic and routed the operator's messages
by it. But the topics deliver nothing: agents read their file inbox, and
Telegram only carries the operator's copy of it. Split across nine topics,
that copy scattered every conversation, because a reply landed in a
different topic from the message it answered. It crowded the group. And it
cost rate limit: the mirror joins backlogged messages only within one
topic, so nine topics meant more sends against the group's ~20 a minute.

The operator also had no plain line to the manager. Writing to it meant a
`manager:` prefix in General, and the manager had no way to answer except
in that same shared space.

## Decision

The group has four topics, and no per-role topics:

| Topic       | Carries                                                    |
| ----------- | ---------------------------------------------------------- |
| General     | `tg broadcast`, unchanged                                  |
| 🤖 Bots     | the mirror of every peer message, whoever it is for        |
| 📋 Manager  | the operator and the manager, both ways                    |
| ❓ Operator | `tg ask` questions and their answers, unchanged (ADR-0023) |

**Peer messages are mirrored into Bots.** Each already carries a
`sender → recipient` header, so one topic reads as one conversation, and
backlogged messages join across recipients. What agents receive does not
change.

**The operator addresses a role by prefix.** A message starting with
`<role>:` or `@<role>` goes to that role, in any topic. Unprefixed, General
goes to everyone, as before. The Manager topic is the one place that still
routes by topic: an unprefixed message there goes to the manager.
Anywhere else, Bots included, an unprefixed message goes to nobody, and the
sidecar replies under it asking which role. It is never silently dropped,
and never sprayed to every agent from a topic that means "watching", not
"talking".

**The manager answers with `tg send operator`.** It goes to no inbox, only
to the Manager topic. Only the manager may send it: `tg` refuses everyone
else, and so does the sidecar, which is the check that counts because it
runs outside the jail. The Operator topic stays reserved for `tg ask`, so
the operator's direct line to the manager does not run through it.

**Topics are created on first use,** like the Operator topic before them:
Bots when the first peer message is mirrored, Manager when the sidecar
starts, so the operator can write there before the manager has said
anything. A mirror item whose topic cannot be created is held back, with
everything behind it, and Telegram is asked again after a minute. It is
never posted to General instead.

**`registry.json` is `{ offset, bots?, manager?, operator? }`**, each topic
`{ topicId }`. It is read field by field: a field in this shape is kept and
any other is dropped, not migrated, with one log line
([ADR-0016](0016-no-backwards-compatibility.md)). So the per-role `roles`
is gone on the next write, but a numeric `offset` survives: dropping it
would make `getUpdates` replay up to a day of operator messages into the
inboxes.

## Consequences

- The operator reads one conversation in Bots, and the mirror spends less
  of the group's rate limit when the company is busy.
- Writing to one agent needs a prefix; writing in a role's old topic no
  longer reaches it (it gets the which-role reply). The old per-role topics
  stay until the operator deletes them by hand; no code cleans them up.
- The manager can report to the operator without broadcasting to the
  company, and the operator can talk to the manager without a prefix.
- Dropping `roles` loses the old topic ids, so the first start after
  this change creates Bots and Manager anew.

## Alternatives Considered

- **Keep per-role topics and only add Manager.** Rejected: it keeps every
  problem in the Context, and per-role topics carried nothing the header
  does not already say.
- **Post the manager's replies in the Operator topic.** Rejected: that topic
  is for decisions that `ASKERS` need, and a running conversation there
  would bury open questions.
- **Route unprefixed Bots messages to everyone, as General does.** Rejected:
  a reply typed under one peer message is almost always meant for one of
  its two roles, and handing it to nine agents with the operator's mark is
  worse than asking.
