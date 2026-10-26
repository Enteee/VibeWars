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
    expect(rolesOf("monk.mend-affliction")).toContain("removal");
    expect(rolesOf("ranger.broad-head-arrow")).toEqual(["interrupt", "condition"]);
    expect(rolesOf("warrior.backbreaker")).toEqual(["knockdown"]);
  });

  it("counts a protective status as defence, whatever its category", () => {
    // A shout that raises armor, and an enchantment that blocks.
    expect(rolesOf("warrior.watch-yourself")).toEqual(["defence"]);
    expect(rolesOf("monk.guardian")).toEqual(["defence"]);
  });
});
