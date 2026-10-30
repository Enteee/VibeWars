import { defaultBuildEquipment } from "@vibewars/game-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import {
  FIRST_CAPE,
  isInvalidGuildTag,
  PLAY_TABS,
  isPlayable,
  loadGuildCape,
  loadGuildTag,
  loadPlayTab,
  pickCape,
  playerGuild,
  playerGuildTag,
  rosterOrder,
  rosterSubtitle,
  rosterTags,
  saveGuildCape,
  saveGuildTag,
  savePlayTab,
  showsCapeDesigner,
  soloPlayActions,
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
    const gold = pickCape(null, { part: "main", colour: "gold" });
    expect(gold).toEqual({ ...FIRST_CAPE, main: "gold" });
    expect(pickCape(gold, { part: "trim", colour: "gold" })).toEqual({
      ...FIRST_CAPE,
      main: "gold",
      trim: "gold",
    });
    expect(pickCape(gold, { part: "emblem", emblem: "ring" })).toEqual({
      ...FIRST_CAPE,
      main: "gold",
      emblem: "ring",
    });
    expect(pickCape(gold, { part: "none" })).toBeNull();
  });

  it("remembers the cape, and wears it only with a valid tag", () => {
    storage();
    expect(loadGuildCape()).toBeNull();
    saveGuildCape(FIRST_CAPE);
    expect(loadGuildCape()).toEqual(FIRST_CAPE);
    expect(playerGuild()).toEqual({ guildTag: null, guildCape: null });
    saveGuildTag("VIBE");
    expect(playerGuild()).toEqual({ guildTag: "VIBE", guildCape: FIRST_CAPE });
    // Cleared, the tag takes the cape off but keeps it for when it is back.
    saveGuildTag("");
    expect(playerGuild().guildCape).toBeNull();
    expect(loadGuildCape()).toEqual(FIRST_CAPE);
    saveGuildCape(null);
    expect(loadGuildCape()).toBeNull();
  });

  it("reads anything stored that is no cape as none", () => {
    const stored = storage();
    for (const corrupt of [
      "{",
      "null",
      '"violet"',
      JSON.stringify({ ...FIRST_CAPE, main: "red" }),
    ]) {
      stored.set(`${STORAGE_NAMESPACE}.guildCape`, corrupt);
      expect(loadGuildCape()).toBeNull();
    }
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
