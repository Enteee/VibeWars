import { describe, expect, it } from "vitest";

import { NO_RANKS, type StatusId } from "../../../skills/status.js";
import { vec2 } from "../../../vec2.js";
import { createCursor, decide, type BehaviourCursor } from "../../behaviour.js";
import type { MatchSimulation } from "../../simulation.js";
import { UPKEEP_DROP_SECONDS } from "./drop-upkeep.js";
import { BOT, DT, askBot, body, match } from "./test-support.js";

const MENDING = "monk.mending";
const BALTHAZAR = "monk.balthazars-spirit";
const AURA = "monk.unyielding-aura";

describe("play-build ends its own upkeep when Energy-starved (#2492)", () => {
  /** Monk `m` at `energy`, maintaining `upkeeps` in order, oldest first; ally `a`. */
  function monk(energy: number, upkeeps: readonly [StatusId, string][]): MatchSimulation {
    const sim = match([
      body("m", 0, vec2(0, 0), {
        skillBar: [MENDING, BALTHAZAR, AURA],
        behaviour: BOT,
      }),
      body("a", 0, vec2(60, 0)),
    ]);
    for (const [seq, [status, bearerId]] of upkeeps.entries()) {
      sim.get(bearerId)?.combatant.statuses.maintain(status, "m", seq + 1, NO_RANKS);
    }
    const self = sim.get("m");
    if (self === undefined) throw new Error("no m");
    self.combatant.energy = energy;
    return sim;
  }

  /** One think of `m`'s with `cursor`, as its own between ticks. */
  function think(sim: MatchSimulation, cursor: BehaviourCursor) {
    const self = sim.get("m");
    if (self === undefined) throw new Error("no m");
    return decide(BOT, cursor, {
      self,
      participants: [...sim.participants()],
      dt: DT,
      stepUnits: 1,
      check: () => ({ ok: true }),
      isBot: () => true,
      calledTargetId: undefined,
      sees: () => true,
    });
  }

  it("below its cheapest skill's cost, drops the older of two upkeeps", () => {
    const sim = monk(2, [
      ["balthazars-spirit", "a"],
      ["mending", "m"],
    ]);
    expect(askBot(sim, "m").endUpkeep).toEqual({ targetId: "a", status: "balthazars-spirit" });
  });

  it("never drops Unyielding Aura, its bearer's death", () => {
    const sim = monk(2, [["unyielding-aura", "a"]]);
    expect(askBot(sim, "m").endUpkeep).toBeUndefined();
  });

  it("skips Unyielding Aura for a younger upkeep it may drop", () => {
    const sim = monk(2, [
      ["unyielding-aura", "a"],
      ["mending", "m"],
    ]);
    expect(askBot(sim, "m").endUpkeep).toEqual({ targetId: "m", status: "mending" });
  });

  it("with Energy for its cheapest skill, drops nothing", () => {
    const sim = monk(5, [
      ["balthazars-spirit", "a"],
      ["mending", "m"],
    ]);
    expect(askBot(sim, "m").endUpkeep).toBeUndefined();
  });

  it("drops at most one every UPKEEP_DROP_SECONDS", () => {
    const sim = monk(2, [
      ["balthazars-spirit", "a"],
      ["mending", "m"],
    ]);
    const cursor = createCursor();
    expect(think(sim, cursor).endUpkeep).toBeDefined();
    let dropped = 0;
    for (let t = 0; t < UPKEEP_DROP_SECONDS - 1; t += DT) {
      if (think(sim, cursor).endUpkeep !== undefined) dropped += 1;
    }
    expect(dropped).toBe(0);
    for (let t = 0; t < 1 + DT; t += DT) {
      if (think(sim, cursor).endUpkeep !== undefined) dropped += 1;
    }
    expect(dropped).toBe(1);
  });

  it("ends it in the match: the oldest upkeep leaves its bearer", () => {
    const sim = monk(2, [
      ["balthazars-spirit", "a"],
      ["mending", "m"],
    ]);
    sim.step(DT);
    expect(sim.get("a")?.combatant.statuses.has("balthazars-spirit")).toBe(false);
    expect(sim.get("m")?.combatant.statuses.has("mending")).toBe(true);
  });
});
