import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY, RANGE_SPELL } from "../../distances.js";
import { getSkill } from "../../skills/catalog.js";
import type { Skill } from "../../skills/types.js";
import { vec2, type Vec2 } from "../../vec2.js";
import { clumpTarget, targetArea } from "./clump.js";
import { ELEMENTALIST, WARRIOR, fighter, match } from "./rules/test-support.js";

const skill = (id: string): Skill => {
  const found = getSkill(id);
  if (found === undefined) throw new Error(`no skill ${id}`);
  return found;
};

const FIREBALL = skill("elementalist.fireball");

describe("targetArea (#4147)", () => {
  it("is the radius of a foe area centred on the target", () => {
    expect(targetArea(FIREBALL)).toBe(AREA_NEARBY);
  });

  it("reads a splash on foes around the target", () => {
    expect(targetArea(skill("warrior.earth-shaker"))).toBe(AREA_ADJACENT);
  });

  it("reads a ground effect left at the target", () => {
    expect(targetArea(skill("monk.symbol-of-wrath"))).toBe(AREA_ADJACENT);
  });

  it("is nothing for a caster-centred area", () => {
    expect(targetArea(skill("warrior.cyclone-axe"))).toBeUndefined();
  });

  it("is nothing for an area that hits all", () => {
    const area = FIREBALL.area;
    if (area === undefined || area.origin === "party") throw new Error("Fireball has an area");
    expect(targetArea({ ...FIREBALL, area: { ...area, affects: "all" } })).toBeUndefined();
  });

  it("is nothing for a single-target skill", () => {
    expect(targetArea(skill("elementalist.immolate"))).toBeUndefined();
  });
});

describe("clumpTarget (#4147)", () => {
  /** A caster at (400, 400), its team's target `t` at (700, 400), and foes at `clump`. */
  function field(clump: readonly Vec2[], beside: readonly Vec2[] = []) {
    const sim = match([
      fighter("m", 0, ELEMENTALIST, vec2(400, 400)),
      fighter("t", 1, WARRIOR, vec2(700, 400)),
      ...beside.map((at, i) => fighter(`s${String(i)}`, 1, WARRIOR, at)),
      ...clump.map((at, i) => fighter(`c${String(i)}`, 1, WARRIOR, at)),
    ]);
    const all = [...sim.participants()];
    const self = all.find((each) => each.id === "m");
    if (self === undefined) throw new Error("no caster");
    return { self, foes: all.filter((each) => each.combatant.team === 1) };
  }

  const THREE = [vec2(700, 600), vec2(740, 600), vec2(700, 640)];
  const pick = (
    { self, foes }: ReturnType<typeof field>,
    range = RANGE_SPELL,
    mayCast: (id: string) => boolean = () => true,
  ) => clumpTarget(FIREBALL, self, foes, "t", range, mayCast);

  it("casts at the nearest foe of three clumped away from a lone target", () => {
    expect(pick(field(THREE))).toBe("c0");
  });

  it("keeps the team's target that already hits two: a clump of three gains one", () => {
    expect(pick(field(THREE, [vec2(740, 400)]))).toBeUndefined();
  });

  it("keeps the team's target standing in the clump", () => {
    expect(pick(field([vec2(740, 400), vec2(700, 440)]))).toBeUndefined();
  });

  it("leaves two foes together alone", () => {
    expect(pick(field(THREE.slice(0, 2)))).toBeUndefined();
  });

  it("skips a clump out of range, or one it may not cast at", () => {
    expect(pick(field(THREE), 300)).toBeUndefined();
    expect(pick(field(THREE), RANGE_SPELL, (id) => id !== "c0")).toBe("c2");
  });

  it("is nothing for a skill without a target-centred area", () => {
    const { self, foes } = field(THREE);
    expect(
      clumpTarget(skill("elementalist.immolate"), self, foes, "t", RANGE_SPELL, () => true),
    ).toBe(undefined);
  });
});
