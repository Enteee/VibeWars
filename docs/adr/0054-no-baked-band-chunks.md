# ADR-0054: Static map art stays live; it is not baked into chunk images

## Status

Accepted (2026-11-17). Issue #3522, following #3506. Builds on ADR-0051 (discrete layers) and ADR-0052 (map lighting).

## Context

On a software renderer, a layered map costs about 6.4× a flat map per walked frame (#3506). No single pass is the cost. Hiding everything gives 1.3×, hiding every Graphics 4.8×, hiding every Image 3.9×. #3506 tried culling single passes and trimming the light maps, and neither gave more than 1.2×.

Issue #3522 tested the obvious next idea. Each band draws its floor, grain, pavings, walls and decks as many overlapping passes. Draw that static art once into cached chunk textures, so a frame blends a few images per chunk instead of dozens of objects.

## What was tried

The mechanism was built in full on `bot/developer@3/issue-3522`, which is not merged:

- **Runs, not fixed groups.** The depth-sorted display list was cut into runs of contiguous static objects, split at every depth a live kind (bodies, zones, fog, tunnel covers, overhangs, lifts, lighting) can take. Each run baked to one image per chunk, placed at its first member's slot, so depth interleaving was untouched.
- **One source of truth.** A run was drawn into a `DynamicTexture` from the same display objects `drawMap` builds, with Graphics cut to the chunk, and those objects were then hidden. Objects that are faded or redrawn every frame stayed live.
- **Chunks.** 512 px square chunks at the current zoom covered the view plus one chunk of margin. They were baked lazily, at most 4 per frame, with an LRU under a 64 MB budget. Anything that reran `drawMap` dropped every chunk, and so did a lost WebGL context. A run stayed live until its visible chunks were ready.

It drew the same pixels, and it was slower everywhere.

| SwiftShader, 1280×720, rAF p50   | live     | baked     | baked, chunk images hidden | chunk px on screen |
| -------------------------------- | -------- | --------- | -------------------------- | ------------------ |
| jungle-ruins², still (flat)      | 16.7 ms¹ | 83–100 ms | 16.7 ms¹                   | 1.84 M (12 images) |
| arena-long-hall, still (layered) | 39.8 ms  | 333 ms    | 17.3 ms                    | 6.20 M (61 images) |
| jungle-ruins², walked (bench)    | 35.0 ms  | 117 ms    |                            |                    |
| arena-long-hall, walked (bench)  | 215 ms   | 384 ms    |                            |                    |

¹ At the frame-rate cap.

² The flat Jungle Ruins before #3436 made it layered. Every row was measured on the WIP branch, based on main at 49d050b0e.

In the still rows nothing was being rebaked, so all of the extra cost is drawing the chunk images. A textured, alpha-blended pixel costs about 50 ns on SwiftShader, roughly 20 Mpix/s. Each run is a full-chunk quad wherever it touches. On long-hall that adds up to about six screens of textured fill, where the live static art it replaced cost about 23 ms.

Ruled out as the cause:

- **`DynamicTexture` as such.** A plain 512² canvas texture in the chunks' place cost the same.
- **The multi-texture batch shader.** `render.maxTextures: 1` saved about 15 %.
- **Linear filtering.** NEAREST saved about 15 %.
- **Rebake churn.** Walking did about 1.4 bakes per frame, and the still case did none.

## Decision

**On software GL, textured area is the cost, so static map art stays live.** Trimmed flat Graphics fills are cheap there. Turning them into textured quads makes the frame slower, however few draw calls it saves. This also explains #3506's finding that Images were the expensive part.

A future render performance card cuts **textured area** (light maps, paving images) and **Graphics tessellation**. It does not add images or render targets to save passes.

## Considered

- **Baking only the runs that stack several overlapping textured layers.** Here baking could win, but only where the overlap is deep, and that changes per map. It cannot reach the ≤ 4.5× walked target, and it would carry the whole chunk mechanism for a small gain. Rejected.
- **Per-pass culling and light-map trimming** (#3506). Neither gave more than 1.2×. Rejected there.

## Consequences

`graphics-cull.ts` remains the only static-art optimisation. The ≤ 4.5× walked target for layered maps moves to a follow-up card about textured area. Anyone who proposes caching map art in textures again has to show it beating these numbers on SwiftShader first.
