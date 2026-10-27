import { describe, expect, it } from "vitest";

import { createBeatEditStore } from "./beat-edits.js";
import { beatEvaluations } from "./beat-evaluations.js";

const TRACK = { id: "ember-deep", source: 's("bd")' };
const GOOD = 's("hh")';
const BROKEN = ")))(";

/** Evaluations over an in-memory store, with the shipped hash resolved when `hash` is. */
function setup() {
  const items = new Map<string, string>();
  const edits = createBeatEditStore(
    () => ({
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => {
        items.set(key, value);
      },
    }),
    () => Promise.resolve("shipped"),
  );
  let hash: (value: string) => void = () => undefined;
  const hashed = new Promise<string>((resolve) => {
    hash = resolve;
  });
  const evaluations = beatEvaluations(TRACK.id, TRACK.source, edits, hashed);
  return { edits, evaluations, hash };
}

describe("the beat editor's evaluations (#373)", () => {
  it("keeps the good edit that plays when a broken one sent after it fails", async () => {
    const { edits, evaluations, hash } = setup();
    hash("shipped");
    evaluations.sent(1, { kind: "edit", source: GOOD });
    evaluations.sent(2, { kind: "edit", source: BROKEN });
    // The good one's answer is not the newest's, so it is kept but not shown.
    expect(evaluations.evaluated(1)).toBeUndefined();
    expect(evaluations.failed(2)).toBe(true);
    await evaluations.settled();
    expect(edits.get(TRACK.id)?.source).toBe(GOOD);
  });

  it("keeps a good edit sent after a broken one, and shows only the good one's answer", async () => {
    const { edits, evaluations, hash } = setup();
    hash("shipped");
    evaluations.sent(1, { kind: "edit", source: BROKEN });
    evaluations.sent(2, { kind: "edit", source: GOOD });
    expect(evaluations.failed(1)).toBe(false);
    expect(evaluations.evaluated(2)).toEqual({ kind: "edit", source: GOOD });
    await evaluations.settled();
    expect(edits.get(TRACK.id)?.source).toBe(GOOD);
  });

  it("takes an error that answers no evaluation for nobody's", () => {
    const { evaluations } = setup();
    evaluations.sent(1, { kind: "edit", source: GOOD });
    // A playing pattern's error carries no number; the editor ignores it,
    // and an answer it never sent is not its own either.
    expect(evaluations.failed(7)).toBe(false);
    expect(evaluations.evaluated(7)).toBeUndefined();
    expect(evaluations.evaluated(1)).toEqual({ kind: "edit", source: GOOD });
  });

  it("answers each evaluation once", () => {
    const { evaluations } = setup();
    evaluations.sent(1, { kind: "edit", source: GOOD });
    expect(evaluations.evaluated(1)).toBeDefined();
    expect(evaluations.evaluated(1)).toBeUndefined();
    expect(evaluations.failed(1)).toBe(false);
  });

  it("is not undone by a save that waited on the hash when Reset is pressed", async () => {
    const { edits, evaluations, hash } = setup();
    evaluations.sent(1, { kind: "edit", source: GOOD });
    evaluations.evaluated(1);
    // Reset before the shipped hash is known: the save asked for first
    // lands first, and the reset after it.
    evaluations.reset();
    evaluations.sent(2, { kind: "reset" });
    hash("shipped");
    await evaluations.settled();
    expect(edits.get(TRACK.id)).toBeUndefined();
    expect(evaluations.evaluated(2)).toEqual({ kind: "reset" });
    await evaluations.settled();
    expect(edits.get(TRACK.id)).toBeUndefined();
  });

  it("keeps what the host played last when a Reset's answer comes before an edit's", async () => {
    const { edits, evaluations, hash } = setup();
    hash("shipped");
    evaluations.sent(1, { kind: "reset" });
    evaluations.sent(2, { kind: "edit", source: GOOD });
    evaluations.evaluated(1);
    evaluations.evaluated(2);
    await evaluations.settled();
    expect(edits.get(TRACK.id)?.source).toBe(GOOD);
  });

  it("keeps no edit that is the shipped source", async () => {
    const { edits, evaluations, hash } = setup();
    hash("shipped");
    evaluations.sent(1, { kind: "edit", source: GOOD });
    evaluations.evaluated(1);
    evaluations.sent(2, { kind: "edit", source: TRACK.source });
    evaluations.evaluated(2);
    await evaluations.settled();
    expect(edits.get(TRACK.id)).toBeUndefined();
  });
});
