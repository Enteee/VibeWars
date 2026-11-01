# ADR-0041: Every player is always in a lobby, and the lobby is the party

## Status

Accepted (2026-10-30). Issue #1526, card 2 of the #1522 split (variant C,
PR 1523).

## Context

Hosting was a button, and a lobby existed only around a match: a player
pressed **Host a game**, read out a code, and the lobby ended when they
left it. #1522 (variant C) asks for a party that is always there: your
friends are with you before you pick what to play, and the mode is a
choice the party makes, not a screen each player opens on their own.

## Decision

**Every menu screen sits in a lobby hosted by the player's own browser**
(ADR-0022). From page load the tab hosts one under a fresh lobby key
(ADR-0043), which the title bar shares with **Copy invite link** and never shows (ADR-0048). The key
holds for the lobby's life; every rehost (a reload, a guest's **Leave**, the end of a
Random Arena queue, a new name or guild tag while alone in it) mints a
fresh one and never reuses a room name. In a party, a new name shows
from the next lobby.

**Joining another lobby closes your own**, and only once the join is in:
a failed join keeps your lobby, its key and its guests. A host who
joins elsewhere sends its guests back to fresh lobbies of their own.

**The lobby is the party, and the host's mode is the party's.**
`WireLobbyState.mode` carries it, and `select-mode` is the host's alone.
A mode whose maps do not hold the current one moves to its first map in
the same broadcast, so no member ever sees a mode with a map outside it.
Every guest's rail and screen follow; their mode entries are locked. The
builders are local screens, open to everyone, and leave no lobby.

**The lobby outlives a pick on the menu**, so a member tells the host
which character it now brings with `set-character`, checked as a join's.

**The Random Arena queue still runs its own lobby** (ADR-0032). Queueing
first closes the player's own, so a join landing in between is refused,
not seated, and only a player alone in its lobby may queue. The menu
opens a fresh lobby once the queue, its match and any Stay together
party are over.

## Alternatives

- **A**, joining closes the lobby and its guests fall back: taken for
  this card; the party moving along with its host is card 3.
- **B**, an ownerless lobby that outlives its host: rejected. Without a
  host's browser there is no authority (ADR-0022).

## Consequences

- One Nostr room per idle tab: an open tab holds a signalling websocket
  and a Trystero room that announces itself on the relays our matches
  use, for as long as it is open. Trystero 0.26 announces on each of its
  `RELAY_REDUNDANCY` (4) relays every 60 s once warmed up, after a few
  quicker ones at the start: about 4 announcements a minute per idle tab,
  400 a minute for 100 idle tabs, spread over our 8 relays.
- A team mode's queued match (#1766, ADR-0042) holds two rooms in each
  of its players' tabs: the party lobby stays, so the party comes back
  to the same one, same key, Open or Closed, same guests, and an open
  one takes a newcomer while the party plays; the match room is the
  second. It is left when the match ends.
- Every open tab is on the relays, so its room must not lead back to its
  key: ADR-0043's secret key and slow derivation are what make this safe.
  Without them, a relay observer could list and join every player's lobby.
- The host's clock runs at full rate while idle, as it did in a lobby
  before, so a join never meets an unrefilled message budget or a slow
  loop.
- One lobby at a time per tab: the own lobby, a joined one, or a queue's.
