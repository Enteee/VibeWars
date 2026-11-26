import { STARTER_TEAMS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { duplicateTeam } from "../ui/team-builder.js";
import { TeamRepository, createMemoryStore } from "./repository.js";
import { isStoredTeam, TEAM_SCHEMA_VERSION } from "./schema.js";
import { forgetDiscardedStarter } from "./starter-character.js";
import { rerollStarterTeam, rollStarterTeam, type StarterTeamKey } from "./starter-team.js";

/** The first start's Team Build (#2036): once per browser, kept by id, rerolled in place. */

function memoryKey(): StarterTeamKey & { value: string | undefined } {
  const key = {
    value: undefined as string | undefined,
    load: () => key.value,
    save: (id: string) => {
      key.value = id;
    },
    clear: () => {
      key.value = undefined;
    },
  };
  return key;
}

/** Ids "m0", "m1", … in turn. */
function counter(): () => string {
  let next = 0;
  return () => `m${String(next++)}`;
}

// The 4v4s, the size the rolls below ask for.
const [FIRST, SECOND] = STARTER_TEAMS.filter((team) => team.members.length === 4);

describe("rollStarterTeam", () => {
  it("rolls and saves a curated team once, under its own names, then never again", async () => {
    const teams = new TeamRepository(createMemoryStore());
    const key = memoryKey();

    const rolled = await rollStarterTeam({
      teams,
      key,
      random: () => 0,
      size: 4,
      id: "t",
      newId: counter(),
      now: 5,
    });

    expect(rolled?.name).toBe(FIRST?.name);
    expect(rolled?.members.map((m) => m.character.name)).toEqual(FIRST?.members.map((m) => m.name));
    expect(rolled?.members.map((m) => m.character.primaryProfession)).toEqual(
      FIRST?.members.map((m) => m.build.primaryProfession),
    );
    expect(new Set(rolled?.members.map((m) => m.character.id)).size).toBe(FIRST?.members.length);
    expect(isStoredTeam(rolled)).toBe(true);
    expect(await teams.load("t")).toEqual(rolled);
    expect(key.value).toBe("t");

    const again = await rollStarterTeam({
      teams,
      key,
      random: () => 0,
      size: 4,
      id: "u",
      newId: counter(),
      now: 6,
    });
    expect(again).toBeUndefined();
    expect((await teams.list()).teams.map((t) => t.id)).toEqual(["t"]);
  });

  it("leaves the key unset when the save fails, to roll again next start", async () => {
    const key = memoryKey();
    const rolled = await rollStarterTeam({
      teams: {
        save: () => Promise.reject(new Error("full")),
      },
      key,
      random: () => 0,
      size: 4,
      id: "t",
      newId: counter(),
      now: 5,
    });
    expect(rolled).toBeUndefined();
    expect(key.value).toBeUndefined();
  });

  it("rolls a team of the size picked (#2109)", async () => {
    const teams = new TeamRepository(createMemoryStore());
    const key = memoryKey();
    const options = { teams, key, random: () => 0, newId: counter(), now: 5 };

    const eight = await rollStarterTeam({ ...options, size: 8, id: "u" });
    expect(eight?.size).toBe(8);
    expect(eight?.members).toHaveLength(8);
    expect(key.value).toBe("u");
  });
});

describe("rerollStarterTeam", () => {
  it("keeps the id and puts another curated team in its place, under that team's names", async () => {
    const teams = new TeamRepository(createMemoryStore());
    const rolled = await rollStarterTeam({
      teams,
      key: memoryKey(),
      random: () => 0,
      size: 4,
      id: "t",
      newId: counter(),
      now: 5,
    });
    if (rolled === undefined) {
      throw new Error("not rolled");
    }

    // The first team again by `random`, but never the one shown.
    const rerolled = await rerollStarterTeam(teams, rolled, () => 0, counter(), 7);

    expect(rerolled.id).toBe("t");
    expect(rerolled.size).toBe(4);
    expect(rerolled.name).toBe(SECOND?.name);
    expect(rerolled.members.map((m) => m.character.name)).toEqual(
      SECOND?.members.map((m) => m.name),
    );
    expect(await teams.load("t")).toEqual(rerolled);
    expect((await teams.list()).teams).toHaveLength(1);
  });

  it("changes the team every time", async () => {
    const teams = new TeamRepository(createMemoryStore());
    let team = await rollStarterTeam({
      teams,
      key: memoryKey(),
      random: () => 0.5,
      size: 4,
      id: "t",
      newId: counter(),
      now: 5,
    });
    for (const random of [0, 0.3, 0.5, 0.99]) {
      if (team === undefined) {
        throw new Error("not rolled");
      }
      const next = await rerollStarterTeam(teams, team, () => random, counter(), 7);
      expect(next.name).not.toBe(team.name);
      team = next;
    }
  });
});

describe("cloning the starter team", () => {
  it("is the same team under a new id and a (copy) name", async () => {
    const teams = new TeamRepository(createMemoryStore());
    const rolled = await rollStarterTeam({
      teams,
      key: memoryKey(),
      random: () => 0,
      size: 4,
      id: "t",
      newId: counter(),
      now: 5,
    });
    if (rolled === undefined) {
      throw new Error("not rolled");
    }
    const copy = duplicateTeam(rolled, "c");
    expect(copy.id).toBe("c");
    expect(copy.name).toBe(`${rolled.name} (copy)`);
    expect(copy.members).toEqual(rolled.members);
  });
});

describe("forgetDiscardedStarter on a team's key (#2717)", () => {
  it("rerolls only the size whose starter team a new version discarded", async () => {
    const store = createMemoryStore();
    const teams = new TeamRepository(store);
    const keys = { 2: memoryKey(), 4: memoryKey() } as const;
    for (const size of [2, 4] as const) {
      await rollStarterTeam({
        teams,
        key: keys[size],
        random: () => 0,
        size,
        id: `old${String(size)}`,
        newId: counter(),
        now: 1,
      });
    }
    // A new version's schema discards the 4v4 starter only.
    const old4 = await teams.load("old4");
    await store.put("teams", "old4", { ...old4, schemaVersion: TEAM_SCHEMA_VERSION - 1 });

    const { discarded } = await teams.list();
    const rolled: (string | undefined)[] = [];
    for (const size of [2, 4] as const) {
      forgetDiscardedStarter(keys[size], discarded);
      const team = await rollStarterTeam({
        teams,
        key: keys[size],
        random: () => 0,
        size,
        id: `new${String(size)}`,
        newId: counter(),
        now: 2,
      });
      rolled.push(team?.id);
    }

    expect(rolled).toEqual([undefined, "new4"]);
    expect(keys[2].value).toBe("old2");
    expect(keys[4].value).toBe("new4");
  });
});
