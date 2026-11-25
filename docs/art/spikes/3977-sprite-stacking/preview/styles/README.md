# #3977 sprite stacking: five art styles and how to make the art

Mockups only, drawn with canvas 2D at game scale (a body has a 12 px radius). Nothing is implemented. Every style draws the same scene: 7 bodies, walls, columns, a tree, a brazier, crates, a pool, a fire area, a ward dome, a fireball and arrows. `*-world.webp` is the scene at game zoom. `*-zoom.webp` is 2× the middle of it. `sheet.webp` shows all five zoom crops.

Sheet order: painterly, low-poly / pixel art, grim gothic / voxel.

| Style           | What changes                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Painterly       | muted earth palette, no outline, smooth shading, hooded figures with capes, soft floor wash                                                                                     |
| Low-poly        | hexagonal slices, 3-step flat shading, bright palette, triangle-faceted floor                                                                                                   |
| Pixel art       | rendered at 1/3 resolution and scaled up hard-edged, 4-step shading, 1 px outline                                                                                               |
| Grim gothic     | dark, high contrast, helmeted figures with visor and cape, strong vignette and warm light pools                                                                                 |
| Gothic, lighter | the operator's pick, lifted: lighter floor, walls and water, contrast 0.75 → 0.6, half the vignette, brighter team colours. `gothic-vs-lighter.webp` sets it beside Grim gothic |
| Voxel           | square slices snapped to a 2 px grid, 4-step shading, checker floor                                                                                                             |

Open `styled.html?style=<name>` (`&s=2` for 2×) to redraw a style.

## Can the art be something other than code?

Yes. The usual sprite-stacking pipeline is **voxel models exported as slices**, not shapes drawn in code.

| Option                                                                        | Consistency                                                   | Effort                                     | Licence                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| Hand voxel models (MagicaVoxel, Goxel, SpriteStack), sliced at build time     | highest: one palette, one grid                                | 1–3 h per prop, more per character         | free tools; the art is ours                                                    |
| A 3D mesh sliced in Blender (a small script of ours)                          | good once colours are snapped to a palette                    | write the slicer once                      | free                                                                           |
| Slices in code (what the spike does)                                          | fully deterministic                                           | slow to make good art; it looks procedural | ours                                                                           |
| AI text/image to 3D (Meshy, Tripo, TRELLIS), then voxelised                   | medium: differs per run, needs palette lock and hand clean-up | fast draft, manual tidy                    | Meshy and Tripo are paid; TRELLIS is MIT; Hunyuan3D excludes the EU, UK and KR |
| AI pixel-art image models (Retro Diffusion, PixelLab, Scenario, a style LoRA) | good with a fixed palette, LoRA and reference images          | low                                        | gives 2D sprites, not slices: concept art only                                 |

People keep AI art consistent with one fixed palette, applied by quantising every export as a build step. They also use one light direction, one grid size, reference images and a style LoRA. Seeds alone do not do it. Purely AI-generated output is not copyrightable (US Copyright Office, 2025), so an open repo cannot really license it, and each asset should record where it came from.

**Recommendation:**

- Commit small `.vox` sources (a few KB each) and one shared palette, and have a build step turn them into a slice atlas. The art then lives as data in the repo, and every build makes the same atlas.
- Model the ~16 looks and ~20 props by hand in MagicaVoxel or Goxel, optionally from AI concept images.
- Keep code-drawn slices only for parametric things: team tint, animation offsets and effects.

Sources: MagicaVoxel sprite-stacking guide (medium.com/@avsnoopy), spritestack.io, docs.pixel-composer.com (Slice Stack), replicate.com/blog (Retro Diffusion), copyright.gov/ai, huggingface.co/tencent/Hunyuan3D-2 (licence).
