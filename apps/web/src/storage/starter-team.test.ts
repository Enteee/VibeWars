import { STARTER_TEAMS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { duplicateTeam } from "../ui/team-builder.js";
import { TeamRepository, createMemoryStore } from "./repository.js";
import { isStoredTeam } from "./schema.js";
import { rerollStarterTeam, rollStarterTeam, type StarterTeamKey } from "./starter-team.js";

/** The first start's Team Build (#2036): once per browser, kept by id, rerolled in place. */

function memoryKey(): StarterTeamKey & { value: string | undefined } {
  const key = {
    value: undefined as string | undefined,
    load: () => key.value,
    save: (id: string) => {
      key.value = id;
    },
  };
  return key;
}

/** Ids "m0", "m1", … in turn. */
function counter(): () => string {
  let next = 0;
  return () => `m${String(next++)}`;
}

const [FIRST, SECOND] = STARTER_TEAMS;

describe("rollStarterTeam", () => {
  it("rolls and saves a curated team once, under its own names, then never again", async () => {
    const teams = new TeamRepository(createMemoryStore());
    const key = memoryKey();

    const rolled = await rollStarterTeam({
      teams,
      key,
      random: () => 0,
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
      id: "t",
      newId: counter(),
      now: 5,
    });
    expect(rolled).toBeUndefined();
    expect(key.value).toBeUndefined();
  });
});

describe("rerollStarterTeam", () => {
  it("keeps the id and puts another curated team in its place, under that team's names", async () => {
    const teams = new TeamRepository(createMemoryStore());
    const rolled = await rollStarterTeam({
      teams,
      key: memoryKey(),
      random: () => 0,
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
