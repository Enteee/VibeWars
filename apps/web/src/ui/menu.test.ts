import { defaultBuildEquipment } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { t } from "../i18n/index.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import type * as Figure from "./character-figure.js";
import type * as Kit from "./kit.js";
import {
  isPlayable,
  randomArenaProblem,
  renderCharacterBuilder,
  renderRandomArena,
  rosterOrder,
  rosterSubtitle,
  rosterTags,
  type MenuCallbacks,
} from "./menu.js";

/** The title bar's actions and queue action, as the last screen drawn put them there. */
const bar = vi.hoisted((): { actions: readonly unknown[]; queueAction: unknown } => ({
  actions: [],
  queueAction: undefined,
}));

vi.mock("./kit.js", async (original) => ({
  ...(await original<typeof Kit>()),
  screenBar: (options: {
    readonly actions?: readonly unknown[];
    readonly queueAction?: unknown;
  }) => {
    bar.actions = options.actions ?? [];
    bar.queueAction = options.queueAction;
    return { back: undefined, release: () => undefined };
  },
}));

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
    expect(rosterTags(character({ id: "s" }), "s")).toEqual(["random"]);
    expect(rosterTags(character({ id: "a" }), "s")).toEqual([]);
  });

  it("marks nothing Random without a starter", () => {
    expect(rosterTags(character({ id: "s" }), undefined)).toEqual([]);
  });

  it("puts Random before Invalid on an invalid starter", () => {
    expect(rosterTags(character({ id: "s", ...illegal }), "s")).toEqual(["random", "invalid"]);
    expect(rosterTags(character({ id: "a", ...illegal }), "s")).toEqual(["invalid"]);
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
  readonly focus = (): void => undefined;

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
    const editing = [t("menu.edit"), t("menu.clone"), t("menu.reroll"), t("menu.newCharacter")];
    expect(labels(nodes).filter((label) => editing.includes(label))).toEqual([]);
    expect(nodes.filter((node) => node.tagName === "input")).toHaveLength(0);
    const cards = nodes.filter((node) => node.className === "play-card-open");
    expect(cards.map((card) => card.attributes.get("aria-pressed"))).toEqual(["false", "false"]);
    cards[1]?.click();
    expect(stored.get(`${STORAGE_NAMESPACE}.activeCharacterId`)).toBe("rolled");
  });

  /** Random Arena's Find a match, from the title bar. */
  const find = (): FakeElement => {
    const button = bar.queueAction;
    if (!(button instanceof FakeElement)) {
      throw new Error("no Find a match in the bar");
    }
    return button;
  };

  it("Random Arena's Find a match queues the sidebar's size as the saved name, once a character is picked (#2022)", () => {
    let nodes = shown(renderRandomArena);
    expect(find().textContent).toBe(t("lobby.findMatch"));
    expect(find().disabled).toBe(true);
    expect(find().title).toBe(t("menu.noCharacterForQueue"));
    expect(nodes.some((node) => node.textContent === t("menu.noCharacterForQueue"))).toBe(true);

    stored.set(`${STORAGE_NAMESPACE}.activeCharacterId`, "mine");
    nodes = shown(renderRandomArena);
    expect(find().disabled).toBe(false);
    expect(nodes.some((node) => node.textContent === t("menu.noCharacterForQueue"))).toBe(false);
    find().click();
    expect(queued).toEqual(["random-arena-4v4 Rurik"]);

    stored.set(`${STORAGE_NAMESPACE}.teamSizeByEntry`, JSON.stringify({ "random-arena": 2 }));
    shown(renderRandomArena);
    find().click();
    expect(queued).toEqual(["random-arena-4v4 Rurik", "random-arena-2v2 Rurik"]);
  });

  it("Random Arena's Find a match queues at the size the sidebar steps to (#2141)", () => {
    stored.set(`${STORAGE_NAMESPACE}.activeCharacterId`, "mine");
    const nodes = shown(renderRandomArena);
    const smaller = nodes.find((node) => node.attributes.get("aria-label") === "Smaller team");
    if (smaller === undefined) {
      throw new Error("no team size stepper");
    }
    smaller.listeners.get("click")?.();
    smaller.listeners.get("click")?.();
    expect(smaller.disabled).toBe(true);
    expect(find().disabled).toBe(false);
    find().click();
    expect(queued).toEqual(["random-arena-1v1 Rurik"]);
  });

  it("says why Random Arena cannot queue: no character, then a party (#2022)", () => {
    expect(randomArenaProblem(false, false)).toBe(t("menu.noCharacterForQueue"));
    expect(randomArenaProblem(true, false)).toBe(t("menu.partyCannotQueue"));
    expect(randomArenaProblem(true, true)).toBeUndefined();
  });

  it("Random Arena with no characters points to Character Builder", () => {
    const nodes = shown(renderRandomArena, []);
    expect(nodes.some((node) => node.textContent === t("menu.noCharacters"))).toBe(true);
    press(nodes, t("menu.characterBuilder"));
    expect(switched).toEqual(["characters"]);
  });

  it("Character Builder has Edit, Clone and Reroll on the starter, and New character", () => {
    const nodes = shown(renderCharacterBuilder);
    expect(labels(nodes).filter((label) => label !== "")).toEqual(
      expect.arrayContaining([
        t("menu.edit"),
        t("menu.clone"),
        t("menu.reroll"),
        t("menu.newCharacter"),
      ]),
    );
    press(nodes, t("menu.edit"));
    nodes.find((node) => node.className === "play-card-open" && node.tagName === "button")?.click();
    press(nodes, t("menu.clone"));
    press(nodes, t("menu.reroll"));
    press(nodes, t("menu.newCharacter"));
    expect(edited).toEqual(["mine", "mine"]);
    expect(cloned).toEqual(["rolled"]);
    expect(rerolled).toEqual(["rolled"]);
    expect(added).toBe(1);
  });
});
