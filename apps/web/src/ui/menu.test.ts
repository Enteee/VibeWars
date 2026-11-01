import { defaultBuildEquipment } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import type * as Figure from "./character-figure.js";
import {
  NO_CHARACTER_FOR_QUEUE,
  isPlayable,
  randomArenaQueue,
  renderCharacterBuilder,
  renderRandomArena,
  rosterOrder,
  rosterSubtitle,
  rosterTags,
  type MenuCallbacks,
} from "./menu.js";

// The figure draws on a canvas, which Node has none of.
vi.mock("./character-figure.js", async (original) => ({
  ...(await original<typeof Figure>()),
  createCharacterFigure: () => document.createElement("canvas"),
}));

function character(overrides: Partial<StoredCharacter> = {}): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: "a",
    name: "Pyro",
    primaryProfession: "elementalist",
    secondaryProfession: "monk",
    attributes: [],
    skillBar: ["elementalist.fireball", null, null, null, null, null, null, null],
    equipment: defaultBuildEquipment("elementalist"),
    updatedAt: 1,
    ...overrides,
  };
}

describe("rosterSubtitle (#579)", () => {
  it("names the professions and how many slots are filled", () => {
    expect(rosterSubtitle(character())).toBe("Elementalist / Monk · 1/8 skills");
  });

  it("leaves an illegal build's invalidity to its row's tag (#1290)", () => {
    const illegal = character({
      skillBar: ["no.such-skill", null, null, null, null, null, null, null],
    });
    expect(rosterSubtitle(illegal)).toBe("Elementalist / Monk · 1/8 skills");
  });
});

describe("isPlayable (#1290)", () => {
  it("lets a legal build and an empty bar be chosen", () => {
    expect(isPlayable(character())).toBe(true);
    expect(isPlayable(character({ skillBar: Array(8).fill(null) }))).toBe(true);
  });

  it("never an invalid one", () => {
    expect(
      isPlayable(
        character({ skillBar: ["no.such-skill", null, null, null, null, null, null, null] }),
      ),
    ).toBe(false);
  });
});

describe("rosterTags (#1426)", () => {
  const illegal = { skillBar: ["no.such-skill", null, null, null, null, null, null, null] };

  it("marks the starter character Random, and no other", () => {
    expect(rosterTags(character({ id: "s" }), "s")).toEqual(["Random"]);
    expect(rosterTags(character({ id: "a" }), "s")).toEqual([]);
  });

  it("marks nothing Random without a starter", () => {
    expect(rosterTags(character({ id: "s" }), undefined)).toEqual([]);
  });

  it("puts Random before Invalid on an invalid starter", () => {
    expect(rosterTags(character({ id: "s", ...illegal }), "s")).toEqual(["Random", "Invalid"]);
    expect(rosterTags(character({ id: "a", ...illegal }), "s")).toEqual(["Invalid"]);
  });
});

describe("rosterOrder (#1425)", () => {
  const ids = (list: readonly StoredCharacter[]) => list.map((c) => c.id);
  // Newest saved first, as the repository lists them.
  const saved = [character({ id: "rolled" }), character({ id: "b" }), character({ id: "c" })];

  it("puts the random starter last, even when it is the newest", () => {
    expect(ids(rosterOrder(saved, "rolled"))).toEqual(["b", "c", "rolled"]);
  });

  it("keeps everyone else newest first", () => {
    expect(ids(rosterOrder(saved, "b"))).toEqual(["rolled", "c", "b"]);
  });

  it("changes nothing with no starter, or one deleted", () => {
    expect(ids(rosterOrder(saved, undefined))).toEqual(["rolled", "b", "c"]);
    expect(ids(rosterOrder(saved, "gone"))).toEqual(["rolled", "b", "c"]);
  });

  it("lists a starter alone as the only row", () => {
    expect(ids(rosterOrder([character({ id: "rolled" })], "rolled"))).toEqual(["rolled"]);
  });
});

/** Just enough DOM to render the menu's screens; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  value = "";
  placeholder = "";
  disabled = false;
  hidden = false;
  title = "";
  type = "";
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly classList = { add: () => undefined, toggle: () => undefined };

  readonly tagName: string;

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  readonly addEventListener = (type: string, listener: () => void): void => {
    this.listeners.set(type, listener);
  };

  readonly querySelector = (): null => null;

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  /** Every element under this one, in document order. */
  all(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }

  click(): void {
    this.listeners.get("click")?.();
  }
}

describe("the character screens (#1525)", () => {
  let queued: string[];
  let edited: string[];
  let cloned: string[];
  let rerolled: string[];
  let added: number;
  let switched: string[];
  const callbacks: MenuCallbacks = {
    onRandomArena: (mode, name) => queued.push(`${mode} ${name}`),
    onSwitch: (entry) => switched.push(entry),
    onNewCharacter: () => {
      added += 1;
    },
    onEditCharacter: (id) => edited.push(id),
    onCloneStarter: (id) => cloned.push(id),
    onRerollCharacter: (id) => rerolled.push(id),
    onSelectCharacter: () => undefined,
  };
  let stored: Map<string, string>;

  beforeEach(() => {
    queued = [];
    edited = [];
    cloned = [];
    rerolled = [];
    added = 0;
    switched = [];
    stored = new Map([
      [`${STORAGE_NAMESPACE}.playerName`, "Rurik"],
      [`${STORAGE_NAMESPACE}.starterCharacterId`, "rolled"],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    vi.stubGlobal("window", { addEventListener: () => undefined });
    vi.stubGlobal("document", {
      activeElement: null,
      createElement: (tag: string) => new FakeElement(tag),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const roster = [
    character({ id: "mine", name: "Mine" }),
    character({ id: "rolled", name: "Rolled" }),
  ];
  const shown = (render: typeof renderRandomArena, list = roster): FakeElement[] => {
    const root = new FakeElement("div");
    render(root as unknown as HTMLElement, callbacks, list);
    return root.all();
  };
  const press = (nodes: FakeElement[], label: string): void => {
    nodes.find((node) => node.tagName === "button" && node.textContent === label)?.click();
  };
  const labels = (nodes: FakeElement[]): string[] =>
    nodes.filter((node) => node.tagName === "button").map((node) => node.textContent);

  it("Random Arena picks only: no Edit, Clone, Reroll or New, and no text field", () => {
    const nodes = shown(renderRandomArena);
    expect(labels(nodes)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^(Edit|Clone|Reroll|New character)$/)]),
    );
    expect(nodes.filter((node) => node.tagName === "input")).toHaveLength(0);
    const cards = nodes.filter((node) => node.className === "play-card-open");
    expect(cards.map((card) => card.attributes.get("aria-pressed"))).toEqual(["false", "false"]);
    cards[1]?.click();
    expect(stored.get(`${STORAGE_NAMESPACE}.activeCharacterId`)).toBe("rolled");
  });

  it("Random Arena's title-bar formats queue as the saved name, once a character is picked", () => {
    const joins = (why: string | undefined): FakeElement[] =>
      (randomArenaQueue(callbacks, why) as unknown as FakeElement).all();
    const greyed = joins(NO_CHARACTER_FOR_QUEUE);
    expect(greyed.map((join) => join.textContent)).toEqual(["1v1", "2v2", "4v4"]);
    expect(greyed.every((join) => join.disabled)).toBe(true);
    expect(greyed.every((join) => join.title === NO_CHARACTER_FOR_QUEUE)).toBe(true);
    // No tiles left in the body; the reason stays there.
    expect(labels(shown(renderRandomArena))).not.toContain("1v1");
    expect(
      shown(renderRandomArena).some((node) => node.textContent === NO_CHARACTER_FOR_QUEUE),
    ).toBe(true);

    stored.set(`${STORAGE_NAMESPACE}.activeCharacterId`, "mine");
    const nodes = shown(renderRandomArena);
    expect(nodes.some((node) => node.textContent === NO_CHARACTER_FOR_QUEUE)).toBe(false);
    const open = joins(undefined);
    expect(open.some((join) => join.disabled || join.title !== "")).toBe(false);
    press(open, "2v2");
    expect(queued).toEqual(["random-arena-2v2 Rurik"]);
  });

  it("Random Arena with no characters points to Character Builder", () => {
    const nodes = shown(renderRandomArena, []);
    expect(nodes.some((node) => node.textContent === "No characters yet.")).toBe(true);
    press(nodes, "Character Builder");
    expect(switched).toEqual(["characters"]);
  });

  it("Character Builder has Edit, Clone and Reroll on the starter, and New character", () => {
    const nodes = shown(renderCharacterBuilder);
    expect(labels(nodes).filter((label) => label !== "")).toEqual(
      expect.arrayContaining(["Edit", "Clone", "Reroll", "New character"]),
    );
    press(nodes, "Edit");
    nodes.find((node) => node.className === "play-card-open" && node.tagName === "button")?.click();
    press(nodes, "Clone");
    press(nodes, "Reroll");
    press(nodes, "New character");
    expect(edited).toEqual(["mine", "mine"]);
    expect(cloned).toEqual(["rolled"]);
    expect(rerolled).toEqual(["rolled"]);
    expect(added).toBe(1);
  });
});
