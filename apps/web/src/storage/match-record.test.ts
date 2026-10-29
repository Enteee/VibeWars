import { describe, expect, it } from "vitest";

import type { MatchOutcome } from "../match-view.js";
import { matchRecordFrom, tally } from "./match-record.js";
import { MATCH_RECORD_SCHEMA_VERSION, type StoredMatchRecord } from "./schema.js";

const CONTEXT = {
  id: "m",
  characterId: "a",
  characterName: "Pyro",
  mapId: "arena-alpha",
  mode: "annihilation",
  finishedAt: 1000,
};

function outcome(overrides: Partial<MatchOutcome> = {}): MatchOutcome {
  return { winningTeam: 0, endReason: "annihilation", selfTeam: 0, aggression: [], ...overrides };
}

describe("matchRecordFrom (#1404)", () => {
  it("records a win, a loss and a draw from the player's team's side", () => {
    expect(matchRecordFrom(outcome(), CONTEXT)).toEqual({
      schemaVersion: MATCH_RECORD_SCHEMA_VERSION,
      ...CONTEXT,
      result: "win",
    });
    expect(matchRecordFrom(outcome({ selfTeam: 1 }), CONTEXT)?.result).toBe("loss");
    expect(
      matchRecordFrom(outcome({ winningTeam: undefined, endReason: "time" }), CONTEXT)?.result,
    ).toBe("draw");
  });

  it("records nothing for a spectator, or a match the host left", () => {
    expect(matchRecordFrom(outcome({ selfTeam: undefined }), CONTEXT)).toBeUndefined();
    expect(
      matchRecordFrom(outcome({ winningTeam: undefined, endReason: "host-left" }), CONTEXT),
    ).toBeUndefined();
  });
});

describe("tally (#1404)", () => {
  const played = (characterId: string, result: StoredMatchRecord["result"]): StoredMatchRecord => ({
    schemaVersion: MATCH_RECORD_SCHEMA_VERSION,
    ...CONTEXT,
    characterId,
    result,
  });

  it("counts each character's wins, losses and draws", () => {
    const tallies = tally([
      played("a", "win"),
      played("a", "win"),
      played("a", "loss"),
      played("b", "draw"),
    ]);
    expect(tallies.get("a")).toEqual({ wins: 2, losses: 1, draws: 0 });
    expect(tallies.get("b")).toEqual({ wins: 0, losses: 0, draws: 1 });
    expect(tallies.get("c")).toBeUndefined();
  });
});
