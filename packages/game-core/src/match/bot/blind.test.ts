import { describe, expect, it } from "vitest";

import { getSkill } from "../../skills/catalog.js";
import { NO_RANKS } from "../../skills/status.js";
import type { Skill } from "../../skills/types.js";
import { vec2 } from "../../vec2.js";
import type { MatchSimulation } from "../simulation.js";
import { blindStatus, blindTarget } from "./blind.js";
import { ELEMENTALIST, MONK, WARRIOR, fighter, match } from "./rules/test-support.js";

const skill = (id: string): Skill => {
  const found = getSkill(id);
  if (found === undefined) throw new Error(`no skill ${id}`);
  return found;
};

const BLINDING_FLASH = skill("elementalist.blinding-flash");

describe("blindStatus (#4239)", () => {
  it("is true for Blinding Flash", () => {
    expect(blindStatus(BLINDING_FLASH)).toBe(true);
  });

  it("is false for a skill that blinds its user too (#2132)", () => {
    expect(blindStatus(skill("mesmer.signet-of-midnight"))).toBe(false);
  });

  it("is false for a blind inside an if", () => {
    expect(blindStatus(skill("elementalist.steam"))).toBe(false);
  });

  it("is false for a skill that only deals damage", () => {
    expect(blindStatus(skill("elementalist.fireball"))).toBe(false);
  });
});

describe("blindTarget (#4239)", () => {
  /** An elementalist at (400, 400), its monk at (300, 600), `d` at (340, 600), `w` at (600, 400), `c` an elementalist at (500, 300). */
  function field(): MatchSimulation {
    return match([
      fighter("e", 0, ELEMENTALIST, vec2(400, 400)),
      fighter("monk", 0, MONK, vec2(300, 600)),
      fighter("d", 1, WARRIOR, vec2(340, 600)),
      fighter("w", 1, WARRIOR, vec2(600, 400)),
      fighter("c", 1, ELEMENTALIST, vec2(500, 300)),
    ]);
  }

  /** `id` swinging at `targetId`. */
  function swing(sim: MatchSimulation, id: string, targetId: string): void {
    const foe = sim.get(id);
    if (foe === undefined) throw new Error(`no ${id}`);
    sim.setTarget(id, targetId);
    foe.combatant.attack = { targetId, swingElapsed: 0.1, unreachableSeconds: 0 };
  }

  function aim(sim: MatchSimulation, blind = BLINDING_FLASH): string | undefined {
    const all = [...sim.participants()];
    const self = all.find((each) => each.id === "e");
    if (self === undefined) throw new Error("no elementalist");
    return blindTarget(
      blind,
      self,
      all.filter((each) => each.combatant.team === 0),
      all.filter((each) => each.combatant.team === 1),
      blind.range,
      () => true,
    );
  }

  it("picks the attacker diving its healer over a nearer one", () => {
    const sim = field();
    swing(sim, "w", "e");
    swing(sim, "d", "monk");
    expect(aim(sim)).toBe("d");
  });

  it("picks an attacker on an ally over one hitting something else", () => {
    const sim = field();
    swing(sim, "w", "e");
    swing(sim, "d", "c");
    expect(aim(sim)).toBe("w");
  });

  it("skips an attacker already blind", () => {
    const sim = field();
    swing(sim, "d", "monk");
    swing(sim, "w", "e");
    sim.get("d")?.combatant.statuses.apply("blind", 10, "x", NO_RANKS);
    expect(aim(sim)).toBe("w");
  });

  it("is nothing with only casters around, or for a skill that blinds nobody", () => {
    const sim = field();
    expect(aim(sim)).toBeUndefined();
    swing(sim, "d", "monk");
    expect(aim(sim, skill("elementalist.fireball"))).toBeUndefined();
  });
});
