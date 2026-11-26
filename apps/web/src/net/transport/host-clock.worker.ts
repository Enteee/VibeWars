/**
 * The host's clock (#392): a beat every tick, from a Worker, because a
 * hidden tab throttles the page's own timers and a Worker's are spared
 * (ADR-0028, measurement 3). It posts `{ elapsed }`, the seconds since its
 * last post, and keeps no accumulator: `MatchHost.advance` has one.
 */
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "@vibewars/game-core";

// Derived here, not imported from `training/local-connection.ts`, so the
// Worker chunk carries the ruleset and not the training session.
const TICK_SECONDS = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;

let last = performance.now();

function beat(): void {
  const now = performance.now();
  postMessage({ elapsed: (now - last) / 1000 });
  last = now;
  setTimeout(beat, TICK_SECONDS * 1000);
}

setTimeout(beat, TICK_SECONDS * 1000);
