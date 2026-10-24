# ADR-0025: An agent that talks to strangers

## Status

Accepted (2026-10-24, #131). Amends [ADR-0024](0024-telegram-topics.md)
with a fifth topic, and [ADR-0015](0015-agent-company.md) with a tenth role.

## Context

Until now nobody but the operator could reach an agent. `routeInbound`
dropped every other sender, because the `*` mark is the operator's authority
and a message from anyone else must not carry it. The operator wants people
outside the company to be able to ask questions about the game and report
bugs, and have those reports turn into issues without passing through the
operator by hand.

That means an agent that reads text written by strangers, which is the
textbook setting for prompt injection. The question is what such an agent
can be allowed to do, so that a successful injection still does little harm.

## Decision

**A tenth role, `support`, and a fifth topic, 🛟 Support.** The sidecar
creates the topic at start, next to Manager, so users can write before
support has said anything.

**Users get their own inbox kind, `user`, and are heard in Support only.**
A group member who is not the operator, writing in Support, produces one
`user` line, to `support` alone. It never carries `*`. It shows the sender
as `user:<telegram id>` and the message id that `tg reply --to` answers. Its
text goes through `visible()` and is cut to 2,000 characters. A `<role>:`
prefix from a user is just text: a user can never address another role. In
every other topic, a non-operator is still dropped, exactly as before. The
operator's own messages in Support stay `human`, with the mark.

**At most six messages per user per minute reach the inbox, and thirty
from all users together.** Every user message costs an agent a turn, so the
sidecar drops the rest. Past a user's own cap that is silent, with one log
line a minute per user. The global cap is there because many accounts get
around a per-user one. Past it, the sidecar logs how many it dropped and
replies "Support is busy, try again in a minute." in the topic, each at
most once a minute. The operator is never counted.

**Support's only way out to users is `tg reply`.** It posts plain text, as a
Telegram reply, into Support and nowhere else. Only support may use it, and
the sidecar checks that, not just `tg`, because `tg` runs in the jail. Its
`tg send` and `tg broadcast` work as for any role, and its briefing limits
it to `tg send manager`.

**Support's only write to GitHub is a labelled issue.** `hub-policy.mjs`
allows support `issue create` and nothing else that writes: no comments, no
edits, no cards, no pushes, no reviews. Comment rights, which used to be
`"*"`, are now an explicit list of every other role. Support's
`issue create` must carry `--label support`, read the way gh reads it, with
no other flags than `--title`, `--body` and `--label`, so every issue a user
caused is visibly a user's. hubd caps it at ten issues per rolling hour.

## Alternatives rejected

- **Letting users through as `human`.** One line of code, and every user
  would carry the operator's authority to every agent. That is the property
  ADR-0023 and #39 exist to protect.
- **Giving support comment rights.** A comment lands on work in progress,
  where the agents doing that work read it. An injected support agent with
  comment rights could steer any issue or pull request. A new issue is
  labelled, starts in the Backlog, and is triaged by the manager first.
- **A separate public group or bot.** More isolation, but a second token
  and a second sidecar to keep. It stays an option if the operator wants
  the public kept out of the company group entirely.

## Consequences

- An injection into support can produce, at worst: labelled issues, at most
  ten an hour; replies in Support; peer messages, which other agents treat
  as information; and reads of what every agent can read.
- Support's jail is like every other role's, and has the network. Whatever
  is in a jail can leave through an injected support agent. SECURITY.md
  lists what that is. Nothing secret may be added to support's jail beyond
  what every jail already holds.
- The `support` label must exist on GitHub before support files its first
  issue. Creating it is the manager's (`label create`).
- The flood cap and the hourly issue cap are in memory. A sidecar or hubd
  restart forgets them, which allows at most one more window's worth.
