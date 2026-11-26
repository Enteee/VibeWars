import { describe, expect, it } from "vitest";

import { isAttacking } from "./attacking.js";
import { makeCombatant } from "./testing.js";

describe("isAttacking (#988, #1142)", () => {
  it("holds for an auto-attack or an attack skill, not idle, a spell, the run-up or dead", () => {
    const swinging = makeCombatant({ id: "t" });
    swinging.attack = { targetId: "x", swingElapsed: 0, unreachableSeconds: 0 };
    expect(isAttacking(swinging)).toBe(true);

    const striking = makeCombatant({ id: "t" });
    striking.cast.beginCast("assassin.jagged-strike", "x", 0.5, undefined);
    expect(isAttacking(striking)).toBe(true);

    const approaching = makeCombatant({ id: "t" });
    approaching.attack = { targetId: "x", swingElapsed: 0, unreachableSeconds: 0 };
    approaching.moving = true;
    expect(isAttacking(approaching)).toBe(false);

    const casting = makeCombatant({ id: "t" });
    casting.cast.beginCast("elementalist.fireball", "x", 2, undefined);
    expect(isAttacking(casting)).toBe(false);

    expect(isAttacking(makeCombatant({ id: "t" }))).toBe(false);

    const dead = makeCombatant({ id: "t", dead: true, health: 0 });
    dead.attack = { targetId: "x", swingElapsed: 0, unreachableSeconds: 0 };
    expect(isAttacking(dead)).toBe(false);
  });
});
