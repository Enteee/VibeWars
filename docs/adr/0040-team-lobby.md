# ADR-0040: Team Lobby: the host runs a vote and claims between ready and the match

## Status

Accepted (2026-10-30). Issue #1458, from the #1449 Team Play concept
(operator pick B); exact-size builds are the operator's rule (Q182).

## Context

Team Play (#1449) lets a side pick a shared Team Build in the lobby,
then split its characters among its players. That needs an authority for
who proposed what, who voted for what, and who holds which slot, and a
clock so a vote cannot stall the match.

## Decision

**The lobby host is authoritative for the vote and the claims**, as it
is for the lobby. A lobby hosted from Team Play (`teamLobby: true`)
goes, once everyone is ready, to the `"team-lobby"` phase: a `"vote"`,
then a `"claim"`, each `TEAM_LOBBY_STAGE_SECONDS` (60) on the lobby's
clock, both sides on one clock and one stage, each ending early once
every human on both sides is ready.

**A side's size is frozen when the Team Lobby starts**, humans and bots,
at most `MAX_TEAM_LOBBY_SIDE` (8, a GW1 team). Only proposals of exactly
that size are taken (Q182). A leaver's seat becomes a bot, and a joiner
spectates, so the size holds.

**The vote is decided by the host**: most votes; on a tie the captain's
vote if it is among the tied; else at random from the host's lobby RNG;
with no proposal, the house team of starter builds.

**The host assigns every seat's build** (`PlannedSeat.build`): in a Team
Lobby the chosen build's slots, claimed first come first served, the
rest of the humans in join order, bots in the slots left. A peer's
`PeerHello.build` is then ignored. A solo lobby keeps `build: null` for
humans, so there is one read path: the host-assigned build, else the
hello's.

**The other side's choices are hidden per recipient.** `lobby-state`
during a Team Lobby is built for each member: its own side's proposals,
votes, choice and claims, the other side `null`.

**Everything fits one message** (`MAX_MESSAGE_BYTES`). A proposal is sent
one build a message, `propose {slot, size, build}`, and stands once all
its slots are in. In the state, proposals carry professions only and are
`[]` during the claim; the chosen build carries names. Each member's
skills and weapons go once per standing proposal, to its side alone, in
their own `team-proposal-builds` message (#1811), never in the state.

## Consequences

- No counter-picking within the 60 s: a side never sees the other's
  build before the match.
- A Team Lobby side cannot exceed 8; the host is told why its start was
  turned down.
- The 5/5 Team Lobby screen renders `LobbySnapshot.teamLobby` and sends
  `propose`, `vote` and `claim` through `LobbyConnection`; it decides
  nothing.

## Alternatives Considered

- **A clock per side**: the match needs both sides anyway, and it
  doubles the states.
- **Proposals of any size, trimmed or padded**: ruled out by the
  operator (Q182).
- **Peers voting by gossip without the host**: the host already
  arbitrates, and there is no peer-to-peer consensus to lean on.
- **A whole proposal in one message**: eight large builds are over the
  transport's message cap (18 KB against 16 KB).
