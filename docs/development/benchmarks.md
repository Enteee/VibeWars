# Load benchmarks

Sprint 26 asks for measurements at 1v1, 4v4, 8v8 and 16v16, and says
explicitly: do not optimise prematurely, use profiling data. This page is
the data. Nothing was tuned in response to it — there was no need.

## How to run it

```sh
pnpm exec vitest run apps/server/src/benchmark.test.ts

# include 16v16, and get a meaningful heap number
VIBEWARS_BENCH_FULL=1 NODE_OPTIONS=--expose-gc \
  pnpm exec vitest run apps/server/src/benchmark.test.ts
```

It runs as a test rather than a standalone script so it cannot quietly
rot: a change that doubles tick cost fails CI the day it lands. CI runs up
to 8v8; 16v16 is opt-in, because 32 real WebSocket clients in one process
is slow and on a loaded CI box measures the box more than the server.

## What is measured, and how

Against a **real** server on a **real** port, with **real** `@colyseus/sdk`
clients decoding **real** schema state. Not a `tick()` loop: most of the
cost at 16v16 is state encoding and per-client delta emission, which a
direct tick loop skips entirely, and benchmarking the cheap half of the
system would be worse than not benchmarking it.

Half the clients move continuously (a new direction 10×/second) and
constantly attempt to cast. Most cast attempts are rejected for range or
recharge — which is what a real match looks like, and still exercises the
whole activation gate each time. The other half stand still and
auto-attack the enemy beside them in seat order, so they approach round
walls along the path finder every tick (#267). A load that never attacks
cannot see the attack path get slower.

| Metric       | How                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Tick time    | `performance.now()` around the fixed-timestep callback, p50/p95/max over the last minute of ticks |
| Memory       | `heapUsed` after an explicit gc, when run with `--expose-gc`                                      |
| Network      | Bytes actually arriving on client sockets, via a wrapped `WebSocket`, per client per second       |
| Sync latency | A `target` intent sent, to that exact value appearing in decoded client state                     |

Latency uses `target` rather than `move` deliberately: a target change is
a discrete value the client can match exactly against what it sent, so
every sample is attributable to one intent. A position sample would
require guessing which tick a continuous value came from.

Percentiles, not means. A mean hides the one tick in fifty that blew the
budget, and that tick is exactly the one a player feels as a stutter.

## Results

Measured 2026-10-25 in an agent jail on the development machine (Linux
6.18, Node 24), with the load above: half the clients attacking. Tick
budget is **50 ms** — what a tick is allowed to take at 20 Hz. The jail is
noisy: three runs of 16v16 gave a tick p95 of 4.68–4.85 ms, against
3.89–4.83 ms for a load where every client moves.

| Scenario | Players | Tick p50 | Tick p95 | Tick max | Heap   | Net/client | Sync p50 | Sync p95 |
| -------- | ------- | -------- | -------- | -------- | ------ | ---------- | -------- | -------- |
| 1v1      | 2       | 0.37 ms  | 1.64 ms  | 6.31 ms  | 34 MiB | 0.6 KiB/s  | 50.4 ms  | 52.8 ms  |
| 4v4      | 8       | 0.91 ms  | 3.36 ms  | 7.66 ms  | 37 MiB | 3.8 KiB/s  | 50.0 ms  | 52.4 ms  |
| 8v8      | 16      | 0.83 ms  | 3.48 ms  | 4.18 ms  | 39 MiB | 6.4 KiB/s  | 50.1 ms  | 54.2 ms  |
| 16v16    | 32      | 1.61 ms  | 4.68 ms  | 8.74 ms  | 44 MiB | 14.7 KiB/s | 50.0 ms  | 54.4 ms  |

## Reading these numbers

**Tick time is not the constraint.** At 16v16 the p95 tick uses 9% of its
budget and the worst observed tick uses 17%. Tick cost grows roughly
linearly with player count (0.37 → 1.61 ms p50 across a 16× increase in
players), with no sign of the quadratic blow-up that pairwise collision
and line-of-sight work could have produced at this scale.

**Bandwidth is irrelevant on a LAN.** 15 KiB/s per client at 16v16 means
a full 32-player match is around 470 KiB/s server-side — nothing for
even old wired Ethernet, which is the only network this game targets.

**Sync latency is the patch rate, not the simulation.** The ~50 ms floor
across every scenario is Colyseus's default 50 ms state-patch interval:
an intent is applied on the next 20 Hz tick, but the client does not
_see_ it until the next patch. That it barely moves from 1v1 to 16v16
(50.4 → 50.0 ms p50) confirms the server is not the bottleneck.

Halving the patch interval would roughly halve this number and roughly
double bandwidth — which, given the figures above, would cost nothing
that matters on a LAN. That is a real option and it is written down here
rather than taken, because the brief asks for an ADR before a gameplay-
feel change, and responsiveness is gameplay feel.

## What is not measured

**Client FPS.** It needs a real browser compositing real frames, which
this headless harness cannot observe. Reporting a number for it would be
a guess, and the brief is explicit that a plausible-looking fabricated
measurement is worse than an absent one (§45). Measuring it properly
means a Playwright run sampling `requestAnimationFrame`.

**A real network.** Every client here shares a process and a loopback
interface with the server, so these numbers contain no NIC, no switch and
no Wi-Fi. For tick time that makes them slightly _pessimistic_ — 32
clients competing with the server for the same CPU. For latency it makes
them optimistic: add the real round-trip time of the LAN.
