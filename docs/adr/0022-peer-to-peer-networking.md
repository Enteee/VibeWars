# ADR-0022: Peer-to-peer networking, with the host's browser as the authority

## Status

Proposed (2026-10-25), by #82, the first phase of epic #15. Accepted when
the last phase deletes `apps/server`. It will then supersede
[ADR-0002](0002-networking.md) and [ADR-0009](0009-production-deployment.md),
and amend [ADR-0001](0001-architecture.md).

## Context

The operator asked for VibeWars to run peer-to-peer, as a static site on
GitHub Pages with no hosted backend (#15). Today a Colyseus server owns
every match: it runs `MatchSimulation`, validates each client's intents
and sends state back. Without a server, some browser has to do that job.

Peers find each other through Trystero, which signals over public relays
(Nostr by default) and then talks WebRTC data channels. Three facts about
that shape the design:

- **Signalling goes through relays we do not control.** We host nothing,
  but we depend on someone. The relay list must live in one place.
- **There is no TURN relay.** STUN gets most pairs through NAT. Some pairs,
  behind symmetric NAT or strict corporate and mobile networks, cannot
  connect at all.
- **A hidden tab throttles timers.** A host that switches tabs would stall
  its match unless the simulation runs in a dedicated worker.

## Decision

**One player's browser hosts each match and is its authority. Everyone
else sends intents to it and renders the snapshots it sends back. This is
a host-authoritative star, not lockstep and not a mesh.**

- The host runs the same `MatchSimulation` the server runs today, from
  `game-core`, at 20 Hz in a Web Worker. The page relays messages, since
  WebRTC is not available in workers.
- Clients send `ClientIntent`s only, as now. The host validates each one
  with the same parsers the rooms use.
- The host sends full JSON snapshots every tick (`WireSnapshot`), not
  schema deltas. Eight players come to roughly 1–2 KB a tick. Optimise
  only if a measurement says so.
- Each message has its own channel (`CHANNELS` in `game-protocol`), and a
  validator. Clients validate the host's messages too: the host is trusted
  for outcomes, not for well-formed bytes.
- The session logic lives in `packages/game-session`. It is pure
  TypeScript with no DOM, no Node and no transport library, and is handed
  a `Transport`. Trystero and BroadcastChannel transports live in
  `apps/web`. The memory transport for tests lives in `game-session`.
- Versions reject and never adapt ([ADR-0016](0016-no-backwards-compatibility.md)).
  The Trystero `appId` carries `PROTOCOL_VERSION`, so mismatched builds
  never meet. A `PeerHello` with another version is refused with
  `PeerRefuse` anyway.

## Consequences

- **The host can cheat.** The brief (§12, §32) asks for a server that never
  trusts a client. The host's browser now is that server. That is fine for
  a game among friends or on a LAN, and wrong for strangers. Matchmaking
  between strangers is out of scope for that reason.
- **Some networks cannot connect.** The joiner sees "Couldn't connect to
  the host — your network may block peer-to-peer connections." It does not
  hang. TURN can be added later as one `rtcConfig` field.
- **When the host leaves, the match ends** for everyone, with
  `WireEnded { endReason: "host-left" }`. There is no host migration.
- **Public relays are a dependency.** If every configured relay is down,
  nobody can start a match. CI never uses them: e2e runs two pages over
  BroadcastChannel.
- **There is no server to deploy, patch or pay for.** `apps/server`,
  the Colyseus dependencies and `containers.prod` go in the last phase.
- Until then, both paths exist. The P2P path is unused until phase 4 wires
  it into `apps/web`.

## Alternatives Considered

- **Deterministic lockstep.** ADR-0003's determinism would allow it. But
  every peer would move at the pace of the slowest, one desync could not
  be recovered, and every client would need every input. The star reuses
  the snapshot-to-render path that already exists.
- **A mesh with no authority.** Nothing would resolve a conflict.
- **Keep the Colyseus server next to P2P.** That is two transports, two
  test suites and two code paths for one feature, which ADR-0016 bans in
  spirit. The server is deleted at the end.
- **Host a TURN relay.** That is a backend, which is what the operator
  asked us not to have.
