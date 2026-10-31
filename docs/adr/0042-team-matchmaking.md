# ADR-0042: Team modes queue whole teams, and each side's host plans its seats

## Status

Accepted (2026-10-31). Issue #1576, card 4a of the #1522 split (variant
C, PR 1523); the screen and the session flow are #1766 (card 4b).

## Context

Variant C of #1522 wants Team Arena (4v4), Heroes' Ascent (8v8) and GvG
(8v8) as matchmade team modes. The queue (ADR-0032) only knew Random
Arena: solo players, and a whole team that won and chose to stay
together (#882). A party now lives in its own lobby (ADR-0041), and that
lobby already runs a Team Lobby (ADR-0040), where the side votes on a
Team Build and claims its characters.

## Decision

**A party's own lobby runs its Team Lobby first, then queues one signed
team ticket that declares its bots.** `QUEUE_MODES` gains `team-arena`,
`heroes-ascent` and `gvg`, of 4, 8 and 8 a side (`isTeamQueueMode`). A
`QueueTicket` carries `bots`: 0 in Random Arena, and in a team mode
`members.length + bots === teamSizeOf(mode)` with at least one human. A
solo ticket in a team mode is refused.

A lobby party's `groupId` is `sha256(roomId ‖ queueNonce)`: `roomId` is
the lobby's derived room (`deriveLobbyRoom`, #1681), never its key, since
tickets are public on the relays (ADR-0043), and `queueNonce` is a fresh
value the host draws on Find a match and sends each guest, who signs a
consent over it as for #1078. A one-human team carries `party: null`.
The longest party (`MAX_PARTY_MEMBERS`) is now 8.

**Two team tickets of the same mode form one match.** Formation takes
the earliest two by `(enteredAt, ticketId)`, as Random Arena does, and
each is a side by itself. `groupId`, the host and the seed are unchanged.

**Each side's host sends the match host its seat plan, and the match
host seats that side without a second vote.** Once in the match room,
the side's ticket host sends `team-plan`, one message a seat as
`propose` is: the seat's human key or `null` for a bot, and its build.
At the start the match host checks each side's plan: its humans are
exactly the ticket's `members`, it is a whole side, and every build
passes the build validation a hello's does, so a skill this client does
not know spoils it. A side whose plan is bad or missing plays the house
team, the starter builds in order. A plan from anyone but the side's
ticket host is ignored. The plan's seats become that side's planned
seats, so a human's own hello build is never read for it.

**Bots enter a queued match only on their own team's ticket.** ADR-0032's
"there are no bots to fill seats" now means a bot never fills another
team's seat.

## Alternatives

- **Vote in the match room for both sides at once.** Rejected: a strange
  team waits on yours, and the counter-pick window grows.
- **Fill a short team with solos.** Rejected for now: GW1 had no solo
  queue for its team modes either, and Team Arena needed a full party.

## Consequences

- A queued match can hold bots, but only those its own side declared.
- With no other team online, the party waits; after 60 s #1766 offers to
  play the house team (Q191).
- A queued team match has no Stay together vote: each side is a party
  already.
- Nothing a player sees changes with this card. #1766 adds the screen,
  Find a match and the player docs.
