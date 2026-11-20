# The render bench's frozen maps

Two synthetic maps in the real schema, never playable ones: only a build
made with `VIBEWARS_BENCH_REFERENCE=1` offers them, and then only in the
Hosted lobby, never in a draw.

`reference-map.json` (`bench-reference`) is the yardstick
`pnpm run bench:render` measures every map against (#3255). An edit to it
moves every map's ratio, so a pull request that changes it re-derives
`BENCH_MAX_RATIO` and `BENCH_CEILINGS` in the same pull request, as
`docs/development/benchmarks.md` describes.

`flat-map.json` (`bench-flat`) is the follow case's flat baseline
(#3444): one layer, its ground layer 0, no pits, tunnels, decks or
transitions, the hall's biome, about The Hollow Deep's size. No player
map stays flat, so the tutorial's e2e walks it too, as its flat map. An
edit to it moves every follow ratio, so a pull request that changes it
re-derives the follow gate, `BENCH_MAX_FOLLOW_RATIO` in `ci.yml`, in the
same pull request.

**Both are frozen.**
