import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedLoadout } from "../equipment/resolve.js";
import type { MatchRules } from "../match-rules.js";
import { weaponAttributeMultiplier } from "../skills/damage.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Ranger pets (#1046 child 1, #1079): Charm Animal on the bar brings a
 * wolf that bites what its owner attacks, lies when killed, costs its
 * owner the bar for a while, and comes back through Comfort Animal or
 * its owner's respawn.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CHARM = "ranger.charm-animal";
const COMFORT = "ranger.comfort-animal";
const BEAST_MASTERY = "ranger.beast-mastery";
/** Comfort Animal's 1 s activation, the aftercast, and a tick to spare. */
const COMFORT_SECONDS = 1 + RULES.combat.aftercastSeconds + 2 * DT;

const RESPAWN: MatchRules = {
  victory: "kill-count",
  scoreToWin: 99,
  timeLimitSeconds: 600,
  deathRule: "respawn",
  respawnSeconds: 1,
  deathPenalty: false,
};

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxEnergy: 100,
    ...extra,
  };
  return result;
}

/** Ranger `r` at the origin with `bar`, at Beast Mastery `rank`. */
function ranger(bar: readonly (string | null)[] = [CHARM, COMFORT], rank = 12): ParticipantSpec {
  return spec("r", 0, vec2(0, 0), {
    skillBar: bar,
    attributeRanks: new Map([[BEAST_MASTERY, rank]]),
  });
}

function match(
  participants: readonly ParticipantSpec[],
  matchRules?: MatchRules,
  seed = "pets",
): MatchSimulation {
  return new MatchSimulation({ seed, matchRules, participants });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function petsOf(sim: MatchSimulation, owner = "r"): Participant[] {
  return [...sim.participants()].filter((other) => other.creature?.ownerId === owner);
}

function wolf(sim: MatchSimulation, owner = "r"): Participant {
  const [pet] = petsOf(sim, owner);
  if (pet === undefined) {
    throw new Error(`${owner} has no pet`);
  }
  return pet;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** Kill `victim` as burning would. */
function kill(sim: MatchSimulation, victim: Participant): void {
  victim.combatant.statuses.apply("burning", 10, "x");
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

/** The wolf's blows on `targetId` in `log`. */
function bites(log: readonly CombatLogEntry[], pet: Participant, targetId: string) {
  return log.filter(
    (entry) =>
      entry.cause === "weapon" &&
      entry.sourceId === pet.id &&
      entry.events.some((event) => event.kind === "damage" && event.targetId === targetId),
  );
}

/** Every amount the log heals `targetId` by. */
function healed(log: readonly CombatLogEntry[], targetId: string): number[] {
  return log.flatMap((entry) =>
    entry.events.flatMap((event) =>
      event.kind === "heal" && event.targetId === targetId ? [event.amount] : [],
    ),
  );
}

describe("Charm Animal brings a wolf (#1046)", () => {
  it("joins with a level-20 wolf on its team: 480 Health, armor 80", () => {
    const sim = match([ranger(), spec("x", 1, vec2(600, 0))]);
    const pets = petsOf(sim);
    expect(pets).toHaveLength(1);
    const pet = wolf(sim);
    expect(pet.id).toBe("r/c1");
    expect(pet.creature).toMatchObject({
      kind: "pet",
      name: "Wolf",
      ownerId: "r",
      onDeath: "lie",
      companionSkillId: CHARM,
    });
    expect(pet.combatant.team).toBe(0);
    expect(pet.combatant.maxHealth).toBe(480);
    expect(pet.combatant.health).toBe(480);
    expect(pet.combatant.equipment.baseArmor).toBe(80);
  });

  it("brings none without Charm Animal, even with Comfort Animal on the bar", () => {
    expect(petsOf(match([ranger([])]))).toHaveLength(0);
    expect(petsOf(match([ranger([COMFORT])]))).toHaveLength(0);
  });

  it("is never cast: pressing it is refused and nothing is paid", () => {
    const sim = match([ranger()]);
    expect(sim.requestSkill("r", 0)?.check).toEqual({ ok: false, reason: "no-animal-to-charm" });
    expect(get(sim, "r").combatant.energy).toBe(100);
  });
});

describe("the wolf fights what its owner attacks (#1046)", () => {
  /** Ranger at the origin, foes `a` and `b` beside it, `far` 800 off. */
  function arena(rank = 12, seed = "pets"): MatchSimulation {
    return match(
      [
        ranger([CHARM, COMFORT], rank),
        spec("a", 1, vec2(60, 0)),
        spec("b", 1, vec2(0, 60)),
        spec("far", 1, vec2(-900, 0)),
      ],
      undefined,
      seed,
    );
  }

  it("bites its owner's foe every 2.15 s for 17-29 slashing, scaled by Beast Mastery", () => {
    const blows = (rank: number): CombatLogEntry[] => {
      const sim = arena(rank);
      expect(sim.requestAttack("r", "a")).toEqual({ ok: true });
      return bites(stepFor(sim, 12), wolf(sim), "a");
    };
    const strong = blows(12);
    expect(strong.length).toBeGreaterThanOrEqual(4);
    const gaps = strong.slice(1).map((entry, i) => entry.atSeconds - (strong[i]?.atSeconds ?? 0));
    for (const gap of gaps) {
      expect(gap).toBeCloseTo(2.15, 1);
    }
    const amounts = (entries: readonly CombatLogEntry[]): number[] =>
      entries.flatMap((entry) =>
        entry.events.flatMap((event) =>
          event.kind === "damage" && event.targetId === "a" && !event.critical
            ? [event.amount]
            : [],
        ),
      );
    for (const amount of amounts(strong)) {
      expect(amount).toBeGreaterThanOrEqual(17);
      expect(amount).toBeLessThanOrEqual(29);
    }
    const weak = amounts(blows(0))[0] ?? 0;
    const full = amounts(strong)[0] ?? 0;
    expect(weak / full).toBeCloseTo(weaponAttributeMultiplier(0, RULES.combat), 1);
  });

  it("switches when its owner switches", () => {
    const sim = arena();
    const pet = wolf(sim);
    sim.requestAttack("r", "a");
    stepFor(sim, 3);
    expect(pet.combatant.attack?.targetId).toBe("a");
    sim.requestAttack("r", "b");
    stepFor(sim, DT);
    expect(pet.combatant.attack?.targetId).toBe("b");
    expect(bites(stepFor(sim, 5), pet, "b").length).toBeGreaterThan(0);
  });

  it("keeps biting after its owner stops attacking", () => {
    const sim = arena();
    const pet = wolf(sim);
    sim.requestAttack("r", "a");
    stepFor(sim, 1);
    get(sim, "r").combatant.attack = undefined;
    expect(bites(stepFor(sim, 5), pet, "a").length).toBeGreaterThan(0);
  });

  it("does not engage a foe its owner only casts at, or one beyond 700 of it", () => {
    const sim = arena();
    const pet = wolf(sim);
    sim.setTarget("r", "a");
    stepFor(sim, 3);
    expect(pet.combatant.attack).toBeUndefined();
    // The owner goes for `far`, 900 away: the wolf stays.
    sim.requestAttack("r", "far");
    stepFor(sim, DT);
    expect(pet.combatant.attack).toBeUndefined();
  });
});

describe("a dead wolf (#1046)", () => {
  it("lies where it fell, and its owner's bar is disabled 4 s at Beast Mastery 12, 10 s at 0", () => {
    for (const [rank, seconds] of [
      [12, 4],
      [0, 10],
    ] as const) {
      const sim = match([ranger([CHARM, COMFORT, null], rank)]);
      const pet = wolf(sim);
      kill(sim, pet);
      stepFor(sim, 1);
      expect(sim.get(pet.id)).toBe(pet);
      expect(pet.combatant.dead).toBe(true);
      const remaining = get(sim, "r").combatant.cast.rechargeRemaining;
      for (const skillId of [CHARM, COMFORT]) {
        expect(remaining.get(skillId)).toBeCloseTo(seconds - 1, 5);
      }
    }
  });

  it("costs nothing when it dies within 15 s of a resurrection", () => {
    const sim = match([ranger()]);
    const pet = wolf(sim);
    const waiting = () => get(sim, "r").combatant.cast.rechargeRemaining.get(CHARM) ?? 0;
    kill(sim, pet);
    expect(waiting()).toBeGreaterThan(0);
    // Past the bar's disable, Comfort Animal raises it.
    stepFor(sim, 5);
    expect(sim.requestSkill("r", 1)?.check).toEqual({ ok: true });
    stepFor(sim, COMFORT_SECONDS);
    expect(pet.combatant.dead).toBe(false);
    stepFor(sim, 10 - COMFORT_SECONDS);
    kill(sim, pet);
    expect(waiting()).toBe(0);
  });

  it("cannot be revived by an ordinary resurrection, even out of range", () => {
    const sim = match([ranger(), spec("m", 0, vec2(2000, 0), { skillBar: ["monk.restore-life"] })]);
    const pet = wolf(sim);
    kill(sim, pet);
    sim.setTarget("m", pet.id);
    expect(sim.requestSkill("m", 0)?.check).toEqual({
      ok: false,
      reason: "invalid-target-creature",
    });
  });
});

describe("Comfort Animal (#1046)", () => {
  it("heals a living wolf for 87 at Beast Mastery 12, whatever is selected", () => {
    const sim = match([ranger(), spec("x", 1, vec2(300, 0))]);
    const pet = wolf(sim);
    pet.combatant.health = 200;
    sim.setTarget("r", "x");
    expect(sim.requestSkill("r", 1)?.check).toEqual({ ok: true });
    expect(healed(stepFor(sim, COMFORT_SECONDS), pet.id)).toEqual([87]);
    expect(get(sim, "r").targetId).toBe("x");
  });

  it("raises a dead wolf with 48% Health", () => {
    const sim = match([ranger()]);
    const pet = wolf(sim);
    kill(sim, pet);
    // Past the bar's disable.
    stepFor(sim, 5);
    expect(sim.requestSkill("r", 1)?.check).toEqual({ ok: true });
    const log = stepFor(sim, COMFORT_SECONDS);
    expect(pet.combatant.dead).toBe(false);
    expect(healed(log, pet.id)).toEqual([]);
    const raised = log.flatMap((entry) =>
      entry.events.filter((event) => event.kind === "resurrected" && event.targetId === pet.id),
    );
    expect(raised).toHaveLength(1);
    expect(pet.combatant.health).toBeCloseTo(480 * 0.48, 0);
  });

  it("is refused with no wolf, and nothing is paid", () => {
    const sim = match([ranger([COMFORT])]);
    expect(sim.requestSkill("r", 0)?.check).toEqual({ ok: false, reason: "no-companion" });
    expect(get(sim, "r").combatant.energy).toBe(100);
  });
});

describe("the wolf and its owner (#1046)", () => {
  it("comes back beside its owner, at full Health, when the owner respawns", () => {
    const sim = match([ranger(), spec("x", 1, vec2(600, 0))], RESPAWN);
    const pet = wolf(sim);
    const owner = get(sim, "r");
    pet.position = vec2(300, 300);
    kill(sim, pet);
    kill(sim, owner);
    stepFor(sim, 1.5);
    expect(owner.combatant.dead).toBe(false);
    expect(pet.combatant.dead).toBe(false);
    expect(pet.combatant.health).toBe(480);
    expect(distance(pet.position, owner.position)).toBeLessThan(RULES.collision.playerRadius * 3);
  });

  it("leaves with its owner, and outlives its owner's death, still biting", () => {
    const sim = match([ranger(), spec("a", 1, vec2(60, 0))]);
    const pet = wolf(sim);
    sim.requestAttack("r", "a");
    stepFor(sim, 1);
    kill(sim, get(sim, "r"));
    expect(bites(stepFor(sim, 5), pet, "a").length).toBeGreaterThan(0);
    expect(pet.combatant.dead).toBe(false);
    sim.remove("r");
    expect(sim.get(pet.id)).toBeUndefined();
  });

  describe("rearm", () => {
    const loadout: ResolvedLoadout = {
      attributeRanks: new Map([[BEAST_MASTERY, 12]]),
      weaponSets: [
        { equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel), maxEnergy: 30 },
        null,
        null,
        null,
      ],
      maxHealth: 480,
      baseEnergyPips: 4,
    };

    it("keeps the same wolf, as it is, while Charm Animal stays on the bar", () => {
      const sim = match([ranger()]);
      const pet = wolf(sim);
      pet.combatant.health = 100;
      sim.rearm("r", loadout, [COMFORT, CHARM]);
      expect(petsOf(sim)).toEqual([pet]);
      expect(pet.combatant.health).toBe(100);
    });

    it("sends the wolf away when Charm Animal leaves the bar, and brings a fresh one back", () => {
      const sim = match([ranger()]);
      const first = wolf(sim);
      sim.rearm("r", loadout, [COMFORT]);
      expect(petsOf(sim)).toHaveLength(0);
      sim.rearm("r", loadout, [CHARM]);
      const second = wolf(sim);
      expect(second.id).not.toBe(first.id);
      expect(second.combatant.health).toBe(480);
    });
  });

  it("is the same in two runs with one seed", () => {
    const run = (): string[] => {
      const sim = match([
        ranger(),
        spec("a", 1, vec2(60, 0)),
        spec("s", 1, vec2(-40, 0), { skillBar: [CHARM] }),
      ]);
      sim.requestAttack("r", "a");
      const log = stepFor(sim, 8);
      return [
        ...[...sim.participants()].map(
          (other) => `${other.id}@${String(other.position.x)},${String(other.position.y)}`,
        ),
        ...log.map((entry) => `${String(entry.tick)}:${String(entry.sourceId)}`),
      ];
    };
    expect(run()).toEqual(run());
  });
});
