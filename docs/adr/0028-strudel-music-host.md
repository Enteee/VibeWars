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
  the game's storage, session or DOM.
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

- **The engine never runs on the game's main thread.** Chromium puts the
  sandboxed frame in its own renderer process: CDP lists it as a separate
  `iframe` target. The game page shows no measurable cost, and noise
  between runs is larger than any difference.
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

Firefox and Safari were not tested: neither is in the dev shell.

## Budgets

Step 4 builds to these budgets, and QA (step 8) checks them.

| Budget                                                         | Ceiling                  | Measured               |
| -------------------------------------------------------------- | ------------------------ | ---------------------- |
| Host chunk, gzip                                               | **200 kB**               | 189.4 kB               |
| Game chunk growth from the host client and protocol            | 2 kB gzip                | 0, with no engine code |
| Beat editor chunk, gzip, lazy, game side                       | **140 kB**               | 134.7 kB (minimal CM6) |
| Music host main thread, intensity 3, 4v4                       | **8 % of a core**        | 3.9 % at intensity 2   |
| Game page script time, music on minus off (median of ≥ 5 runs) | **≤ 1 percentage point** | below noise            |
| Sound palette                                                  | 3 MB                     | –                      |
| Worker-backed timers                                           | **required**             | –                      |

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
5. **Vite 8 deprecates `build.rollupOptions`**, and ESLint fails on it. The
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
