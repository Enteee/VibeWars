import { describe, expect, it } from "vitest";

import { IMPLEMENTED_SKILLS, getSkill } from "./catalog.js";
import { skillRoles } from "./roles.js";

function rolesOf(id: string): readonly string[] {
  const skill = getSkill(id);
  if (skill === undefined) throw new Error(`no skill ${id}`);
  return skillRoles(skill);
}

describe("skillRoles", () => {
  it("tags the whole catalogue the same way every time", () => {
    const tagged = Object.fromEntries(
      IMPLEMENTED_SKILLS.map((s) => [s.id, skillRoles(s).join(" ")]),
    );
    expect(tagged).toMatchSnapshot();
  });

  it("reads each role from the skill's effects", () => {
    expect(rolesOf("warrior.distracting-blow")).toEqual(["interrupt"]);
    expect(rolesOf("monk.mend-condition")).toEqual(["healing", "removal"]);
    expect(rolesOf("ranger.broad-head-arrow")).toEqual(["interrupt", "condition"]);
    expect(rolesOf("warrior.backbreaker")).toEqual(["knockdown"]);
    // A preparation's roles are what it does to the foes it hits.
    expect(rolesOf("ranger.apply-poison")).toEqual(["condition"]);
  });

  it("counts a protective status as defence, whatever its category", () => {
    // A shout that raises armor, and an enchantment that blocks.
    expect(rolesOf("warrior.watch-yourself")).toEqual(["defence"]);
    expect(rolesOf("monk.guardian")).toEqual(["defence"]);
    // One that turns the next hit into a heal (#987).
    expect(rolesOf("monk.reversal-of-fortune")).toEqual(["defence"]);
  });

  it("counts a hex or condition removal as removal (#987)", () => {
    expect(rolesOf("monk.smite-hex")).toContain("removal");
    expect(rolesOf("monk.restore-condition")).toEqual(["healing", "removal"]);
  });

  it("counts a status that regenerates as healing (#1013)", () => {
    for (const id of [
      "monk.healing-breeze",
      "monk.mending",
      "ranger.troll-unguent",
      "dervish.mystic-regeneration",
      "paragon.never-surrender",
    ]) {
      expect(rolesOf(id), id).toContain("healing");
    }
    expect(rolesOf("ritualist.weapon-of-warding")).toEqual(
      expect.arrayContaining(["defence", "healing"]),
    );
    expect(rolesOf("monk.remove-hex")).toEqual(["removal"]);
    expect(rolesOf("monk.dismiss-condition")).toEqual(
      expect.arrayContaining(["removal", "healing"]),
    );
  });

  it("counts a heal on each attack or spell as healing, and the Monk staples 3 (#1039)", () => {
    expect(rolesOf("monk.vigorous-spirit")).toEqual(["healing"]);
    expect(rolesOf("monk.cure-hex")).toEqual(["healing", "removal"]);
    expect(rolesOf("monk.mending-touch")).toEqual(["healing", "removal"]);
    expect(rolesOf("monk.smite-condition")).toEqual(["removal"]);
  });

  it("counts Soul Feast's stolen Health as healing (#466)", () => {
    expect(rolesOf("necromancer.soul-feast")).toEqual(["healing"]);
  });
});
