# Load benchmarks

Sprint 26 asks for measurements at realistic team sizes, and says
explicitly: do not optimise prematurely, use profiling data. This page is
the data. Nothing was tuned in response to it.

Since #404 there is no server. A match runs in its host's browser, in
`MatchHost` (game-session), so that is what is measured.

## How to run it

On the company host, run a heavy job (a bench, Playwright) wrapped in
`company heavy <cmd>` (#3362): the host runs one at a time and queues the
rest. A job under 5 minutes (a screenshot, one spec) goes
`company heavy --short <cmd>`: it is granted ahead of waiting long jobs (at most
3 in a row, so long ones are not starved) and is killed at 10 minutes (#3582).

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
  company heavy pnpm exec vitest run --silent=false packages/game-core/src/tools/tick-bench.test.ts
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

## The ranking bench

`pnpm run bench:ranking` (#3571) rates 10 000 2v2 receipts among 400
keys over 100 days with `rate` (ADR-0055) and prints how long it took.
Signatures are checked by a stand-in hash, not BIP-340, so it measures
the rating, not the curve. Without `BENCH_RANKING` the test file runs
and the bench is skipped. On a dev machine it takes about 6 s; the hourly
leaderboard job can afford far more.

## The map balance bench

`BENCH_MAP=<id> BENCH_SIZE=<n> company heavy pnpm run bench:balance` (#3065) plays
all-bot matches on one real map: its walls, gates, switches, layers,
zones and objectives, and its mode's own rules and time limit. Both
teams field the same built-in builds, so the only difference between
them is their spawn side. Each seed is played twice, the second time
with the builds rotated by one, so no build keeps one spawn.
`BENCH_MAP=all` (the default) runs every map, and without `BENCH_SIZE`
every size a map seats is its own row. `BENCH_SEEDS` sets how many
seeds, 100 by default; a 4v4 row of 100 seeds takes about twenty
minutes. Fewer than 100 are spread evenly over seeds 0 to 99 (20 seeds
are 0, 5, …, 95), so a short run samples what a full one plays; the
table's `matches` header names the count and the stride (#3694).

Pull requests that touch a map, the bot rules or the bench run it on
GitHub-hosted runners (`balance-bench.yml`, #3356): 20 seeds, at most 12
rows, each touched map at every size it seats, or `arena-canyon` and
`arena-crossroads` 2v2 for a rule change. Read the table in the run's job
summary, or copy it from `hub run view <id> --log` between
`--- balance table ---` and `--- end ---`. It is information, never a
gate. Run it locally only after asking on Telegram: it loads the host.

A row gives the matches run, the wins of each team (by spawn side), the
draws, the mean match length in simulated seconds, the share of
bot time spent stuck, the share of that when the nearest foe was on
another layer, and a verdict (#3354). A bot is stuck when, over 5 seconds,
it stayed within 64 units, took part in no damage or heal and started no
skill while a foe lived: _stuck %_ is those seconds over all living-bot
seconds, _apart %_ the share of them with the nearest foe on another
layer. A bot holding an objective, on a capture point its team does
not fully own or on the altar its team holds, is never stuck (#3689);
Relic Run escorts waiting at the altar still count. Creatures are not
counted. `BENCH_STUCK=1` also prints, per row,
the cells (64 units, with their layer) where bots were stuck longest. A
match the mode does not decide by its time limit is a draw; a mode
without a wipe is won by whoever its own outcome names. The verdict is
PASS when every team's share of the decided matches is within 10 points
of fair (40-60 % with two teams, 23-43 % with three; ±10 points is about
the 95 % interval at 100 matches) and draws are at most a quarter of the
matches. Otherwise it is FAIL, naming the favoured team, or the share of
draws, or "no contact" when no match was decided at all.

PASS is necessary, not sufficient. Bots take high ground only with a bow
or a spear (#3141), and duck behind walls, decks and tunnels only once
focused (#3369); they never hold a choke or a height for its own sake.
So a map whose heights favour one side can still pass.
The operator's playtest is the final word on every map.

### The host tick on a whole map

`BENCH_TICKS=600 BENCH_HOST=arena-canyon,arena-crossroads pnpm run
bench:ticks` (#3240) times the host's step of a 4v4 of bots on each map
named: every layer, structure and objective, as a match plays it;
`BENCH_SIZE=8` makes it an 8v8 (#3599). It prints p50, p95 and max per
map. Report-only; CI runs only a short smoke
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
  one flat map, the baseline: `bench-flat`, the frozen
  `packages/game-maps/bench/flat-map.json` (#3444), as no player map stays
  flat. A Hosted match there at the smallest size it seats, its
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
  times the baseline walked. CI gates it at 10 (#3488): a cost every layered
  map shares cancels out of the `BENCH_MAX_RATIO` ratio, but not out of this
  one. 10 is the highest value in a green pull-request run against the
  `hollow-deep` baseline (7.87, sandstone-steps, #3436) times 1.15, rounded
  up. The baseline moved to `bench-flat` with #3444: an edit to
  `flat-map.json` re-derives the gate in the same pull request, as an edit
  to the reference map does. Against `bench-flat`, in CI's green run on
  #3444, the highest was 8.60 (sandstone-steps), so 8.60 x 1.15 rounds up
  to 10 again. A breach is a perf card, not a raise.

The follow case measures the page through `?frametiming`
(`render/frame-timing.ts`), which any client takes: open a match with
it and `window.__frameTiming` holds those times.

In software GL the update and render JS are a small share of a frame:
most of it is the GPU process filling pixels, which no JS timer sees.

The bench build also times the per-frame passes that grow with 2.5D
geometry (#3368, `render/pass-timing.ts`): `cutAwayTunnels`,
`drawHiddenOutlines`, `fadeOverhangs` and the lighting update. Each
case prints their mean ms a frame and their sum as a share of the frame
p50. Only the bench's build measures; a player build folds the timing to
nothing.

## The hosted perf bench

`.github/workflows/perf-bench.yml` (#3368) runs the render bench and the
host tick (a 4v4 of bots, 400 ticks, `BENCH_HOST`) on GitHub-hosted
runners, so nobody loads the company host for it. Dispatch it with a list
of map ids, or `layered` (the default) for every map of more than one
layer. A pull request touching the renderer, the layer rules, pathing or
a map runs it on the touched maps plus `arena-canyon` and
`sandstone-steps`. It is information, never a gate: the 2.7 ceiling stays
enforced by `ci.yml`. Read the table in the run's job summary, or in the
log between `--- perf table ---` and `--- end ---`. Raw ms on a hosted
runner are for orientation; the ratios are against the calibration map
run on the same runner.

### 2.5D maps

Every layered map, one dispatch run of the workflow on 2026-11-15
([run 43712803219](https://github.com/Enteee/VibeWars/actions/runs/43712803219),
hosted runner, so raw ms are for orientation). The ratio ceiling stays 2.7.
The three passes the card named cost about 1 % of a frame between them; the
frames are dominated by software-GL pixel filling, not by these passes.

| map              | frames | p50 ms | p95 ms | base ms | p50 / calibration |
| ---------------- | ------ | ------ | ------ | ------- | ----------------- |
| arena-canyon     | 99     | 103.4  | 121.7  | 69.8    | 1.48              |
| arena-crossroads | 99     | 103.7  | 121.6  | 69.7    | 1.49              |
| arena-long-hall  | 69     | 156.4  | 161.3  | 69.3    | 2.26              |
| ember-pits       | 93     | 121.0  | 123.6  | 69.6    | 1.74              |
| frozen-crossing  | 96     | 104.2  | 122.1  | 69.6    | 1.50              |
| sandstone-steps  | 97     | 104.9  | 123.1  | 69.5    | 1.51              |

| passes (still)   | cutAwayTunnels ms/frame | drawHiddenOutlines ms/frame | fadeOverhangs ms/frame | lighting ms/frame | passes % of p50 |
| ---------------- | ----------------------- | --------------------------- | ---------------------- | ----------------- | --------------- |
| arena-canyon     | 0.01                    | 0.88                        | 0.02                   | 0.46              | 1 %             |
| arena-crossroads | 0.02                    | 0.43                        | 0.01                   | 0.57              | 1 %             |
| arena-long-hall  | 0.01                    | 0.43                        | 0.00                   | 0.55              | 1 %             |
| ember-pits       | 0.01                    | 0.32                        | 0.00                   | 0.52              | 1 %             |
| frozen-crossing  | 0.00                    | 0.29                        | 0.01                   | 0.42              | 1 %             |
| sandstone-steps  | 0.02                    | 0.12                        | 0.00                   | 0.59              | 1 %             |

| follow                     | frames | p50 ms | p95 ms | update p50 ms | render p50 ms | update share | snapshot p50 ms | snapshot p95 ms | snapshot jitter ms | waypoints | p50 / flat |
| -------------------------- | ------ | ------ | ------ | ------------- | ------------- | ------------ | --------------- | --------------- | ------------------ | --------- | ---------- |
| arena-canyon (follow)      | 119    | 103.7  | 130.5  | 2.6           | 1.9           | 3 %          | 105.3           | 169.6           | 22.1               | 3         | 9.26       |
| arena-crossroads (follow)  | 136    | 92.4   | 121.8  | 2.1           | 1.5           | 2 %          | 93.5            | 186.8           | 25.1               | 3         | 8.25       |
| arena-long-hall (follow)   | 107    | 116.3  | 154.5  | 2.1           | 2.1           | 2 %          | 117.8           | 181.8           | 25.7               | 2         | 10.38      |
| ashen-courtyard (follow)   | 121    | 102.3  | 123.0  | 3.3           | 1.7           | 3 %          | 103.2           | 206.2           | 30.2               | 2         | 9.13       |
| barrow-field (follow)      | 117    | 101.5  | 129.3  | 2.7           | 2.5           | 3 %          | 101.7           | 133.8           | 11.9               | 1         | 9.06       |
| canthan-terraces (follow)  | 114    | 108.3  | 126.0  | 2.3           | 1.6           | 2 %          | 110.5           | 208.0           | 26.2               | 3         | 9.67       |
| elonian-plateau (follow)   | 136    | 89.9   | 124.7  | 2.3           | 2.1           | 3 %          | 88.0            | 128.5           | 12.4               | 0         | 8.03       |
| ember-pits (follow)        | 120    | 102.0  | 130.3  | 3.2           | 1.8           | 3 %          | 101.1           | 201.9           | 23.5               | 3         | 9.11       |
| frozen-crossing (follow)   | 133    | 94.1   | 112.7  | 2.4           | 2.7           | 3 %          | 93.9            | 185.6           | 25.4               | 3         | 8.40       |
| moss-vale (follow)         | 121    | 100.9  | 136.8  | 3.2           | 2.9           | 3 %          | 98.6            | 147.6           | 20.2               | 2         | 9.01       |
| sandstone-steps (follow)   | 109    | 114.1  | 135.7  | 2.2           | 1.4           | 2 %          | 114.6           | 238.7           | 30.3               | 3         | 10.19      |
| shiverpeak-pass (follow)   | 142    | 83.8   | 117.8  | 2.2           | 2.5           | 3 %          | 86.8            | 169.5           | 24.5               | 2         | 7.48       |
| sunken-bastion (follow)    | 126    | 97.9   | 116.2  | 2.1           | 1.6           | 2 %          | 99.0            | 208.9           | 34.1               | 3         | 8.74       |
| tutorial-canyon-1 (follow) | 118    | 102.8  | 120.1  | 2.0           | 0.8           | 2 %          | 104.1           | 210.9           | 25.2               | 0         | 9.18       |
| tutorial-canyon-2 (follow) | 122    | 99.5   | 116.7  | 1.5           | 0.8           | 2 %          | 101.6           | 205.6           | 28.1               | 0         | 8.88       |
| jungle-ruins (follow)      | 1053   | 11.2   | 28.4   | 0.9           | 0.8           | 9 %          | 52.6            | 157.2           | 31.5               | 1         | 1.00       |

| passes (follow)           | cutAwayTunnels ms/frame | drawHiddenOutlines ms/frame | fadeOverhangs ms/frame | lighting ms/frame | passes % of p50 |
| ------------------------- | ----------------------- | --------------------------- | ---------------------- | ----------------- | --------------- |
| arena-canyon (follow)     | 0.01                    | 0.77                        | 0.01                   | 0.38              | 1 %             |
| arena-crossroads (follow) | 0.01                    | 0.26                        | 0.00                   | 0.44              | 1 %             |
| arena-long-hall (follow)  | 0.01                    | 0.18                        | 0.00                   | 0.49              | 0 %             |
| ember-pits (follow)       | 0.01                    | 0.17                        | 0.00                   | 0.45              | 1 %             |
| frozen-crossing (follow)  | 0.00                    | 0.15                        | 0.00                   | 0.36              | 0 %             |
| sandstone-steps (follow)  | 0.02                    | 0.08                        | 0.00                   | 0.58              | 1 %             |
| jungle-ruins (follow)     | 0.00                    | 0.00                        | 0.00                   | 0.01              | 0 %             |

| host tick (4v4, 400 ticks) | p50 ms | p95 ms | max ms |
| -------------------------- | ------ | ------ | ------ |
| arena-canyon               | 1.071  | 2.552  | 5.751  |
| arena-crossroads           | 0.851  | 1.616  | 6.191  |
| arena-long-hall            | 0.896  | 1.808  | 3.964  |
| ember-pits                 | 0.668  | 2.550  | 5.536  |
| frozen-crossing            | 0.542  | 1.152  | 2.106  |
| sandstone-steps            | 0.691  | 1.202  | 2.089  |

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
`BENCH_MAX_RATIO=2.7` on pull requests that touch the renderer or the
maps (#3157, #3190, #3243, #3255), in its own `render bench` job of `ci.yml` (#3382).

**The reference map.** `packages/game-maps/bench/reference-map.json` is a
synthetic medium arena in the real map schema: three layers, walls, three decks
and a ramp, a pit with a tunnel, lights and a zone. Only the bench's build
(`VIBEWARS_BENCH_REFERENCE=1`) offers it, and `bench-flat`, in the Hosted
lobby, never in a draw; the e2e build sets it too, for the tutorial spec's
flat map. It is
drawn through the menu background like any map, so whatever bounds a
runner (fill, geometry, JS) bounds the reference and the maps alike. It
is frozen: a pull request that edits it re-derives the gate below in the
same pull request.

**The gate** was 3.5 against a reference that measured 38 to 82 ms; on a
fast runner the calibration landed on the 30 fps beat (31.7-34.3 ms) and the
cap guard failed the job (#3285). The reference now has 3 decks with their
stairs, 14 walls, 10 lights and 3 zones of different kinds: it grew mostly in
walls, decks and transitions, so the lights and zones stay in the maps' mix.
(Six decks were tried: its calibration windows oscillated 92 / 103 ms on the
slower runners and the warm-up failed once, so there are three.) It measures
68 to 87 ms on the CI runners; every calibration window of five runs on one
head is over 65 ms, well over the guard. Five runs (reference p50 in ms: 68,
69, 87, 68, 70):

| map              | ratios                       | median | before (median) | factor |
| ---------------- | ---------------------------- | ------ | --------------- | ------ |
| arena-canyon     | 1.14, 1.26, 1.20, 1.12, 1.25 | 1.20   | 1.67            | 0.72   |
| arena-crossroads | 1.51, 1.50, 1.59, 1.54, 1.49 | 1.51   | 2.29            | 0.66   |
| arena-long-hall  | 2.05, 2.07, 2.40, 2.05, 2.24 | 2.07   | 3.12            | 0.66   |

Medians throughout; "before" is the old five-run table. Each new median is the
old one × the factor, 0.66-0.72 (old × 0.68 gives 1.14, 1.56, 2.12). Within a
map the runs stay within -7 % / +5 % of the median, except long-hall's 2.40,
+16 %, on the slowest runner (reference 87 ms).

The gate keeps the headroom of long-hall, the map nearest it: after #3254 it
measured 2.71 against 3.5, a factor of 1.29, and 2.07 × 1.29 = 2.67, so 2.7.
Its worst run, 2.40, is 11 % under. The old rule (1.5 × the highest of canyon
and crossroads, 1.59 → 2.4) would put that run on the gate.

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
(2.16 at 2.7) fails as stale, so its entry is deleted when its issue
lands. The margin keeps a map just under the gate from flaking: long-hall
measured 2.99-3.45 before #3254.
