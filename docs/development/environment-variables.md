# Environment Variables

There is no server to configure (ADR-0022): the game is the static web
client. What stays is read when the client is built, and one variable for
`pnpm run dev`.

## Web client build variables

Read by Vite when it builds `apps/web`, not at runtime.

| Variable                   | Default    | Meaning                                                                                                                                                                                                                                                                                |
| -------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIBEWARS_BASE`            | `/`        | The sub-path the client is served under, as GitHub Pages deploys it (`/VibeWars/`, `/VibeWars/next/`). It also names the client's storage (`storage/namespace.ts`).                                                                                                                    |
| `VITE_VIBEWARS_TRANSPORT`  | `trystero` | How peers reach each other (#403): `trystero` over WebRTC and public Nostr relays, or `broadcast` over a BroadcastChannel, which only reaches tabs of one browser. e2e builds `broadcast`; every other build plays over Trystero. Anything else fails the build.                       |
| `VIBEWARS_BUILD`           | `dev`      | This build's id (#1268), stamped into the bundle and written beside `index.html` as `build.json`. `pages.yml` passes the commit it builds, e2e `e2e`. A tab whose id differs from the served `build.json` offers a reload. `dev` never checks. Letters, digits, `.`, `_` and `-` only. |
| `VIBEWARS_RELEASE`         | `dev`      | This build's release (#2798), shown with the build at the foot of Help. `pages.yml` passes it per target: the tag without its `v` for `release`, `0.2.0-rc` for `rc`, `next` for `next`.                                                                                               |
| `VITE_VIBEWARS_STRESS`     | unset      | `on` only in the build `scripts/music-stress.mjs` makes, the one where `?stress=` works (#420).                                                                                                                                                                                        |
| `VITE_VIBEWARS_LOBBY_SEED` | unset      | A decimal integer that seeds each Team Lobby's random picks (preset foes, tied votes, maps), so every solo match meets the same foe (#2213). Only e2e sets it (`11`). Keys, tokens and matches stay on `crypto`. Anything that is not a decimal integer fails the build.               |
| `VITE_VIBEWARS_SPLASH`     | unset      | `off` only in the e2e build: no splash screen (#2884) unless the URL has `?splash`.                                                                                                                                                                                                    |

## Development

| Variable               | Default | Meaning                                       |
| ---------------------- | ------- | --------------------------------------------- |
| `VIBEWARS_CLIENT_PORT` | `5173`  | The port `pnpm run dev` serves the client on. |
