import { describe, expect, it } from "vitest";
import { IMPLEMENTED_SKILLS, SKILLS_BY_ID } from "./catalog.js";
import { groundReach } from "./ground-reach.js";

describe("groundReach (#3283)", () => {
  it("reads a reach off every skill in the catalog that leaves ground", () => {
    const ground = [...SKILLS_BY_ID.values()].filter((skill) =>
      skill.effects.some((effect) => effect.kind === "create-ground-effect"),
    );
    expect(ground.length).toBeGreaterThan(20);
    for (const skill of ground) {
      expect(["allies", "foes", "all"]).toContain(groundReach(skill.id));
    }
  });

  it("reads a ward's allies, a well's foes, a trap's and a storm's foes", () => {
    expect(groundReach("elementalist.ward-against-melee")).toBe("allies");
    expect(groundReach("necromancer.well-of-darkness")).toBe("foes");
    expect(groundReach("ranger.barbed-trap")).toBe("foes");
    expect(groundReach("mesmer.chaos-storm")).toBe("foes");
    expect(groundReach("ranger.healing-spring")).toBe("allies");
  });

  it("reads all for a skill that leaves no ground", () => {
    const plain = IMPLEMENTED_SKILLS.find(
      (skill) => !skill.effects.some((effect) => effect.kind === "create-ground-effect"),
    );
    expect(groundReach(plain?.id ?? "no-such-skill")).toBe("all");
    expect(groundReach("no-such-skill")).toBe("all");
  });
});
