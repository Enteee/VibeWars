# ADR-0009: Production Deployment

## Status

Accepted (2026-10-23); container build to be validated on a devenv-capable
machine (see ADR-0007's sandbox caveat — this cannot be executed from inside
the current sandbox).

## Context

The brief requires a single OCI image, built via devenv's own container
facilities, serving both the built web client and the game server over one
HTTP/WebSocket port, with no database and minimal configuration (§26–§27).

## Decision

- **One process serves both** the static web build and Colyseus traffic:
  `apps/server/src/server.ts`'s `express` hook serves `VIBEWARS_WEB_ROOT`
  (defaulting to not serving a client at all if unset, rather than assuming
  a path) and falls back to `index.html` for any non-API GET, so the SPA's
  client-side routes survive a reload. This was verified directly: the built
  client (`apps/web/dist`) was served by a running server instance, and both
  `/healthz` and a deep link (`/lobby/A7KQ`) returned correctly over real
  HTTP.
- Configuration is environment-variable only, with LAN-friendly defaults
  (`apps/server/src/config.ts`): `PORT` defaults to `2567`, `HOST` defaults
  to `0.0.0.0` (binds all interfaces, since the primary use case is "friends
  on the same LAN," not localhost-only), `VIBEWARS_WEB_ROOT` is optional,
  and `VIBEWARS_MAX_ROOMS` caps the rooms the server holds (default 200,
  #114).
  `parsePort`/`parseBoolean` reject malformed values loudly rather than
  silently coercing `"abc"` into a fallback port.
- `devenv.nix` will define a `containers.prod` entry (devenv's
  `nix2container`-backed container support, confirmed present in current
  devenv docs) whose `copyToRoot` is the built `apps/web/dist` +
  `apps/server/dist` + production `node_modules`, and whose
  `startupCommand` runs `node apps/server/dist/main.js`. This is added in
  the Sprint 0 repository-foundation work alongside `devenv.nix`'s dev-shell
  definition, not deferred, since the brief lists it as a Sprint 0
  deliverable ("verify production container").
- `/healthz` is deliberately stateless (no lobby/room enumeration) so a
  container orchestrator's liveness probe cannot be used to fingerprint
  active matches.

## Consequences

- A LAN host's full workflow is `docker run -p 2567:2567 vibewars` (or the
  `devenv container run prod` equivalent) with zero required configuration,
  directly satisfying brief §46 ("No manual development environment setup
  beyond the documented Nix/devenv workflow" — extended here to "no runtime
  configuration" for the common case).
- Binding `0.0.0.0` by default is a deliberate LAN-party choice; a host on an
  untrusted network should override `HOST`, which this ADR does not attempt
  to prevent since network-level trust is outside this project's scope (no
  authentication system exists or is planned for v1 — brief §3, §42).
- The container build itself could not be executed end-to-end in this
  sandbox (ADR-0007); it is written to the same specification a working
  devenv machine would use, and must be validated there before being treated
  as proven rather than merely reviewed.

## Alternatives Considered

- **Separate containers for client (nginx) and server.** Rejected: adds a
  reverse-proxy/CORS configuration step the brief explicitly wants to avoid
  for a LAN host (§27: "work on arbitrary container infrastructure,"
  "require minimal configuration").
- **A generic Dockerfile instead of devenv's container support.** Rejected
  per brief §27 ("Use devenv container facilities... unless technically
  necessary" to use something else) — no such necessity was found.
