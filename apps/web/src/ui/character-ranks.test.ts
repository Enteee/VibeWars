import { defaultBuildEquipment, describeSkill, getSkill } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";
import type { TeamCharacter } from "../storage/schema.js";
import { characterRanks } from "./character-ranks.js";
import { toBoxModel } from "./skill-library.js";

/** A Necromancer with Death Magic 12 bought and a superior Death Magic rune on. */
function necromancer(): TeamCharacter {
  const equipment = defaultBuildEquipment("necromancer");
  return {
    id: "n",
    name: "n",
    primaryProfession: "necromancer",
    secondaryProfession: undefined,
    attributes: [{ attributeId: "necromancer.death-magic", rank: 12 }],
    skillBar: Array.from({ length: 8 }, () => null),
    equipment: {
      ...equipment,
      armor: {
        ...equipment.armor,
        chest: {
          insigniaId: null,
          rune: { kind: "attribute", attributeId: "necromancer.death-magic", tier: "superior" },
        },
      },
    },
  };
}

describe("characterRanks (#1900)", () => {
  it("adds the runes to the bought ranks", () => {
    expect(characterRanks(necromancer()).get("necromancer.death-magic")).toBe(15);
  });

  it("is what the library card's skill text reads", () => {
    const golem = getSkill("necromancer.animate-flesh-golem");
    if (golem === undefined) {
      throw new Error("Animate Flesh Golem is in the catalog");
    }
    const atFifteen = describeSkill(golem, new Map([["necromancer.death-magic", 15]]));
    const atTwelve = describeSkill(golem, new Map([["necromancer.death-magic", 12]]));
    const card = toBoxModel(golem, characterRanks(necromancer()), new Set()).description;
    expect(card.effects).toEqual(atFifteen.effects);
    expect(card.effects).not.toEqual(atTwelve.effects);
  });
});
