import { packEmblem } from "@vibewars/game-protocol";
import { sanitizeName } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMBLEM_PRESET_NAMES, presetEmblem } from "../render/cape-shape.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import {
  FIRST_CAPE,
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
    const ring = { emblem: packEmblem(presetEmblem("ring")), emblemColours: ["23272e"] };
    expect(pickCape(gold, { part: "emblem", ...ring })).toEqual({
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

  it("replaces anything stored that is no cape, a shape emblem's too, with the sample (#3554)", () => {
    const stored = storage();
    for (const corrupt of [
      "{",
      "null",
      '"violet"',
      JSON.stringify({ ...FIRST_CAPE, main: "red" }),
      JSON.stringify({ main: "violet", trim: "white", emblem: "diamond" }),
      // A cape from before its colours were picked freely (#3628).
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
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
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

  it("always shows the emblem editor with the cape designer, and no emblem row (#3628)", () => {
    const { tag, cape, shown } = mount();
    expect(cape.hidden).toBe(true);
    tag.typeIn("VIBE");
    expect(cape.hidden).toBe(false);
    expect(cape.all().find((node) => node.className === "emblem-editor")).toBeDefined();
    expect(shown.find((node) => node.textContent === "Edit emblem")).toBeUndefined();
    expect(shown.find((node) => node.className === "player-cape-emblem")).toBeUndefined();
    expect(shown.find((node) => node.className === "player-cape-swatch")).toBeUndefined();
    // Nothing applied by showing it.
    expect(loadGuildCape()).toBeNull();
  });

  /** The CAPE or TRIM colour picker. */
  function colourInput(shown: FakeElement[], part: "main" | "trim"): FakeElement {
    const input = shown.find((node) => node.dataset.part === part);
    if (input === undefined) throw new Error(`no ${part} picker`);
    return input;
  }

  it("saves a cape on every pick, CAPE and TRIM any colour (#3628)", () => {
    stored.set(`${STORAGE_NAMESPACE}.guildTag`, "VIBE");
    const { shown } = mount();
    const main = colourInput(shown, "main");
    expect(main.type).toBe("color");
    expect(main.value).toBe(`#${FIRST_CAPE.main}`);
    main.typeIn("#12AB34");
    expect(loadGuildCape()).toEqual({ ...FIRST_CAPE, main: "12ab34" });
    colourInput(shown, "trim").typeIn("#ff7b72");
    expect(loadGuildCape()).toEqual({ ...FIRST_CAPE, main: "12ab34", trim: "ff7b72" });
    shown.find((node) => node.textContent === "No cape")?.click();
    expect(loadGuildCape()).toBeNull();
  });

  it("saves the emblem as a stroke or a Start from applies it (#3628)", () => {
    stored.set(`${STORAGE_NAMESPACE}.guildTag`, "VIBE");
    const { shown } = mount();
    shown.find((node) => node.textContent === "Clear")?.click();
    expect(loadGuildCape()).toEqual({
      ...FIRST_CAPE,
      emblemColours: [],
      emblem: packEmblem([]),
    });
    shown.find((node) => node.dataset.emblem === "ring")?.click();
    expect(loadGuildCape()).toEqual({
      ...FIRST_CAPE,
      emblem: packEmblem(presetEmblem("ring")),
    });
  });

  it("shows no figure beside the picks (#3760)", () => {
    stored.set(`${STORAGE_NAMESPACE}.guildTag`, "VIBE");
    const { cape, shown } = mount();
    colourInput(shown, "main").typeIn("#e6c04a");
    expect(
      cape.all().some((node) => node.tagName === "canvas" && node.className === "character-figure"),
    ).toBe(false);
  });

  it("starts from each preset in the drawing colour (#3554, #3628)", () => {
    stored.set(`${STORAGE_NAMESPACE}.guildTag`, "VIBE");
    const { shown } = mount();
    for (const name of EMBLEM_PRESET_NAMES) {
      shown.find((node) => node.dataset.emblem === name)?.click();
      expect(loadGuildCape()).toEqual({ ...FIRST_CAPE, emblem: packEmblem(presetEmblem(name)) });
    }
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
