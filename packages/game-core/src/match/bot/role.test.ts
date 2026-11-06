import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../../distances.js";
import { getSkill } from "../../skills/catalog.js";
import type { Skill } from "../../skills/types.js";
import { botRole } from "./role.js";
import { botUses } from "./skill-intent.js";

const skill = (id: string): Skill => {
  const found = getSkill(id);
  if (found === undefined) throw new Error(`no skill ${id}`);
  return found;
};

const HEAL = skill("monk.orison-of-healing");
const PROT = skill("monk.protective-spirit");
const STRIKE = skill("warrior.sever-artery");

describe("botRole (#2545)", () => {
  it("reads the bar's skills as the rules do", () => {
    expect(botUses(HEAL)).toContain("healing");
    expect(botUses(PROT)).toContain("defence");
    expect(botUses(STRIKE)).not.toContain("healing");
  });

  it("is a frontline wielding a melee weapon", () => {
    expect(botRole([STRIKE], RANGE_MELEE)).toBe("frontline");
    expect(botRole([HEAL, STRIKE], RANGE_MELEE)).toBe("frontline");
  });

  it("is a healer with two healing or defence skills, whatever it wields", () => {
    expect(botRole([HEAL, PROT], RANGE_SPELL)).toBe("healer");
    expect(botRole([HEAL, PROT, STRIKE], RANGE_MELEE)).toBe("healer");
  });

  it("is ranged otherwise", () => {
    expect(botRole([], RANGE_SPELL)).toBe("ranged");
    expect(botRole([HEAL], RANGE_SPELL)).toBe("ranged");
  });
});
