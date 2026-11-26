import { describe, expect, it } from "vitest";

import { distance, vec2 } from "../../vec2.js";
import { DT, MONK, fighter, match, starter } from "./rules/test-support.js";

/** A frontline with no heal of its own, so it falls back rather than heal first. */
const SMASHER = starter("Enraged Smash (W)");

/** 2v2 (#2549): a frontline and a healer against two frontlines, its frontline at a quarter health. */
function play(seed: string) {
  const sim = match(
    [
      fighter("w0", 0, SMASHER, vec2(500, 400)),
      fighter("m0", 0, MONK, vec2(200, 400)),
      fighter("w1", 1, SMASHER, vec2(750, 350)),
      fighter("w2", 1, SMASHER, vec2(750, 450)),
    ],
    seed,
  );
  const w0 = sim.get("w0");
  const m0 = sim.get("m0");
  if (w0 === undefined || m0 === undefined) throw new Error("no side 0");
  w0.combatant.health = w0.combatant.maxHealth * 0.25;
  const before = distance(w0.position, m0.position);
  for (let t = 0; t < 3; t += DT) sim.step(DT);
  const positions = [...sim.participants()].map(
    ({ id, position }) => `${id}@${String(position.x)},${String(position.y)}`,
  );
  return {
    before,
    after: distance(w0.position, m0.position),
    alive: !w0.combatant.dead,
    positions,
  };
}

describe("a badly hurt bot falls back (#2549)", () => {
  it("is nearer its healer within 3 s, and alive", () => {
    const { before, after, alive } = play("flee");
    expect(alive).toBe(true);
    expect(after).toBeLessThan(before);
  });

  it("plays the same twice from one seed", () => {
    expect(play("flee").positions).toEqual(play("flee").positions);
  });
});
