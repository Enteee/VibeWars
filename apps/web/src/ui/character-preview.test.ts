import { defaultBuildEquipment } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import { createProfessionDot, miniSkillCells, teamMemberRow } from "./character-preview.js";
import { offhandIcon, professionIcon, weaponIcon } from "./icons.js";

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

/** Just enough DOM for a dot; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  title = "";
  src = "";
  alt = "";
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly properties = new Map<string, string>();
  readonly style = {
    width: "",
    height: "",
    setProperty: (name: string, value: string): void => {
      this.properties.set(name, value);
    },
  };

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  /** Every element under this one with class `name`, in document order. */
  all(name: string): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(child.className === name ? [child] : []),
      ...child.all(name),
    ]);
  }

  /** All the text under this one, as a reader would get it. */
  text(): string {
    return this.textContent + this.children.map((child) => child.text()).join("");
  }
}

describe("createProfessionDot (#1785)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const dot = (...args: Parameters<typeof createProfessionDot>): FakeElement =>
    createProfessionDot(...args) as unknown as FakeElement;
  const masks = (shown: FakeElement): (string | undefined)[] =>
    shown.all("character-dot-glyph").map((glyph) => glyph.properties.get("mask-image"));

  it("shows the primary's icon and no text, labelled with the profession's name", () => {
    const shown = dot("elementalist", undefined);
    expect(shown.text()).toBe("");
    expect(masks(shown)).toEqual([`url("${professionIcon("elementalist")}")`]);
    expect(shown.all("character-dot-secondary")).toEqual([]);
    expect(shown.title).toBe("Elementalist");
    expect(shown.attributes.get("aria-label")).toBe("Elementalist");
  });

  it("adds the secondary's icon on its disc, and names both", () => {
    const shown = dot("elementalist", "monk", "ally");
    expect(shown.text()).toBe("");
    expect(masks(shown)).toEqual([
      `url("${professionIcon("elementalist")}")`,
      `url("${professionIcon("monk")}")`,
    ]);
    expect(shown.all("character-dot-secondary")).toHaveLength(1);
    expect(shown.title).toBe("Elementalist / Monk");
    expect(shown.attributes.get("aria-label")).toBe("Elementalist / Monk");
  });
});

describe("teamMemberRow (#1786)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const row = (shown: StoredCharacter): FakeElement =>
    teamMemberRow(shown) as unknown as FakeElement;
  const gear = (shown: FakeElement): string[] =>
    shown.all("gear-icon").map((icon) => `${icon.src} ${icon.alt}`);
  const bar = ["warrior.backbreaker", null, null, null, null, null, null, null];

  it("is the ball, the main hand and the off-hand, and eight skill cells, with no text", () => {
    const shown = row({ ...character(bar), name: "Ser Bash" });
    expect(shown.children.map((child) => child.className)).toEqual([
      "character-dot",
      "mini-gear",
      "mini-skill-bar",
    ]);
    expect(gear(shown)).toEqual(
      [weaponIcon("sword"), offhandIcon("shield")].map(
        (icon) => `${icon?.src ?? ""} ${icon?.name ?? ""}`,
      ),
    );
    expect(shown.all("mini-skill").length + shown.all("mini-skill is-empty").length).toBe(8);
    expect(shown.text()).toBe("");
    expect(shown.title).toBe("Ser Bash, Warrior");
    expect(shown.attributes.get("aria-label")).toBe("Ser Bash, Warrior");
  });

  it("shows one weapon when the hand carries no off-hand", () => {
    const base = character(bar);
    const [set] = base.equipment.weaponSets;
    const shown = row({
      ...base,
      equipment: { ...base.equipment, weaponSets: [{ ...set, offHand: null }, null, null, null] },
    });
    expect(gear(shown)).toEqual([`${weaponIcon("sword")?.src ?? ""} Sword`]);
  });

  it("shows no weapon for a build the host would refuse", () => {
    const shown = row({
      ...character(bar),
      attributes: [{ attributeId: "warrior.strength", rank: 99 }],
    });
    expect(gear(shown)).toEqual([]);
    expect(shown.all("mini-skill-bar")).toHaveLength(1);
  });
});
