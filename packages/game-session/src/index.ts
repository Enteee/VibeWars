/**
 * `@vibewars/game-session`: peer-to-peer match sessions (#15). Pure: no
 * DOM, no Node, no transport library; a `Transport` is handed in. The
 * memory transport for tests is `@vibewars/game-session/testing`.
 */

export type { Transport } from "./transport.js";

export type {
  CombatBatchMessage,
  CombatMessage,
  MatchConnection,
  MatchSnapshot,
  PlayerSnapshot,
  ProjectileSnapshot,
  SkillSlot,
  SlotRecharge,
} from "./match-connection.js";
export { MESSAGE_BURST, MESSAGES_PER_SECOND, MessageBudget } from "./intent-budget.js";
export type { DropReport } from "./intent-budget.js";
export { sanitizeName } from "./names.js";
export { RECHARGE_TOLERANCE_SECONDS, rechargePredicted, rechargeSlots } from "./recharge.js";
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
export type { HostMap, MatchHost, MatchHostOptions } from "./match-host.js";
export {
  HostLeftError,
  MatchRefusedError,
  MatchTimeoutError,
  connectMatch,
} from "./match-client.js";
export type { ConnectMatchOptions, PeerMatchConnection } from "./match-client.js";
