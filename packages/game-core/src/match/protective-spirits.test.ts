import { describe, expect, it } from "vitest";

import { RANGE_SPIRIT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { mitigate, type DamagePacket } from "../skills/damage.js";
import { applyEffects } from "../skills/effects.js";
import type { StatusId } from "../skills/status.js";
import type { Skill } from "../skills/types.js";
import { blocks } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Ritualist protective spirits (#1265): Shelter, Union, Displacement and
 * Earthbind each plant a spirit whose aura protects allies, or binds
 * foes, and that loses health every time its protection changes an
 * outcome.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SHELTER = "ritualist.shelter";
const UNION = "ritualist.union";
const DISPLACEMENT = "ritualist.displacement";
const EARTHBIND = "ritualist.earthbind";

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function spec(id: string, team: number, spawn: Vec2, communing = 12): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [SHELTER, UNION, DISPLACEMENT, EARTHBIND],
    attributeRanks: new Map([["ritualist.communing", communing]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/**
 * `r` on team 0 at the origin; `ally` beside it, `far` an ally out of the
 * spirit's range, and `foe` on team 1 within it.
 */
function match(communing = 12): MatchSimulation {
  return new MatchSimulation({
    seed: "protective-spirits",
    participants: [
      spec("r", 0, vec2(0, 0), communing),
      spec("ally", 0, vec2(200, 0)),
      spec("far", 0, vec2(RANGE_SPIRIT + 300, 0)),
      spec("foe", 1, vec2(-300, 0)),
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

function spirit(sim: MatchSimulation): Participant {
  const found = [...sim.participants()].find((p) => p.creature?.kind === "spirit");
  if (found === undefined) {
    throw new Error("no spirit");
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

/** `r` casts `skillId` and steps until its spirit stands and projects. */
function ritual(sim: MatchSimulation, skillId: string): Participant {
  const slot = get(sim, "r").skillBar.indexOf(skillId);
  expect(sim.requestSkill("r", slot)?.check.ok).toBe(true);
  stepFor(sim, skillOf(skillId).activationSeconds + DT * 2);
  return spirit(sim);
}

/** What `spiritId` paid, payment by payment, for `statusId` in `log`. */
function paid(log: readonly CombatLogEntry[], spiritId: string, statusId: StatusId): number[] {
  return log
    .flatMap((entry) => entry.events)
    .flatMap((event) =>
      event.kind === "health-lost" && event.targetId === spiritId && event.statusId === statusId
        ? [event.amount]
        : [],
    );
}

/** A packet that ignores armor, so it arrives as `amount`. */
function packet(amount: number, source: "weapon" | "skill"): DamagePacket {
  return { armored: 0, armorIgnoring: amount, type: "slashing", source, armorPenetration: 0 };
}

describe("the four spirits' numbers (#1265)", () => {
  // Rank 0...15 is GW1's a...b, so 12 is four fifths of the way; health
  // is 50 + 20 per whole level (#1917).
  it.each([
    [SHELTER, 0, 70, 30],
    [SHELTER, 12, 190, 54],
    [SHELTER, 15, 210, 60],
    [UNION, 0, 70, 30],
    [UNION, 12, 190, 54],
    [UNION, 15, 210, 60],
    [DISPLACEMENT, 0, 70, 30],
    [DISPLACEMENT, 12, 210, 54],
    [DISPLACEMENT, 15, 250, 60],
    [EARTHBIND, 0, 70, 15],
    [EARTHBIND, 12, 210, 39],
    [EARTHBIND, 15, 250, 45],
  ])("%s at Communing %i: %i Health, %i s", (id, rank, health, seconds) => {
    const planted = ritual(match(rank), id);
    expect(planted.combatant.maxHealth).toBe(health);
    expect(planted.combatant.equipment.baseArmor).toBe(51);
    expect(planted.combatant.attack).toBeUndefined();
    // Planted a few ticks ago.
    expect(planted.creature?.expiresInSeconds).toBeLessThan(seconds);
    expect(planted.creature?.expiresInSeconds).toBeCloseTo(seconds, 0);
  });
});

describe("a protective spirit's aura (#1265)", () => {
  it.each([
    [SHELTER, "shelter"],
    [UNION, "union"],
    [DISPLACEMENT, "displacement"],
  ] as const)("%s's is worn by an ally in range, not one out of it, nor a foe", (id, status) => {
    const sim = match();
    ritual(sim, id);
    expect(get(sim, "ally").combatant.statuses.has(status)).toBe(true);
    expect(get(sim, "r").combatant.statuses.has(status)).toBe(true);
    expect(get(sim, "far").combatant.statuses.has(status)).toBe(false);
    expect(get(sim, "foe").combatant.statuses.has(status)).toBe(false);
  });

  it("Earthbind's is worn by a foe in range, not an ally", () => {
    const sim = match();
    ritual(sim, EARTHBIND);
    expect(get(sim, "foe").combatant.statuses.has("earthbind")).toBe(true);
    expect(get(sim, "ally").combatant.statuses.has("earthbind")).toBe(false);
  });
});

describe("Shelter (#1265)", () => {
  it("caps a big blow at 10% of max health and pays 51; a small blow or a spell costs nothing", () => {
    const sim = match();
    const shelter = ritual(sim, SHELTER);
    const ally = get(sim, "ally").combatant;
    const cap = Math.floor(0.1 * ally.maxHealth);

    expect(mitigate(packet(200, "weapon"), ally, RULES.combat, null, createRng(1))).toBe(cap);
    expect(paid(stepFor(sim, DT), shelter.id, "shelter")).toEqual([51]);

    expect(mitigate(packet(cap - 10, "weapon"), ally, RULES.combat, null, createRng(1))).toBe(
      cap - 10,
    );
    expect(mitigate(packet(200, "skill"), ally, RULES.combat, null, createRng(1))).toBe(200);
    expect(paid(stepFor(sim, DT), shelter.id, "shelter")).toEqual([]);
    expect(shelter.combatant.health).toBe(190 - 51);
  });
});

describe("Union (#1265)", () => {
  it("cuts 15 from a hit and from a life steal, and pays 15 for each, a hit it zeroes too", () => {
    const sim = match();
    const union = ritual(sim, UNION);
    const ally = get(sim, "ally").combatant;

    expect(mitigate(packet(40, "skill"), ally, RULES.combat, null, createRng(1))).toBe(25);
    expect(mitigate(packet(10, "weapon"), ally, RULES.combat, null, createRng(1))).toBe(0);
    const before = ally.health;
    const events = applyEffects([{ kind: "life-steal", amount: { flat: 30 } }], {
      surroundings: new Map(),
      caster: get(sim, "foe").combatant,
      target: ally,
      rng: createRng(1265),
      rules: RULES.combat,
    });
    expect(events).toContainEqual({ kind: "life-stolen", targetId: "ally", amount: 15 });
    expect(ally.health).toBe(before - 15);
    expect(paid(stepFor(sim, DT), union.id, "union")).toEqual([15, 15, 15]);
  });
});

describe("Displacement (#1265)", () => {
  it("blocks about 75% of blows, pays 60 for each, and dies once it has paid its health", () => {
    const sim = match();
    const displacement = ritual(sim, DISPLACEMENT);
    const ally = get(sim, "ally").combatant;
    const rng = createRng(1265);
    let blocked = 0;
    for (let i = 0; i < 400; i += 1) {
      if (blocks(ally, "foe", "melee", false, rng)) {
        blocked += 1;
      }
    }
    expect(blocked / 400).toBeGreaterThan(0.7);
    expect(blocked / 400).toBeLessThan(0.8);

    const log = stepFor(sim, DT);
    // 210 Health: three blocks, and the fourth takes what is left.
    expect(paid(log, displacement.id, "displacement")).toEqual([60, 60, 60, 30]);
    expect(displacement.combatant.dead).toBe(true);
    stepFor(sim, DT * 2);
    expect(ally.statuses.has("displacement")).toBe(false);
  });

  it("pays only for its own blocks, not another status's", () => {
    const sim = match();
    ritual(sim, DISPLACEMENT);
    const ally = get(sim, "ally").combatant;
    ally.statuses.apply("guardian", 60, "r", NO_RANKS);
    ally.statuses.drainChanges();
    const rng = createRng(1265);
    let blocked = 0;
    for (let i = 0; i < 400; i += 1) {
      if (blocks(ally, "foe", "melee", false, rng)) {
        blocked += 1;
      }
    }
    const charges = ally.statuses
      .drainChanges()
      .filter((change) => change.kind === "charged-source" && change.statusId === "displacement");
    // Displacement (75%) rolls first, Guardian (50%) on the rest: 87.5%
    // blocked, Displacement's own 75%.
    expect(blocked / 400).toBeGreaterThan(0.83);
    expect(blocked / 400).toBeLessThan(0.92);
    expect(charges.length / 400).toBeGreaterThan(0.7);
    expect(charges.length / 400).toBeLessThan(0.8);
  });
});

describe("Earthbind (#1265)", () => {
  it("makes a 2 s knockdown on a foe in range 3 s and pays 30; an ally is unaffected", () => {
    const sim = match();
    const earthbind = ritual(sim, EARTHBIND);
    const knockdown = (targetId: string, casterId: string): void => {
      applyEffects([{ kind: "knockdown", durationSeconds: 2 }], {
        surroundings: new Map(),
        caster: get(sim, casterId).combatant,
        target: get(sim, targetId).combatant,
        rng: createRng(1265),
        rules: RULES.combat,
      });
    };

    knockdown("foe", "r");
    expect(get(sim, "foe").combatant.knockdownRemaining).toBe(3);
    knockdown("ally", "foe");
    expect(get(sim, "ally").combatant.knockdownRemaining).toBe(2);
    expect(paid(stepFor(sim, DT), earthbind.id, "earthbind")).toEqual([30]);
  });
});
