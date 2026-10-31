import { defaultBuildEquipment } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import {
  characterFigureCard,
  lookOfCharacter,
  lookOfWire,
  teamFigureCard,
  type FigureLook,
} from "./character-card.js";

/** Just enough DOM for the cards; the unit tests run in Node, where a canvas draws nothing. */
class FakeElement {
  className = "";
  textContent = "";
  title = "";
  src = "";
  alt = "";
  type = "";
  width = 0;
  height = 0;
  disabled = false;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, () => void>();
  readonly style = { width: "", height: "" };
  readonly classList = {
    toggle: (name: string, on: boolean): void => {
      const names = this.className.split(" ").filter((part) => part !== "" && part !== name);
      this.className = (on ? [...names, name] : names).join(" ");
    },
  };

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  readonly addEventListener = (type: string, listener: () => void): void => {
    this.listeners.set(type, listener);
  };

  readonly getContext = (): null => null;

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  /** Every element under this one with class `name`, in document order. */
  all(name: string): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(child.className.split(" ").includes(name) ? [child] : []),
      ...child.all(name),
    ]);
  }

  /** All the text under this one, as a reader would get it. */
  text(): string {
    return this.textContent + this.children.map((child) => child.text()).join("");
  }

  click(): void {
    this.listeners.get("click")?.();
  }
}

const BAR = ["warrior.backbreaker", null, null, null, null, null, null, null];

function character(overrides: Partial<StoredCharacter> = {}): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: "a",
    name: "Ser Bash",
    primaryProfession: "warrior",
    secondaryProfession: "monk",
    attributes: [],
    skillBar: BAR,
    equipment: defaultBuildEquipment("warrior"),
    updatedAt: 1,
    ...overrides,
  };
}

const shown = (element: HTMLElement): FakeElement => element as unknown as FakeElement;

describe("the character card (#1864)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
    vi.stubGlobal("window", { devicePixelRatio: 1 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const look = (overrides: Partial<StoredCharacter> = {}): FigureLook =>
    lookOfCharacter(character(overrides), undefined);

  for (const size of ["card", "row"] as const) {
    it(`as a ${size}, is the figure holding its weapons and the bar's eight cells, never the name`, () => {
      const card = shown(characterFigureCard(look(), { size, label: "Ser Bash, Warrior / Monk" }));
      const figures = card.all("character-figure");
      expect(figures.map((figure) => figure.dataset.weaponId)).toEqual(["sword"]);
      expect(figures[0]?.attributes.get("aria-label")).toBe("Warrior / Monk");
      expect(card.all("mini-skill")).toHaveLength(8);
      expect(card.text()).not.toContain("Ser Bash");
    });
  }

  it("as a card, has the professions on its line, or the caller's", () => {
    expect(shown(characterFigureCard(look(), { size: "card" })).text()).toBe("Warrior / Monk");
    expect(
      shown(
        characterFigureCard(look(), { size: "card", line: "Warrior / Monk · 1/8 skills" }),
      ).text(),
    ).toBe("Warrior / Monk · 1/8 skills");
  });

  it("as a row, draws a smaller figure, and keeps its label for a hover and a reader", () => {
    const card = shown(characterFigureCard(look(), { size: "card" }));
    const row = shown(characterFigureCard(look(), { size: "row", label: "Ser Bash, Warrior" }));
    expect(row.text()).toBe("");
    expect(row.title).toBe("Ser Bash, Warrior");
    expect(row.attributes.get("aria-label")).toBe("Ser Bash, Warrior");
    const width = (element: FakeElement): number =>
      Number.parseFloat(element.all("character-figure")[0]?.style.width ?? "");
    expect(width(row)).toBeLessThan(width(card));
  });

  it("is the bare body for a build the host would refuse", () => {
    const refused = look({ attributes: [{ attributeId: "warrior.strength", rank: 99 }] });
    const card = shown(characterFigureCard(refused, { size: "row" }));
    expect(card.all("character-figure").map((figure) => figure.dataset.weaponId)).toEqual([
      undefined,
    ]);
    expect(card.all("mini-skill")).toHaveLength(8);
  });
});

describe("lookOfWire (#1864)", () => {
  const warrior = { primary: "warrior", secondary: "monk" };

  it("holds what the host sent, and empties a skill this client does not know", () => {
    expect(
      lookOfWire(warrior, {
        skills: ["warrior.backbreaker", "gone.skill", null, null, null, null, null, null],
        mainHand: "sword",
        offHand: "shield",
      }),
    ).toEqual({
      primary: "warrior",
      secondary: "monk",
      appearance: { weaponId: "sword", offhandId: "shield" },
      skillBar: ["warrior.backbreaker", null, null, null, null, null, null, null],
      cape: undefined,
    });
  });

  it("is the bare body before its build arrives, or for weapons this client does not know", () => {
    const bare = { weaponId: undefined, offhandId: undefined };
    expect(lookOfWire(warrior, undefined)?.appearance).toEqual(bare);
    expect(lookOfWire(warrior, undefined)?.skillBar).toEqual([]);
    expect(
      lookOfWire(warrior, { skills: [], mainHand: "gone.weapon", offHand: "shield" })?.appearance,
    ).toEqual(bare);
    expect(
      lookOfWire(warrior, { skills: [], mainHand: "sword", offHand: "gone.offhand" })?.appearance,
    ).toEqual({ weaponId: "sword", offhandId: undefined });
  });

  it("has no look for a profession this client does not know", () => {
    expect(lookOfWire({ primary: "?", secondary: null }, undefined)).toBeUndefined();
  });
});

describe("teamFigureCard (#1864)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
    vi.stubGlobal("window", { devicePixelRatio: 1 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const members = [
    { look: lookOfCharacter(character(), undefined), label: "Ser Bash, Warrior / Monk" },
    { look: undefined, label: "?" },
  ];

  it("is its title, a row per member, then its footer", () => {
    const card = shown(
      teamFigureCard({
        title: "Sunrise",
        members,
        footer: [document.createElement("span")],
      }),
    );
    expect(card.all("play-card-name").map((name) => name.textContent)).toEqual(["Sunrise"]);
    const rows = card.all("play-card-member");
    expect(rows.map((row) => row.className)).toEqual([
      "character-card-row play-card-member",
      "character-dot is-house play-card-member",
    ]);
    expect(rows[0]?.attributes.get("aria-label")).toBe("Ser Bash, Warrior / Monk");
    const open = card.all("play-card-open")[0];
    expect(open?.children).toHaveLength(3);
  });

  it("opens on a press, unless disabled", () => {
    let opened = 0;
    const onOpen = (): void => {
      opened += 1;
    };
    const open = (disabled: boolean): FakeElement | undefined =>
      shown(teamFigureCard({ title: "Sunrise", members, onOpen, disabled })).all(
        "play-card-open",
      )[0];
    const live = open(false);
    live?.click();
    expect(opened).toBe(1);
    expect(live?.disabled).toBe(false);
    expect(open(true)?.disabled).toBe(true);
  });
});
