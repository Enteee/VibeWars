---
name: area-lanes
description: One card per code area in flight, so parallel developers do not collide. Use when the architect moves a card to Ready, and when a developer picks one.
---

# Area lanes

Parallel developers editing the same subsystem produce conflicts, and
conflicts mean re-done PRs. Labels keep them apart.

Labels: `area:render`, `area:game-core`, `area:maps`, `area:maps-2`,
`area:maps-3`, `area:ui`, `area:net`, `area:i18n`, `area:bots-ai`,
`area:audio`, `area:tooling`.

- Labels are not shown by `board ls`/`board show`; read them with `hub issue view <n> --json labels`.
- **Architect:** label every card you spec with the area(s) it mostly touches.
  Before `Ready`, `board ls Ready` and `board ls "In Progress"`: if a card
  with the same `area:` label is already there, leave yours in `Backlog` and
  spec a card from another area instead. Map builds run in up to three lanes
  (`area:maps`, `area:maps-2`, `area:maps-3`, Q93): give each map card one
  of them. Two maps in flight that both touch a shared map file (the biome
  dressing, `net/maps.ts`, `docs/player/modes.md`) merge `main` before
  their PR and rerun typecheck; #3493 is what happens otherwise.
- **Developer:** take a Ready card in an area no other `In Progress` card
  holds. Merge `main` into your branch whenever another PR in your area
  lands, open small PRs early, and fix your own conflicts at once.
- **Manager:** if two cards of one area are in flight, tell the later
  developer to switch to another area.
- **Backfill:** the architect labels the cards now in `Ready`/`In Progress` on its next loop.
- hub enforces the architect half: `board move <n> Ready` is refused without an `area:*` label or into a taken lane.
- An area label is a guess, not a contract; do not block on a few shared files.
