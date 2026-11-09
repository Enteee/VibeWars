import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_SPIRIT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { NO_RANKS } from "./status.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Preservation, Rejuvenation and Recovery (#2477), their PvP versions: a
 * spirit that heals the most hurt ally every 4 s, one whose heal costs it
 * Health per ally healed, and one that runs conditions out faster by its
 * Ritualist's rank. At Restoration Magic 12 and 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RESTORATION = "ritualist.restoration-magic";

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function spirit(sim: MatchSimulation): Participant | undefined {
  return [...sim.participants()].find((p) => p.creature?.kind === "spirit");
}

/** The heals `skillId` gave over `seconds`, in order. */
function heals(
  sim: MatchSimulation,
  skillId: string,
  seconds: number,
): { readonly targetId: string; readonly amount: number }[] {
  const out: { targetId: string; amount: number }[] = [];
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    for (const entry of sim.step(DT).log) {
      for (const event of entry.events) {
        if (entry.skillId === skillId && event.kind === "heal") {
          out.push({ targetId: event.targetId, amount: event.amount });
        }
      }
    }
  }
  return out;
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    sim.step(DT);
  }
}

/**
 * Ritualist `r` at the origin, at Restoration Magic `rank`, makes the
 * spirit of `skillId`; `others` stand where they are put. Stepped until
 * the spirit stands, the spirit 0 s old.
 */
function ritual(skillId: string, rank: number, others: readonly ParticipantSpec[]) {
  const sim = new MatchSimulation({
    seed: skillId,
    participants: [
      spec("r", 0, vec2(0, 0), {
        skillBar: [skillId],
        attributeRanks: new Map([[RESTORATION, rank]]),
      }),
      spec("x", 1, vec2(3000, 0)),
      ...others,
    ],
  });
  sim.setTarget("r", "r");
  expect(sim.requestSkill("r", 0)?.check.ok).toBe(true);
  for (let tick = 0; tick < 200 && spirit(sim) === undefined; tick += 1) {
    sim.step(DT);
  }
  const made = spirit(sim);
  if (made === undefined) {
    throw new Error(`${skillId} made no spirit`);
  }
  return { sim, spiritId: made.id };
}

describe("the three are the corpus's PvP versions (#2477)", () => {
  it.each([
    ["ritualist.preservation", 1250, 5, 20, true],
    ["ritualist.rejuvenation", 2204, 10, 30, false],
    ["ritualist.recovery", 1748, 15, 30, false],
  ] as const)("%s: gwId %i, %i Energy, 3 s, %i s recharge, elite %s", (id, gwId, e, r, elite) => {
    expect(getSkill(id)).toMatchObject({
      gwId,
      type: "binding-ritual",
      attributeId: RESTORATION,
      cost: { kind: "energy", amount: e },
      activationSeconds: 3,
      rechargeSeconds: r,
      elite,
    });
  });
});

describe("Preservation (#2477): one ally a pulse", () => {
  it.each([
    [12, 94],
    [0, 10],
  ] as const)("at %i, every 4 s, heals the most hurt ally in range for %i", (rank, amount) => {
    const { sim } = ritual("ritualist.preservation", rank, [
      spec("a", 0, vec2(100, 0)),
      spec("b", 0, vec2(-100, 0)),
      spec("far", 0, vec2(RANGE_SPIRIT + 300, 0)),
    ]);
    get(sim, "a").combatant.health = 300;
    get(sim, "b").combatant.health = 200;
    get(sim, "far").combatant.health = 50;
    expect(heals(sim, "ritualist.preservation", 3.9)).toEqual([]);
    expect(heals(sim, "ritualist.preservation", 0.2)).toEqual([{ targetId: "b", amount }]);
    expect(heals(sim, "ritualist.preservation", 4)).toHaveLength(1);
  });

  it("between equals, the lower id, every time; nobody hurt, no heal", () => {
    const { sim } = ritual("ritualist.preservation", 12, [
      spec("b", 0, vec2(-100, 0)),
      spec("a", 0, vec2(100, 0)),
    ]);
    get(sim, "a").combatant.health = 250;
    get(sim, "b").combatant.health = 250;
    expect(heals(sim, "ritualist.preservation", 4.1).map(({ targetId }) => targetId)).toEqual([
      "a",
    ]);
    get(sim, "a").combatant.health = 500;
    get(sim, "b").combatant.health = 500;
    get(sim, "r").combatant.health = get(sim, "r").combatant.maxHealth;
    expect(heals(sim, "ritualist.preservation", 4)).toEqual([]);
  });

  it("heals no spirit, and lives 90 s whatever the rank", () => {
    const { sim, spiritId } = ritual("ritualist.preservation", 0, [spec("a", 0, vec2(100, 0))]);
    get(sim, spiritId).combatant.health = 10;
    expect(heals(sim, "ritualist.preservation", 4.1)).toEqual([]);
    stepFor(sim, 85);
    expect(sim.get(spiritId)).toBeDefined();
    stepFor(sim, 1);
    expect(sim.get(spiritId)).toBeUndefined();
  });

  it.each([
    [12, 94],
    [0, 10],
  ] as const)("describes its heal at %i", (rank, amount) => {
    const preservation = getSkill("ritualist.preservation");
    if (preservation === undefined) throw new Error("Preservation is not in the catalog");
    const text = describeSkill(
      preservation,
      new Map([["ritualist.restoration-magic", rank]]),
      EN_WORDS,
      EN_NAMES,
    ).effects.map((line) => line.text);
    expect(text).toContain(
      `Every 4 seconds: heals the most hurt non-spirit ally in its range for ${String(amount)} Health`,
    );
  });
});

describe("Rejuvenation (#2477): a heal that costs the spirit", () => {
  it.each([
    [12, 9, 78],
    [0, 3, 30],
  ] as const)(
    "at %i each hurt ally in earshot is healed %i a second, the spirit losing as much; it lives %i s",
    (rank, amount, life) => {
      const { sim, spiritId } = ritual("ritualist.rejuvenation", rank, [
        spec("a", 0, vec2(150, 0)),
        spec("b", 0, vec2(-150, 0)),
        spec("far", 0, vec2(0, AREA_EARSHOT + 300)),
      ]);
      get(sim, "a").combatant.health = 200;
      get(sim, "r").combatant.health = get(sim, "r").combatant.maxHealth;
      get(sim, "far").combatant.health = 200;
      stepFor(sim, 0.05);
      const before = get(sim, spiritId).combatant.health;
      const given = heals(sim, "ritualist.rejuvenation", 2);
      // The hurt ally only: a full one is not healed and costs nothing.
      expect(given).toEqual([
        { targetId: "a", amount },
        { targetId: "a", amount },
      ]);
      expect(before - get(sim, spiritId).combatant.health).toBe(2 * amount);
      // Nobody hurt from here: it lives its lifespan out at no cost.
      get(sim, "a").combatant.health = get(sim, "a").combatant.maxHealth;
      stepFor(sim, life - 3);
      expect(sim.get(spiritId)).toBeDefined();
      stepFor(sim, 1.5);
      expect(sim.get(spiritId)).toBeUndefined();
    },
  );

  it("a nearly full ally still costs the spirit the whole amount", () => {
    const { sim, spiritId } = ritual("ritualist.rejuvenation", 12, [spec("a", 0, vec2(150, 0))]);
    get(sim, "a").combatant.health = 499;
    stepFor(sim, 0.05);
    const before = get(sim, spiritId).combatant.health;
    expect(heals(sim, "ritualist.rejuvenation", 1)).toEqual([{ targetId: "a", amount: 1 }]);
    expect(before - get(sim, spiritId).combatant.health).toBe(9);
  });

  it("describes the heal and its cost", () => {
    const text = describeStatus("rejuvenation", undefined, EN_WORDS, EN_NAMES);
    expect(text).toContain("every second");
    expect(text).toContain("loses 3...9 Health for each one healed");
  });
});

describe("Recovery (#2477): conditions expire faster, by rank", () => {
  it.each([
    [12, 10 / 1.44, 54],
    [0, 10 / 1.2, 30],
  ] as const)(
    "at %i a 10 s Bleeding lasts %d s on an ally in range; it lives %i s",
    (rank, lasts, life) => {
      const { sim, spiritId } = ritual("ritualist.recovery", rank, [spec("a", 0, vec2(150, 0))]);
      sim.step(DT);
      get(sim, "a").combatant.statuses.apply("bleeding", 10, "x", NO_RANKS);
      stepFor(sim, lasts - 0.2);
      expect(get(sim, "a").combatant.statuses.has("bleeding")).toBe(true);
      stepFor(sim, 0.4);
      expect(get(sim, "a").combatant.statuses.has("bleeding")).toBe(false);
      stepFor(sim, life - lasts - 1);
      expect(sim.get(spiritId)).toBeDefined();
      stepFor(sim, 1.5);
      expect(sim.get(spiritId)).toBeUndefined();
    },
  );

  it("describes its share at its Ritualist's rank", () => {
    expect(describeStatus("recovery", undefined, EN_WORDS, EN_NAMES)).toContain(
      "expire 20%...44% faster",
    );
  });
});
