import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { areaRadius } from "./area-radius.js";
import { getSkill } from "./catalog.js";
import type { Skill } from "./types.js";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

describe("areaRadius (#4142)", () => {
  it("reads a skill's own area on foes: Barrage's adjacent", () => {
    expect(areaRadius(skill("ranger.barrage"))).toBe(AREA_ADJACENT);
  });

  it("reads a splash on foes: Death Blossom's adjacent", () => {
    expect(areaRadius(skill("assassin.death-blossom"))).toBe(AREA_ADJACENT);
  });

  it("reads a ground effect's pulse: Fire Storm's", () => {
    expect(areaRadius(skill("elementalist.fire-storm"))).toBe(AREA_ADJACENT);
  });

  it("leaves out an area only on allies: Aegis", () => {
    expect(areaRadius(skill("monk.aegis"))).toBeUndefined();
  });

  it("has none for a single-target skill: Power Attack", () => {
    expect(areaRadius(skill("warrior.power-attack"))).toBeUndefined();
  });
});
