import type { StatusDefinition } from "../status.js";
import { define } from "./define.js";

/**
 * What harmful ground does beyond the conditions it reuses (#3027): GW1's
 * environment effects, which nothing removes; only leaving the ground,
 * so the status runs out, or a death ends one.
 */
export type EnvironmentStatusId = "mired" | "fouled";

export const ENVIRONMENT_STATUSES: Readonly<Record<EnvironmentStatusId, StatusDefinition>> = {
  // Quicksand: 15% slower, and 1 Energy lost to every attack and skill.
  mired: define("mired", "Mired", "environment", {
    moveSpeedMultiplier: 0.85,
    energyLossOnAction: 1,
  }),
  // Swamp water.
  fouled: define("fouled", "Fouled", "environment", { healthPips: -1 }),
};
