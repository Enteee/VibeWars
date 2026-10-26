# Environment Variables

There is no server to configure (ADR-0022): the game is the static web
client. What stays is read when the client is built, and one variable for
`pnpm run dev`.

## Web client build variables

Read by Vite when it builds `apps/web`, not at runtime.

| Variable                  | Default    | Meaning                                                                                                                                                                                                                                                          |
| ------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIBEWARS_BASE`           | `/`        | The sub-path the client is served under, as GitHub Pages deploys it (`/VibeWars/`, `/VibeWars/next/`). It also names the client's storage (`storage/namespace.ts`).                                                                                              |
| `VITE_VIBEWARS_TRANSPORT` | `trystero` | How peers reach each other (#403): `trystero` over WebRTC and public Nostr relays, or `broadcast` over a BroadcastChannel, which only reaches tabs of one browser. e2e builds `broadcast`; every other build plays over Trystero. Anything else fails the build. |
| `VITE_VIBEWARS_STRESS`    | unset      | `on` only in the build `scripts/music-stress.mjs` makes, the one where `?stress=` works (#420).                                                                                                                                                                  |

## Development

| Variable               | Default | Meaning                                       |
| ---------------------- | ------- | --------------------------------------------- |
| `VIBEWARS_CLIENT_PORT` | `5173`  | The port `pnpm run dev` serves the client on. |
