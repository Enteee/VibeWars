# ADR-0006: Map Representation

## Status

Accepted (2026-10-23); first implementation is Sprint 6.

## Context

Maps must be declarative, original (not copied GW1 geometry/assets), usable
identically by server collision, headless tests, and the client renderer,
and composed from simple primitives (walls, spawn zones, objectives, LOS
blockers — brief §17–§19).

## Decision

- A map is a single JSON file validated against a JSON Schema at build time
  (mirroring ADR-0004's "invalid data fails CI" rule), living at
  `packages/game-maps/maps/<map-id>/map.json`.
- Geometry is expressed with the same primitives `game-core`'s collision
  module already needs for gameplay (circle, rectangle/polygon, line
  segment) — a wall is `{ x, y, width, height }` or a polygon point list,
  not a bespoke "map geometry" vocabulary parallel to the collision
  vocabulary. `apps/web/src/render/arena-scene.ts`'s `RenderableWall` shape
  (Sprint 0/2) is the renderer-facing _projection_ of this, not the source of
  truth — the map file is.
- A map file declares, at minimum: `dimensions`, collision geometry, spawn
  points per team, objective/capture zones (data only until Sprint 21/22
  implement their rules), LOS-blocking geometry, and decorative-only geometry
  explicitly tagged as non-colliding so the renderer and the collision system
  never have to guess which shapes matter for gameplay.
- The same parsed map object is consumed by: server-side collision/LOS
  (ADR-0003's simulation), headless geometry tests (brief §7 test
  philosophy), and the client renderer — one parse, three consumers, so a
  map authored once is correct everywhere by construction rather than by
  convention.

### Amendment (2026-10-24, #8): the client consumes the parsed map

Until now the client only had the lossy `MapDescriptor` projection, because
nothing in the browser needed real geometry. The Training Ground (#2 §4.4)
runs the simulation in the browser, so `apps/web` now imports map JSON
through `@vibewars/game-maps`' fs-free subpaths and runs `validateMapData` at
module load: the third consumer named above, parsing the same file the
server does. A test asserts the fs-loaded and directly imported maps agree.
The cost is `zod` in the web bundle; if it bites, `validateMapData` can
become a zod-free type guard behind the same export.

Training arenas live in `packages/game-maps/training/<map-id>/map.json`, a
sibling of `maps/`. The loader scans only `maps/`, so they never appear in
`listMapIds()`, `/api/maps` or the lobby's map check, with no schema field
and no filtering.

## Consequences

- Map authoring is JSON-editing, not code; a new arena (Sprint 23) is a new
  data file plus schema validation passing, not a new TypeScript module.
- Keeping collision/LOS geometry and decorative geometry in the same file
  under different tags (rather than a separate "visual-only" file) means a
  single source of truth, at the cost of needing a renderer that correctly
  ignores the decorative-only flag when doing gameplay queries — enforced by
  tests, not convention, once the collision module exists (Sprint 7).

## Alternatives Considered

- **Tilemap/tileset format (e.g. Tiled's `.tmx`).** Rejected: this is a
  vector, not tile-based, minimalist game (brief §20); a tile grid would be
  the wrong primitive for arbitrary wall polygons and would add a tileset
  asset pipeline this project has no use for.
- **Procedural/code-defined maps (TypeScript functions building geometry).**
  Rejected: harder to validate at CI time as _data_, and couples map content
  to a compiled language unnecessarily, contrary to brief §19 ("Map data
  must be declarative").
