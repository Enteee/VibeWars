/**
 * `@vibewars/game-session/testing`: what a test needs and a match never
 * does. The memory transport, and the contract every transport runs.
 */

export { createMemoryNetwork } from "./memory-transport.js";
export type { MemoryNetwork } from "./memory-transport.js";
export { transportContract } from "./transport-contract.js";
export type { ContractNetwork } from "./transport-contract.js";
