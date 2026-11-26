import { defaultBuildEquipment, type ProfessionId, type WeaponSetIndex } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import {
  mountAttributes,
  mountGear,
  mountProfessions,
  setProfessions,
  type GearHost,
} from "./build-editor.js";
import { FakeElement } from "./fake-dom.test-support.js";
import { mountGearLibrary } from "./gear-library-view.js";
import { mountPaperDoll } from "./paper-doll.js";
import type { SkillTooltip } from "./skill-tooltip.js";

/** A Warrior/Monk with a Monk skill on the bar, the build a team member holds. */
function member(): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: "m1",
    name: "Ser Bash",
    primaryProfession: "warrior",
    secondaryProfession: "monk",
    attributes: [],
    skillBar: ["monk.healing-breeze", null, null, null, null, null, null, null],
    equipment: defaultBuildEquipment("warrior"),
    updatedAt: 1,
  };
}

const fake = (element: HTMLElement): FakeElement => element as unknown as FakeElement;
const panel = (): HTMLElement => new FakeElement() as unknown as HTMLElement;

describe("the Character Builder's parts, on any screen that hosts a build (#2226)", () => {
  let character: StoredCharacter;
  let set: WeaponSetIndex;
  let commits: StoredCharacter[];
  let host: GearHost & {
    readonly changeProfessions: (
      primary: ProfessionId,
      secondary: ProfessionId | undefined,
    ) => void;
  };

  beforeEach(() => {
    vi.stubGlobal("Node", FakeElement);
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
      createTextNode: (text: string) => Object.assign(new FakeElement(), { textContent: text }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("window", {
      innerWidth: 1366,
      innerHeight: 768,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    character = member();
    set = 0;
    commits = [];
    const tooltip: SkillTooltip = {
      show: () => undefined,
      hide: () => undefined,
      dispose: () => undefined,
    } as unknown as SkillTooltip;
    host = {
      current: () => character,
      commit: (next) => {
        commits.push(next);
        character = next;
      },
      changeProfessions: (primary, secondary) => {
        host.commit(setProfessions(character, primary, secondary));
      },
      tooltip,
      weaponSet: () => set,
      selectWeaponSet: (next) => {
        set = next;
      },
      showLibrary: () => undefined,
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a pip clicked sets the rank, through the host", () => {
    const root = panel();
    mountAttributes(root, host).update(character);
    const healing = fake(root)
      .all("editor-attribute")
      .find((row) => row.getAttribute("aria-label") === "Healing Prayers");
    healing?.all("attribute-pip")[2]?.click();
    expect(commits).toHaveLength(1);
    expect(character.attributes).toEqual([{ attributeId: "monk.healing-prayers", rank: 3 }]);
  });

  it("a new secondary drops the skills it cannot use", () => {
    const professions = mountProfessions(host);
    professions.update(character);
    fake(professions.element)
      .all("editor-profession")
      .find((opener) => opener.dataset.which === "secondary")
      ?.click();
    const ranger = fake(professions.element)
      .all("profession-cell")
      .filter((cell) => cell.dataset.profession === "ranger")
      .at(-1);
    ranger?.click();
    expect(character.primaryProfession).toBe("warrior");
    expect(character.secondaryProfession).toBe("ranger");
    expect(character.skillBar[0]).toBeNull();
  });

  it("the gear library equips the shown set, and the gear clears its off-hand", () => {
    const library = mountGearLibrary(host);
    library.update(character);
    const longbow = library.elements
      .flatMap((element) => fake(element).all("gear-box"))
      .find((box) =>
        box.all("skill-box-name")[0]?.children.some((n) => n.textContent === "Longbow"),
      );
    longbow?.click();
    expect(character.equipment.weaponSets[0].mainHand.weaponId).toBe("longbow");

    character = member();
    const root = panel();
    const gear = mountGear(root, host, mountPaperDoll(host));
    gear.update(character);
    expect(character.equipment.weaponSets[0].offHand).not.toBeNull();
    fake(root)
      .all("gear-slot")
      .find((slot) => slot.dataset.cause?.endsWith(".offHand") === true)
      ?.all("gear-slot-clear")[0]
      ?.click();
    expect(character.equipment.weaponSets[0].offHand).toBeNull();
  });
});
