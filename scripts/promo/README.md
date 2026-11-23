# The promo video (#3811)

A 45 s trailer, 16:9 and 9:16, cut from captures of the game itself. Not in
CI. The cuts are **release assets**, never committed (`out/promo/` is
ignored): `vibewars-trailer-16x9.mp4` and `vibewars-trailer-9x16.mp4`.

## Re-shoot

```sh
company heavy pnpm run promo:capture     # scenes -> out/promo/capture/
company heavy pnpm run promo:assemble    # cuts   -> out/promo/
```

`promo:capture --scene fight` shoots one scene (`fight`, `editor`,
`map-<id>`, `friends`, `ranked`). It builds the client with the broadcast
transport and the splash off, as `readme:shots` does, and needs the
workspace packages built (`pnpm -r --filter "./packages/**" run build`).

- **Events.** `?capture` makes the match view list its combat events on
  `window.__capture` (`apps/web/src/capture-events.ts`); the cut slows and
  centres on the interrupt, the rez and the ward from it. The flag does
  nothing else. The fight is retried up to five times until it has an interrupt.
- **Music.** Playwright records no sound. An init script, in every frame
  including the sandboxed music host, tees the music bus into a
  `MediaRecorder`; the take is one continuous recording of the fight scene
  (`music.webm`), no game code involved. `assemble` finds its beat from
  the onsets and starts it so a beat lands on the interrupt's frame.
- **Captions** are `captions.json`, English only, drawn by ffmpeg in the
  system's bold sans. They are not `t()` strings.
- **Fixture.** Every scene starts in a fresh browser context: no real
  player's data.

## Where it lives

The finished files are attached to the GitHub release of the version they
ship with, under a fixed tag, never `latest`:

`https://github.com/Enteee/VibeWars/releases/download/<tag>/vibewars-trailer-16x9.mp4`

The `<tag>` is recorded here once the first release carries them.
