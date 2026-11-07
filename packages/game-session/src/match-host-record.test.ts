import { ANNIHILATION_MATCH_RULES, type PlayerBuild } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { RECONNECT_WINDOW_SECONDS, type PlannedSeat } from "./match-host.js";
import {
  TEST_NOW_SECONDS,
  helloAs,
  startMatch,
  starterBuild,
} from "./match-harness.test-support.js";
import {
  MATCH_RECORD_VERSION,
  recordTemplate,
  validateMatchRecord,
  type MatchRecord,
} from "./match-record.js";

/** The finished match's record (#2528): what the host hands its publisher. */

const played = (build: PlayerBuild) => recordTemplate(build);

function recording() {
  const records: MatchRecord[] = [];
  return {
    records,
    publishRecord: (record: MatchRecord) => {
      records.push(record);
    },
  };
}

describe("a finished match's record (#2528)", () => {
  it("is published once, with both teams' names, builds and the result", async () => {
    const { records, publishRecord } = recording();
    const match = startMatch({
      matchRules: { ...ANNIHILATION_MATCH_RULES, timeLimitSeconds: 1 },
      seats: new Map<string, PlannedSeat>([
        [
          "host/local",
          { team: 0, name: "Me", guildTag: "VIBE", guildCape: null, bot: false, build: null },
        ],
        [
          "Elementalist Bot",
          {
            team: 1,
            name: "Elementalist Bot",
            guildTag: null,
            guildCape: null,
            bot: true,
            build: starterBuild("Elementalist/Mesmer"),
          },
        ],
      ]),
      publishRecord,
    });
    await match.joinLocal(helloAs("Warrior/Monk"));

    await match.step(2);
    // A tick after the end: it is published once.
    match.host.advance(1);

    expect(match.host.phase).toBe("finished");
    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record).toMatchObject({
      v: MATCH_RECORD_VERSION,
      mode: "random-arena",
      map: "test-arena",
      endedAt: TEST_NOW_SECONDS,
      durationSeconds: 1,
      winningTeam: match.host.winningTeam,
    });
    expect(record?.teams).toEqual([
      {
        players: [
          {
            name: "Me",
            guildTag: "VIBE",
            bot: false,
            template: played(starterBuild("Warrior/Monk")),
          },
        ],
      },
      {
        players: [
          {
            name: "Elementalist Bot",
            guildTag: null,
            bot: true,
            template: played(starterBuild("Elementalist/Mesmer")),
          },
        ],
      },
    ]);
    // What the host publishes, any reader takes.
    const read = validateMatchRecord(
      JSON.parse(JSON.stringify(record)),
      new Set(["test-arena"]),
      TEST_NOW_SECONDS,
    );
    expect(read?.endReason).toBe(record?.endReason);
    expect(read?.teams).toEqual(record?.teams);
  });

  it("keeps a player who left mid-match, with the build they played", async () => {
    const { records, publishRecord } = recording();
    const match = startMatch({
      matchRules: { ...ANNIHILATION_MATCH_RULES, timeLimitSeconds: RECONNECT_WINDOW_SECONDS + 2 },
      publishRecord,
    });
    await match.join(helloAs("Warrior/Monk"));
    const { transport } = await match.join(helloAs("Elementalist/Mesmer"));

    await match.step(0.5);
    await transport.leave();
    await match.step(RECONNECT_WINDOW_SECONDS + 2);

    expect(records).toHaveLength(1);
    expect(records[0]?.teams[1]?.players).toEqual([
      expect.objectContaining({ template: played(starterBuild("Elementalist/Mesmer")) }),
    ]);
  });

  it("is not published for a match the host closed before it ended", async () => {
    const { records, publishRecord } = recording();
    const match = startMatch({ publishRecord });
    await match.join(helloAs("Warrior/Monk"));
    await match.step(0.5);

    await match.host.close("host-left");
    match.host.advance(1);

    expect(records).toEqual([]);
  });
});
