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
const PARTY = skill("monk.heal-party");
const AREA = skill("monk.heal-area");
const STRIKE = skill("warrior.sever-artery");

describe("botRole (#2545)", () => {
  it("reads the bar's skills as the rules do", () => {
    expect(botUses(HEAL)).toContain("healing");
    expect(botUses(PROT)).toContain("defence");
    expect(botUses(PARTY)).toContain("healing");
    expect(botUses(STRIKE)).not.toContain("healing");
  });

  it("is a frontline wielding a melee weapon, whatever its bar", () => {
    expect(botRole([STRIKE], RANGE_MELEE)).toBe("frontline");
    expect(botRole([HEAL, STRIKE], RANGE_MELEE)).toBe("frontline");
    expect(botRole([HEAL, PROT, STRIKE], RANGE_MELEE)).toBe("frontline");
  });

  it("is a healer with two ally-targeted healing or defence skills", () => {
    expect(botRole([HEAL, PROT], RANGE_SPELL)).toBe("healer");
    expect(botRole([HEAL, PROT, STRIKE], RANGE_SPELL)).toBe("healer");
  });

  it("does not count self-only heals", () => {
    expect(botRole([PARTY, AREA], RANGE_SPELL)).toBe("ranged");
    expect(botRole([HEAL, PARTY], RANGE_SPELL)).toBe("ranged");
  });

  it("is ranged otherwise", () => {
    expect(botRole([], RANGE_SPELL)).toBe("ranged");
    expect(botRole([HEAL], RANGE_SPELL)).toBe("ranged");
  });
});
