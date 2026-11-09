import {
  MATCH_MODES,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_TEAMS,
  createRng,
} from "@vibewars/game-core";
import { createMatchHost, type MatchRecord, type PlannedSeat } from "@vibewars/game-session";
import { createMemoryNetwork } from "@vibewars/game-session/testing";
import { describe, expect, it } from "vitest";
import { hostMap } from "./maps.js";

const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
/** A 60 s clock keeps the test well inside its limit: seed 2735 now ends at time, not by its wipe at 127 s. */
const RULES = { ...MATCH_MODES["capture-points"], timeLimitSeconds: 60 };

/** A side of four bots, on the first starter team that has four. */
function side(team: 0 | 1): [string, PlannedSeat][] {
  const builds = STARTER_TEAMS.find((starter) => starter.members.length >= 4)?.members ?? [];
  return builds.slice(0, 4).map(({ build }, i) => {
    const name = `Bot ${String(team)}.${String(i)}`;
    return [name, { team, name, guildTag: null, guildCape: null, bot: true, build }];
  });
}

describe("a hosted 4v4 on Scarred Earth (#2735)", () => {
  it("runs to its end, by a 20-point lead or at time, and says which", () => {
    const map = hostMap("scarred-earth");
    if (map === undefined) {
      throw new Error("no Scarred Earth");
    }
    const rng = createRng(2735);
    const records: MatchRecord[] = [];
    const host = createMatchHost({
      transport: createMemoryNetwork().join("host"),
      map,
      seed: "2735",
      matchRules: RULES,
      random: () => rng.nextFloat(),
      maxPlayers: 8,
      seats: new Map([...side(0), ...side(1)]),
      matchId: "match-2735",
      isSpectator: () => false,
      mode: "hosted-game",
      publishRecord: (record) => records.push(record),
      nowSeconds: () => 0,
      signetOf: () => 0,
    });
    const ticks = Math.ceil(RULES.timeLimitSeconds / DT) + 1;
    for (let tick = 0; tick < ticks && host.phase === "active"; tick += 1) {
      host.advance(DT);
    }
    expect(host.phase).toBe("finished");
    expect(records).toHaveLength(1);
    expect(["score", "time"]).toContain(records[0]?.endReason);
  });
});
