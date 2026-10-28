/**
 * `@vibewars/game-session`: peer-to-peer match sessions (#15). Pure: no
 * DOM, no Node, no transport library; a `Transport` is handed in. The
 * memory transport for tests is `@vibewars/game-session/testing`.
 */

export { MAX_MESSAGE_BYTES, messageBytes, sizeChecked } from "./transport.js";
export { packCombat } from "./combat-batches.js";
export { packSnapshot, snapshotAssembler } from "./snapshot-parts.js";
export type { Transport, TransportTrouble } from "./transport.js";

export { NO_CALLS } from "./match-connection.js";
export { PING_SECONDS, createCallBoard } from "./calls.js";
export type { CallBoard } from "./calls.js";
export type {
  CallsSnapshot,
  CombatBatchMessage,
  CombatMessage,
  MatchConnection,
  MatchSnapshot,
  PlayerSnapshot,
  ProjectileSnapshot,
  SkillSlot,
  SlotRecharge,
  StatusSnapshot,
} from "./match-connection.js";
export { MESSAGE_BURST, MESSAGES_PER_SECOND, MessageBudget } from "./intent-budget.js";
export type { DropReport } from "./intent-budget.js";
export { sanitizeChatText, sanitizeName } from "./names.js";
export { RECHARGE_TOLERANCE_SECONDS, rechargePredicted, rechargeState } from "./recharge.js";
export { adrenalineSlots, sameAdrenaline } from "./adrenaline.js";
export { spawnPoint } from "./spawn-points.js";
export type { SpawnPoint } from "./spawn-points.js";
export type { Json } from "./transport.js";
export { createLocalPeer } from "./local-peer.js";
export {
  MATCH_FULL_MESSAGE,
  MATCH_OVER_MESSAGE,
  RECONNECT_WINDOW_SECONDS,
  createMatchHost,
} from "./match-host.js";
export type { HostMap, MatchHost, MatchHostOptions, PlannedSeats } from "./match-host.js";
export {
  HostLeftError,
  MatchRefusedError,
  MatchTimeoutError,
  connectMatch,
} from "./match-client.js";
export type { ConnectMatchOptions, PeerMatchConnection } from "./match-client.js";
export { generateLobbyCode } from "./lobby-codes.js";
export type {
  ChatLine,
  LobbyCharacter,
  LobbyClosedReason,
  LobbyConnection,
  LobbyPlayerSnapshot,
  LobbySnapshot,
  MatchStarting,
} from "./lobby-connection.js";
export { UNNAMED_CHARACTER, lobbyCharacter } from "./lobby-character.js";
export { canStart, createLobbyHost } from "./lobby-host.js";
export type { LobbyHost, LobbyHostOptions, MatchPlan, QueuedPlan } from "./lobby-host.js";
export { LobbyNoAnswerError, LobbyRefusedError, joinLobby } from "./lobby-client.js";
export type { JoinLobbyOptions } from "./lobby-client.js";
export { scopeTransport } from "./scoped-transport.js";
export {
  WIRE_STATUS_IDS,
  sameSkillBar,
  skillBarSlots,
  statusSnapshot,
  wireStatuses,
} from "./wire.js";
export { ROOM_PREFIX, formGroups, groupOf, isLive, ticketsOf } from "./queue-formation.js";
export type { FormGroupsInput, FormedGroup } from "./queue-formation.js";
export { createMemoryBoard } from "./queue-board.js";
export type { MemoryBoard, QueueBoard, QueueBoardEvent } from "./queue-board.js";
export { createQueueClient } from "./queue-client.js";
export type {
  QueueClient,
  QueueClientOptions,
  QueueParty,
  QueueState,
  TicketKey,
} from "./queue-client.js";
export { decideStayTogether } from "./stay-together.js";
export type { StayTogetherDecision, StayTogetherInput } from "./stay-together.js";
export { admissionBytes, admissionDigest } from "./queue-admission.js";
export type { AdmissionTag, QueuedSeat, VerifyTicketSig } from "./queue-admission.js";
