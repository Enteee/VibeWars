# ADR-0032: Strangers meet in unranked play, through a ticket queue on Nostr

## Status

Accepted (2026-10-27), by #868, the first child of epic #854. The operator
approved #854 on 2026-10-27, which revisits Q45 for unranked play. It
amends [ADR-0022](0022-peer-to-peer-networking.md), which kept matchmaking
between strangers out of scope.

## Context

GW1's Random Arenas is its entry point to PvP: pick a character, press
_Enter_, and fight beside three strangers against four more. VibeWars can
start a match only from a lobby code that somebody shares, so a player
with no friends online cannot play at all.

ADR-0022 ruled matchmaking between strangers out, because the host's
browser is the match's authority and can cheat. That reasoning is about
stakes: a cheating host is fine among friends and wrong for anything a
stranger could lose. A queue that gives nothing away that outlives a
visit has nothing to lose.

There is no server to run a queue on (ADR-0022), and there will not be
one. Peers already find each other through public Nostr relays
(`apps/web/src/net/transport/relays.ts`). The same relays can carry small
"I am looking for a match" events, and if every queued client sees the
same events, each can work out the same match on its own.

## Decision

**Strangers may meet in unranked play only. They queue by publishing
ephemeral ticket events on the public Nostr relays we already use, and
every queued client computes the same match from the same live tickets,
with nobody negotiating.**

1. **Unranked only.** ADR-0022's reasoning still holds for anything with
   stakes: no rating, ladder, title or reward that outlives a visit (#481
   keeps those). A session streak, kept in memory, is all a player takes
   away.
2. **The queue lives on public Nostr relays**, the ones `relays.ts`
   already lists. Nothing new is hosted.
3. **Tickets are ephemeral Nostr events**, of a kind in 20000–29999, which
   relays forward and do not store. A queued client re-publishes its ticket
   every `TICKET_HEARTBEAT_MS`, so a client that subscribes late waits at
   most one heartbeat to see everyone. A ticket not refreshed within
   `TICKET_TTL_MS` is dead. The child that builds the Nostr board probes
   the relays first: if they drop ephemeral kinds, that child goes back to
   the architect instead of switching kinds on its own.
4. **Every client computes the same match.** Formation is one pure
   function of the live tickets (`queue-formation.ts`, #869): the earliest
   by `(enteredAt, ticketId)` fill the seats, party tickets whole on one
   side. Once that set has stayed the same for `FORMATION_SETTLE_MS`, the
   group's id is the sha256 of its sorted ticket ids, and from it come the
   room, the teams (a shuffle seeded by the group id) and the map (a
   seeded pick from the pool). The host is the ticket with the lowest
   `sha256(groupId ‖ ticketId)`, not the lowest ticket id, so a fixed
   secret does not host every match. A late joiner can still grind a
   few secrets against the group it would join; that is accepted, for
   the reason a lying host is (Consequences). When two clients disagree, the rooms do not fill within
   `FORMATION_TIMEOUT_MS`, and everyone requeues keeping their original
   `enteredAt`.
5. **Admission by secret.** A ticket's public id is `sha256(secret)`,
   and the secret stays in memory. The room's name can be worked out by
   anyone watching the relays, so a joiner shows its secret, and the host
   admits a peer only if the secret hashes to one of the group's ticket
   ids, once per ticket. This is the shape `rejoin-proof.ts` already uses.
6. **Signing with `@noble/secp256k1`**, which Trystero already brings into
   the lockfile at 3.2.0. It becomes a direct dependency at that version.
   Each ticket is signed with a throwaway key of its own, so tickets do
   not link a player across visits.
7. **No proof-of-work at first.** A fake ticket costs its sender nothing,
   but it can cause each client at most one fall-through, after which the
   client ignores it for `NO_SHOW_IGNORE_MS`. NIP-13 proof-of-work is the
   lever to pull if spam ever shows up.
8. **Versions reject** ([ADR-0016](0016-no-backwards-compatibility.md)).
   The protocol version rides the ticket, and a ticket of another version
   never matches. Nothing adapts to it.

## Consequences

- **A player can play with nobody to invite.** _Random Arena_ needs no
  code and no friends.
- **The host can still cheat**, as in every match since ADR-0022. That is
  why nothing in this mode is worth protecting, and why it stays unranked.
  A lying `enteredAt` jumps the queue; that is accepted for the same
  reason.
- **Some peers cannot reach some hosts**, because there is no TURN relay
  (ADR-0022). Such a peer counts as a no-show, its group falls through,
  and its next group most likely has another host.
- **A thin queue just waits.** There are no bots to fill seats until
  #475.
- **Public relays are now the queue as well as the introducer.** If they
  are down, nobody queues, just as nobody can join a lobby. CI never uses
  them: the queue board is an interface, with a memory board for unit
  tests and a BroadcastChannel board for e2e.
- **Disagreement is possible and costs time, never correctness.** Relays
  deliver at different speeds; the settle window makes a split rare, and
  formation never puts one ticket in two groups, so the worst case is a
  fall-through and a requeue.

## Alternatives Considered

- **A well-known Trystero room for the queue.** Trystero connects every
  peer in a room to every other over WebRTC: about 1,200 connections at
  50 queued players, before a single match forms. A ticket on a relay
  costs nothing until a group forms.
- **A matchmaking server.** It would decide matches cleanly, and it is a
  backend, which ADR-0022 exists to avoid.
- **Stored Nostr events with an expiry (NIP-40).** Relays would keep the
  tickets, which they then hold about players for no reason, and the
  heartbeat already brings a late subscriber up to date.
- **Negotiating the match among the queued peers.** Any negotiation needs
  connections between strangers before they have a reason to connect,
  and a protocol to agree on who decides. A pure function of public data
  needs neither.
- **Proof-of-work on every ticket from the start.** It slows every honest
  player to stop spam nobody has seen yet. The no-show ignore list
  already bounds what a fake ticket can do.
