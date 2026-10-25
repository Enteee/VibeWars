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
auto-attack the enemy next to them in seat order, so they approach round
the walls along a path every tick. Moving cancels an attack, so a bench in
which everyone moves never reaches path finding; that is how the cost of
path finding (#211) went unmeasured until #267.

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
6.18, Node 24), with the attacking half of the load (#267). Tick budget is
**50 ms** — what a tick is allowed to take at 20 Hz. The jail is noisy:
across seven runs on the same commit the 16v16 tick p95 ranged from 2.0 to
6.5 ms, so compare runs on one machine, three per ref, never one number
against this table.

| Scenario | Players | Tick p50 | Tick p95 | Tick max | Heap   | Net/client | Sync p50 | Sync p95 |
| -------- | ------- | -------- | -------- | -------- | ------ | ---------- | -------- | -------- |
| 1v1      | 2       | 0.32 ms  | 1.31 ms  | 6.27 ms  | 34 MiB | 0.6 KiB/s  | 50.2 ms  | 52.0 ms  |
| 4v4      | 8       | 0.35 ms  | 0.80 ms  | 2.75 ms  | 37 MiB | 3.9 KiB/s  | 49.9 ms  | 51.8 ms  |
| 8v8      | 16      | 0.49 ms  | 1.23 ms  | 2.63 ms  | 39 MiB | 6.5 KiB/s  | 50.0 ms  | 51.9 ms  |
| 16v16    | 32      | 0.93 ms  | 2.03 ms  | 3.47 ms  | 44 MiB | 14.8 KiB/s | 50.1 ms  | 51.3 ms  |

## Reading these numbers

**Tick time is not the constraint.** At 16v16 even the slowest run's p95
tick (6.5 ms) uses 13% of its budget. Tick cost grows roughly linearly
with player count (0.32 → 0.93 ms p50 across a 16× increase in players),
with no sign of the quadratic blow-up that pairwise collision, line of
sight and path finding could have produced at this scale. The simulation
step alone is a small part of it: stepped without a server, 16 attackers
and 16 movers on Arena Alpha take about 0.05 ms p50 and 0.2 ms p95 a
tick, so most of a tick is state encoding and patching.

**Bandwidth is irrelevant on a LAN.** 15 KiB/s per client at 16v16 means
a full 32-player match is around 480 KiB/s server-side — nothing for
even old wired Ethernet, which is the only network this game targets.

**Sync latency is the patch rate, not the simulation.** The ~50 ms floor
across every scenario is Colyseus's default 50 ms state-patch interval:
an intent is applied on the next 20 Hz tick, but the client does not
_see_ it until the next patch. That it barely moves from 1v1 to 16v16
(50.2 → 50.1 ms p50) confirms the server is not the bottleneck.

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
