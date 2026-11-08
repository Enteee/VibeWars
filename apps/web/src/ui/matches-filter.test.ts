import { LOBBY_MODES, type LobbyMode } from "@vibewars/game-protocol";
import {
  MATCH_RECORD_VERSION,
  type MatchRecord,
  type MatchRecordTeam,
} from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { MATCH_KINDS, matchesFilter, matchSize, type MatchFilter } from "./matches-filter.js";

const team = (size: number): MatchRecordTeam => ({
  players: Array.from({ length: size }, (_, i) => ({
    name: `P${String(i)}`,
    guildTag: null,
    bot: i > 0,
    pubkey: i > 0 ? null : "a".repeat(64),
    template: "",
  })),
});

const record = (mode: LobbyMode, ...sizes: number[]): MatchRecord => ({
  v: MATCH_RECORD_VERSION,
  mode,
  map: "map",
  endedAt: 0,
  durationSeconds: 60,
  winningTeam: 0,
  endReason: "annihilation",
  teams: sizes.map(team),
});

const filter = (kinds: LobbyMode[], sizes: (1 | 2 | 4 | 8)[]): MatchFilter => ({
  kinds: new Set(kinds),
  sizes: new Set(sizes),
});

const RANDOM_4 = record("random-arena", 4, 4);
const TEAM_2 = record("team-arena", 2, 2);
const TEAM_4 = record("team-arena", 4, 4);
const HOSTED_3V2 = record("hosted-game", 3, 2);
const ASCENT_3_TEAMS = record("heroes-ascent", 8, 8, 8);

describe("the Matches filter (#2741)", () => {
  it("lets every record through when nothing is pressed", () => {
    for (const each of [RANDOM_4, TEAM_2, HOSTED_3V2, ASCENT_3_TEAMS]) {
      expect(matchesFilter(each, filter([], []))).toBe(true);
    }
  });

  it("filters by kind alone, and by size alone", () => {
    expect(matchesFilter(TEAM_2, filter(["team-arena"], []))).toBe(true);
    expect(matchesFilter(RANDOM_4, filter(["team-arena"], []))).toBe(false);
    expect(matchesFilter(RANDOM_4, filter([], [4]))).toBe(true);
    expect(matchesFilter(TEAM_2, filter([], [4]))).toBe(false);
  });

  it("ANDs kind with size", () => {
    const teamFours = filter(["team-arena"], [4]);
    expect(matchesFilter(TEAM_4, teamFours)).toBe(true);
    expect(matchesFilter(TEAM_2, teamFours)).toBe(false);
    expect(matchesFilter(RANDOM_4, teamFours)).toBe(false);
  });

  it("ORs two kinds, and two sizes", () => {
    const either = filter(["team-arena", "random-arena"], []);
    expect(matchesFilter(TEAM_2, either)).toBe(true);
    expect(matchesFilter(RANDOM_4, either)).toBe(true);
    expect(matchesFilter(HOSTED_3V2, either)).toBe(false);
    expect(matchesFilter(TEAM_2, filter([], [2, 4]))).toBe(true);
    expect(matchesFilter(TEAM_4, filter([], [2, 4]))).toBe(true);
  });

  it("counts the larger team, so a Hosted 3v2 fits no size chip", () => {
    expect(matchSize(HOSTED_3V2)).toBe(3);
    expect(matchesFilter(HOSTED_3V2, filter(["hosted-game"], []))).toBe(true);
    for (const size of [1, 2, 4, 8] as const) {
      expect(matchesFilter(HOSTED_3V2, filter([], [size]))).toBe(false);
    }
  });

  it("sizes a three-team record by its largest team (#2684)", () => {
    expect(matchesFilter(ASCENT_3_TEAMS, filter(["heroes-ascent"], [8]))).toBe(true);
  });

  it("has a chip for every lobby mode", () => {
    expect(Object.keys(MATCH_KINDS).sort()).toEqual([...LOBBY_MODES].sort());
  });
});
