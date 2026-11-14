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
lobby seats at most 24 (`MAX_LOBBY_PLAYERS`, three parties of eight), so
there is no 16v16.

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

## The tick bench

`pnpm run bench:ticks` times `MatchSimulation.step` alone, with no host,
peers or transport, on a 4000 × 4000 field of 63 pillars (#542). It
prints p50, p95 and max for every tick after the first 50, which hold
the JIT warm-up. `BENCH_CROWD` picks who is on the field:

| Crowd       | Who                                                                                                                                                            | What it stresses              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `fighters`  | 16 bodies, each ordered to attack its mirror across the field                                                                                                  | pathing round pillars, swings |
| `followers` | 16 still bodies, and 32 minions walking back to them from across the field (#1157)                                                                             | creature pathing              |
| `casters`   | 16 bodies in two facing lines between two pillar columns, each a starter build that uses its next ready slot whenever it is not casting, the whole run (#1588) | the skill path                |

The casters never run out of energy (1,000,000) or health, and whatever
the simulation refuses (recharging, no adrenaline, no target) passes
the turn to the next slot, so the mix of hexes, enchantments, AoE,
conditions and summons on the starter bars all gets used. The
`MAX_CREATURES` cap holds, as in a match. The run also prints how many
skills began.

### Measuring a skill PR

`BENCH_SKILLS` fills every caster's bar with the skills given,
round-robin and offset by body, so the sixteen bars differ. An unknown
id stops the run and names the id:

```sh
BENCH_TICKS=600 BENCH_CROWD=casters BENCH_SKILLS=assassin.death-blossom,elementalist.fireball \
  pnpm exec vitest run --silent=false packages/game-core/src/tools/tick-bench.test.ts
```

Run it on the PR's branch and on `main`, on the same machine, and
compare the two. A number on its own means nothing: the starter builds
change, and with them the `casters` baseline, and machines differ.

## The bot bench

`pnpm run bench:bots` (#2545) fights all-bot 4v4s and 8v8s on an open
field, bots on `play-build` and the built-in builds, 90 s a fight, on two
sets of 20 seeds, and prints how many players died. It measures whether
bots commit to kills: a bot change that makes fights stall shows as fewer
deaths. It is not in CI; every PR that changes how bots fight runs it on
its branch and on `main` and puts both counts in the PR. Deaths at or
above `main`'s are the bar. The counts are deterministic, so a
difference is a real one, but a seed set is small: read a few deaths
either way as noise.

## The map balance bench

`BENCH_MAP=<id> BENCH_SIZE=<n> pnpm run bench:balance` (#3065) plays
all-bot matches on one real map: its walls, gates, switches, layers,
zones and objectives, and its mode's own rules and time limit. Both
teams field the same built-in builds, so the only difference between
them is their spawn side. Each seed is played twice, the second time
with the builds rotated by one, so no build keeps one spawn.
`BENCH_MAP=all` (the default) runs every map, and without `BENCH_SIZE`
every size a map seats is its own row. `BENCH_SEEDS` sets the seeds,
100 by default; a 4v4 row of 100 seeds takes about twenty minutes. It is
not in CI: it is a design tool, and every map PR pastes its table.

A row gives the matches run, the wins of each team (by spawn side), the
draws, the mean match length in simulated seconds, and a verdict. A
match the mode does not decide by its time limit is a draw; a mode
without a wipe is won by whoever its own outcome names. The verdict is
PASS when every team's share of the decided matches is within 10 points
of fair (40-60 % with two teams, 23-43 % with three; ±10 points is about
the 95 % interval at 100 matches) and draws are at most a quarter of the
matches. Otherwise it is FAIL, naming the favoured team, or the share of
draws, or "no contact" when no match was decided at all.

PASS is necessary, not sufficient. Bots do not yet value high ground or
cover (#2542), so a map whose heights favour one side can still pass.
The operator's playtest is the final word on every map.

### The host tick on a whole map

`BENCH_TICKS=600 BENCH_HOST=arena-canyon,arena-crossroads pnpm run
bench:ticks` (#3240) times the host's step of a 4v4 of bots on each map
named: every layer, structure and objective, as a match plays it. It
prints p50, p95 and max per map. Report-only; CI runs only a short smoke
of it.

## The render bench

`pnpm run bench:render` (#3157, #3240) builds the client and times its
frames in headless Chromium at 1280 × 720, as ratios to a frozen
reference map drawn the same way in the same browser. CI runs it on pull
requests that touch the renderer or the maps, and fails a map whose p50
is over `BENCH_MAX_RATIO` times the reference's. It measures two cases:

- **The menu background** on every layered map: the bots' fight, the
  camera still, at the menu's 30 fps cap.
- **Follow** (`--follow` runs only this one) on every layered map and
  one flat map, `jungle-ruins`, the baseline. A Hosted 1v1 there, its
  body walking a fixed loop by left clicks: over the transition nearest
  its spawn, to the map's centre, and back. The camera follows, the
  pointer sweeps the ground every 50 ms so hover runs, and nothing caps
  the frame rate. Its own table gives each map's frame p50 and p95,
  its update and render p50 (the frame's JS: the game's step, the match view and
  `ArenaScene.update`, then Phaser's render of the scene), the update's
  share of the frame time, the time between two frames that drew a
  new snapshot (its p50, p95 and standard deviation, the jitter), and
  each map's p50 over the baseline's. The `BENCH_MAX_RATIO` gate does not judge these
  rows: walking costs a frame about twice what standing does.
  `BENCH_MAX_FOLLOW_RATIO` fails a map walked that is over that many
  times the baseline walked.

The follow case measures the page through `?frametiming`
(`render/frame-timing.ts`), which any client takes: open a match with
it and `window.__frameTiming` holds those times.

In software GL the update and render JS are a small share of a frame:
most of it is the GPU process filling pixels, which no JS timer sees.

## What is not measured

**Client FPS on a real GPU.** The render bench draws in headless
Chromium's software GL, where filling pixels costs far more than on a
graphics card: there it measures regressions against its calibration,
not what a player's machine shows.

**A real network, and sync latency.** Every peer shares a process with
the host, and the in-memory transport delivers a microtask later, so a
target sent shows up the next tick, every time. The old server bench
timed that round trip over a socket; here it would measure nothing. On a
real network, add the WebRTC round trip between the two browsers.

**Memory.** The host's heap is a browser tab's, which a Node process does
not stand for.

## Render bench (`pnpm bench:render`)

A layered map's frame cost in software GL, as a ratio to a frozen
reference map drawn the same way on the same run. CI gates it at
`BENCH_MAX_RATIO=3.5` on pull requests that touch the renderer or the
maps (#3157, #3190, #3243, #3255).

**The reference map.** `packages/game-maps/bench/reference-map.json` is a
synthetic medium arena in the real map schema: three layers, walls, two decks
and a ramp, a pit with a tunnel, lights and a zone. Only the bench's build
(`VIBEWARS_BENCH_REFERENCE=1`) offers it in the lobby, and it is
drawn through the menu background like any map, so whatever bounds a
runner (fill, geometry, JS) bounds the reference and the maps alike. It
is frozen: a pull request that edits it re-derives the gate below in the
same pull request.

**The gate** is the highest ratio of a healthy map (canyon, crossroads)
over five CI runs, × 1.5, rounded to 0.1. Five runs on one head (#3255),
with the reference between 38 and 82 ms on different runners:

| map              | ratios                       | median |
| ---------------- | ---------------------------- | ------ |
| arena-canyon     | 1.50, 1.75, 1.67, 1.53, 1.69 | 1.67   |
| arena-crossroads | 2.25, 2.25, 2.33, 2.29, 2.36 | 2.29   |
| arena-long-hall  | 2.99, 3.11, 3.12, 3.30, 3.45 | 3.12   |

So 2.36 × 1.5 → 3.5. Each map stays within about ±10 % of its median
while the reference swings 2×. The two edge cells are canyon at −10.2 %
and long-hall at +10.6 %. With the old blank-page calibration it was
±15 %.

The runner is slow for its first 20-40 s, so the run warms up first: it
loads the first map, then calibrates for at least 45 s and until two
windows in a row agree within 5 % (cap 75 s, else it fails). None of
that is measured. Each map is then judged against the mean of the two
calibration windows around it, and fails as too noisy if those two
differ by over 20 %.

**Ceilings.** `scripts/bench/ceilings.mjs` lists maps that are over or
near the gate for a known reason, each gated at its own ratio and tied to the perf
issue that will cut it. None is listed: long-hall's was deleted when its
issue, #3254, boxed each cluster of flickering lights on its own, which
took it from 3.24 to 2.71. A listed map that measures at or under the gate ÷ 1.25
(2.80 at 3.5) fails as stale, so its entry is deleted when its issue
lands. The margin keeps a map just under the gate from flaking: long-hall
measured 2.99-3.45 before #3254.
