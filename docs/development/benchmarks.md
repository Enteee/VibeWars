# Load benchmarks

Sprint 26 asks for measurements at realistic team sizes, and says
explicitly: do not optimise prematurely, use profiling data. This page is
the data. Nothing was tuned in response to it.

Since #404 there is no server. A match runs in its host's browser, in
`MatchHost` (game-session), so that is what is measured.

## How to run it

```sh
pnpm exec vitest run packages/game-session/src/benchmark.test.ts
```

It runs as a test rather than a standalone script so it cannot quietly
rot: a change that doubles a host's tick cost fails CI the day it lands.
It takes under a second: match time is stepped as fast as the host can
run it, not waited out.

## What is measured, and how

A real `MatchHost` with every peer a real `connectMatch` client, over the
in-memory `Transport`, in one Node process. Seats are planned as a lobby
plans them. Sizes are 1v1, 4v4 and 8v8, six seconds of match each; a
lobby seats at most 16 (`MAX_LOBBY_PLAYERS`), so there is no 16v16.

Half the peers move continuously (a new direction 10×/second) and
constantly attempt to cast. Most cast attempts are rejected for range or
recharge, which is what a real match looks like and still exercises the
whole activation gate each time. The other half stand still and
auto-attack the foe beside them in seat order, so they approach round
walls along the path finder every tick (#267). A load that never attacks
cannot see the attack path get slower.

| Metric    | How                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tick time | `performance.now()` around one tick's `advance`: the simulation, each peer's snapshot, and every message handed to the transport, encoded as JSON. p50/p95/max |
| Network   | The JSON bytes the host sends each peer, per second of match time, as Trystero would put them on the wire                                                      |

What a peer does with its messages, decoding and drawing, is outside the
tick: that is each joiner's own browser.

The test asserts what it always has: each scenario's p95 tick is under
the tick's own 50 ms (20 Hz), more than 20 ticks ran, and every peer was
sent something. Percentiles, not means: a mean hides the one tick in
fifty that blew the budget, and that tick is the one a player feels as a
stutter.

## Results

Measured 2026-10-26 in an agent jail on the development machine (Linux
6.18, Node 24), three runs, the spread shown for p95. Tick budget is
**50 ms**.

| Scenario | Players | Tick p50 | Tick p95     | Tick max | Net/peer  |
| -------- | ------- | -------- | ------------ | -------- | --------- |
| 1v1      | 2       | 0.13 ms  | 0.36–0.43 ms | 4.21 ms  | 22 KiB/s  |
| 4v4      | 8       | 0.57 ms  | 0.87–1.12 ms | 1.53 ms  | 85 KiB/s  |
| 8v8      | 16      | 1.35 ms  | 1.70–2.79 ms | 3.40 ms  | 168 KiB/s |

## Reading these numbers

**Tick time is not the constraint.** At 8v8 the p95 tick uses about 5% of
its budget. A host is a player's browser, likely slower than this machine
and busy drawing the match too, so the margin matters, and it is wide.

**Upload is the constraint.** The host sends every peer its own snapshot
every tick: 168 KiB/s a peer at 8v8, so about 2.6 MiB/s, some 22 Mbit/s,
of upload for a full match. That is fine on a LAN and on most home fibre,
and too much for many home connections and phones. It limits who can host
a big match, as SECURITY.md says.

## What is not measured

**Client FPS.** It needs a real browser compositing real frames, which
this headless harness cannot observe. Reporting a number for it would be
a guess, and the brief is explicit that a plausible-looking fabricated
measurement is worse than an absent one (§45). Measuring it properly
means a Playwright run sampling `requestAnimationFrame`.

**A real network, and sync latency.** Every peer shares a process with
the host, and the in-memory transport delivers a microtask later, so a
target sent shows up the next tick, every time. The old server bench
timed that round trip over a socket; here it would measure nothing. On a
real network, add the WebRTC round trip between the two browsers.

**Memory.** The host's heap is a browser tab's, which a Node process does
not stand for.
