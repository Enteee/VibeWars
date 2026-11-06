import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Mechanics (#2472): Illusionary Weaponry (PvP), whose melee blows
 * neither hit nor fail to hit and deal its damage instead, and Aneurysm,
 * whose foe regains all Energy and pays for each point. Every scaled
 * number at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

const rankAll = (rank: number): ReadonlyMap<string, number> =>
  new Map([
    ["mesmer.illusion-magic", rank],
    ["mesmer.domination-magic", rank],
    ["warrior.swordsmanship", 12],
  ]);
const R12 = rankAll(12);
const R0 = rankAll(0);

const IW = "mesmer.illusionary-weaponry";
const ANEURYSM = "mesmer.aneurysm";
const HAMSTRING = "warrior.hamstring";
const SEVER_ARTERY = "warrior.sever-artery";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("the two are the corpus's (#2472)", () => {
  it.each([
    [IW, 33, "enchantment", true, "mesmer.illusion-magic", 5, 1, 10, "self"],
    [ANEURYSM, 2055, "spell", false, "mesmer.domination-magic", 5, 1, 5, "single-enemy"],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attributeId, energy, activation, recharge, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        cost: { kind: "energy", amount: energy },
        overcast: 0,
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );
});

const SWORD: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: WEAPONS.sword.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  extra: Partial<ParticipantSpec> = {},
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e5,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
}

/** `c` of team 0 at the origin with `bar` at `ranks`; `others` as given. */
function arena(
  bar: readonly string[],
  ranks: ReadonlyMap<string, number>,
  extra: Partial<ParticipantSpec>,
  ...others: ParticipantSpec[]
): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "mech-2472",
    participants: [
      spec("c", 0, vec2(0, 0), { skillBar: bar, attributeRanks: ranks, ...extra }),
      ...others,
    ],
  });
  for (const participant of sim.participants()) {
    participant.combatant.health = participant.combatant.maxHealth;
    participant.combatant.energy = 50;
  }
  return sim;
}

function get(sim: MatchSimulation, id: string): Combatant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

/** `c` uses `skillId` on `targetId`, and steps until it has landed. */
function use(sim: MatchSimulation, skillId: string, targetId = "c"): CombatLogEntry[] {
  sim.setTarget("c", targetId);
  expect(sim.requestSkill("c", get(sim, "c").skillBar.indexOf(skillId))?.check).toEqual({
    ok: true,
  });
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "c" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(10 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** Damage `targetId` took in `log`, by the skill it is logged under (`undefined`: a weapon's). */
function damageBySkill(
  log: readonly CombatLogEntry[],
  targetId: string,
): Map<string | undefined, number[]> {
  const taken = new Map<string | undefined, number[]>();
  for (const entry of log) {
    for (const event of entry.events) {
      if (event.kind === "damage" && event.targetId === targetId) {
        taken.set(entry.skillId, [...(taken.get(entry.skillId) ?? []), event.amount]);
      }
    }
  }
  return taken;
}

function adrenalineOf(combatant: Combatant): number {
  return [...combatant.adrenaline.values()].reduce((sum, units) => sum + units, 0);
}

describe("Illusionary Weaponry (#2472)", () => {
  function armed(ranks: ReadonlyMap<string, number>, bar: readonly string[] = [IW]) {
    const sim = arena(bar, ranks, { equipment: SWORD }, spec("foe", 1, vec2(30, 0)));
    use(sim, IW);
    return sim;
  }

  it("lasts 30 seconds on its caster", () => {
    const sim = armed(R12);
    const remaining = get(sim, "c").statuses.get("illusionary-weaponry")?.remainingSeconds;
    expect(remaining).toBeGreaterThan(29.8);
    expect(remaining).toBeLessThanOrEqual(30);
  });

  it.each([
    ["rank 12", R12, 52],
    ["rank 0", R0, 20],
  ] as const)(
    "%s: each swing deals %i, never the sword's, and earns no adrenaline",
    (_, ranks, dealt) => {
      const sim = armed(ranks, [IW, SEVER_ARTERY]);
      const self = get(sim, "c");
      const foe = get(sim, "foe");
      const adrenaline = adrenalineOf(self);
      expect(sim.requestAttack("c", "foe")).toEqual({ ok: true });
      const log: CombatLogEntry[] = [];
      for (let i = 0; foe.health > foe.maxHealth - 3 * dealt; i++) {
        expect(i).toBeLessThan(10 * RULES.tickRateHz);
        log.push(...sim.step(DT).log);
      }
      const taken = damageBySkill(log, "foe");
      expect(taken.get(IW)).toEqual([dealt, dealt, dealt]);
      expect([...taken.keys()]).toEqual([IW]);
      expect(adrenalineOf(self)).toBe(adrenaline);
    },
  );

  it("an attack skill's blow is its damage too: paid for, recharging, no weapon damage", () => {
    const sim = armed(R12, [IW, HAMSTRING]);
    const self = get(sim, "c");
    const foe = get(sim, "foe");
    const energy = self.energy;
    const log = use(sim, HAMSTRING, "foe");
    expect(damageBySkill(log, "foe").get(IW)).toEqual([52]);
    expect(damageBySkill(log, "foe").get(HAMSTRING)).toBeUndefined();
    // Hamstring's own cripple is an on-hit effect: none.
    expect(foe.statuses.has("crippled")).toBe(false);
    expect(self.cast.isRecharging(HAMSTRING)).toBe(true);
    expect(self.energy).toBeLessThan(energy - 4);
  });
});

describe("Aneurysm (#2472)", () => {
  /** `foe` with `energy` of 25 beside `adjacent` (50 of 100), `away` beyond. */
  function aneurysm(ranks: ReadonlyMap<string, number>, energy: number) {
    const sim = arena(
      [ANEURYSM],
      ranks,
      {},
      spec("foe", 1, vec2(0, 300), { maxEnergy: 25 }),
      spec("adjacent", 1, vec2(40, 300)),
      spec("away", 1, vec2(400, 300)),
    );
    const foe = get(sim, "foe");
    sim.setTarget("c", "foe");
    expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    // Held where it is until the spell lands, regeneration and all.
    for (
      let i = 0;
      !log.some((entry) => entry.sourceId === "c" && entry.skillId === ANEURYSM);
      i++
    ) {
      expect(i).toBeLessThan(10 * RULES.tickRateHz);
      foe.energy = energy;
      get(sim, "adjacent").energy = 50;
      log.push(...sim.step(DT).log);
    }
    return { sim, log, foe };
  }

  it.each([
    // 2.6 a point rounds once, to 3; the cap of 24.2 to 24.
    ["rank 12", R12, 75, 24],
    ["rank 0", R0, 25, 1],
  ] as const)("%s: a foe at 0 takes %i and the adjacent foe loses %i", (_, ranks, damage, lost) => {
    const { sim, log, foe } = aneurysm(ranks, 0);
    expect(foe.energy).toBeGreaterThan(24.9);
    expect(damageBySkill(log, "foe").get(ANEURYSM)).toEqual([damage]);
    const adjacent = get(sim, "adjacent").energy;
    expect(Math.floor(adjacent)).toBe(50 - lost);
    expect(get(sim, "away").energy).toBeGreaterThanOrEqual(50);
  });

  it("a foe at full Energy takes nothing, and the foes beside it lose nothing", () => {
    const { sim, log } = aneurysm(R12, 25);
    expect(damageBySkill(log, "foe").get(ANEURYSM)).toBeUndefined();
    expect(get(sim, "adjacent").energy).toBeGreaterThanOrEqual(50);
  });
});
