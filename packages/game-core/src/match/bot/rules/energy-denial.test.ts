import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../../../distances.js";
import { IMPLEMENTED_SKILLS, getSkill } from "../../../skills/catalog.js";
import { vec2 } from "../../../vec2.js";
import type { MatchSimulation } from "../../simulation.js";
import { deniesEnergy } from "../skill-intent.js";
import energy from "./energy.js";
import fight from "./fight.js";
import { ELEMENTALIST, MONK, WARRIOR, fighter, match, ruleFor } from "./test-support.js";

const BURN = "mesmer.energy-burn";

const denies = (id: string): boolean => {
  const skill = getSkill(id);
  return skill !== undefined && deniesEnergy(skill);
};

/**
 * A mesmer bot `m` with `skillBar`, a foe warrior `w` beside it and foe
 * monks at `monks`' x with their Energy.
 */
const at = (skillBar: string[], monks: readonly [number, number][]): MatchSimulation => {
  const sim = match([
    fighter("m", 0, ELEMENTALIST, vec2(400, 400), { skillBar, maxEnergy: 60 }),
    fighter("w", 1, WARRIOR, vec2(500, 400), { behaviour: undefined }),
    ...monks.map(([x], i) =>
      fighter(`monk${String(i)}`, 1, MONK, vec2(x, 450), { behaviour: undefined, maxEnergy: 60 }),
    ),
  ]);
  monks.forEach(([, energy], i) => {
    const monk = sim.get(`monk${String(i)}`);
    if (monk !== undefined) monk.combatant.energy = energy;
  });
  return sim;
};

const fightAt = (sim: MatchSimulation) => fight.decide(ruleFor(sim, "m", { targetId: "w" }));

describe("play-build denies the foe healer's Energy (#4281)", () => {
  it("knows an energy-denial skill by its top-level loss or steal", () => {
    expect(denies(BURN)).toBe(true);
    expect(denies("mesmer.signet-of-weariness")).toBe(true);
    expect(denies("ranger.debilitating-shot")).toBe(true);
    expect(denies("mesmer.power-leak")).toBe(false);
    expect(denies("mesmer.drain-delusions")).toBe(false);
    expect(denies("monk.purge-signet")).toBe(false);
    expect(denies("warrior.dwarven-battle-stance")).toBe(false);
    const listed = IMPLEMENTED_SKILLS.filter(deniesEnergy).map(({ id }) => id);
    expect(listed).toEqual(expect.arrayContaining([BURN, "mesmer.energy-drain"]));
    expect(listed).not.toContain("mesmer.power-leak");
  });

  it("burns a foe monk in range, not the team's target", () => {
    expect(fightAt(at([BURN], [[700, 20]]))).toMatchObject({ useSkillId: BURN, targetId: "monk0" });
  });

  it("burns the team's target when the monk is nearly dry, or out of range", () => {
    expect(fightAt(at([BURN], [[700, 3]]))).toMatchObject({ useSkillId: BURN, targetId: "w" });
    expect(fightAt(at([BURN], [[400 + RANGE_SPELL + 100, 20]]))).toMatchObject({
      useSkillId: BURN,
      targetId: "w",
    });
  });

  it("burns the richer of two foe healers", () => {
    const sim = at(
      [BURN],
      [
        [700, 12],
        [650, 30],
      ],
    );
    expect(fightAt(sim)).toMatchObject({ useSkillId: BURN, targetId: "monk1" });
  });

  it("casts a spell that denies no Energy at the team's target", () => {
    const skill = "elementalist.flare";
    expect(fightAt(at([skill], [[700, 20]]))).toMatchObject({ useSkillId: skill, targetId: "w" });
  });

  it("drains a foe healer before a richer foe that heals none", () => {
    const sim = at(["mesmer.energy-drain"], [[700, 10]]);
    const self = sim.get("m");
    const warrior = sim.get("w");
    if (self !== undefined) self.combatant.energy = 5;
    if (warrior !== undefined) warrior.combatant.energy = 25;
    expect(energy.decide(ruleFor(sim, "m"))).toMatchObject({
      useSkillId: "mesmer.energy-drain",
      targetId: "monk0",
    });
  });
});
