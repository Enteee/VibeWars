/**
 * `@vibewars/game-protocol` — the contract between browser and server.
 *
 * This package is intentionally dependency-free and holds *only* the wire
 * vocabulary. Game rules live in `@vibewars/game-core`; transport lives in the
 * server app. Keeping them apart is what lets us write headless protocol tests
 * (see `docs/adr/0002-networking.md`).
 *
 * Clients send *intent*. They never send outcomes — no damage numbers, no
 * positions, no cooldown state. See `docs/adr/0002-networking.md` §Security.
 */

export {
  PROTOCOL_VERSION,
  ROOM_MATCH,
  isLobbyCode,
  normalizeLobbyCode,
  parseClientIntent,
  LOBBY_CODE_LENGTH,
  LOBBY_CODE_ALPHABET,
} from "./protocol.js";
export type {
  ClientIntent,
  MoveIntent,
  StopIntent,
  TargetIntent,
  ServerHello,
  MapDescriptor,
  WallDescriptor,
  RectWallDescriptor,
  PolygonWallDescriptor,
} from "./protocol.js";
