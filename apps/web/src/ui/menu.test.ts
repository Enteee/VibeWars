import { defaultBuildEquipment } from "@vibewars/game-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import {
  PLAY_TABS,
  isPlayable,
  loadPlayTab,
  renderMenu,
  rosterOrder,
  rosterSubtitle,
  rosterTags,
  savePlayTab,
  soloPlayActions,
  type MenuCallbacks,
} from "./menu.js";

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

  it("follows it with the character's record, draws only when there are some (#1404)", () => {
    expect(rosterSubtitle(character(), { wins: 12, losses: 7, draws: 0 })).toBe(
      "Elementalist / Monk · 1/8 skills · 12W 7L",
    );
    expect(rosterSubtitle(character(), { wins: 12, losses: 7, draws: 1 })).toBe(
      "Elementalist / Monk · 1/8 skills · 12W 7L 1D",
    );
    // A character that has not played shows nothing extra.
    expect(rosterSubtitle(character(), undefined)).toBe("Elementalist / Monk · 1/8 skills");
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

describe("Solo Play / Team Play (#1453)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads Solo Play, then Team Play", () => {
    expect(PLAY_TABS.map(({ label }) => label)).toEqual(["Solo Play", "Team Play"]);
  });

  it("keeps Record in the bar, and no Teams or Music", () => {
    expect(soloPlayActions({ onShowRecord: () => undefined }).map(({ label }) => label)).toEqual([
      "Record",
    ]);
  });

  it("starts on Solo Play and remembers the tab last switched to", () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    expect(loadPlayTab()).toBe("solo");
    savePlayTab("team");
    expect(stored.get(`${STORAGE_NAMESPACE}.playTab`)).toBe("team");
    expect(loadPlayTab()).toBe("team");
    savePlayTab("solo");
    expect(loadPlayTab()).toBe("solo");
    stored.set(`${STORAGE_NAMESPACE}.playTab`, "teams");
    expect(loadPlayTab()).toBe("solo");
  });
});

/** Just enough DOM to render Solo Play; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  value = "";
  placeholder = "";
  disabled = false;
  hidden = false;
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

describe("Solo Play's name (#1513)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has no Name or Guild tag field, and hosts as the name saved in Options", () => {
    const stored = new Map([[`${STORAGE_NAMESPACE}.playerName`, "Rurik"]]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null });
    vi.stubGlobal("window", { addEventListener: () => undefined });
    vi.stubGlobal("document", {
      activeElement: null,
      createElement: (tag: string) => new FakeElement(tag),
    });
    const hosted: string[] = [];
    const callbacks: MenuCallbacks = {
      onRandomArena: () => undefined,
      onCreateLobby: (name) => hosted.push(name),
      onJoinLobby: () => undefined,
      onSwitchTab: () => undefined,
      onShowRecord: () => undefined,
      onNewCharacter: () => undefined,
      onEditCharacter: () => undefined,
      onCloneStarter: () => undefined,
      onRerollCharacter: () => undefined,
      onSelectCharacter: () => undefined,
    };
    const root = new FakeElement("div");
    renderMenu(root as unknown as HTMLElement, callbacks);

    const shown = root.all();
    // The join code is the only text field left.
    expect(shown.filter((node) => node.tagName === "input")).toHaveLength(1);
    expect(shown.some((node) => node.textContent === "Guild tag")).toBe(false);
    expect(shown.some((node) => node.className.includes("cape"))).toBe(false);
    shown.find((node) => node.textContent === "Host a lobby")?.click();
    expect(hosted).toEqual(["Rurik"]);
  });
});
