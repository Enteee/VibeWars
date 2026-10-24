# Security

VibeWars is a browser PvP game with one **authoritative server**
(`apps/server`, Colyseus over a single HTTP/WebSocket port) that serves the
web client and runs every match. This file says what we defend against,
what we deliberately do not, how to report a problem, and which weaknesses
are known and still open.

It is kept by the `perf-sec-qa` role. A change that moves a trust boundary
— a new client message, a new HTTP route, a new thing written to disk,
anything peer-to-peer — updates this file in the same pull request.

## Reporting a vulnerability

Do **not** open a public issue for something exploitable. Use GitHub's
private reporting instead: _Security → Report a vulnerability_ on
<https://github.com/Enteee/VibeWars>. Include:

- the commit you tested against;
- the exact messages or requests that trigger it (a script is ideal);
- what happened, and what should have happened.

There is no released version yet, so there are no supported versions to
backport to: fixes land on `main` only. We aim to acknowledge a report
within a week. There is no bounty.

## Who and what we defend

The deployment we design for is a host running the container on a LAN, or
on an internet-facing machine for friends, with **no accounts**. Anyone who
can reach the port can play. Players' own data (characters, builds) lives
in their browser's IndexedDB and never reaches the server except as a join
option.

The attacker we design against is a **hostile client**: someone who skips
our web client and speaks the Colyseus protocol directly, sending whatever
bytes they like, as often as they like, from as many connections as they
like.

## What we defend against

| Threat                                              | Defence                                                                                                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A client claims an outcome (damage, position, HP)   | Clients send **intent only** (`ClientIntent`: move / stop / target / use-skill). Every outcome is computed server-side in `game-core`.                                            |
| A malformed or malicious message crashes the server | Every inbound payload is `unknown` until `parseClientIntent` or `field()` has checked it; non-finite numbers are rejected. `fuzz.test.ts` enforces "never crash on client input". |
| Casting a skill the player does not have            | The client sends a **slot index**, never a skill id; the server reads its own copy of the bar.                                                                                    |
| An illegal build (over budget, wrong profession)    | `validatePlayerBuild` runs at join; anything illegal gets the house loadout.                                                                                                      |
| Moving faster than allowed                          | Direction is clamped to unit length; speed comes from the ruleset; walls and bodies are resolved on the server.                                                                   |
| Targeting a player who does not exist               | `applyTarget` accepts only a session id present in the room. Range and line of sight are checked at cast time.                                                                    |
| Display names used to attack other players' UIs     | `sanitizeName` strips control characters and clamps to 16 characters. The web client must render names as text, never as HTML.                                                    |
| Host-only lobby actions by a non-host               | `select-map` and `start-match` check `isHost` (but see the open `return-to-lobby` gap below).                                                                                     |
| A stale or foreign client desynchronising a match   | `PROTOCOL_VERSION` is checked on every join; a mismatch is refused.                                                                                                               |
| Oversized frames                                    | The WebSocket transport caps a frame at 4 KiB (Colyseus `ws-transport` default) and has per-message deflate off. Do not raise either without a reason written here.               |
| Cross-origin use of the HTTP API                    | Production is same-origin. CORS is sent only in dev mode, and only for one exact origin, never `*`.                                                                               |
| Enumerating live matches                            | `/healthz` carries no game state. `/api/maps` lists static map ids only.                                                                                                          |
| Path traversal through the static file server       | `express.static` on one fixed root; the SPA fallback always sends that root's `index.html`, never a path built from the request.                                                  |
| Secrets in source                                   | There are none to leak: the game server has no credentials. `gitleaks` runs over history on review.                                                                               |
| Non-reproducible simulation abuse                   | Simulation randomness is seeded (`SimulationRng`), so any reported exploit can be replayed from its seed.                                                                         |

## What we explicitly do not defend against

- **Identity.** There are no accounts, passwords or tokens. A player is a
  WebSocket session. Anyone can pick any name, and two players can share
  one. Do not build anything that relies on a name meaning a person.
- **Network-level attackers.** The server speaks plain HTTP/WS. Anyone on
  the path can read and alter traffic. If you expose a server to the
  internet, put it behind a TLS-terminating reverse proxy. `HOST` defaults
  to `0.0.0.0` on purpose (LAN party); override it on an untrusted network.
- **Volumetric DoS.** One process, no clustering, no IP-level throttling.
  Filtering floods is the job of whatever sits in front of the container.
  _Cheap application-level_ abuse (one client making the tick slow) is in
  scope and must be defended in the server. See the open gaps below.
- **Cheating that needs only what the client is shown.** Every client gets
  the full match state, including enemy positions, health and casts. An
  aimbot-style helper that reads that state is not prevented. There is no
  fog of war, so there is nothing hidden to leak. If hidden information is
  ever added, it must be filtered on the server per client
  (`@view`/`StateView`), never hidden in the renderer.
- **A hostile server operator.** Whoever runs the server sees and controls
  everything. Players trust the host they connect to.
- **Players' browser storage.** IndexedDB is the player's own data on the
  player's own machine. A record in the wrong shape is discarded (ADR-0016).
  We do not try to protect it from the player.

## Known open gaps

These were found by reviewing `main` at `47a403f` (2026-10-24). Each one is
in scope by the rules above and needs a fix. When one is fixed, remove it
from this list in the same PR.

1. **A lobby's match is not tied to that lobby** (#41). The web client joins a
   match with `joinOrCreate("match")` and no filter. `match-starting`
   carries an empty `roomId`, because `matchRoomId` is never set. Every
   lobby, and every Quick Match player, therefore lands in the same match
   room. A stranger can join a private lobby's match just by clicking Quick
   Match. The match also gives out teams by join order, so the lobby's team
   choices are ignored.
   _Reproduce:_ start a lobby match in one browser, then press Quick Match
   in another. Both players are in the same room.
2. **There is no cap on players per match** (#42). `LobbyRoom` sets
   `maxClients = 16` but `MatchRoom` sets none. Body-blocking collision is
   O(n²) per tick. Measured with `tools/benchmark.ts` (server and clients in
   one process, 5 s per scenario):

   | players | tick p50 | tick p95 | tick max | heap    | sync p95 |
   | ------- | -------- | -------- | -------- | ------- | -------- |
   | 32      | 0.64 ms  | 2.34 ms  | 4.49 ms  | 51 MiB  | 53 ms    |
   | 100     | 3.31 ms  | 21.1 ms  | 34.7 ms  | 106 MiB | 140 ms   |
   | 200     | 7.40 ms  | 51.8 ms  | 89.5 ms  | 253 MiB | 845 ms   |
   | 400     | 18.8 ms  | 67.3 ms  | 320 ms   | 913 MiB | 1808 ms  |

   The tick budget is 50 ms. One script that opens a few hundred sockets
   into the shared match room (see gap 1) makes the game unplayable for
   everyone in it.

3. **No per-client message rate limit** (#43). Colyseus's `maxMessagesPerSecond`
   defaults to `Infinity`, and neither room sets it. Every `intent` runs its
   handler right away, outside the tick.
4. **Any lobby member can send `return-to-lobby`** (#44). It has no
   `isHost` check. Its only phase guard is a no-op while already `waiting`,
   so a non-host can reset a lobby that is in a match back to `waiting` and
   clear everyone's ready state.
5. **Lobby codes can be enumerated.** There are 23⁴ = 279,841 codes, and
   joining is not rate-limited. That is fine for a LAN party. It is not
   access control, and it must not be described as access control.

## Dependencies

`osv-scanner` and `trivy` run over `pnpm-lock.yaml` on review. Currently
reported (2026-10-24):

| Package          | Advisory                             | Reached via                                       | Status                                                                          |
| ---------------- | ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `uuid` 8.3.2     | GHSA-w5hq-g745-h8pq / CVE-2026-41907 | `colyseus` → `@colyseus/auth` → `grant` → request | Not reachable: we never mount `@colyseus/auth`. Remove it once Colyseus allows. |
| `elliptic` 6.6.1 | GHSA-848j-6mx2-7j84 / CVE-2025-14505 | `colyseus` → `@colyseus/auth` → `jwk-to-pem`      | Not reachable, same reason. No fixed version exists upstream.                   |

"Not reachable" is a claim about our code today. If anyone ever wires up
`@colyseus/auth`, both of these become live and must be fixed first.

## If the architecture changes

A peer-to-peer mode (for example WebRTC via Trystero, with no hosted
backend) has been proposed. That **removes the authoritative server**, and
with it most of the defences listed above. In a peer-to-peer match some
peer computes the outcomes, so that peer can cheat. Such a mode needs its
own threat model here before it merges. It must not inherit this one.
