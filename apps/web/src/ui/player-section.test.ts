import { defaultBuildEquipment } from "@vibewars/game-core";
import { packEmblem } from "@vibewars/game-protocol";
import { sanitizeName } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { presetEmblem } from "../render/cape-shape.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import { saveActiveCharacterId, saveStarterCharacterId } from "./menu.js";
import {
  FIRST_CAPE,
  capeWearer,
  isInvalidGuildTag,
  loadGuildCape,
  loadGuildTag,
  loadPlayerName,
  pickCape,
  playerGuild,
  sameTypedGuild,
  playerGuildTag,
  playerSection,
  saveGuildCape,
  saveGuildTag,
  setCapeWearers,
  showsCapeDesigner,
} from "./player-section.js";
import { SIGNET_HEADING_PX, signetUrl } from "./player-label.js";

describe("the guild tag field (#1406)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows as invalid only what is typed and is no tag", () => {
    expect(isInvalidGuildTag("")).toBe(false);
    expect(isInvalidGuildTag("  ")).toBe(false);
    expect(isInvalidGuildTag("VIBE")).toBe(false);
    expect(isInvalidGuildTag("V")).toBe(true);
    expect(isInvalidGuildTag("V B")).toBe(true);
    expect(isInvalidGuildTag("[V]")).toBe(true);
  });

  it("remembers what was typed, and plays it only when it is a tag", () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    expect(loadGuildTag()).toBe("");
    expect(playerGuildTag()).toBeNull();
    saveGuildTag("V!");
    expect(loadGuildTag()).toBe("V!");
    expect(playerGuildTag()).toBeNull();
    saveGuildTag("Vb ");
    expect(playerGuildTag()).toBe("Vb");
  });

  it("plays untagged when the browser keeps nothing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private browsing");
      },
      setItem: () => {
        throw new Error("private browsing");
      },
    });
    saveGuildTag("VIBE");
    expect(playerGuildTag()).toBeNull();
  });
});

describe("the cape designer (#1422)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A localStorage on a map, as the browser keeps one. */
  function storage(): Map<string, string> {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
    return stored;
  }

  it("shows only while the tag is a valid one", () => {
    expect(showsCapeDesigner("")).toBe(false);
    expect(showsCapeDesigner("V")).toBe(false);
    expect(showsCapeDesigner("[VB]")).toBe(false);
    expect(showsCapeDesigner(" Vb ")).toBe(true);
  });

  it("starts a first pick from the sample, changes one part a pick, and No cape clears it", () => {
    const gold = pickCape(null, { part: "main", colour: "e6c04a" });
    expect(gold).toEqual({ ...FIRST_CAPE, main: "e6c04a" });
    // The trim no longer drives the emblem's colours (#3628).
    expect(pickCape(gold, { part: "trim", colour: "e6c04a" })).toEqual({
      ...FIRST_CAPE,
      main: "e6c04a",
      trim: "e6c04a",
    });
    const ring = { emblemColours: ["2fb8a0"], emblem: packEmblem(presetEmblem("ring")) };
    expect(pickCape(gold, { part: "emblem", emblem: ring })).toEqual({
      ...FIRST_CAPE,
      main: "e6c04a",
      ...ring,
    });
    expect(pickCape(gold, { part: "none" })).toBeNull();
  });

  it("remembers the cape, and wears it only with a valid tag", () => {
    storage();
    expect(loadGuildCape()).toBeNull();
    saveGuildCape(FIRST_CAPE);
    expect(loadGuildCape()).toEqual(FIRST_CAPE);
    expect(playerGuild()).toEqual({ guildTag: null, heroRank: 0, guildCape: null });
    saveGuildTag("VIBE");
    expect(playerGuild()).toEqual({ guildTag: "VIBE", heroRank: 0, guildCape: FIRST_CAPE });
    // Cleared, the tag takes the cape off but keeps it for when it is back.
    saveGuildTag("");
    expect(playerGuild().guildCape).toBeNull();
    expect(loadGuildCape()).toEqual(FIRST_CAPE);
    saveGuildCape(null);
    expect(loadGuildCape()).toBeNull();
  });

  it("replaces anything stored that is no cape, an older shape's too, with the sample (#3554, #3628)", () => {
    const stored = storage();
    for (const corrupt of [
      "{",
      "null",
      '"violet"',
      JSON.stringify({ ...FIRST_CAPE, main: "red" }),
      JSON.stringify({ main: "violet", trim: "white", emblem: "diamond" }),
      // One from before a cape had colours of its own (#3628).
      JSON.stringify({ main: "violet", trim: "white", emblem: FIRST_CAPE.emblem }),
    ]) {
      stored.set(`${STORAGE_NAMESPACE}.guildCape`, corrupt);
      expect(loadGuildCape()).toEqual(FIRST_CAPE);
      expect(stored.get(`${STORAGE_NAMESPACE}.guildCape`)).toBe(JSON.stringify(FIRST_CAPE));
    }
  });
});

/** Just enough DOM for the Player section; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  value = "";
  placeholder = "";
  title = "";
  maxLength = -1;
  hidden = false;
  type = "";
  src = "";
  alt = "";
  width = 0;
  height = 0;
  tabIndex = -1;
  disabled = false;
  readonly dataset: Record<string, string> = {};
  readonly style = { setProperty: () => undefined, removeProperty: () => undefined };
  readonly classList = { add: () => undefined, toggle: () => undefined };
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();

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

  readonly getContext = (): null => null;
  readonly toDataURL = (): string => "";

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
    this.children.length = 0;
    this.append(...children);
  }

  remove(): void {
    // Detached by the container's owner; nothing to do here.
  }

  /** Every element under this one, in document order. */
  all(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }

  /** Type `text` into this input, as one input event. */
  typeIn(text: string): void {
    this.value = text;
    this.listeners.get("input")?.();
  }

  click(): void {
    this.listeners.get("click")?.();
  }
}

describe("the Player section of Options (#1513)", () => {
  let stored: Map<string, string>;

  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
    vi.stubGlobal("window", { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    setCapeWearers(() => Promise.resolve([]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Mount the section; its name and tag fields, its cape designer, and all of it. */
  function mount(signet = 0) {
    const container = new FakeElement("div");
    playerSection(signet).mount(container as unknown as HTMLElement);
    const shown = container.all();
    const [name, tag] = shown.filter((node) => node.tagName === "input");
    const cape = shown.find((node) => node.className === "player-cape");
    if (name === undefined || tag === undefined || cape === undefined) {
      throw new Error("no name, tag or cape designer");
    }
    return { name, tag, cape, shown };
  }

  it("no longer says a change waits for the next lobby (#3548)", () => {
    expect(mount().shown.some((node) => node.className === "player-applies")).toBe(false);
  });

  it("shows the key's signet just left of the name (#3235)", () => {
    const { name, shown } = mount(12345);
    const row = shown.find((node) => node.children.includes(name));
    expect(row?.className).toBe("player-name-row");
    const [signet] = row?.children ?? [];
    expect(signet?.className).toBe("signet");
    expect(signet?.src).toBe(signetUrl(12345, SIGNET_HEADING_PX));
    expect(row?.children.indexOf(name)).toBe(1);
  });

  it("shows what is saved, and saves the name and tag on every keystroke", () => {
    stored.set(`${STORAGE_NAMESPACE}.playerName`, "Rurik");
    stored.set(`${STORAGE_NAMESPACE}.guildTag`, "VIBE");
    const { name, tag } = mount();
    expect(name.value).toBe("Rurik");
    expect(name.placeholder).toBe("Player");
    expect(tag.value).toBe("VIBE");
    name.typeIn("Ente");
    expect(loadPlayerName()).toBe("Ente");
    tag.typeIn("VB");
    expect(loadGuildTag()).toBe("VB");
  });

  it("hides the cape designer and shows the hint while the tag is invalid", () => {
    const { tag, cape, shown } = mount();
    const hint = shown.find((node) => node.className === "field-hint");
    expect(cape.hidden).toBe(true);
    tag.typeIn("VIBE");
    expect(cape.hidden).toBe(false);
    expect(hint?.hidden).toBe(true);
    tag.typeIn("V!");
    expect(cape.hidden).toBe(true);
    expect(hint?.hidden).toBe(false);
    expect(tag.attributes.get("aria-invalid")).toBe("true");
  });

  it("always shows the emblem editor under CAPE and TRIM, with no emblem row and no Edit emblem (#3628)", () => {
    const { tag, cape, shown } = mount();
    expect(shown.some((node) => node.textContent === "Edit emblem")).toBe(false);
    expect(shown.some((node) => node.className === "player-cape-emblem")).toBe(false);
    tag.typeIn("VIBE");
    const parts = cape.all();
    const pickers = parts.filter((node) => node.className === "player-cape-colour");
    expect(pickers.map((node) => [node.type, node.dataset.part])).toEqual([
      ["color", "main"],
      ["color", "trim"],
    ]);
    const editor = parts.find((node) => node.className === "emblem-editor");
    expect(editor).toBeDefined();
    expect(parts.indexOf(editor ?? cape)).toBeGreaterThan(parts.indexOf(pickers[1] ?? cape));
  });

  /** The designer's colour picker for `part`. */
  function pickerOf(shown: readonly FakeElement[], part: "main" | "trim"): FakeElement {
    const picker = shown.find(
      (node) => node.className === "player-cape-colour" && node.dataset.part === part,
    );
    if (picker === undefined) {
      throw new Error(`no ${part} picker`);
    }
    return picker;
  }

  it("saves a cape on every pick, any colour, as 6 lowercase hex digits", () => {
    stored.set(`${STORAGE_NAMESPACE}.guildTag`, "VIBE");
    const { shown } = mount();
    const main = pickerOf(shown, "main");
    expect(main.value).toBe(`#${FIRST_CAPE.main}`);
    main.typeIn("#12AB56");
    expect(loadGuildCape()).toEqual({ ...FIRST_CAPE, main: "12ab56" });
    pickerOf(shown, "trim").typeIn("#000001");
    expect(loadGuildCape()).toEqual({ ...FIRST_CAPE, main: "12ab56", trim: "000001" });
    shown.find((node) => node.textContent === "No cape")?.click();
    expect(loadGuildCape()).toBeNull();
  });

  it("applies the emblem editor's every action to the saved cape at once (#3628)", () => {
    stored.set(`${STORAGE_NAMESPACE}.guildTag`, "VIBE");
    const { shown } = mount();
    shown.find((node) => node.dataset.emblem === "ring")?.click();
    expect(loadGuildCape()).toEqual({
      ...FIRST_CAPE,
      emblem: packEmblem(presetEmblem("ring")),
    });
    shown.find((node) => node.textContent === "Clear")?.click();
    expect(loadGuildCape()).toEqual({ ...FIRST_CAPE, emblemColours: [], emblem: packEmblem([]) });
  });

  /** The cape designer's figure, the one shown now. */
  function figureIn(cape: FakeElement): FakeElement | undefined {
    return cape.all().find((node) => node.className === "character-figure");
  }

  it("dresses a figure in the cape being designed, redrawn on every pick (#3551)", () => {
    stored.set(`${STORAGE_NAMESPACE}.guildTag`, "VIBE");
    const { cape, shown } = mount();
    const first = figureIn(cape);
    expect(first?.tagName).toBe("canvas");
    // Nothing saved yet: no cape.
    expect(first?.dataset.cape).toBeUndefined();
    pickerOf(shown, "main").typeIn("#e6c04a");
    const second = figureIn(cape);
    expect(second).not.toBe(first);
    expect(second?.dataset.cape).toBe(
      `e6c04a.${FIRST_CAPE.trim}.${FIRST_CAPE.emblem}.${FIRST_CAPE.emblemColours.join("")}`,
    );
    shown.find((node) => node.textContent === "No cape")?.click();
    expect(figureIn(cape)?.dataset.cape).toBeUndefined();
    expect(cape.all().filter((node) => node.className === "character-figure")).toHaveLength(1);
  });

  it("shows no figure without a valid tag (#3551)", () => {
    const { cape } = mount();
    expect(cape.hidden).toBe(true);
  });

  it("dresses the menu's character once the roster is read, else the bare body (#3551)", async () => {
    stored.set(`${STORAGE_NAMESPACE}.guildTag`, "VIBE");
    setCapeWearers(() => Promise.resolve([pyro()]));
    saveActiveCharacterId("a");
    const { cape } = mount();
    expect(figureIn(cape)?.attributes.get("aria-label")).toContain("Warrior");
    await Promise.resolve();
    await Promise.resolve();
    expect(figureIn(cape)?.attributes.get("aria-label")).toContain("Elementalist");
  });

  it("offers the guild link only with a valid tag, and copies the tag and cape (#3167)", async () => {
    stored.set(`${STORAGE_NAMESPACE}.guildTag`, "VW");
    stored.set(`${STORAGE_NAMESPACE}.guildCape`, JSON.stringify(FIRST_CAPE));
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("location", { origin: "https://vibewars.example", pathname: "/" });
    vi.stubGlobal("document", {
      createElement: (tag: string) => new FakeElement(tag),
      body: new FakeElement("body"),
    });
    const { tag, shown } = mount();
    const copy = shown.find((node) => node.className === "player-guild-copy");
    expect(copy?.hidden).toBe(false);
    copy?.click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        `https://vibewars.example/#guild=VW.a078e0.f2f2f2.${FIRST_CAPE.emblem}.f2f2f2`,
      );
    });
    tag.typeIn("V!");
    expect(copy?.hidden).toBe(true);
  });
});

/** A playable character, as saved. */
function pyro(overrides: Partial<StoredCharacter> = {}): StoredCharacter {
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

describe("capeWearer (#3551)", () => {
  beforeEach(() => {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const illegal = pyro({
    id: "b",
    skillBar: ["no.such-skill", null, null, null, null, null, null, null],
  });
  const starter = pyro({ id: "c" });

  it("is the active character when it is playable, else the starter, else none", () => {
    expect(capeWearer([pyro(), starter])).toBeUndefined();
    saveStarterCharacterId("c");
    expect(capeWearer([pyro(), starter])?.id).toBe("c");
    saveActiveCharacterId("a");
    expect(capeWearer([pyro(), starter])?.id).toBe("a");
    saveActiveCharacterId("b");
    expect(capeWearer([illegal, starter])?.id).toBe("c");
  });
});

describe("sameTypedGuild (#2702)", () => {
  const guild = { guildTag: "VIBE", heroRank: 3, guildCape: null };

  it("does not call an earned rank a rename", () => {
    expect(sameTypedGuild(guild, { ...guild, heroRank: 4 })).toBe(true);
  });

  it("calls a new tag or cape one, and so no guild at all", () => {
    expect(sameTypedGuild(guild, { ...guild, guildTag: "NEW" })).toBe(false);
    expect(sameTypedGuild(guild, { ...guild, guildCape: FIRST_CAPE })).toBe(false);
    expect(sameTypedGuild(undefined, guild)).toBe(false);
  });
});

describe("the player's name on a first visit (#2653)", () => {
  const key = `${STORAGE_NAMESPACE}.playerName`;
  let stored: Map<string, string>;

  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (at: string) => stored.get(at) ?? null,
      setItem: (at: string, value: string) => stored.set(at, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates a name, keeps it, and gives the same one next time", () => {
    const name = loadPlayerName();
    expect(name).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
    expect(sanitizeName(name, "x")).toBe(name);
    expect(stored.get(key)).toBe(name);
    expect(loadPlayerName()).toBe(name);
  });

  it("never replaces a stored name, not even an emptied one", () => {
    stored.set(key, "Ann");
    expect(loadPlayerName()).toBe("Ann");
    stored.set(key, "");
    expect(loadPlayerName()).toBe("");
  });

  it("gives the same name all page long when the browser keeps nothing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private mode");
      },
    });
    const name = loadPlayerName();
    expect(name).not.toBe("");
    expect(loadPlayerName()).toBe(name);
  });
});
