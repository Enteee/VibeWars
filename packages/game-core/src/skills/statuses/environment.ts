import type { StatusDefinition } from "../status.js";
import { define } from "./define.js";

/**
 * What ground does beyond the conditions it reuses (#3027, #3028): GW1's
 * environment effects, which nothing removes; only leaving the ground,
 * so the status runs out, or a death ends one.
 */
export type EnvironmentStatusId =
  "mired" | "fouled" | "refreshed" | "fleet" | "tainted" | "drained";

export const ENVIRONMENT_STATUSES: Readonly<Record<EnvironmentStatusId, StatusDefinition>> = {
  // Quicksand: 15% slower, and 1 Energy lost to every attack and skill.
  mired: define("mired", "Mired", "environment", {
    moveSpeedMultiplier: 0.85,
    energyLossOnAction: 1,
  }),
  // Swamp water.
  fouled: define("fouled", "Fouled", "environment", { healthPips: -1 }),
  // A spring's clear water (#3028).
  refreshed: define("refreshed", "Refreshed", "environment", { healthPips: 3 }),
  // A grove's open ground: 25% faster, under the speed-boost rules (#3028).
  fleet: define("fleet", "Fleet", "environment", { moveSpeedMultiplier: 1.25 }),
  // Tainted water: 15 Health lost to every skill paid for (#3028).
  tainted: define("tainted", "Tainted", "environment", { healthLossOnSkill: 15 }),
  // A draining spire's pull on Energy (#3028).
  drained: define("drained", "Drained", "environment", { energyPips: -3 }),
};
