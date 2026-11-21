import { describe, expect, it } from "vitest";

import type { Leaderboard, LeaderboardEntry } from "../net/leaderboard.js";
import { loadPlayerKey } from "../net/transport/player-key.js";
import { COSMETIC_CATALOG, cosmeticById, type CosmeticEntry } from "./catalog.js";
import { checkCosmetic } from "./check.js";
import {
  buildSelection,
  ownCosmetics,
  signSelection,
  verifySelection,
  visibleCosmetics,
  wornOf,
} from "./selection.js";
import { createCosmeticsStore } from "./store.js";
import { FLAME_STREAK, TIERS, TOP_RANK, isUnlocked } from "./unlocks.js";

/** A `Storage` in memory. */
function memory(): Storage & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    get length() {
      return items.size;
    },
    clear: () => {
      items.clear();
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

function entry(id: string): CosmeticEntry {
  const found = cosmeticById(id);
  if (found === undefined) {
    throw new Error(`no ${id}`);
  }
  return found;
}

const facts = (wins: number, rank: number | null = null, streak = 0) => ({ wins, rank, streak });

function boardWith(pubkey: string, wins: number, rank: number | null = null): Leaderboard {
  const listed: LeaderboardEntry = {
    pubkey,
    rank,
    name: "Ana",
    rating: 1600,
    conservative: 1500,
    matches: wins,
    provisional: false,
    wins,
    streak: 0,
  };
  return { asOf: 1_700_000_000, entries: [listed] };
}

describe("unlocks (ADR-0056)", () => {
  it("opens a wins tier at its count, not one short", () => {
    expect(isUnlocked(entry("frame-rose"), facts(TIERS[2] - 1))).toBe(false);
    expect(isUnlocked(entry("frame-rose"), facts(TIERS[2]))).toBe(true);
  });

  it("opens Top only while ranked in it, whatever the wins", () => {
    expect(isUnlocked(entry("frame-orchid"), facts(10_000, null))).toBe(false);
    expect(isUnlocked(entry("frame-orchid"), facts(0, TOP_RANK + 1))).toBe(false);
    expect(isUnlocked(entry("frame-orchid"), facts(0, TOP_RANK))).toBe(true);
  });

  it("lights the flame from the streak alone", () => {
    expect(isUnlocked(entry("flame-streak"), facts(500, 1, FLAME_STREAK - 1))).toBe(false);
    expect(isUnlocked(entry("flame-streak"), facts(0, null, FLAME_STREAK))).toBe(true);
  });

  it("earns nothing off the leaderboard", () => {
    expect(COSMETIC_CATALOG.some((each) => isUnlocked(each, undefined))).toBe(false);
  });
});

describe("checkCosmetic (ADR-0056 §4)", () => {
  it("passes every catalog entry", () => {
    for (const each of COSMETIC_CATALOG) {
      expect(checkCosmetic(each), each.id).toEqual([]);
    }
  });

  it("fails a team colour, a big or strong ground effect, and one with no size", () => {
    const frame = entry("frame-jade");
    if (frame.look.kind !== "frame") {
      throw new Error("frame-jade is a frame");
    }
    const blue = { ...frame, look: { ...frame.look, colour: 0x59c2ff } };
    expect(checkCosmetic(blue)).toContain("frame-jade: #59c2ff reads as the cue #59c2ff");
    const ground = {
      ...frame,
      look: {
        ...frame.look,
        layer: "under-body" as const,
        ground: { radiusOfBody: 0.8, alpha: 0.5 },
      },
    };
    expect(checkCosmetic(ground)).toHaveLength(2);
    const bare = { ...frame, look: { ...frame.look, layer: "under-body" as const } };
    expect(checkCosmetic(bare)).toHaveLength(1);
  });

  it("has unique ids that fit the wire", () => {
    const ids = COSMETIC_CATALOG.map((each) => each.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length <= 32)).toBe(true);
  });
});

describe("a cosmetic selection (ADR-0056)", () => {
  const key = loadPlayerKey(memory());
  const other = loadPlayerKey(memory());
  const choice = { frame: "frame-rose", title: "title-contender" } as const;
  const signed = signSelection(key, choice, 1_700_000_000_000);

  it("lists its ids in slot order, one per slot", () => {
    expect(
      buildSelection(key.pubkey, { title: "title-veteran", frame: "frame-jade" }, 5).ids,
    ).toEqual(["frame-jade", "title-veteran"]);
  });

  it("verifies for its own key and nothing changed", () => {
    expect(verifySelection(key.pubkey, signed)).toBe(true);
    expect(verifySelection(other.pubkey, signed)).toBe(false);
    expect(verifySelection(key.pubkey, { ...signed, ids: ["frame-orchid"] })).toBe(false);
    expect(verifySelection(key.pubkey, { ...signed, at: signed.at + 1 })).toBe(false);
  });

  it("signs an empty list too", () => {
    expect(verifySelection(key.pubkey, signSelection(key, {}, 0))).toBe(true);
  });

  it("shows another seat what its board says it earned", () => {
    const seat = { playerPubkey: key.pubkey, cosmetics: signed };
    const worn = visibleCosmetics(seat, boardWith(key.pubkey, TIERS[2]), true);
    expect(worn.frame?.id).toBe("frame-rose");
    expect(worn.title?.id).toBe("title-contender");
    // Five wins earn the title but not the rose frame.
    expect(visibleCosmetics(seat, boardWith(key.pubkey, TIERS[1]), true)).toEqual({
      title: entry("title-contender"),
    });
  });

  it("draws the default for a selection signed by another key, an unlisted key, or with others hidden", () => {
    const board = boardWith(key.pubkey, TIERS[5]);
    expect(
      visibleCosmetics({ playerPubkey: other.pubkey, cosmetics: signed }, board, true),
    ).toEqual({});
    expect(
      visibleCosmetics({ playerPubkey: key.pubkey, cosmetics: signed }, undefined, true),
    ).toEqual({});
    expect(visibleCosmetics({ playerPubkey: key.pubkey, cosmetics: signed }, board, false)).toEqual(
      {},
    );
  });

  it("passes over an id from a newer build, and a second id for a slot", () => {
    expect(wornOf(["frame-of-the-future", "frame-jade", "frame-rose"], facts(TIERS[5]))).toEqual({
      frame: entry("frame-jade"),
    });
  });

  it("keeps a lost Top item picked, but draws it default for you too", () => {
    expect(ownCosmetics({ frame: "frame-orchid" }, facts(0, TOP_RANK))).toEqual({
      frame: entry("frame-orchid"),
    });
    expect(ownCosmetics({ frame: "frame-orchid" }, facts(0, TOP_RANK + 1))).toEqual({});
  });
});

describe("the cosmetics store (ADR-0056)", () => {
  it("keeps picks and facts across pages, per browser", () => {
    const storage = memory();
    const first = createCosmeticsStore(storage);
    first.pick("frame", "frame-jade");
    first.rememberFacts(facts(7, null, 1));
    const next = createCosmeticsStore(storage);
    expect(next.choice()).toEqual({ frame: "frame-jade" });
    expect(next.lastFacts()).toEqual(facts(7, null, 1));
  });

  it("shows others' cosmetics until told not to", () => {
    const storage = memory();
    expect(createCosmeticsStore(storage).showOthers()).toBe(true);
    createCosmeticsStore(storage).setShowOthers(false);
    expect(createCosmeticsStore(storage).showOthers()).toBe(false);
  });

  it("deletes a stored record of another shape rather than reading it (ADR-0016)", () => {
    const storage = memory();
    storage.setItem(
      "vibewars.cosmetics",
      JSON.stringify({ choice: { frame: "title-veteran" }, facts: null }),
    );
    expect(createCosmeticsStore(storage).choice()).toEqual({});
    expect(storage.items.has("vibewars.cosmetics")).toBe(false);
  });
});
