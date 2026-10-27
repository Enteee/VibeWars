import { describe, expect, it } from "vitest";

import {
  MAX_EDIT_BYTES,
  createBeatEditStore,
  editRemovedNotice,
  parseBeatEdits,
  shippedHash,
  tooLarge,
  type BeatEdit,
} from "./beat-edits.js";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

const TRACK = { id: "ember-deep", title: "Ember Deep", source: 's("bd")' };

describe("the beat edits (#373)", () => {
  it("survive a reload, and play only once their hashes are checked", async () => {
    const storage = memoryStorage();
    const edit: BeatEdit = { shippedHash: await shippedHash(TRACK.source), source: 's("hh")' };
    createBeatEditStore(() => storage).save(TRACK.id, edit);

    const reloaded = createBeatEditStore(() => storage);
    expect(reloaded.get(TRACK.id)).toBeUndefined();
    expect(await reloaded.load([TRACK])).toEqual([]);
    expect(reloaded.get(TRACK.id)).toEqual(edit);
  });

  it("delete a stale edit and say so once", async () => {
    const storage = memoryStorage();
    createBeatEditStore(() => storage).save(TRACK.id, {
      shippedHash: await shippedHash('s("sd")'),
      source: 's("hh")',
    });

    const reloaded = createBeatEditStore(() => storage);
    expect(await reloaded.load([TRACK])).toEqual([editRemovedNotice("Ember Deep")]);
    expect(reloaded.get(TRACK.id)).toBeUndefined();
    expect(await createBeatEditStore(() => storage).load([TRACK])).toEqual([]);
  });

  it("forget the edit of a track no longer shipped, with no notice", async () => {
    const storage = memoryStorage();
    createBeatEditStore(() => storage).save("gone", {
      shippedHash: await shippedHash(TRACK.source),
      source: 's("hh")',
    });
    const reloaded = createBeatEditStore(() => storage);
    expect(await reloaded.load([TRACK])).toEqual([]);
    expect(reloaded.get("gone")).toBeUndefined();
  });

  it("are none when the stored map is malformed", () => {
    const hash = "a".repeat(64);
    expect(parseBeatEdits(null)).toEqual(new Map());
    expect(parseBeatEdits("{")).toEqual(new Map());
    expect(parseBeatEdits("[]")).toEqual(new Map());
    expect(parseBeatEdits(JSON.stringify({ x: { shippedHash: "short", source: "" } }))).toEqual(
      new Map(),
    );
    expect(parseBeatEdits(JSON.stringify({ x: { shippedHash: hash } }))).toEqual(new Map());
    expect(parseBeatEdits(JSON.stringify({ x: { shippedHash: hash, source: "s" } }))).toEqual(
      new Map([["x", { shippedHash: hash, source: "s" }]]),
    );
  });

  it("removing one tells its subscribers", () => {
    const store = createBeatEditStore(memoryStorage);
    let changes = 0;
    store.subscribe(() => {
      changes += 1;
    });
    store.save(TRACK.id, { shippedHash: "a".repeat(64), source: "" });
    store.remove(TRACK.id);
    store.remove(TRACK.id);
    expect(changes).toBe(2);
    expect(store.get(TRACK.id)).toBeUndefined();
  });

  it("refuse a source over 64 KB, counted in UTF-8 bytes", () => {
    expect(tooLarge("a".repeat(MAX_EDIT_BYTES))).toBe(false);
    expect(tooLarge("a".repeat(MAX_EDIT_BYTES + 1))).toBe(true);
    expect(tooLarge("é".repeat(MAX_EDIT_BYTES / 2 + 1))).toBe(true);
  });

  it("hash the shipped source as SHA-256 hex", async () => {
    expect(await shippedHash("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
