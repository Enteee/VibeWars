import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import {
  MAX_CREATURES,
  MatchSimulation,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Minions (#467 child 3): Animate Bone Minions and Animate Bone Horror
 * raise rotting bodies from a corpse that follow their master and fight.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const MINIONS = "necromancer.animate-bone-minions";
const HORROR = "necromancer.animate-bone-horror";
const DEATH_MAGIC = "necromancer.death-magic";
/** The 1 s activation, the aftercast, and a tick to spare. */
const CAST_SECONDS = 1 + RULES.combat.aftercastSeconds + 2 * DT;
/** How far one tick of movement carries anyone. */
const STEP = RULES.movement.maxSpeedUnitsPerSecond * DT;

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [MINIONS, HORROR],
    attributeRanks: new Map([[DEATH_MAGIC, 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxEnergy: 100,
    ...extra,
  };
  return result;
}

/** A creature already standing, as `#summon` would make it: a minion, or a pet for #1188. */
function standing(
  id: string,
  ownerId: string,
  spawn: Vec2,
  kind: "minion" | "pet" = "minion",
): ParticipantSpec {
  return {
    ...spec(id, 0, spawn, { skillBar: [], attributeRanks: new Map() }),
    creature: {
      ownerId,
      kind,
      look: kind === "pet" ? "beast" : "bone-minion",
      name: "Bone Minion",
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: MINIONS,
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
}

/** Necromancer `n` at the origin and `x`, a foe 300 away to be the corpse. */
function match(extra: readonly ParticipantSpec[] = [], rank = 12): MatchSimulation {
  return new MatchSimulation({
    seed: "minions",
    participants: [
      spec("n", 0, vec2(0, 0), { attributeRanks: new Map([[DEATH_MAGIC, rank]]) }),
      spec("x", 1, vec2(300, 0)),
      ...extra,
    ],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** Kill `id` as burning would. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "n", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

/** `n` casts `slot` through to the end. */
function raise(sim: MatchSimulation, slot = 0): CombatLogEntry[] {
  get(sim, "n").combatant.energy = 100;
  expect(sim.requestSkill("n", slot)?.check).toEqual({ ok: true });
  return stepFor(sim, CAST_SECONDS);
}

function minionsOf(sim: MatchSimulation, owner = "n"): Participant[] {
  return [...sim.participants()].filter(
    (participant) => participant.creature?.ownerId === owner && !participant.combatant.dead,
  );
}

describe("Animate Bone Minions (#467)", () => {
  it("raises two Bone Minions at the corpse at Death Magic 12: 280 Health, armor 30", () => {
    const sim = match();
    kill(sim, "x");
    get(sim, "n").combatant.energy = 100;
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
    while (minionsOf(sim).length === 0) {
      stepFor(sim, DT);
    }
    const risen = minionsOf(sim);
    expect(risen).toHaveLength(2);
    for (const minion of risen) {
      expect(minion.creature).toMatchObject({ kind: "minion", name: "Bone Minion", ownerId: "n" });
      expect(minion.combatant.team).toBe(0);
      expect(minion.combatant.maxHealth).toBe(280);
      expect(minion.combatant.equipment.baseArmor).toBe(30);
      // Risen at the corpse: one step toward heel already, as it acts this
      // tick, and shouldered off its twin.
      expect(distance(minion.position, vec2(300, 0))).toBeLessThanOrEqual(
        STEP + 2 * RULES.collision.creatureRadius,
      );
    }
    expect(get(sim, "x").corpseExploited).toBe(true);
  });

  it("raises them at 80 Health and armor 0 at Death Magic 0", () => {
    const sim = match([], 0);
    kill(sim, "x");
    raise(sim);
    for (const minion of minionsOf(sim)) {
      expect(minion.combatant.maxHealth).toBe(80);
      expect(minion.combatant.equipment.baseArmor).toBe(0);
    }
  });

  it("raises them with 4% more Health a rank of their master's Spawning Power (#1098): 414", () => {
    const sim = new MatchSimulation({
      seed: "minions",
      participants: [
        spec("n", 0, vec2(0, 0), {
          attributeRanks: new Map([
            [DEATH_MAGIC, 12],
            ["ritualist.spawning-power", 12],
          ]),
        }),
        spec("x", 1, vec2(300, 0)),
      ],
    });
    kill(sim, "x");
    raise(sim);
    expect(minionsOf(sim).map((minion) => minion.combatant.maxHealth)).toEqual([414, 414]);
  });

  it("refuses with no corpse in range, and takes nothing", () => {
    const sim = match();
    const n = get(sim, "n");
    n.combatant.energy = 50;
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: false, reason: "no-corpse" });
    stepFor(sim, DT);
    expect(n.combatant.energy).toBe(50);
  });

  it("rots 2 Health a second, 4 after 20 s, and dies untouched at 65 s", () => {
    const sim = match();
    kill(sim, "x");
    raise(sim);
    const [minion] = minionsOf(sim);
    if (minion === undefined) {
      throw new Error("nothing rose");
    }
    const age = (): number => minion.creature?.ageSeconds ?? 0;
    expect(sim.pips(minion).health).toBe(-1);
    stepFor(sim, 10 - age());
    const at10 = minion.combatant.health;
    stepFor(sim, 5);
    expect(at10 - minion.combatant.health).toBeCloseTo(10, 6);
    stepFor(sim, 20.5 - age());
    expect(sim.pips(minion).health).toBe(-2);
    const at20 = minion.combatant.health;
    stepFor(sim, 5);
    expect(at20 - minion.combatant.health).toBeCloseTo(20, 6);
    // Never a tick of natural regeneration on the way down.
    let last = minion.combatant.health;
    while (!minion.combatant.dead) {
      stepFor(sim, DT);
      expect(minion.combatant.health).toBeLessThan(last);
      last = minion.combatant.health;
    }
    expect(age()).toBeCloseTo(65, 1);
  });

  it("sums its rot with its statuses before the ±10 clamp", () => {
    const sim = match();
    kill(sim, "x");
    raise(sim);
    const [minion] = minionsOf(sim);
    if (minion === undefined) {
      throw new Error("nothing rose");
    }
    stepFor(sim, 21);
    // +12 from statuses, −2 of rot: +10, where clamping first would leave +8.
    minion.combatant.statuses.apply("shadow-refuge", 30, "n", NO_RANKS);
    minion.combatant.statuses.apply("mending", 30, "n", NO_RANKS);
    expect(sim.pips(minion).health).toBe(10);
  });

  it("swings at a foe beside it every 3.10 s for 6-11 blunt, scaled by its master's rank", () => {
    const blows = (rank: number): CombatLogEntry[] => {
      const sim = match([spec("y", 1, vec2(330, 0))], rank);
      kill(sim, "x");
      raise(sim);
      const [minion] = minionsOf(sim);
      return stepFor(sim, 12).filter(
        (entry) => entry.cause === "weapon" && entry.sourceId === minion?.id,
      );
    };
    const strong = blows(12);
    expect(strong.length).toBeGreaterThanOrEqual(3);
    const gaps = strong.slice(1).map((entry, i) => entry.atSeconds - (strong[i]?.atSeconds ?? 0));
    for (const gap of gaps) {
      expect(gap).toBeCloseTo(3.1, 1);
    }
    const amounts = (entries: CombatLogEntry[]): number[] =>
      entries.flatMap((entry) =>
        entry.events.flatMap((event) =>
          event.kind === "damage" && event.targetId === "y" && !event.critical
            ? [event.amount]
            : [],
        ),
      );
    for (const amount of amounts(strong)) {
      expect(amount).toBeGreaterThanOrEqual(6);
      expect(amount).toBeLessThanOrEqual(11);
    }
    expect(strong.every((entry) => entry.weaponId === "unarmed")).toBe(true);
    // GWW: a Death Magic 0 Bone Minion hits for 0, a rank-6 one for 2-6
    // with criticals, 2-4 without (#1131).
    const zero = blows(0);
    expect(zero.length).toBeGreaterThanOrEqual(3);
    const damage = zero.flatMap((entry) =>
      entry.events.flatMap((event) => (event.kind === "damage" ? [event.amount] : [])),
    );
    expect(damage.every((amount) => amount === 0)).toBe(true);
    const six = amounts(blows(6));
    expect(six.length).toBeGreaterThanOrEqual(1);
    for (const amount of six) {
      expect(amount).toBeGreaterThanOrEqual(2);
      expect(amount).toBeLessThanOrEqual(4);
    }
  });

  it("holds 2 + half its master's Death Magic: past it one dies, and that is a death", () => {
    const corpses = [0, 1, 2, 3, 4].map((i) => spec(`d${String(i)}`, 1, vec2(-100, 20 * i)));
    // A second Necromancer, to reap the culled.
    const reaper = spec("o", 0, vec2(0, 40), {
      attributeRanks: new Map([["necromancer.soul-reaping", 12]]),
      maxEnergy: 60,
    });
    const sim = match([...corpses, reaper]);
    for (const corpse of corpses) {
      kill(sim, corpse.id);
    }
    const ids: string[][] = [];
    let culled: CombatLogEntry[] = [];
    for (let i = 0; i < 5; i += 1) {
      const before = new Set(minionsOf(sim).map(({ id }) => id));
      stepFor(sim, 5);
      get(sim, "o").combatant.energy = 0;
      culled = raise(sim);
      ids.push(minionsOf(sim).flatMap(({ id }) => (before.has(id) ? [] : [id])));
    }
    const alive = minionsOf(sim).map(({ id }) => id);
    expect(alive).toHaveLength(8);
    const [first = []] = ids;
    for (const id of first) {
      expect(alive).not.toContain(id);
    }
    const cull = culled.find((entry) => entry.cause === "skill" && entry.skillId === MINIONS);
    expect(cull?.sourceId).toBe("n");
    expect(cull?.events).toEqual(first.map((targetId) => ({ kind: "death", targetId })));
    expect(get(sim, "o").combatant.energy).toBeGreaterThan(0);
  });

  /**
   * At Death Magic 0 (a cap of 2), a Bone Horror on each of `x` and `y`, a
   * second apart, then `health` sets theirs as a third is cast on `z`.
   * The two it had are returned oldest first, with who died.
   */
  function cullOneOfTwo(health: (oldest: Participant, newest: Participant) => void) {
    const sim = match([spec("y", 1, vec2(300, 40)), spec("z", 1, vec2(300, -40))], 0);
    for (const id of ["x", "y", "z"]) {
      kill(sim, id);
    }
    raise(sim, 1);
    stepFor(sim, 5);
    raise(sim, 1);
    stepFor(sim, 5);
    const [oldest, newest] = minionsOf(sim);
    if (oldest === undefined || newest === undefined) {
      throw new Error("two did not rise");
    }
    get(sim, "n").combatant.energy = 100;
    expect(sim.requestSkill("n", 1)?.check).toEqual({ ok: true });
    health(oldest, newest);
    stepFor(sim, CAST_SECONDS);
    expect(minionsOf(sim)).toHaveLength(2);
    return { oldest, newest };
  }

  it("past the cap kills the weakest, not the oldest (#1130)", () => {
    const { oldest, newest } = cullOneOfTwo((oldest, newest) => {
      oldest.combatant.health = 200;
      newest.combatant.health = 100;
    });
    expect(newest.combatant.dead).toBe(true);
    expect(oldest.combatant.dead).toBe(false);
  });

  it("past the cap kills the oldest of two as weak (#1130)", () => {
    const { oldest, newest } = cullOneOfTwo((oldest, newest) => {
      oldest.combatant.health = 100;
      newest.combatant.health = 100;
    });
    expect(oldest.combatant.dead).toBe(true);
    expect(newest.combatant.dead).toBe(false);
  });

  it("counts its living minions for its master's armor, not a dead one; a pet apart (#1206)", () => {
    const sim = match([
      standing("m1", "n", vec2(40, 0)),
      standing("m2", "n", vec2(-40, 0)),
      standing("p", "n", vec2(0, 40), "pet"),
    ]);
    stepFor(sim, DT);
    expect(get(sim, "n").combatant.controlled).toEqual({ minion: 2, spirit: 0, pet: 1 });
    kill(sim, "m1");
    stepFor(sim, DT);
    expect(get(sim, "n").combatant.controlled).toEqual({ minion: 1, spirit: 0, pet: 1 });
  });

  it("leaves no corpse when it dies", () => {
    const sim = match();
    kill(sim, "x");
    raise(sim);
    const [minion] = minionsOf(sim);
    if (minion === undefined) {
      throw new Error("nothing rose");
    }
    kill(sim, minion.id);
    stepFor(sim, 5);
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: false, reason: "no-corpse" });
  });

  it("outlives its owner's death, but not its leaving", () => {
    const sim = match();
    kill(sim, "x");
    raise(sim);
    kill(sim, "n");
    stepFor(sim, 1);
    expect(minionsOf(sim)).toHaveLength(2);
    sim.remove("n");
    stepFor(sim, DT);
    expect([...sim.participants()].filter(({ creature }) => creature !== undefined)).toEqual([]);
  });

  it("rises as many as fit under the match's creature limit, and spends the corpse", () => {
    const others = Array.from({ length: MAX_CREATURES - 1 }, (_, i) =>
      standing(`m${String(i)}`, "other", vec2(-2000, 10 * i)),
    );
    const sim = match([spec("other", 0, vec2(-2000, -50)), ...others]);
    kill(sim, "x");
    raise(sim);
    expect(minionsOf(sim)).toHaveLength(1);
    expect(get(sim, "x").corpseExploited).toBe(true);
  });

  it("at the limit with its master at cap, the culled make room one for one", () => {
    const own = Array.from({ length: 8 }, (_, i) =>
      standing(`k${String(i)}`, "n", vec2(0, 10 * i)),
    );
    const others = Array.from({ length: MAX_CREATURES - 8 }, (_, i) =>
      standing(`m${String(i)}`, "other", vec2(-2000, 10 * i)),
    );
    const sim = match([...own, spec("other", 0, vec2(-2000, -50)), ...others]);
    kill(sim, "x");
    raise(sim);
    const mine = minionsOf(sim).map(({ id }) => id);
    expect(mine).toHaveLength(8);
    expect(mine).not.toContain("k0");
    expect(mine).not.toContain("k1");
  });

  it("raises, rots and culls the same way twice from one seed", () => {
    const run = (): unknown => {
      const sim = match([spec("y", 1, vec2(330, 0)), spec("z", 1, vec2(-300, 0))]);
      kill(sim, "x");
      raise(sim);
      kill(sim, "z");
      stepFor(sim, 5);
      raise(sim);
      const log = stepFor(sim, 30);
      return {
        bodies: [...sim.participants()].map(({ id, position, combatant }) => ({
          id,
          position,
          health: combatant.health,
        })),
        deaths: log.flatMap((entry) => entry.events.filter((event) => event.kind === "death")),
      };
    };
    expect(run()).toEqual(run());
  });
});

describe("Bone Minions assisting their master (#1118)", () => {
  it("attack the foe their master wands from 400, out of their own earshot, within 2 s", () => {
    const unarmed = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel);
    const wanded = { ...unarmed, mainHand: { ...unarmed.mainHand, weapon: WEAPONS.wand } };
    const sim = new MatchSimulation({
      seed: "minions",
      participants: [
        spec("n", 0, vec2(0, 0), { equipment: wanded }),
        spec("x", 1, vec2(300, 0)),
        spec("y", 1, vec2(0, -400)),
      ],
    });
    kill(sim, "x");
    raise(sim);
    // At heel, about 109 from their master: more than 350 from the foe.
    stepFor(sim, 3);
    const minions = minionsOf(sim);
    expect(minions).toHaveLength(2);
    for (const minion of minions) {
      expect(distance(minion.position, get(sim, "y").position)).toBeGreaterThan(350);
      expect(minion.combatant.attack).toBeUndefined();
    }
    expect(sim.requestAttack("n", "y")).toEqual({ ok: true });
    stepFor(sim, 2);
    for (const minion of minions) {
      expect(minion.combatant.attack?.targetId).toBe("y");
    }
  });
});

describe("Animate Bone Horror (#467)", () => {
  it("raises one Bone Horror at Death Magic 12: 360 Health, armor 56", () => {
    const sim = match();
    kill(sim, "x");
    raise(sim, 1);
    const risen = minionsOf(sim);
    expect(risen).toHaveLength(1);
    expect(risen[0]?.creature?.name).toBe("Bone Horror");
    expect(risen[0]?.combatant.maxHealth).toBe(360);
    expect(risen[0]?.combatant.equipment.baseArmor).toBe(56);
  });
});
