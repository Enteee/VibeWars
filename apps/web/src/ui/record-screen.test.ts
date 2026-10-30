import { describe, expect, it } from "vitest";

import { MATCH_RECORD_SCHEMA_VERSION, type StoredMatchRecord } from "../storage/schema.js";
import { recordCells } from "./record-screen.js";

function played(overrides: Partial<StoredMatchRecord> = {}): StoredMatchRecord {
  return {
    schemaVersion: MATCH_RECORD_SCHEMA_VERSION,
    id: "m",
    characterId: "a",
    characterName: "Pyro",
    finishedAt: Date.UTC(2026, 9, 29, 17, 5),
    mapId: "no-such-map",
    mode: "relic-run",
    result: "win",
    ...overrides,
  };
}

describe("record screen (#1404)", () => {
  it("lists a match by when, who, where, what mode and how it went", () => {
    const record = played();
    const when = new Date(record.finishedAt).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
    // A map this build does not have shows its id.
    expect(recordCells(record)).toEqual([when, "Pyro", "no-such-map", "Relic Run", "Win"]);
    expect(recordCells(played({ result: "draw", mode: "kill-count" })).slice(3)).toEqual([
      "Kill Count",
      "Draw",
    ]);
  });
});
