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
   ticket does not host every match (but see 9). When two clients
   disagree, the rooms do not fill within `FORMATION_TIMEOUT_MS`, and
   everyone requeues keeping their original `enteredAt`.
5. **A ticket id is its signing key.** Each ticket has a throwaway
   secp256k1 key of its own, kept in memory: the secret is the private
   key, and the ticket id is its x-only public key (64 hex). The board
   accepts a ticket or a withdrawal for id X only from an event whose
   `pubkey` is X with a valid signature, so nobody can republish an
   honest id with another `enteredAt` or members. Throwaway keys
   also mean tickets do not link a player across visits.
6. **Admission by signature, both ways; the key never leaves the
   client.** The room's name can be worked out by anyone watching the
   relays, so a peer there proves which ticket it holds. The joiner's
   join carries its `ticketId` and a BIP-340 Schnorr signature by its
   ticket key over
   `sha256("vibewars-admit" ‖ groupId ‖ hostTicketId ‖ joinerPeerId)`,
   where `joinerPeerId` is its transport peer id as the
   host sees it. The host admits it only if the ticket is in the group
   and unused, and the signature verifies with the host's own
   `hostTicketId` and the sender's actual peer id, so a relayed or
   replayed signature fails. The host proves itself the same way: its
   welcome carries a signature by the host ticket's key over
   `sha256("vibewars-host" ‖ groupId ‖ hostTicketId ‖ joinerPeerId)`, and
   a joiner takes lobby state only from a peer whose welcome verifies
   against the planned host; otherwise it waits out
   `FORMATION_TIMEOUT_MS`. Both sides already know every input, so there
   is no round trip. Revealing the secret instead would let anyone in the
   room pose as the host, collect the joiners' secrets and take their
   seats. game-session takes `verifyTicketSig` and `signWithTicket` as
   functions, so it has no secp256k1 dependency. Like
   `rejoin-proof.ts`, a proof names the peer that sends it. A client
   that requeues after a fall-through still makes a fresh key, so a
   fresh ticket id, and keeps its original `enteredAt`.

   _Amended by #882, for a party._ A team that stayed together has no
   shared secret: each member keeps a key of its own, and the ticket
   lists their public keys, sorted, as `members`. Its leader, the
   lowest, publishes it with its own key, so `ticketId = members[0]`;
   the others publish nothing and follow it. A side is seated by **seat
   key**, a solo's ticket id or a member's own key, and the join carries
   `seatKey` in place of `ticketId`, signed by that key as above. **A
   party keeps its key, and so its id and `enteredAt`, across a
   fall-through**: its followers find it by that id, and there is no
   channel left to tell them a new one. The cost is that a party blamed
   as a no-show is ignored by those clients for `NO_SHOW_IGNORE_MS`.
   A party is a no-show when any of its members is.

   **Party membership is proven by each member's signature over the
   group it won and the exact member set** (#1078). Once every winner
   has voted yes with a fresh member key, the host proposes the party,
   the queued lobby's `groupId` and the keys sorted, to each of them.
   Each signs, with its member key,
   `sha256("vibewars-party" ‖ groupId ‖ members.join("") ‖ "")`, but
   only for a proposal that holds its own key and its own lobby's group,
   and the host checks every consent. One missing or bad after
   `PARTY_CONSENT_MS`, and the team splits, with no second proposal of
   fewer. A member gone before the party forms splits it too, whatever
   consents are in. A member that signed waits `PARTY_CONSENT_MS` plus the
   vote's grace from signing for the answer, so it never requeues alone
   while the host forms its party. A consent over the group alone would not do: the winning
   match's host could mint a key and publish it in a party with any one
   winner's consent. The host hands every consent to every member, and
   the leader's ticket carries them as `party`, beside `members`. The board verifies each one, paid for from the same verify
   budget, before formation sees the ticket, and remembers a ticket's
   verified `party` so a heartbeat costs no second check. A ticket that
   names a key without that key's consent never reaches formation. A
   party keeps its `party` across fall-throughs, as it keeps its key:
   the consents sign the group it won, not the one it is in.

   **A seat key seats once**: formation drops a party that names another
   live ticket's id, and both parties that name one member, since
   `enteredAt` is forgeable and neither can be trusted to have been
   first. With consents, a key on two verified tickets signed both, so
   only its holder can cause that. A client settles only into a group
   where it sits as its own ticket: a solo as a solo, a member in
   exactly the `members` it was told.

   What remains: the host of the winning match sees every consent, so
   it can republish them, but only under the same group and the same
   members. That party already exists, and this ADR accepts the
   cheating host.

7. **Signing with `@noble/secp256k1`**, which Trystero already brings into
   the lockfile at 3.2.0. It becomes a direct dependency at that version.
8. **No proof-of-work at first.** A fake ticket costs its sender nothing.
   One fake ticket causes each client at most one fall-through, after
   which the client ignores it for `NO_SHOW_IGNORE_MS`, but a sybil
   flood of fresh ones can stall the whole queue, every group falling
   through. That is accepted; NIP-13 proof-of-work is the lever to pull
   if it ever happens, and is not built until then.
9. **A queued player can choose to host.** Tickets are public, so a
   player can grind fresh keys against the visible tickets until theirs
   hashes lowest, about 2 × team size tries. That is accepted for
   unranked play, like any cheating host. Commit-reveal at a host-less
   meet is the lever if a mode with stakes ever uses the queue.
10. **Versions reject** ([ADR-0016](0016-no-backwards-compatibility.md)).
    The protocol version rides the ticket, and a ticket of another version
    never matches. Nothing adapts to it.

### NAT hint (#2090)

There is no hosted TURN, and a match is a star to one browser host, so a
joiner behind a symmetric NAT, or with UDP blocked, cannot reach a host
behind one too. Matching such a pair cost a wasted `JOIN_TIMEOUT_MS` and
a broken group, again and again.

- **Each ticket carries `hardNat: boolean`**, the publisher's (a party's
  leader's). The browser decides it once per page, in at most 3 s: a
  throwaway `RTCPeerConnection` against two STUN servers on different
  IPs. One base mapped to two public ports is symmetric; gathering that
  completes with no `srflx` is UDP blocked. Unknown, a timeout or an
  error is not hard. A player with a relay of their own (#972) is never
  hard.
- **Formation never forms a group of only hard tickets.** Where the
  front-first candidate is all hard, it gives way, per pool it draws
  from, to the same candidate with that pool's latest member swapped for
  its earliest ticket not hard; dropping it instead would block the
  queue's head for good. Leftover hard tickets keep their place.
- **`hostOf` ranks only tickets not hard**, by the same sha256.
- **A boolean, not a ranking.** Hints are untrusted. A ranking ("open
  beats cone") would let anyone claim "open" and host at will, for free.
  With a boolean, a lie only takes the liar out of hosting (`true`) or
  changes nothing (`false`).
- **No pre-match connectivity probe.** In a star, a joiner in the lobby
  already holds the one link it needs, and one that cannot reach the
  host is caught by `JOIN_TIMEOUT_MS` and the fall-through, which skips
  that host for 120 s. A probe would test a link already proven.

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
  already bounds what one fake ticket can do (8).
