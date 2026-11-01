import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { NO_RANKS, getStatusDefinition, type StatusId } from "../skills/status.js";
import { raisedMaxEnergy } from "../skills/overcast.js";
import { effectiveMaxHealth } from "../skills/tick.js";
import { vec2, type Vec2 } from "../vec2.js";
import { applyIntent } from "./apply-intent.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * The six Ritualist item spells (#1434), each cast, held and dropped with
 * the Drop button, at rank 12: what holding the ashes gives, and what
 * their drop does.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    spawn,
    facing: 0,
  };
}

/**
 * A rank-12 Ritualist "r" with `skillId`; an ally "a" across the field; a
 * foe "x" beside "r", and a foe "z" well away.
 */
function match(skillId: string): MatchSimulation {
  return new MatchSimulation({
    seed: "ritualist-item-spells",
    participants: [
      {
        ...spec("r", 0, vec2(0, 0)),
        skillBar: [skillId],
        attributeRanks: new Map([
          ["ritualist.restoration-magic", 12],
          ["ritualist.channeling-magic", 12],
          ["ritualist.spawning-power", 12],
          ["ritualist.communing", 12],
        ]),
        maxEnergy: 100,
      },
      spec("a", 0, vec2(1500, 0)),
      spec("x", 1, vec2(60, 0)),
      spec("z", 1, vec2(400, 0)),
    ],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    sim.step(DT);
  }
}

/** "r" casts `skillId`, its only skill, and holds the ashes. */
function cast(skillId: string): MatchSimulation {
  const sim = match(skillId);
  expect(applyIntent(sim, "r", { kind: "use-skill", slot: 0 })).toBeNull();
  stepFor(sim, 2.5);
  return sim;
}

/** "r" drops what it holds, with the Drop button. */
function drop(sim: MatchSimulation): void {
  expect(applyIntent(sim, "r", { kind: "drop-bundle" })).toBeNull();
}

function held(sim: MatchSimulation, id: StatusId): number | undefined {
  return get(sim, "r").combatant.statuses.get(id)?.remainingSeconds;
}

describe("Ritualist item spells (#1434)", () => {
  it("are item spells, Ritualist, from the corpus record", () => {
    const ids = [
      ["ritualist.protective-was-kaolai", "ritualist.restoration-magic", false],
      ["ritualist.generous-was-tsungrai", "ritualist.restoration-magic", false],
      ["ritualist.defiant-was-xinrae", "ritualist.restoration-magic", true],
      ["ritualist.blind-was-mingson", "ritualist.restoration-magic", false],
      ["ritualist.grasping-was-kuurong", "ritualist.channeling-magic", true],
      ["ritualist.energetic-was-lee-sa", "ritualist.spawning-power", false],
    ] as const;
    for (const [id, attributeId, elite] of ids) {
      expect(getSkill(id), id).toMatchObject({
        type: "item-spell",
        profession: "ritualist",
        target: "self",
        attributeId,
        elite,
      });
    }
  });

  it("Protective Was Kaolai: +20 armor held; the drop heals the whole party 80", () => {
    const sim = cast("ritualist.protective-was-kaolai");
    expect(held(sim, "protective-was-kaolai")).toBeGreaterThan(48);
    expect(getStatusDefinition("protective-was-kaolai").armorModifier).toBe(20);
    for (const id of ["r", "a", "x"]) {
      get(sim, id).combatant.health = 100;
    }
    drop(sim);
    expect(get(sim, "r").combatant.health).toBe(180);
    expect(get(sim, "a").combatant.health).toBe(180);
    expect(get(sim, "x").combatant.health).toBe(100);
  });

  it("Generous Was Tsungrai: +122 maximum Health held; the drop gives 244", () => {
    const sim = cast("ritualist.generous-was-tsungrai");
    const r = get(sim, "r").combatant;
    // Its 10% sacrifice, paid on the cast, then the bonus raises Health with it.
    expect(r.health).toBe(450 + 122);
    expect(effectiveMaxHealth(r)).toBe(622);
    r.health = 620;
    drop(sim);
    // The raised Health goes with the bonus, and the heal stops at 500.
    expect(effectiveMaxHealth(r)).toBe(500);
    expect(r.health).toBe(500);
    const again = cast("ritualist.generous-was-tsungrai");
    get(again, "r").combatant.health = 100;
    drop(again);
    expect(get(again, "r").combatant.health).toBe(344);
  });

  it("Defiant Was Xinrae: a hit takes at most 20% held; the drop steals 41 from nearby foes", () => {
    const sim = cast("ritualist.defiant-was-xinrae");
    expect(getStatusDefinition("defiant-was-xinrae").maxDamageFractionPerHit).toBe(0.2);
    get(sim, "r").combatant.health = 100;
    drop(sim);
    expect(get(sim, "x").combatant.health).toBe(500 - 41);
    expect(get(sim, "z").combatant.health).toBe(500);
    expect(get(sim, "r").combatant.health).toBe(141);
  });

  it("Blind Was Mingson: the drop blinds nearby foes for 7 s", () => {
    const sim = cast("ritualist.blind-was-mingson");
    drop(sim);
    expect(get(sim, "x").combatant.statuses.get("blind")?.remainingSeconds).toBe(7);
    expect(get(sim, "z").combatant.statuses.get("blind")).toBeUndefined();
  });

  it("Grasping Was Kuurong: the drop strikes foes in the area and knocks them down", () => {
    const sim = cast("ritualist.grasping-was-kuurong");
    drop(sim);
    const x = get(sim, "x").combatant;
    expect(x.health).toBeLessThan(500);
    expect(x.health).toBeGreaterThanOrEqual(500 - 63);
    expect(x.knockdownRemaining).toBeGreaterThan(0);
    expect(get(sim, "z").combatant.health).toBe(500);
  });

  it("Energetic Was Lee Sa: +2 Energy regeneration held, for 13 s; the drop gives 8", () => {
    const sim = cast("ritualist.energetic-was-lee-sa");
    expect(held(sim, "energetic-was-lee-sa")).toBeGreaterThan(10);
    expect(held(sim, "energetic-was-lee-sa")).toBeLessThanOrEqual(13);
    expect(getStatusDefinition("energetic-was-lee-sa").energyPips).toBe(2);
    const r = get(sim, "r").combatant;
    r.energy = 0;
    drop(sim);
    expect(r.energy).toBe(8);
  });
});

describe("Ritualist item spells 2 (#1464)", () => {
  it("are item spells, Ritualist, from the corpus record", () => {
    const ids = [
      ["ritualist.mighty-was-vorizun", "ritualist.communing", false],
      ["ritualist.cruel-was-daoshen", "ritualist.channeling-magic", false],
      ["ritualist.destructive-was-glaive", "ritualist.channeling-magic", true],
      ["ritualist.tranquil-was-tanasen", "ritualist.restoration-magic", true],
      ["ritualist.vengeful-was-khanhei", "ritualist.restoration-magic", true],
      ["ritualist.pure-was-li-ming", "ritualist.restoration-magic", false],
    ] as const;
    for (const [id, attributeId, elite] of ids) {
      expect(getSkill(id), id).toMatchObject({
        type: "item-spell",
        profession: "ritualist",
        target: "self",
        attributeId,
        elite,
      });
    }
  });

  it("Mighty Was Vorizun: +15 armor and +30 maximum Energy held; the drop clamps Energy", () => {
    const sim = cast("ritualist.mighty-was-vorizun");
    expect(getStatusDefinition("mighty-was-vorizun").armorModifier).toBe(15);
    const r = get(sim, "r").combatant;
    expect(raisedMaxEnergy(r)).toBe(130);
    // Above the unraised 100, and kept there.
    r.energy = 125;
    stepFor(sim, 1);
    expect(r.energy).toBe(125);
    drop(sim);
    expect(raisedMaxEnergy(r)).toBe(100);
    expect(r.energy).toBe(100);
  });

  it("Cruel Was Daoshen: Ritualist skills pierce 10% held; the drop strikes nearby foes", () => {
    const sim = cast("ritualist.cruel-was-daoshen");
    expect(getStatusDefinition("cruel-was-daoshen").skillArmorPenetration).toEqual({
      share: 0.1,
      profession: "ritualist",
    });
    drop(sim);
    const x = get(sim, "x").combatant;
    expect(x.health).toBeLessThan(500);
    expect(x.health).toBeGreaterThanOrEqual(500 - 71);
    expect(get(sim, "z").combatant.health).toBe(500);
  });

  it("Destructive Was Glaive: held 54 s; the drop strikes foes in the area", () => {
    const sim = cast("ritualist.destructive-was-glaive");
    expect(held(sim, "destructive-was-glaive")).toBeGreaterThan(51);
    expect(held(sim, "destructive-was-glaive")).toBeLessThanOrEqual(54);
    drop(sim);
    expect(get(sim, "x").combatant.health).toBeLessThan(500);
    expect(get(sim, "z").combatant.health).toBe(500);
  });

  it("Tranquil Was Tanasen: +22 armor and uninterruptible held, for 17 s", () => {
    const sim = cast("ritualist.tranquil-was-tanasen");
    expect(held(sim, "tranquil-was-tanasen")).toBeGreaterThan(14);
    expect(held(sim, "tranquil-was-tanasen")).toBeLessThanOrEqual(17);
    expect(getStatusDefinition("tranquil-was-tanasen")).toMatchObject({
      armorModifier: 22,
      uninterruptible: true,
    });
  });

  it("Vengeful Was Khanhei: each foe's hit on the holder steals 38 from that foe", () => {
    const sim = cast("ritualist.vengeful-was-khanhei");
    const r = get(sim, "r").combatant;
    const x = get(sim, "x").combatant;
    r.health = 100;
    expect(applyIntent(sim, "x", { kind: "attack", targetId: "r" })).toBeNull();
    stepFor(sim, 3);
    const struck = x.health < 500;
    expect(struck).toBe(true);
    expect((500 - x.health) % 38).toBe(0);
    expect(get(sim, "z").combatant.health).toBe(500);
  });

  it("Pure Was Li Ming: conditions run 42% faster held; the drop cleanses 3 from allies in earshot", () => {
    const sim = cast("ritualist.pure-was-li-ming");
    const r = get(sim, "r").combatant;
    r.statuses.apply("bleeding", 10, "x", NO_RANKS);
    stepFor(sim, 1);
    expect(r.statuses.get("bleeding")?.remainingSeconds).toBeCloseTo(8.58, 1);
    r.statuses.apply("poison", 10, "x", NO_RANKS);
    r.statuses.apply("weakness", 10, "x", NO_RANKS);
    r.statuses.apply("crippled", 10, "x", NO_RANKS);
    drop(sim);
    expect(r.statuses.countByCategory("condition")).toBe(1);
  });
});
