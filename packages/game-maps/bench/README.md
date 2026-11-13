# The render bench's reference map

`reference-map.json` is the yardstick `pnpm run bench:render` measures
every map against (#3255). It is a synthetic map in the real schema, never
a playable one: only a build made with `VITE_VIBEWARS_BENCH_REFERENCE=1`
offers it.

**It is frozen.** An edit to it moves every map's ratio, so a pull request
that changes it re-derives `BENCH_MAX_RATIO` and `BENCH_CEILINGS` in the
same pull request, as `docs/development/benchmarks.md` describes.
