import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import { miniSkillCells } from "./character-preview.js";

function character(skillBar: (string | null)[]): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: "a",
    name: "a",
    primaryProfession: "warrior",
    secondaryProfession: undefined,
    attributes: [],
    skillBar,
    equipment: defaultBuildEquipment("warrior"),
    updatedAt: 1,
  };
}

describe("miniSkillCells (#578)", () => {
  it("gives eight cells with each skill's name and icon, null where empty (#727)", () => {
    const cells = miniSkillCells(
      character([
        "monk.orison-of-healing",
        null,
        "warrior.backbreaker",
        null,
        null,
        null,
        null,
        null,
      ]),
    );
    expect(cells).toHaveLength(8);
    expect(cells[0]).toEqual({
      name: "Orison of Healing",
      icon: "/icons/skill/monk.orison-of-healing.svg",
    });
    expect(cells[1]).toBeNull();
    expect(cells[2]).toEqual({ name: "Backbreaker", icon: "/icons/skill/warrior.backbreaker.svg" });
  });

  it("shows an unknown id by its id, on the bare plate, and pads a short bar", () => {
    const cells = miniSkillCells(character(["gone.skill"]));
    expect(cells).toHaveLength(8);
    expect(cells[0]).toEqual({ name: "gone.skill", icon: "/icons/skill/unknown.svg" });
    expect(cells.slice(1).every((cell) => cell === null)).toBe(true);
  });
});
