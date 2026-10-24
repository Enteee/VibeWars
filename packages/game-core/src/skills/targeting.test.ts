import { describe, expect, it } from "vitest";

import { segment } from "../geometry.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { resolveTargets, type TargetCandidate, type TargetSelection } from "./targeting.js";
import { makeCombatant } from "./testing.js";
import type { AreaRule, Combatant, Skill } from "./types.js";

const SPLASH: AreaRule = {
  radius: 81,
  origin: "target",
  affects: "enemies",
  maxTargets: undefined,
  includesCaster: false,
};

function withArea(area: AreaRule | undefined): Skill {
  const fireball = getSkill("elementalist.fireball");
  if (fireball === undefined) {
    throw new Error("no fireball");
  }
  return { ...fireball, area };
}

function at(id: string, team: number, position: Vec2, dead = false): TargetCandidate {
  return { combatant: makeCombatant({ id, team, dead }), position };
}

const caster = at("caster", 0, vec2(0, 0));

/** Caster at the origin of the world, primary enemy at (300, 0). */
function select(
  area: AreaRule | undefined,
  others: readonly TargetCandidate[],
  extra: Partial<TargetSelection> = {},
): string[] {
  const primary = at("primary", 1, vec2(300, 0));
  return resolveTargets({
    skill: withArea(area),
    caster: caster.combatant,
    casterPosition: caster.position,
    primary,
    candidates: [caster, primary, ...others],
    losBlockers: [],
    ...extra,
  }).map((combatant: Combatant) => combatant.id);
}

describe("resolveTargets", () => {
  it("without an area is exactly the primary, whoever else stands near it", () => {
    expect(select(undefined, [at("near", 1, vec2(310, 0))])).toEqual(["primary"]);
    expect(select(undefined, [], { primary: undefined })).toEqual([]);
  });

  it("puts the primary first, then foes in the radius, nearest first, ties by id", () => {
    expect(
      select(SPLASH, [
        at("far", 1, vec2(380, 0)),
        at("b", 1, vec2(300, 40)),
        at("a", 1, vec2(300, -40)),
        at("outside", 1, vec2(382, 0)),
      ]),
    ).toEqual(["primary", "a", "b", "far"]);
  });

  it("never filters the primary again, even dead", () => {
    const dead = at("primary", 1, vec2(300, 0), true);
    expect(select(SPLASH, [at("x", 1, vec2(310, 0))], { primary: dead })).toEqual(["primary", "x"]);
  });

  it("catches only the side affects names, and never the dead", () => {
    const crowd = [
      at("ally", 0, vec2(310, 0)),
      at("foe", 1, vec2(320, 0)),
      at("corpse", 1, vec2(305, 0), true),
    ];
    expect(select(SPLASH, crowd)).toEqual(["primary", "foe"]);
    expect(select({ ...SPLASH, affects: "allies" }, crowd)).toEqual(["primary", "ally"]);
    expect(select({ ...SPLASH, affects: "all" }, crowd)).toEqual(["primary", "ally", "foe"]);
  });

  it("leaves the caster out of its own area unless includesCaster", () => {
    const nova: AreaRule = { ...SPLASH, origin: "caster", affects: "all" };
    const self = { primary: caster };
    const near = [at("ally", 0, vec2(20, 0))];
    expect(select(nova, near, self)).toEqual(["ally"]);
    expect(select({ ...nova, includesCaster: true }, near, self)).toEqual(["caster", "ally"]);
  });

  it("cuts to maxTargets after sorting, the primary counted", () => {
    const pack = [1, 2, 3, 4, 5, 6, 7].map((i) => at(`f${String(i)}`, 1, vec2(300 + i * 5, 0)));
    expect(select({ ...SPLASH, maxTargets: 6 }, pack)).toEqual([
      "primary",
      "f1",
      "f2",
      "f3",
      "f4",
      "f5",
    ]);
  });

  it("checks line of sight from the origin, not from the caster", () => {
    // A wall between the primary and one foe, which the caster sees fine.
    const wall = segment(vec2(320, 20), vec2(320, -20));
    const foes = [at("behind", 1, vec2(340, 0)), at("beside", 1, vec2(300, 50))];
    expect(select(SPLASH, foes, { losBlockers: [wall] })).toEqual(["primary", "beside"]);
  });

  it("with a target origin and no primary, hits nobody", () => {
    expect(select(SPLASH, [at("x", 1, vec2(300, 0))], { primary: undefined })).toEqual([]);
  });

  it("gives the same answer however the candidates are ordered", () => {
    const crowd = [
      at("c", 1, vec2(300, 30)),
      at("a", 1, vec2(330, 0)),
      at("b", 1, vec2(270, 0)),
      at("d", 1, vec2(300, -30)),
      at("e", 1, vec2(300, 60)),
    ];
    const capped = { ...SPLASH, maxTargets: 4 };
    const expected = select(capped, crowd);
    expect(expected).toEqual(["primary", "a", "b", "c"]);
    const shuffles = [
      [...crowd].reverse(),
      [...crowd.slice(2), ...crowd.slice(0, 2)],
      [...crowd].sort((p, q) => p.position.y - q.position.y),
    ];
    for (const shuffled of shuffles) {
      expect(select(capped, shuffled)).toEqual(expected);
    }
  });
});
