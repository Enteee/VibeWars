import { describe, expect, it } from "vitest";
import { CREATURE_LOOKS, MINIMAL_GW_INSPIRED_PVP_V1, type StatusId } from "@vibewars/game-core";
import type { MatchSnapshot, PlayerSnapshot, StatusSnapshot } from "@vibewars/game-session";

import { toArenaSnapshot } from "./match-view.js";
import { ACTOR_RADIUS, CREATURE_RADIUS, actorAtPoint } from "./render/arena-snapshot.js";

function player(sessionId: string, knockdownRemaining: number): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    guildTag: undefined,
    guildCape: undefined,
    x: 100,
    y: 100,
    facing: 0,
    targetSessionId: undefined,
    attackTargetSessionId: undefined,
    walking: false,
    health: 400,
    maxHealth: 500,
    energy: 20,
    maxEnergy: 50,
    overcast: 0,
    morale: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 0,
    dead: false,
    corpseExploited: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining,
    invulnerableSeconds: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    bot: false,
    statuses: [],
  };
}

function match(players: readonly PlayerSnapshot[]): MatchSnapshot {
  return {
    selfSessionId: "me",
    players,
    scoreTeam0: 0,
    scoreTeam1: 0,
    elapsedSeconds: 0,
    phase: "active",
    winningTeam: undefined,
    endReason: undefined,
    projectiles: [],
    groundEffects: [],
    traps: [],
    flags: [],
    stand: undefined,
    aggression: [],
    relics: [],
    altar: undefined,
    altarHolder: undefined,
    altarHeldSeconds: 0,
    capturePoints: [],
    summary: undefined,
  };
}

describe("toArenaSnapshot", () => {
  it("draws a watcher's team 1 in the ally colour and team 2 in the enemy one (#480)", () => {
    const arena = toArenaSnapshot(
      { ...match([player("a", 0), { ...player("b", 0), team: 1 }]), selfSessionId: "watcher" },
      [],
      [],
      undefined,
      undefined,
    );
    expect(arena.actors.map((actor) => [actor.id, actor.team])).toEqual([
      ["a", "ally"],
      ["b", "enemy"],
    ]);
  });

  it("lays a body down while its knockdown lasts, and stands it up at 0 (#545)", () => {
    const arena = toArenaSnapshot(
      match([player("me", 0), player("down", 2.5)]),
      [],
      [],
      undefined,
      undefined,
    );
    expect(arena.actors.map((actor) => [actor.id, actor.knockedDown])).toEqual([
      ["me", false],
      ["down", true],
    ]);
  });

  it("draws a creature smaller than a player, at the ruleset's radii (#1052)", () => {
    const minion: PlayerSnapshot = {
      ...player("me/c1", 0),
      creature: {
        ownerId: "me",
        kind: "minion",
        look: "bone-minion",
        mode: null,
        armedAttack: null,
        leaderId: null,
      },
    };
    const arena = toArenaSnapshot(match([player("me", 0), minion]), [], [], undefined, undefined);
    expect(arena.actors.map((actor) => actor.radius)).toEqual([
      MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius,
      MINIMAL_GW_INSPIRED_PVP_V1.collision.creatureRadius,
    ]);
    expect([ACTOR_RADIUS, CREATURE_RADIUS]).toEqual([
      MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius,
      MINIMAL_GW_INSPIRED_PVP_V1.collision.creatureRadius,
    ]);
  });

  it("gives each creature its look, and a player none (#1162)", () => {
    const creatures = CREATURE_LOOKS.map((look, i): PlayerSnapshot => ({
      ...player(`me/c${String(i + 1)}`, 0),
      creature: {
        ownerId: "me",
        kind: look === "beast" ? "pet" : look === "spirit" ? "spirit" : "minion",
        look,
        mode: null,
        armedAttack: null,
        leaderId: null,
      },
    }));
    const arena = toArenaSnapshot(
      match([player("me", 0), ...creatures]),
      [],
      [],
      undefined,
      undefined,
    );
    expect(arena.actors.map((actor) => actor.creatureLook)).toEqual([undefined, ...CREATURE_LOOKS]);
  });

  it("picks a creature within its drawn radius: a Guild Lord 13 away, a pet not (#2047)", () => {
    const creature = (sessionId: string, look: "beast" | "guild-lord"): PlayerSnapshot => ({
      ...player(sessionId, 0),
      x: 0,
      y: 0,
      creature: {
        ownerId: "me",
        kind: look === "beast" ? "pet" : "minion",
        look,
        mode: null,
        armedAttack: null,
        leaderId: null,
      },
    });
    const pick = (look: "beast" | "guild-lord"): string | undefined =>
      actorAtPoint(toArenaSnapshot(match([creature("it", look)]), [], [], undefined, undefined), {
        x: 13,
        y: 0,
      })?.id;
    expect(pick("guild-lord")).toBe("it");
    expect(pick("beast")).toBeUndefined();
  });

  it("arms a guard with a spear and shield, and leaves a pet unarmed (#2047)", () => {
    const arena = toArenaSnapshot(
      match(
        (["guard", "beast"] as const).map((look, i): PlayerSnapshot => ({
          ...player(`c${String(i)}`, 0),
          creature: {
            ownerId: "me",
            kind: look === "beast" ? "pet" : "minion",
            look,
            mode: null,
            armedAttack: null,
            leaderId: null,
          },
        })),
      ),
      [],
      [],
      undefined,
      undefined,
    );
    expect(arena.actors.map((actor) => [actor.weaponId, actor.offhandId])).toEqual([
      ["spear", "shield"],
      [undefined, undefined],
    ]);
  });

  it("rings a body enchanted or hexed by its statuses, and a corpse never (#1117)", () => {
    const status = (id: StatusId): StatusSnapshot => ({
      id,
      endsAt: 10,
      durationSeconds: 10,
      casterId: "me",
    });
    const enchanted = { ...player("enchanted", 0), statuses: [status("armor-boost")] };
    const hexed = { ...player("hexed", 0), statuses: [status("backfire")] };
    const dead = {
      ...player("dead", 0),
      dead: true,
      statuses: [status("armor-boost"), status("backfire")],
    };
    const arena = toArenaSnapshot(match([enchanted, hexed, dead]), [], [], undefined, undefined);
    expect(arena.actors.map((actor) => [actor.id, actor.enchanted, actor.hexed])).toEqual([
      ["enchanted", true, false],
      ["hexed", false, true],
      ["dead", false, false],
    ]);
  });

  it("shimmers a body while it is invulnerable, and not at 0 or as a corpse (#1233)", () => {
    const raised = { ...player("raised", 0), invulnerableSeconds: 4.2 };
    const dead = { ...player("dead", 0), invulnerableSeconds: 4.2, dead: true };
    const arena = toArenaSnapshot(
      match([player("me", 0), raised, dead]),
      [],
      [],
      undefined,
      undefined,
    );
    expect(arena.actors.map((actor) => [actor.id, actor.invulnerable])).toEqual([
      ["me", false],
      ["raised", true],
      ["dead", false],
    ]);
  });

  it("cues a burning body's flames, and a corpse's never (#1138)", () => {
    const burning: StatusSnapshot = {
      id: "burning",
      endsAt: 10,
      durationSeconds: 10,
      casterId: "me",
    };
    const alive = { ...player("alive", 0), statuses: [burning] };
    const dead = { ...player("dead", 0), dead: true, statuses: [burning] };
    const arena = toArenaSnapshot(match([alive, dead]), [], [], undefined, undefined);
    expect(arena.actors.map((actor) => [actor.id, actor.conditionCues])).toEqual([
      ["alive", ["burning"]],
      ["dead", []],
    ]);
  });

  it("badges a cast bar with the casting skill's type, and nothing else (#1125)", () => {
    const casting = (id: string, skillId: string, castTotal: number): PlayerSnapshot => ({
      ...player(id, 0),
      castingSkillId: skillId,
      castRemaining: castTotal / 2,
      castTotal,
    });
    const arena = toArenaSnapshot(
      match([
        casting("hex", "mesmer.empathy", 2),
        casting("instant", "mesmer.empathy", 0),
        casting("unknown", "nobody.no-such-skill", 2),
        player("idle", 0),
      ]),
      [],
      [],
      undefined,
      undefined,
    );
    expect(arena.actors.map((actor) => [actor.id, actor.castType])).toEqual([
      ["hex", "hex"],
      ["instant", undefined],
      ["unknown", undefined],
      ["idle", undefined],
    ]);
  });
});
