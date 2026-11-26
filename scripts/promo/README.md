# The promo video (#3811)

A 45 s trailer, 16:9 and 9:16, cut from captures of the game itself. CI
builds them (`trailer.yml`). The cuts are **release assets**, never committed (`out/promo/` is
ignored): `vibewars-trailer-16x9.mp4` and `vibewars-trailer-9x16.mp4`.

## Re-shoot

Local runs are only for previews: the published cuts come from `trailer.yml`.

```sh
company heavy pnpm run promo:capture     # scenes -> out/promo/capture/
company heavy pnpm run promo:assemble    # cuts   -> out/promo/
```

`promo:capture --scene fight` shoots one scene (`fight`, `editor`,
`act-<name>`, `friends`, `ranked`). It builds the client with the broadcast
transport and the splash off, as `readme:shots` does, and needs the
workspace packages built (`pnpm -r --filter "./packages/**" run build`).

- **Stepped frames (#4006).** The action and fight scenes open with
  `?capture=step` (`apps/web/src/capture-clock.ts`): game time moves only
  when the script calls `window.__captureStep(1)`, which advances the host
  by 1/20 s (the sim tick, so no frame repeats) and draws one frame; the script then screenshots the viewport
  into ffmpeg (`image2pipe`, 20 fps VP9; assemble blends it up to 30). The video is smooth however slow
  the host renders (software GL: 3 to 8 fps). `walk` and the waits count
  frames; event times are virtual. The lobby runs in real time with the
  clock pumped, and the video starts at the match canvas. The editor,
  friends and ranked scenes have no playfield movement and stay on
  `recordVideo`.
- **Events.** `?capture` makes the match view list its combat events on
  `window.__capture` (`apps/web/src/capture-events.ts`); the cut slows and
  centres on the interrupt, the rez and the ward from it. The flag does
  nothing else. The fight is retried up to five times until it has an interrupt.
- **Music.** Playwright records no sound. An init script, in every frame
  including the sandboxed music host, tees the music bus into a
  `MediaRecorder`; the take is one continuous recording of a real-time run of the fight
  (`fightMusic`, its own match: audio cannot be stepped; `music.webm`), no game code involved. A second init script notes each
  track the host reports playing, and the fight's `musicSettled` mark is
  where the last switch (menu to match) has faded in. `assemble` uses the
  take only from there: one song under the whole cut, which changes only
  through the fades at its ends (ADR-0058). It finds the beat from the
  onsets after that mark and starts the music so a beat lands on the
  interrupt's frame.
- **Captions** are `captions.json`, English only, drawn by ffmpeg in the
  system's bold monospace, the wordmark's face, in its blue (#59c2ff); the name
  is blue "Vibe" and red "Wars". They are not `t()` strings.
- **Fixture.** Every scene starts in a fresh browser context: no real
  player's data.

## Where it lives

Every published `v0.N.0` release carries the cuts, starting with `v0.12.0`.
`.github/workflows/trailer.yml` builds and uploads them when the release is
published, replacing same-named assets; it never creates or edits a release.
It builds the commit it runs from (a release event: the tag; a hand run: the branch you pick, normally main), and `tag` only names the release the cuts go to. Re-run it by hand with the `tag` input, which is also how a release older than `scripts/promo` gets its cuts. The files appear some minutes after
the release, so the URL 404s until then:

`https://github.com/Enteee/VibeWars/releases/download/<tag>/vibewars-trailer-16x9.mp4`

The game's Help > Trailer page (#3835) plays the cuts on **v0.12.0**,
uploaded there by `trailer.yml` (#3922). A re-cut re-runs the workflow for
that tag, so the page's URLs never change. Its length, size and poster
(`apps/web/public/promo/trailer-poster.webp`) are read from the 16:9 cut by
hand: update `apps/web/src/ui/trailer-section.ts` when a re-cut changes them.

## Playwright's video encoder

`recordVideo` looks for its own ffmpeg at
`~/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux`. Where Playwright's
download is not available, point it at the devenv's ffmpeg (it has libvpx):

```sh
mkdir -p ~/.cache/ms-playwright/ffmpeg-1011
ln -sf "$(command -v ffmpeg)" ~/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux
```
