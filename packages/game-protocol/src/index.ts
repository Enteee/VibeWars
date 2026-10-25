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
  PROTOCOL_MISMATCH_MESSAGE,
  ROOM_LIMIT,
  SERVER_FULL_MESSAGE,
  CLIENT_LIMIT,
  ADDRESS_LIMIT,
  ADDRESS_LIMIT_MESSAGE,
  ROOM_MATCH,
  ROOM_LOBBY,
  MAX_LOBBY_PLAYERS,
  QUICK_MATCH_MAX_PLAYERS,
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
  UseSkillIntent,
  AttackIntent,
  CancelAttackIntent,
  CastRefusedMessage,
  RechargeMessage,
  RechargeSlot,
  ServerHello,
  MapDescriptor,
  WallDescriptor,
  RectWallDescriptor,
  PolygonWallDescriptor,
  LobbyPhase,
  MatchJoinOptions,
  LobbyJoinOptions,
  LobbyChooseTeamMessage,
  LobbyReadyMessage,
  LobbySelectMapMessage,
  LobbyMatchStartingMessage,
  MatchSeatReservation,
} from "./protocol.js";
