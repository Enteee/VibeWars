import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { GUILD_BATTLE_MATCH_RULES, PRIEST_WAVE_SECONDS } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { Behaviour } from "./behaviour.js";
import type { CombatLogEntry } from "./combat-log.js";
import { GUILD_LORD_HEALTH, guildLordId } from "./guild-lord.js";
import { priestId } from "./priest.js";
import { countsForTeam, MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * The Guild Battle (#1222): each team's Guild Lord stands rooted at its
 * post and shoots what comes in reach; its death loses the match; the
 * shrines raise with no priest; damage to a lord is the team's aggression.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const LORD_0 = vec2(100, 300);
const LORD_1 = vec2(1900, 300);
const SHRINE_0 = vec2(300, 300);
const SHRINE_1 = vec2(1700, 300);
const LONGBOW_RANGE = WEAPONS.longbow.range;

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxHealth: 480,
    maxEnergy: 30,
  };
}

/** `a` on team 0, `x` on team 1, both in the middle, out of either lord's reach. */
function match(participants: readonly ParticipantSpec[] = []): MatchSimulation {
  return new MatchSimulation({
    seed: "guild-lord",
    matchRules: GUILD_BATTLE_MATCH_RULES,
    bounds: { width: 2000, height: 600 },
    shrines: [
      { team: 0, position: SHRINE_0 },
      { team: 1, position: SHRINE_1 },
    ],
    guildLords: [
      { team: 0, position: LORD_0 },
      { team: 1, position: LORD_1 },
    ],
    participants: [spec("a", 0, vec2(950, 300)), spec("x", 1, vec2(1050, 300)), ...participants],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** Step until the match clock reaches `seconds`, every log entry on the way. */
function stepTo(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  while (sim.elapsedSeconds < seconds - DT / 2 && sim.phase === "active") {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** Kill `id` as burning would, with `x` as its source. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "x", NO_RANKS);
  victim.combatant.health = 0.2;
  sim.step(DT);
}

const shotsBy = (log: readonly CombatLogEntry[], sourceId: string, targetId: string) =>
  log.filter(
    (entry) =>
      entry.sourceId === sourceId &&
      entry.events.some((event) => event.kind === "damage" && event.targetId === targetId),
  );

describe("the Guild Lord (#1222)", () => {
  it("stands at its post as a creature nobody owns, counting for nobody, with no priest beside it", () => {
    const sim = match();
    const lord = get(sim, guildLordId(0));
    expect(lord.position).toEqual(LORD_0);
    expect(lord.combatant.team).toBe(0);
    expect(lord.combatant.maxHealth).toBe(GUILD_LORD_HEALTH);
    expect(lord.creature).toMatchObject({ kind: "guild-lord", ownerId: undefined });
    expect(countsForTeam(lord)).toBe(false);
    expect(get(sim, guildLordId(1)).position).toEqual(LORD_1);
    expect(sim.get(priestId(0))).toBeUndefined();
  });

  it("shoots a foe in its longbow's reach, and never one beyond it", () => {
    const sim = match();
    const x = get(sim, "x");
    x.position = vec2(LORD_0.x + LONGBOW_RANGE + 40, LORD_0.y);
    expect(shotsBy(stepTo(sim, 5), guildLordId(0), "x")).toHaveLength(0);

    x.position = vec2(LORD_0.x + LONGBOW_RANGE - 40, LORD_0.y);
    expect(shotsBy(stepTo(sim, 12), guildLordId(0), "x").length).toBeGreaterThan(0);
  });

  it("never moves: not to a foe, not when hit, not when knocked down", () => {
    const sim = match();
    const lord = get(sim, guildLordId(0));
    const x = get(sim, "x");
    // In aggro but past its reach is impossible (aggro is the reach), so
    // a foe just inside: it shoots and stays.
    x.position = vec2(LORD_0.x + LONGBOW_RANGE - 10, LORD_0.y);
    stepTo(sim, 4);
    expect(lord.position).toEqual(LORD_0);

    // A foe at its elbow beating on it, then pushing into it.
    x.position = vec2(LORD_0.x + 2 * RULES.collision.playerRadius + 2, LORD_0.y);
    sim.requestAttack("x", lord.id);
    expect(shotsBy(stepTo(sim, 7), "x", lord.id).length).toBeGreaterThan(0);
    expect(lord.position).toEqual(LORD_0);
    sim.setInputDirection("x", vec2(-1, 0));
    stepTo(sim, 8);
    expect(lord.position).toEqual(LORD_0);

    lord.combatant.knockdownRemaining = 2;
    stepTo(sim, 11);
    expect(lord.position).toEqual(LORD_0);
  });

  it("shoots no foe behind a wall, where it would have to walk round", () => {
    const sim = new MatchSimulation({
      seed: "guild-lord-wall",
      matchRules: GUILD_BATTLE_MATCH_RULES,
      bounds: { width: 2000, height: 600 },
      walls: [{ a: vec2(250, 100), b: vec2(250, 500) }],
      guildLords: [
        { team: 0, position: LORD_0 },
        { team: 1, position: LORD_1 },
      ],
      participants: [spec("a", 0, vec2(950, 300)), spec("x", 1, vec2(350, 300))],
    });
    const log = stepTo(sim, 5);
    expect(shotsBy(log, guildLordId(0), "x")).toHaveLength(0);
    expect(get(sim, guildLordId(0)).position).toEqual(LORD_0);
  });

  it("loses its team the match when it dies, and is not raised", () => {
    const sim = match();
    kill(sim, guildLordId(1));
    expect(sim.phase).toBe("finished");
    expect(sim.outcome).toMatchObject({ winningTeam: 0, reason: "guild-lord" });
    expect(sim.get(guildLordId(1))).toBeUndefined();
  });

  it("loses both teams the match when both die in one tick", () => {
    const sim = match();
    for (const team of [0, 1]) {
      const lord = get(sim, guildLordId(team));
      lord.combatant.statuses.apply("burning", 10, "x", NO_RANKS);
      lord.combatant.health = 0.2;
    }
    sim.step(DT);
    expect(sim.outcome).toMatchObject({
      phase: "finished",
      winningTeam: undefined,
      reason: "guild-lord",
    });
  });

  it("regenerates on its own: +5 pips on top of natural regeneration", () => {
    const sim = match();
    const lord = get(sim, guildLordId(0));
    expect(sim.pips(lord).health).toBeGreaterThanOrEqual(5);
  });
});

describe("the Guild Battle's shrines (#1222)", () => {
  it("raise the team's dead at 2 minutes with no priest, and a wiped team is not beaten", () => {
    const sim = match();
    kill(sim, "a");
    expect(get(sim, "a").combatant.dead).toBe(true);
    expect(sim.phase).toBe("active");

    const log = stepTo(sim, PRIEST_WAVE_SECONDS + DT);
    expect(get(sim, "a").combatant.dead).toBe(false);
    const raised = log.filter((entry) =>
      entry.events.some((event) => event.kind === "resurrected" && event.targetId === "a"),
    );
    expect(raised).toHaveLength(1);
    expect(raised[0]?.sourceId).toBeUndefined();
  });

  it("end the match on morale once a team is all dead at the floor", () => {
    const sim = match();
    get(sim, "a").combatant.morale = -60;
    kill(sim, "a");
    expect(sim.outcome).toMatchObject({ phase: "finished", winningTeam: 1, reason: "morale" });
  });
});

describe("aggression (#1222)", () => {
  /** `x` beside team 0's lord, ready to hurt it. */
  function beside(sim: MatchSimulation): void {
    get(sim, "x").position = vec2(LORD_0.x + 40, LORD_0.y);
  }

  it("counts direct damage to a foe's lord for the dealer's team, after armor", () => {
    const sim = match();
    beside(sim);
    sim.requestAttack("x", guildLordId(0));
    const log = stepTo(sim, 6);
    const dealt = log
      .filter((entry) => entry.sourceId === "x")
      .flatMap((entry) => entry.events)
      .reduce(
        (sum, event) =>
          event.kind === "damage" && event.targetId === guildLordId(0) ? sum + event.amount : sum,
        0,
      );
    expect(dealt).toBeGreaterThan(0);
    expect(sim.aggression(1)).toBe(dealt);
    expect(sim.aggression(0)).toBe(0);
  });

  it("does not count degeneration", () => {
    const sim = match();
    get(sim, guildLordId(0)).combatant.statuses.apply("burning", 10, "x", NO_RANKS);
    const log = stepTo(sim, 5);
    expect(
      log.some(
        (entry) =>
          entry.cause === "degeneration" &&
          entry.events.some(
            (event) => event.kind === "damage" && event.targetId === guildLordId(0),
          ),
      ),
    ).toBe(true);
    expect(sim.aggression(1)).toBe(0);
  });

  it("does not count life stealing", () => {
    const sim = match([
      {
        ...spec("n", 1, vec2(LORD_0.x + 300, LORD_0.y + 200)),
        skillBar: ["necromancer.vampiric-gaze"],
        attributeRanks: new Map([["necromancer.blood-magic", 12]]),
      },
    ]);
    sim.setTarget("n", guildLordId(0));
    sim.requestSkill("n", 0);
    const log = stepTo(sim, 3);
    expect(
      log.some((entry) =>
        entry.events.some((event) => event.kind === "life-stolen" && event.amount > 0),
      ),
    ).toBe(true);
    expect(sim.aggression(1)).toBe(0);
  });

  it("counts a creature's damage for its owner's team", () => {
    const sim = match();
    const wolf: ParticipantSpec = {
      ...spec("x/c1", 1, vec2(LORD_0.x + 40, LORD_0.y)),
      creature: {
        ownerId: "x",
        kind: "pet",
        look: "beast",
        name: "Wolf",
        expiresInSeconds: Number.POSITIVE_INFINITY,
        ageSeconds: 0,
        summonedAtTick: 0,
        skillId: undefined,
        aura: undefined,
        onDeath: "vanish",
        ownerDisableSeconds: 0,
        deathBurst: undefined,
        onDeathInRange: undefined,
        replacedBy: undefined,
        corpsesLeft: 0,
        companionSkillId: undefined,
        leaderId: undefined,
        mode: "guard",
      },
    };
    sim.add(wolf);
    sim.requestAttack(wolf.id, guildLordId(0));
    stepTo(sim, 6);
    expect(sim.aggression(1)).toBeGreaterThan(0);
  });
});

describe("the guard behaviour (#1222)", () => {
  const GUARD: Behaviour = {
    kind: "guard",
    post: vec2(500, 300),
    aggroUnits: 300,
    leashUnits: 200,
    rooted: false,
    thinkSeconds: 0,
  };

  function guarded(): MatchSimulation {
    return new MatchSimulation({
      seed: "guard",
      bounds: { width: 2000, height: 600 },
      participants: [
        { ...spec("g", 0, vec2(500, 300)), behaviour: GUARD, equipment: bow() },
        spec("weak", 1, vec2(650, 250)),
        spec("whole", 1, vec2(620, 300)),
        spec("far", 1, vec2(1500, 300)),
      ],
    });
  }

  function bow() {
    return {
      ...unarmedResolvedEquipment(60),
      mainHand: {
        weapon: WEAPONS.longbow,
        attributeId: "ranger.marksmanship",
        damageType: WEAPONS.longbow.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    };
  }

  it("fights the weakest foe near its post, not its team's called target", () => {
    const sim = guarded();
    get(sim, "weak").combatant.health = 200;
    sim.setCalledTarget(0, "whole");
    sim.step(DT);
    expect(get(sim, "g").targetId).toBe("weak");
    expect(get(sim, "g").combatant.attack?.targetId).toBe("weak");
  });

  it("ignores a foe beyond its aggro", () => {
    const sim = guarded();
    sim.remove("weak");
    sim.remove("whole");
    stepTo(sim, 2);
    expect(get(sim, "g").targetId).toBeUndefined();
    expect(get(sim, "g").position).toEqual(vec2(500, 300));
  });

  it("past its leash walks back to its post, ignoring foes until home", () => {
    const sim = guarded();
    const g = get(sim, "g");
    g.position = vec2(500, 300 + 250);
    sim.step(DT);
    expect(g.targetId).toBeUndefined();
    expect(g.combatant.attack).toBeUndefined();
    stepTo(sim, 1);
    // Still on its way home, past the 30-unit mark: still no fight.
    expect(g.position.y).toBeLessThan(550);
    expect(g.targetId).toBeUndefined();
    stepTo(sim, 3);
    expect(Math.abs(g.position.y - 300)).toBeLessThanOrEqual(30);
    sim.step(DT);
    expect(g.targetId).toBeDefined();
  });
});
