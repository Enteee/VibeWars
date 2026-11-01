# ADR-0028: Strudel music engine in a sandboxed host

## Status

Accepted (2026-10-25). Epic #366, steps 0 and 1; issue #368. The spike
behind the numbers is commit
[`9d04b16`](https://github.com/Enteee/VibeWars/commit/9d04b163c16a8999520d5122e217556744d78c4d)
on branch `bot/developer-2/issue-368-spike`. It is not merged. Step 4 (the
host card) lifts from it.

## Context

VibeWars wants music that feels like Guild Wars 1, in three ways:

- the track follows the map and the screen;
- intensity follows the fight, live;
- a player can open the current beat in an editor and change it.

Strudel writes music as source code and plays it in the browser, and its
pattern language can read a value at query time (`ref()`). That makes live
intensity possible without re-evaluating a track. It also brings sharp
edges, which #366 §1 lists:

- `@strudel/web` touches `window` at import, patches `Pattern.prototype`,
  and turns on `miniAllStrings`;
- the scheduler is driven by `setInterval`;
- the default sounds load from GitHub CDNs;
- a patch is arbitrary JavaScript.

## Decision

**Music is Strudel, played live (#366 option B), in a sandboxed host.**

- **Isolation.** The engine runs in `apps/web/music-host.html`, a second
  Vite entry (`build.rolldownOptions.input`). The game loads it in an
  `<iframe sandbox="allow-scripts" allow="autoplay">` with no
  `allow-same-origin`, so the host has an opaque origin. The game and the
  host talk only by `postMessage`. A beat pasted from a stranger cannot read
  the game's storage, session or DOM, **but only while the host runs inside
  that sandbox.**
- **The host refuses to run anywhere else.** `music-host.html` is an
  ordinary page on the game's origin. Another site can open it with
  `window.open`, or frame it without a sandbox. Either way it then runs
  with the game's origin and storage, and a pattern posted to it would be
  XSS on the game. GitHub Pages cannot send a CSP `sandbox` header, and a
  `<meta>` CSP cannot sandbox. So:
  1. **Guard.** Before it installs a message listener or evaluates
     anything, the host checks `self.origin === "null" && window.parent !== window`,
     which means it is sandboxed and framed. If the check fails, it stops.
     It relies on that check alone: never on `document.referrer`, the URL
     or a query parameter, all of which the opener controls.
  2. **Host side.** The host accepts a message only when
     `event.source === window.parent`.
  3. **Game side.** The game accepts a message only when
     `event.source === iframe.contentWindow`. Origin checks are useless on
     either side, because the host's origin is `"null"`, the same as every
     other sandboxed frame.
  4. **No `allow-same-origin`.** It is forbidden on the iframe. The
     `sandbox` attribute is exactly `allow-scripts`.
  5. **Tests.** Step 4 adds a test that a top-level load of
     `music-host.html` evaluates nothing and answers no message. The same
     step asserts the iframe's `sandbox` attribute is exactly
     `allow-scripts`.
- **Any site can frame the host, and that is harmless only because of 1 and 2.** With `Access-Control-Allow-Origin: *` and an opaque origin, any site
  can put `music-host.html` in its own sandboxed frame and drive it. There
  it runs with an opaque origin, can reach nothing of ours, and is no more
  than a copy of Strudel. Adding `allow-same-origin`, or weakening the
  guard, turns this into the XSS above.
- **Wiring.** The host wires `@strudel/core`, `mini`, `tonal`, `transpiler`
  and `webaudio` by hand: `evalScope`, `registerSynthSounds`, our own
  `samples(…)`, and `webaudioRepl({ transpiler, setInterval, clearInterval })`.
  It never calls `initStrudel()` and never imports `@strudel/web`.
- **One read path.** A track is source code. It is never a WAV for some
  players and source for others.
- **Intensity is a layer inside a track**: `layer(n, pat)` is
  `pat.mask(ref(() => intensity >= n ? 1 : 0))`. Intensity never switches
  the track.
- **Self-hosted sound.** Every sound comes from Strudel's built-in synths
  or from `apps/web/public/music/` through one `strudel.json`. The palette
  is at most 3 MB. Nothing loads from a CDN.
- **Lazy.** Nothing of the engine loads before the first user gesture.
- **The scheduler works ahead of the audio clock** (#446, #448): its clock
  runs `LEAD_SECONDS` = 0.75 s ahead of the context's, so a stall of the
  main thread up to about 0.9 s costs no note. See "The scheduler works
  ahead" below.
- **Worker timers are required.** The scheduler's `setInterval` and
  `clearInterval` are backed by a dedicated Worker (see Measurements).
- **Static files carry `Access-Control-Allow-Origin: *`.** This is needed
  on every server that serves the client. GitHub Pages already sends it
  (see Measurements).
- **Pinned versions.** `@strudel/core`, `mini`, `tonal` and `transpiler`
  1.2.6, plus **`@strudel/webaudio` 1.3.0**, so there is one copy of core.
  Not `@strudel/soundfonts` and not `@strudel/codemirror`.
- **Sound effects** are written in Strudel too, but pre-rendered to MP3 in
  CI and played by `sound-player.ts`, never through the scheduler (#366
  §2.1). A cue such as "interrupt now" cannot wait ~200 ms for a scheduler
  tick, and must play when music is off or broken.

**Licence.** Every Strudel package is `AGPL-3.0-or-later`, the same as
VibeWars, so shipping them in the client is fine.

## Measurements

Crackle is counted in every browser by `?musicstats` (#507):
`underrunMs`, the wall time per second in which the audio clock fell behind
the wall clock (`getOutputTimestamp()`, read once a second, reset across a
suspend), and `maxReductionDb`, the deepest the bus limiter pulled the mix
down. A stall of the main thread with the audio thread fine counts 0. The
probe is checked with fake clocks; forcing underruns in Firefox (`?audiostress`)
is not built yet, so until then its readings are unvalidated there.

These come from the spike, in Chromium 155 (the dev shell's), on a Vite
8.3.5 production build. Measured on 2026-10-25.

### 1. Host chunk size

Minified, measured with gzip:

| Host contents                                                          |    raw |         gzip |
| ---------------------------------------------------------------------- | -----: | -----------: |
| core, mini, tonal, transpiler, webaudio 1.3.0 (superdough 1.3.0)       | 645 kB |     211.9 kB |
| … with `@kabelsalat/web` aliased to a 10-line stub                     | 579 kB | **189.4 kB** |
| … plus `@strudel/soundfonts` 1.3.0                                     | 780 kB |     237.9 kB |
| … plus `@strudel/codemirror` 1.3.0                                     | 1.9 MB |     515.1 kB |
| … plus a minimal CodeMirror 6 (view, state, commands, lang-javascript) | 1.0 MB |     346.6 kB |

- **`@kabelsalat/web` can be left out.** Core's `repl()` builds a
  `SalatRepl` it only uses for `compileKabel`. Aliasing the module to a
  stub whose `evaluate` throws saves 22.5 kB gzip, and the reference track
  plays unchanged. Superdough still depends on `@kabelsalat/lib`.
- The game's own chunk does not grow. The second entry only splits Vite's
  1.6 kB modulepreload polyfill into a shared chunk.

### 2. Main-thread CPU in a 4v4 fight

The scenario was a spike-only 4v4 Training Ground: the player and three
bow dummies against four. Music was at intensity 2, about 7 events/s. Each
window was 30 s, read with CDP `Performance.getMetrics`, on headless
software WebGL on a shared machine. There were 6 runs with music off and 7
with music on.

| Thread            | music off (median, range) | music on (median, range) |
| ----------------- | ------------------------- | ------------------------ |
| game page, busy   | 68.5 % (48.6–75.9)        | 60.8 % (55.6–66.8)       |
| game page, script | 8.8 % (6.0–9.7)           | 7.6 % (6.5–8.2)          |
| music host, busy  | –                         | 3.9 % (3.4–4.9)          |

- **The engine runs on the game's main thread on Android Chrome and in
  Firefox** (corrected in #446). Desktop Chromium puts the sandboxed frame
  in its own renderer process (CDP lists it as a separate `iframe`
  target), so there the game page shows no measurable cost. Android
  Chrome keeps sandboxed frames in the page's process, and so does
  Firefox, whose process follows the site that created the frame. There
  the host's scheduler, Strudel's queries and superdough's node creation
  share a thread with Phaser, the HUD, net messages and GC, and a stall
  of that thread drops music (see "The scheduler works ahead").
- The host's main thread uses about 4 % of a core.
- Audio rendering happens on the audio thread, which these numbers do not
  include.
- The spike forwards every event to the parent for counting, so the
  game-side numbers overstate the cost.

### 3. Hidden tab for 60 s

These runs used headful Chromium on Xvfb. The tab was switched by raw CDP,
and `visibilityState` was confirmed `hidden`. Playwright keeps every page
`visible`, so it cannot run this test.

| Timers             | Tab audible? | events/s before |   hidden | after return |
| ------------------ | ------------ | --------------: | -------: | -----------: |
| page `setInterval` | yes          |            5.60 |     5.62 |         5.48 |
| page `setInterval` | no (gain 0)  |            5.80 | **1.15** |         5.78 |
| Worker             | yes          |            5.80 |     5.73 |         5.68 |
| Worker             | no (gain 0)  |            5.80 |     5.72 |         5.68 |

- **An inaudible hidden tab drops about 80 % of events.** The Cyclist skips
  any query whose time has already passed ("skip query: too late"), so the
  missed events are lost. They do not arrive late.
- **There is no burst on return.** The busiest 100 ms held 9 events, the
  same as in steady play, and no event was scheduled in the past.
- **A visible tab is throttled too, in one case.** With the frame
  `display: none` and no sound reaching the output, the page's
  `setInterval` ran at 0.4–0.6 events/s against 5.6 with Worker timers.
  Chromium throttles hidden cross-origin frames that make no sound.
  Music fading in, a muted music bus and a quiet passage all hit this.
- **Worker timers are therefore required.**

### 4. Fetching from the opaque-origin frame

Every subresource the host loads is a CORS request with `Origin: null`.
That includes **its own `<script type="module">`**, not only the samples.
Without `Access-Control-Allow-Origin`, the host never starts.

| Server                                       | as on `main`                                                                                   | with the header     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------- |
| `vite` dev                                   | blocked: its default `server.cors` admits only localhost origins                               | plays, sample loads |
| `vite preview`                               | blocked: CORS error on `music-host-*.js`                                                       | plays, sample loads |
| LAN server (`apps/server`, `express.static`) | no header is sent, so blocked                                                                  | plays, sample loads |
| GitHub Pages                                 | sends `access-control-allow-origin: *` on every response, including 404s (checked with `curl`) | no change needed    |

- The browser test of GitHub Pages was not run: it was not possible from
  the jail. The headers above were checked with `curl`.
- **Decision: serve `Access-Control-Allow-Origin: *` on static files.**
  - LAN server: `express.static(webRoot, { setHeaders })`, which leaves
    `/api` and matchmaking alone.
  - Vite: `server.cors` and `preview.cors` set to `{ origin: "*" }`.
- **Rejected: the parent fetches and transfers `ArrayBuffer`s.** It would
  fix samples but not the host's own scripts. Only inlining the whole host
  into `srcdoc` could avoid the header, and that is more machinery for no
  gain. The files are public anyway.
- **Trade-off.** In dev, any page in the developer's browser can read the
  Vite dev server's modules. The source is public (AGPL), and Vite still
  refuses `.env` and paths outside the allow list.

### 5. `setIntensity` timing

A `setIntensity` takes effect **sooner than the next cycle**. A layer's
next event lands 0.23–0.31 s after the message, which is the scheduler's
lookahead. Turning a layer off is just as quick. A cycle of
`reference-dawn` lasts 3.3 s.

Changes are therefore not beat-quantised: a layer can enter mid-bar, on its
next event. If step 4 wants layers to enter on the bar, the host latches
the level at cycle boundaries. `ref()` reads the latched value, and the
latch updates when `floor(scheduler.now())` changes. This needs no
re-evaluation.

### 6. Autoplay

The test used headful Chromium with `--autoplay-policy=document-user-activation-required`
(the desktop default). A click in the game page leads to a `postMessage`,
then `AudioContext.resume()` in the host, and the context reaches
`running`. `allow="autoplay"` passes the user activation on to the frame.

2026-10-26 (#612, Q74): the operator ran `pnpm dev` in desktop Firefox with
default prefs. Music played on the main menu after the first click and carried
on in the Training Ground. `allow="autoplay"` and the click → `postMessage` →
`resume()` path work there too. The headless harness hung only because it
lacked `libpulse` (fixed in PR 617, see §8).

Safari has not been tested.

### 7. Under load, and what it changed (#420)

The runs used `scripts/music-stress.mjs`: Chromium with Pixel 7
emulation and sandboxed frames in the page's process, as on Android. Each
run was 60 s of the Training Ground at intensity 3, with one crossfade.
`skipped` is music the cyclist never queried because a tick came later
than its 0.2 s lookahead. Those are the gaps a player hears.

| Load               | skipped before | skipped after | late events before → after |
| ------------------ | -------------: | ------------: | -------------------------: |
| no throttle        |          50 ms |          0 ms |                     25 → 0 |
| CPU 4×             |       7 500 ms |        550 ms |                     25 → 0 |
| CPU 6×             |       7 550 ms |        200 ms |                     25 → 0 |
| CPU 4×, music only |      11 250 ms |        100 ms |                     25 → 0 |

- **One reverb per orbit.** superdough rebuilds an orbit's reverb, an
  impulse response seconds long generated on the main thread, whenever an
  event asks for a different room on that orbit. Every track mixed room
  sizes on `orbit(2)`, which cost about 30 % of the main thread at 4×.
  The host now keeps the first room a track asks for on each orbit
  (`host/reverb-pins.ts`). **A voice that needs another room needs its
  own orbit.**
- **Tempo changes on a marker.** Strudel's cyclist times the rest of a
  slot by the tempo it started with, so an event carrying `cps` early in
  the slot put the rest of the new track's downbeat seconds in the past.
  A crossfade now changes the tempo with one silent event, last in its
  slot (`host/crossfade.ts`).
- **`latencyHint: "playback"`.** The music has a context of its own,
  with a bigger output buffer (base 10 → 23 ms, output 32 → 72 ms here),
  so a busy phone's audio thread is less likely to run dry. The sound
  effects keep theirs.
- **The music stops while the page is hidden.** Its context is suspended
  on `visibilitychange` and resumed on return. That is a deliberate change
  from measurement 3, where a hidden tab played on: a phone may freeze a
  page in the background while its audio clock runs on.
- **The lookahead stays** at 0.2 s (#448 moves the clock, not the lookahead). The cyclist's `latency` is not what skips a
  query, and `webaudioRepl` does not pass one through. What is left at 4×
  is one rebuild of the reverb when a new track takes over, and compiling
  the new track when a switch is asked for.

Firefox could not be measured here: in this sandbox it has no audio
output. Its numbers come from the phone check in
`docs/development/manual-tests.md`.

### 8. Underruns in Chromium and Firefox, validated (#519)

`.github/workflows/music-measure.yml` runs `scripts/music-stress.mjs --pulse`
for each browser on a push to `main` that touches the music, or on demand:
a PulseAudio null sink gives both a real-time output, and `?audiostress=<ms>`
(stress build only) makes an AudioWorklet busy-wait that long in every
render quantum (2.5 ms is about 95 % of the 2.67 ms budget at 48 kHz). A
browser's readings are **validated** when `underrunMs` stays near 0 with no
stress and rises from 1.5 to 2.5 ms (`scripts/music-stress-validation.mjs`);
otherwise they are printed marked unvalidated and nobody tunes from them.
It never fails on bad numbers, only on a crash. A headless runner is not a
phone.

**First numbers, 2026-10-26** (workflow run 40267554400 on `main`, after the
fix in #612: Firefox only ran once it had `libpulse`). Both browsers kept the
scheduler on time: 600 ticks in 60 s, no skipped music, at every load
except CPU 6x (Chromium: 5 late ticks on the editor, 26 in a match, max tick
work 190 and 284 ms; no skipped music). Underruns did **not** validate in either browser, because the baseline
failed: at audio stress 0 Firefox read 22 underruns, 98 ms, and Chromium 1 underrun, 1252 ms,
over the 10 ms bound for clock noise. Both did rise from 1.5 to 2.5 ms of
worklet load (Firefox 169, then 436 ms; Chromium 0, then 1986 ms). A shared
runner's null sink underruns by itself, so these readings stay marked
unvalidated and the `music:check` budgets (#514) stay provisional. The tables are in
that run's job summaries and `music-measure-*` artifacts.

### 9. Render-ahead (#509)

A spike asked whether rendering the music ahead of the audio clock, in an
`OfflineAudioContext` with no deadline, removes the underruns that come
with a heavy live graph. The prototype was not merged: it is
`host/render-ahead.ts` and the pure planner `host/render-plan.ts` at commit
[`b772006`](https://github.com/Enteee/VibeWars/commit/b7720062)
(PR #819), behind `?musicrender=ahead` in a stress build. A track is cut into chunks of 4 cycles. A chunk is one whole
mix at one level, plus a 7 s tail for the room and the release. The current
level is kept 3 chunks ahead and the levels either side 2 chunks ahead. Live,
the graph is a few `AudioBufferSourceNode`s, their gains and the bus limiter.
At that commit `scripts/music-stress.mjs --render-ahead` measures it. On
`main`, `--reactivity` steps the live engine through changes and prints
how late each is heard (`heard`, under `?musicstats`).

All numbers are from this sandbox, 2026-10-27: Playwright Firefox 155 and
Chromium 155, headless, a PulseAudio null sink at 44.1 kHz, 30 s per load.
The sink underruns about 2 ms/s by itself, so every reading is marked
unvalidated (measurement 8), and the gate compares against a control: one
looping buffer source into a gain, nothing else.

**The gate: underrunMs under audio-thread load** (Firefox, `audiostress`,
menu, music only):

| `audiostress` | live engine (3 runs) | control (2 runs) | render-ahead (2 runs) |
| ------------- | -------------------- | ---------------- | --------------------- |
| 0 ms          | 82 / 78 / 124        | 87 / 105         | 22 / 47               |
| 1.5 ms        | 289 / 263 / 650      | 57 / 131         | 105 / 204             |
| 2.5 ms        | 760 / 2134 / 8184    | 2694 / 254       | 362 / 357             |

- **At 1.5 ms, the load-dependent part of the underruns is the live graph's
  size.** The control stays at its floor, the live engine climbs 2 to 5
  times, and render-ahead stays near the control. The gate passes.
- At 2.5 ms the worklet alone nearly fills the 2.90 ms quantum, and the
  control fails as well. No graph survives an audio thread with no
  headroom.
- A busy main thread (`stress=40`) barely moves the live engine (53 ms),
  so #448's worker clock holds.

**Render speed, memory, main thread** (all levels together; the main-thread
stall is the longest gap in a 100 ms worker beat while rendering):

| Browser, load            | speed, median (min) | peak buffers | longest stall |
| ------------------------ | ------------------- | ------------ | ------------- |
| Firefox, menu            | 6.6 to 9.0× (3.4×)  | 58 to 65 MB  | 88 to 194 ms  |
| Firefox, during a switch | –                   | **79 MB**    | –             |
| Chromium, editor         | 3.1× (2.7×)         | 27 MB        | 143 ms        |
| Chromium, match          | 4.6× (3.8×)         | 44 MB        | 108 ms        |
| Chromium, menu, CPU 4×   | 2.9× (2.0×)         | 26 MB        | 372 ms        |

With its tail, a chunk is about 13.7 s of audio for a 6.7 s slot, so
keeping three levels ahead takes at least 6× real time. **Chromium is below
that on a desktop**, so its planner never catches up and its buffer peaks are
low because little is rendered. Firefox keeps up, but at 58 to 79 MB it is
over the 48 MB budget.

**How late a change is heard** (Firefox, `--reactivity`; live → render-ahead):

| Change                 |   live | render-ahead |
| ---------------------- | -----: | -----------: |
| first sound after load |  0.8 s |        2.8 s |
| intensity +1           |  1.6 s |        4.2 s |
| intensity −1           |  3.0 s |        2.5 s |
| intensity +2           |  1.3 s |       10.3 s |
| 0-1-0-1 within 1 s     |   ~2 s |         ~2 s |
| track switch           |  9.5 s |       12.2 s |
| an edit in the editor  | 0.75 s |        5.0 s |

With changes 8 s apart, the renderer is still filling the last level when
the next change comes. In Chromium an intensity change is heard 11 to 14 s
late.

**superdough's node pools.** superdough 1.3.0 pools filters and supersaws
per module, not per context, so the next `OfflineAudioContext` gets nodes
from the last one, and `connect` throws `InvalidAccessError`. The pool is
not exported, and aliasing to superdough's sources fails because they need
Strudel's `?audioworklet` Vite plugin. The prototype empties the pools with
silent probes before each render (`cutoff`, not `lpf`, which superdough does
not pool), and retries an event that meets a stale node. No event fails,
at about 40 extra superdough calls per chunk. That is a workaround for
superdough's internals, and it breaks the day they change.

**Verdict: the default path stays live.** Render-ahead removes the
load-dependent underruns, but as built it is too slow in Chromium, over
the memory budget in Firefox, and seconds late to every change the fight
makes. Levers that might close the gap, none tried:

- 8-cycle chunks, which cut the tail overhead by about a quarter;
- rendering the neighbours of the playing chunk before the wanted level's
  later chunks;
- the reverb live on the bus, one node, instead of baked into every tail.

A real-device run (desktop Firefox, a phone) is wanted before the default
path ever flips. The architect asks the operator for it.

### 10. A lower DSP budget (#446)

After #448 and #509 what still scales with load is the size of the live
audio graph, and the operator still heard cracks in a match at the top
intensity levels. The budget went from 90 to **50** (`MAX_DSP_COST`, still
provisional until a validated device measurement); the ruler (`cost.mjs`)
did not move. 23 of 31 levels were over. They were trimmed with the levers
that keep the character, in this order:

1. A pad no longer overlaps the next chord. A chord-held `supersaw` or
   `sawtooth` voice used `release` of 1 to 3 s over a chord of a cycle or
   two, so two five-note chords sounded at once (10 voices). The pad now
   ends at 90% of its chord (`.clip(.9)`) with a release inside the last
   10%; the reverb tail and the slow `attack` of the next chord cover the
   join. This alone took 15 levels under.
2. `unison` of the pads: 3 to 2 on northern-pass and clash-of-banners; 2
   to 1 on the strings of victors-hymn and hall-of-champions (one detuned-less
   saw, under a second saw voice).
3. Shorter releases on lines that overlapped themselves (ember-deep's stabs,
   northern-pass's horn and whistle, hall-of-champions's bass and brass,
   victors-hymn's tune and bass).
4. Two timbre changes, both flagged for the ear: hall-of-champions's level-3
   choir is a triangle chord with no filter, not a resonant saw (−10); and
   victors-hymn's level-1 war drum lost its 700 Hz low-pass (−2).

The peak gain numbers fall too (the overlap was part of them); levels still
rise with intensity, so no top level is quieter than the one below it.
Measured with `music:check`; the Firefox `audiostress` before/after table
could not be run in the agent sandbox and is the operator's run.

### 11. Firefox crackle (#1991)

The operator still heard crackle in desktop Firefox at intensity above 0
while the page worked hard. Two known paths could click, and both now
cannot:

1. **A late note is left out.** `defaultOutput` used to start a note whose
   onset had passed, its envelope begun in the past: a truncated attack.
   A note due sooner than `LATE_MARGIN_SECONDS` (0.01 s) after the audio
   clock is now dropped (`host/late-notes.ts`), a tiny gap rather than a
   click, and counted as `droppedEvents`, which replaces `lateEvents`.
2. **A stall longer than the lead skips to live in one tick.** After one,
   `catchUpTick` ran up to four ticks back to back, every note in them due
   at once or past. A clock the audio has passed is reset instead, and
   ticks once, `LEAD_SECONDS` ahead.

Measured with `scripts/music-stress.mjs --browser firefox` (Playwright
Firefox, null sink, unvalidated as in §8; underrun ms over 30 s, before →
after). The headless Firefox has no WebGL, so "no stress" is the character
builder:

| Load            | Intensity 0 | Intensity 2 |
| --------------- | ----------- | ----------- |
| menu, no stress | 92 → 77     | 319 → 37    |
| no stress       | 103 → 28    | 607 → 48    |
| stress=40       | 124 → 165   | 1208 → 158  |
| audiostress 1.5 | 470 → 698   | 1733 → 810  |
| audiostress 2.5 | 5300 → 9400 | 7144 → 6979 |

Late and dropped events were 0 and skipped music 0 ms in every run,
before and after. Under this harness neither path ever fired, and the
underrun numbers move with the load on the sandbox host (one discarded
intensity-2 run on a busy host read 1 to 17 s), not with the change. What
underruns is the audio thread itself. The fixes close the click paths a
real main-thread stall opens; whether that was the crackle is the
operator's ear check on desktop Firefox.

One reverb on the bus, the lever §9 lists, was not built. It was a lever
for render-ahead, which baked a reverb into every tail. The live path
already has one convolver: superdough keeps one per orbit, and every
track is wet only on orbit 2 (`MUSIC_ROOMS`). A bus reverb would cost the
same convolution and lose each voice's own wet level. A shorter impulse
response or a lower `MAX_DSP_COST` is the next lever, and a card of its
own if the crackle is still heard.

## The scheduler works ahead

Strudel's cyclist queries slots up to 0.2 s past its clock and skips every
slot already behind it. A tick the main thread delivers late finds the
clock moved on and its slots skipped: a dropout. A note queried late but
before its time starts off the beat: a crack. Worker timers only make the
tick fire on time; its callback still waits for the main thread. Where the
host shares that thread (Android Chrome, Firefox), a match's stalls are
enough to hear.

**Decision (#448): the scheduler's clock runs `LEAD_SECONDS` (0.75 s)
ahead of `context.currentTime`** (`host/lead-clock.ts`). Every note is
queried and handed to Web Audio at least that long before it plays; once
a node exists the audio thread plays it on time however busy the main
thread is. The price is that an intensity step, a switch, an edit and a
jukebox preview are heard up to 0.75 s later, and a stop must not be:
`host/bus-gate.ts` ramps the music bus to 0 in 50 ms on `stop` and opens
it again when the next pattern's first note can sound. Volume and mute
ramp the bus as before.

- **A constant shift is not enough.** The first design passed
  `context.currentTime + LEAD` as `getTime`. The cyclist then looks ahead
  from, and skips behind, the shifted time, so the shifted lookahead
  moves with it and a 0.6 s stall skips as many slots as before (the
  unit test keeps this as a control). The clock moves on by at most 0.2 s,
  the cyclist's own lookahead, per reading, so a late tick resumes where
  the last stopped; `catchUpTick` runs the tick again until the clock has
  closed the gap, since one tick only covers 0.2 s of music.
- **Rejected: a Worker.** `AudioContext` and node creation exist only on a
  window's main thread.
- **Rejected: an AudioWorklet.** It would mean rewriting superdough's
  synths, samples and effects as DSP: a new engine.
- **Rejected: queries in a Worker, nodes on the main thread.** It saves
  the roughly 4 % the queries cost, and the nodes are still made on the
  stalled thread.
- **Measured** with `node scripts/music-stress.mjs --browser chromium
--only match` (Armor ladder, SFX, HUD and key mashing; there is no 4v4
  with bots locally). The box was very noisy (load 8–18), so only the
  clean runs count:

  | Screen, CPU throttle | Skipped, before | Skipped, after | Late events, before | Late events, after |
  | -------------------- | --------------: | -------------: | ------------------: | -----------------: |
  | match, 4x            |          150 ms |           0 ms |                  17 |                  0 |
  | training, 4x         |          900 ms |           0 ms |                   – |                  – |

  A later no-throttle run: 0 ms skipped, 0 late events. A 4x run on a
  loaded box skipped 26.5 s and 6x ran too few ticks to say anything:
  those are noise, not results.

- **Not above 1 s.** More lead would hide a main thread that is too busy;
  that is the game's to fix.

## Budgets

Step 4 builds to these budgets, and QA (step 8) checks them.

| Budget                                                         | Ceiling                  | Measured               |
| -------------------------------------------------------------- | ------------------------ | ---------------------- |
| Host chunk, gzip                                               | **200 kB**               | 189.4 kB               |
| Game chunk growth from the host client and protocol            | 2 kB gzip                | 0, with no engine code |
| Beat editor chunk, gzip, lazy, game side                       | **140 kB**               | 136.8 kB (#373)        |
| Music host main thread, intensity 3, 4v4                       | **8 % of a core**        | 3.9 % at intensity 2   |
| Game page script time, music on minus off (median of ≥ 5 runs) | **≤ 1 percentage point** | below noise            |
| Sound palette                                                  | 3 MB                     | –                      |
| Worker-backed timers                                           | **required**             | –                      |
| Audio-thread DSP cost of what sounds at once (`music:check`)   | **50** (provisional)     | 24 to 49, per level    |
| Reverb                                                         | one room: orbit 2 6 s    | –                      |

The DSP cost and the room are checked by `pnpm music:check` (#508), with no
audio device. A voice costs what superdough builds for it (a supersaw its
`unison` voices, each filter, `vowel` a bank of five, a worklet effect two),
for as long as it sounds, release included, and each orbit with a wet voice adds
a cost per second of its `roomsize`. The ceiling and the weights are
provisional until #507 can say which cost plays without underruns in Firefox.
Every track uses the same reverb (`MUSIC_ROOMS` in `cost.mjs`), so a track
switch never rebuilds the impulse response.

What we cut to stay within budget:

- **`@strudel/codemirror`** costs 303 kB. It ships vim, emacs and VS Code
  keymaps, and its own REPL glue. The beat editor uses a minimal CodeMirror
  6 instead, as its own lazy chunk in the game page. The editor only edits
  text; evaluation happens in the host.
- **`@strudel/soundfonts`** costs 26 kB. It downloads each `gm_*`
  instrument as a JavaScript file and runs it with `eval`. The palette's
  instruments ship as samples in `strudel.json` instead.

## What failed during the spike

1. **The host would not load at all** until static files sent
   `Access-Control-Allow-Origin` (measurement 4).
2. **Two copies of core.** `@strudel/webaudio` 1.2.6 depends on
   `@strudel/core` 1.2.5, which installs a second core and a second
   `Pattern` class beside 1.2.6. Version 1.3.0 depends on core 1.2.6.
3. **Silent frames are throttled.** A `display: none` host that makes no
   sound is throttled in a visible tab (measurement 3).
4. **`pnpm add` fails on `main`.** The lockfile already holds
   `rolldown@1.2.15`, which is younger than `minimumReleaseAge`.
   `@colyseus/uwebsockets-transport` pulls `uWebSockets.js` from git, which
   `blockExoticSubdeps` refuses. The spike installed with both settings
   overridden on the command line. That is not acceptable for a real
   dependency change, and is left to CI/CD.
5. **The spike's host has no origin guard.** It checks `event.source`, but
   it would evaluate a pattern if opened top-level. Review caught this. Step
   4 must not lift the host without adding the guard from the Decision.
6. **Vite 8 deprecates `build.rollupOptions`**, and ESLint fails on it. The
   second entry goes under `build.rolldownOptions.input`.

## Consequences

- The game gains a second page entry and a cross-origin boundary. Every
  call across it is a typed `postMessage`, validated in both directions
  (#366 §3.1).
- The engine's cost lands in another renderer process, not on the game's
  main thread. Step 8 measures the host frame's own target, not the game
  page.
- Every server that serves the client must send
  `Access-Control-Allow-Origin: *` on static files, or music silently never
  starts. Step 4 adds an e2e test that the host reports `ready` from the LAN
  server build.
- `music-host.html` opened on its own shows nothing and does nothing. It
  is not a page for people, and its guard is the security boundary, so a
  change to the guard needs the same review as a change to the sandbox.
- A hidden-tab regression cannot be caught by Playwright, which never hides
  a page. It needs headful Chromium and a CDP tab switch, as in the spike.
- Intensity reacts within a quarter second, but not on the beat unless the
  host latches it.
- Strudel is a large dependency: 189 kB gzip, loaded only after a gesture.
  It is kept to five pinned packages.

## Alternatives Considered

- **A. Pre-rendered audio files.** These cannot follow intensity live and
  cannot be edited by players. Pre-rendering survives only as a build tool:
  for sound effects (#366 §2.1), and for previews in pull requests.
- **C. Events computed server-side, played by our own sampler.** This
  means rebuilding superdough's envelopes, filters and reverb, which is the
  hard part of Strudel.
- **Tidal Cycles or SuperCollider.** Both are native programs, not
  browser code. They cannot run in the client.
- **`initStrudel()` from `@strudel/web` in the game page.** At import it
  touches `window`, patches `Pattern.prototype.play` and turns on
  `miniAllStrings`. It does not register soundfonts. It would also run
  player patches with the game's origin.
- **The same-origin iframe or a Worker** instead of a sandboxed frame.
  - A same-origin frame gives a pasted patch the game's `localStorage`.
  - Web Audio is not available in a Worker.
