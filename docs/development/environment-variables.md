# Server Environment Variables

The server (`apps/server`) is configured entirely through environment
variables, resolved once at startup by `loadConfig()`
(`apps/server/src/config.ts`). Every variable is optional; defaults are
chosen so a LAN host needs zero configuration for the common case.

| Variable            | Default       | Meaning                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`              | `2567`        | TCP port for both HTTP and the WebSocket upgrade. Must be a decimal integer in `1..65535`; anything else fails loudly at startup rather than silently falling back.                                                                                                                                                                                                |
| `HOST`              | `0.0.0.0`     | Interface to bind. Defaults to all interfaces, since the primary use case is "friends on the same LAN," not localhost-only.                                                                                                                                                                                                                                        |
| `VIBEWARS_WEB_ROOT` | auto-detected | Absolute path to the built web client (`apps/web/dist`). If unset, the server looks for a `web/dist` directory at the conventional location relative to its own build output — true for both a local `pnpm run build` and the production container — and serves it automatically. Set this explicitly only if your deployment layout differs from that convention. |
| `VIBEWARS_DEV`      | `false`       | Enables dev-only diagnostics (brief §34's debug overlay data, once implemented). Any of `1`/`true`/`yes`/`on` (case-insensitive) enables it; `0`/`false`/`no`/`off` disables it; anything else is a startup error. Never implicitly on in a production image.                                                                                                      |

`parsePort`/`parseBoolean`/`loadConfig` are unit tested in
`apps/server/src/config.test.ts` — see that file for the exact accepted/
rejected input shapes.
