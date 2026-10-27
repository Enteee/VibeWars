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

export { PROTOCOL_VERSION } from "./protocol-version.js";

export {
  PROTOCOL_MISMATCH_MESSAGE,
  MAX_LOBBY_PLAYERS,
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
  CancelIntent,
  WalkToIntent,
  CastRefusedMessage,
  RechargeMessage,
  RechargeSlot,
  MapDescriptor,
  WallDescriptor,
  RectWallDescriptor,
  PolygonWallDescriptor,
  LobbyPhase,
  SkillBarSlot,
  CombatMessage,
  CombatBatchMessage,
} from "./protocol.js";

export {
  CHANNELS,
  MAX_WIRE_STRING,
  MAX_WIRE_TEXT,
  MAX_WIRE_STATUSES,
  MAX_WIRE_STATUS_INDEX,
  MAX_WIRE_EVENTS,
  MAX_WIRE_SLOTS,
  MAX_WIRE_PINGS,
  MAX_WIRE_MORALE,
  MAX_WIRE_PIPS,
  MIN_WIRE_MORALE,
  MAX_WIRE_RANK,
  MAX_WIRE_RANKS,
  MAX_WIRE_WALLS,
  MAX_WIRE_POINTS,
  MAX_WIRE_RADIUS,
  MAX_WIRE_COMBATS,
  MAX_WIRE_PROJECTILES,
  MAX_SNAPSHOT_PARTS,
  MAX_WIRE_JSON_DEPTH,
  MAX_WIRE_JSON_VALUES,
  helloProtocolVersion,
  parsePeerHello,
  parsePeerBye,
  parsePeerCall,
  parseWireCalls,
  parsePeerRejoinChallenge,
  parsePeerRejoinProof,
  parsePeerWelcome,
  parsePeerRefuse,
  parseWireSnapshotPart,
  parseWireCombatBatch,
  parseWireSkillBar,
  parseWireEnded,
  parseCastRefused,
  parseRecharge,
  LOBBY_REFUSALS,
  parsePeerLobbyJoin,
  parseWireLobbyState,
  parseWireLobbyCommand,
  parseWireLobbyNote,
  parseWireMatchStart,
} from "./p2p.js";

export type {
  Channel,
  PeerHello,
  PeerBye,
  PeerCall,
  WireCalls,
  WirePing,
  PeerRejoinChallenge,
  PeerRejoinProof,
  PeerWelcome,
  PeerRefuse,
  WirePlayer,
  WireSnapshot,
  WireSnapshotPart,
  WireCombatEvent,
  WireCombat,
  WireCombatBatch,
  WireProjectile,
  JsonValue,
  WireSkillBar,
  WireEnded,
  PeerLobbyJoin,
  WireLobbyCharacter,
  WireLobbyPlayer,
  WireLobbyState,
  WireLobbyCommand,
  WireLobbyNote,
  LobbyRefusal,
  WireMatchStart,
} from "./p2p.js";
