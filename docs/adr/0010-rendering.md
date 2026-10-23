# ADR-0010: Rendering

## Status

Accepted (2026-10-23)

## Context

The brief requires a minimalist, geometry-only visual language (circles,
lines, polygons, rings, progress indicators — §20), rendered in a browser,
kept strictly separate from game rules (§14, §41), and says to use Phaser for
the viewport while using normal HTML/CSS for menus (§21).

Separately: the implementation is not required to be TypeScript-everywhere as
a matter of principle — the actual requirement is a **modern, actively
maintained, strongly-typed toolkit suited to browser game programming**.
TypeScript-over-WebGL happens to satisfy that, but the choice below is
justified on those merits, not on "must be TypeScript."

## Decision

Use **Phaser 4** (`phaser@4.2.1` on npm, confirmed current as of 2026-10-23)
as the viewport renderer, driven from TypeScript, targeting its WebGL
renderer (Phaser 4 is described by its maintainers as a ground-up rewrite of
the WebGL renderer over the Phaser 3 API surface).

Why this satisfies "modern, maintained, strongly typed, suited to web game
programming":

- **Modern & maintained**: 4.0/4.1/4.2 all shipped in 2026; the package ships
  first-party `.d.ts` types (`types/phaser.d.ts`) and a clean ESM build
  (`dist/phaser.esm.js`) — verified directly from the installed package, not
  assumed from docs.
- **Strongly typed**: no `@types/phaser` shim needed; it typechecked cleanly
  under our strict `tsconfig.base.json` (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, etc.) with zero `any`.
  as required by this package.
- **Suited to web game programming**: scene graph, WebGL batching, input,
  camera/viewport scaling — all the primitives a 2D arena game needs — without
  us hand-rolling a render loop over raw WebGL.
- Minimalist geometry (circles/rects/rings) is drawn with Phaser's
  `GameObjects.Graphics`, which is a thin, direct wrapper over WebGL drawing
  calls — there is no sprite-sheet or texture-atlas pipeline to build for a
  game whose whole visual language is vector shapes.

`ArenaScene` (`apps/web/src/render/arena-scene.ts`) takes a plain
`ArenaSnapshot` (`{ actors, walls, targetId }`) and draws it; it holds no
reference to `game-core`'s simulation types, combat rules, or network client.
That snapshot shape is renderer-owned, deliberately decoupled from both the
wire protocol (`game-protocol`) and the simulation's internal representation,
so the two can evolve independently.

Menus, the character builder, team builder, and lobby UI use plain HTML/CSS
(see `apps/web/index.html`, `apps/web/src/styles.css`), not Phaser — per
§21, building menus inside a game canvas is unnecessary complexity for forms,
lists, and text input that the DOM already does well.

## Consequences

- A production client build of the current (nearly-empty) scene is ~358 KB
  gzipped, almost entirely Phaser itself (measured via `pnpm run build`,
  `apps/web/dist/assets/index-*.js`). This is an acceptable one-time cost for
  a LAN game served from the same host as the match; it is tracked here so a
  future regression in bundle size has a baseline to compare against.
- WebGL requires a GPU-capable browser context; Phaser 4 falls back to Canvas
  automatically (`Phaser.AUTO`), which we rely on rather than forcing WebGL,
  so the game degrades rather than failing to boot on a constrained device.
- Because the renderer only ever receives a plain snapshot object, headless
  simulation tests (brief §15) never need to construct a `Phaser.Game` at all.

## Alternatives Considered

- **Raw WebGL.** Rejected: would mean hand-building a 2D batcher, camera, and
  resize handling that Phaser already provides, for no gain given our visual
  language is intentionally simple shapes, not a custom shader pipeline.
- **PixiJS.** A reasonable, also well-typed, WebGL-based alternative. Not
  chosen because it is a renderer only — Phaser additionally gives us scene
  management and input handling we will need from Sprint 2 onward, without
  assembling them from separate libraries.
- **Canvas 2D only, no Phaser.** Rejected: fine for the current static demo,
  but would need to be replaced once movement/animation performance matters
  for an 8v8 match; starting on Phaser's `Phaser.AUTO` renderer gets WebGL
  "for free" while still falling back safely.
