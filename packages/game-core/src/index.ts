/**
 * `@vibewars/game-core` — pure game-domain primitives.
 *
 * Nothing in this package may import a renderer, a network library, a browser
 * API, or the system clock. Everything here must be deterministic and
 * unit-testable in isolation (see `docs/adr/0001-architecture.md`).
 */

export type { SimulationRng } from "./rng.js";
export { createRng, seedFromString } from "./rng.js";

export type { Vec2 } from "./vec2.js";
export * as Vec from "./vec2.js";
export { ZERO, length, normalize, vec2 } from "./vec2.js";

export { clampInputDirection, integrateMovement } from "./movement.js";

export type { MovementRules, Ruleset } from "./ruleset.js";
export { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
