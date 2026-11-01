import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { applySkillEffects } from "./effects.js";
import { NO_RANKS, aggregateModifiers, reducedRecharge, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import { advanceStatuses } from "./tick.js";
import type { Combatant, Skill } from "./types.js";

/**
 * The Ritualist's weapon spells (#975): Spirit Light Weapon heals every
 * second, Weapon of Quickening shortens spell recharges, Weapon of
 * Aggression speeds attacks. There are no spirits or binding rituals yet
 * (#467), so neither clause about them ever applies.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
/** Rank 12 of what Weapon of Aggression and of Quickening last by (#2041). */
const CHANNELING_12 = new Map([["ritualist.channeling-magic", 12]]);
const COMMUNING_12 = new Map([["ritualist.communing", 12]]);
const WEAPON_SPELLS: readonly StatusId[] = [
  "spirit-light-weapon",
  "weapon-of-quickening",
  "weapon-of-aggression",
];

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** An ally well below its maximum, so no heal is cut short. */
function ally(): Combatant {
  return makeCombatant({ id: "ally", maxHealth: 500, health: 100 });
}

/** `user` pays for `skillId` and it lands on `target`. */
function use(user: Combatant, skillId: string, target: Combatant): void {
  payCost(skill(skillId), user);
  applySkillEffects({
    surroundings: new Map(),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES,
  });
}

/** `combatant`'s statuses ticked for `seconds`, one 20 Hz tick at a time. */
function tickFor(combatant: Combatant, seconds: number): void {
  for (let t = 0; t < Math.round(seconds / DT); t += 1) {
    advanceStatuses(combatant, DT, 0);
  }
}

describe("Spirit Light Weapon (#975)", () => {
  it("lasts 10 s, and is an elite weapon spell on an ally", () => {
    const caster = makeCombatant({ id: "caster", energy: 30 });
    const target = ally();
    use(caster, "ritualist.spirit-light-weapon", target);
    expect(target.statuses.get("spirit-light-weapon")?.remainingSeconds).toBe(10);
    expect(skill("ritualist.spirit-light-weapon")).toMatchObject({
      type: "weapon-spell",
      elite: true,
      flash: false,
      disabledAfterUseSeconds: undefined,
      target: "single-ally",
    });
  });

  it("heals 21 a second, 210 over its 10 s, and then stops", () => {
    const target = ally();
    target.statuses.apply("spirit-light-weapon", 10, "rt", NO_RANKS);
    tickFor(target, 1);
    expect(target.health).toBeCloseTo(121, 9);

    tickFor(target, 9 + DT);
    expect(target.statuses.has("spirit-light-weapon")).toBe(false);
    const healed = target.health;
    expect(healed).toBeCloseTo(310, 6);
    tickFor(target, 1);
    expect(target.health).toBe(healed);
  });

  it("is a heal: Deep Wound scales it, Bleeding nets against it in one event a tick", () => {
    const wounded = ally();
    wounded.statuses.apply("spirit-light-weapon", 10, "rt", NO_RANKS);
    wounded.statuses.apply("deep-wound", 10, "foe", NO_RANKS);
    advanceStatuses(wounded, 1, 0);
    expect(wounded.health).toBeCloseTo(100 + 21 * 0.8, 9);

    const bled = ally();
    bled.statuses.apply("spirit-light-weapon", 10, "rt", NO_RANKS);
    bled.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    const events = advanceStatuses(bled, DT, 0);
    expect(events.filter((e) => e.kind === "heal" || e.kind === "damage")).toEqual([
      { kind: "heal", targetId: "ally", amount: expect.closeTo(15 * DT, 9) as number },
    ]);
  });

  it("heals nothing, and says nothing, on an ally at full health", () => {
    const full = makeCombatant({ id: "full", maxHealth: 500, health: 500 });
    full.statuses.apply("spirit-light-weapon", 10, "rt", NO_RANKS);
    expect(advanceStatuses(full, DT, 0).filter((e) => e.kind === "heal")).toEqual([]);
    expect(full.health).toBe(500);
  });
});

describe("one weapon spell at a time (#975)", () => {
  it.each(WEAPON_SPELLS)("%s replaces Weapon of Warding, and Warding replaces it", (id) => {
    const bearer = ally();
    bearer.statuses.apply("weapon-of-warding", 7, "rt", NO_RANKS);
    bearer.statuses.apply(id, 10, "rt", NO_RANKS);
    expect(bearer.statuses.active.map((s) => s.id)).toEqual([id]);
    bearer.statuses.apply("weapon-of-warding", 7, "rt", NO_RANKS);
    expect(bearer.statuses.active.map((s) => s.id)).toEqual(["weapon-of-warding"]);
  });

  it("a recast restarts it at its full duration", () => {
    const bearer = ally();
    bearer.statuses.apply("spirit-light-weapon", 10, "rt", NO_RANKS);
    tickFor(bearer, 4);
    bearer.statuses.apply("spirit-light-weapon", 10, "rt", NO_RANKS);
    expect(bearer.statuses.get("spirit-light-weapon")?.remainingSeconds).toBe(10);
  });
});

describe("Weapon of Aggression (#975)", () => {
  const multiplier = (...ids: StatusId[]): number =>
    aggregateModifiers(ids.map((id) => ({ id, ranks: NO_RANKS }))).attackDurationMultiplier;

  it("is on yourself only, for 13 s", () => {
    const caster = makeCombatant({ id: "caster", energy: 30, attributeRanks: CHANNELING_12 });
    use(caster, "ritualist.weapon-of-aggression", caster);
    expect(caster.statuses.get("weapon-of-aggression")?.remainingSeconds).toBe(13);
    expect(skill("ritualist.weapon-of-aggression")).toMatchObject({
      type: "weapon-spell",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      target: "self",
    });
  });

  it("attacks 25% faster; only the strongest speed-up counts, times a slow-down", () => {
    expect(multiplier("weapon-of-aggression")).toBe(0.75);
    expect(multiplier("weapon-of-aggression", "frenzy")).toBe(0.67);
    expect(multiplier("weapon-of-aggression", "faintheartedness")).toBeCloseTo(0.75 * 1.5, 9);
  });

  it("does not end when its bearer attacks", () => {
    const bearer = ally();
    bearer.statuses.apply("weapon-of-aggression", 13, "bearer", NO_RANKS);
    bearer.statuses.endOnBearerAttack("melee");
    expect(bearer.statuses.has("weapon-of-aggression")).toBe(true);
  });
});

describe("Weapon of Quickening (#975)", () => {
  const QUICKENING = 0;
  const MEND = 1;
  const MANTRA = 2;

  function match(): MatchSimulation {
    const spec: ParticipantSpec = {
      id: "rt",
      team: 0,
      skillBar: [
        "ritualist.weapon-of-quickening",
        "ritualist.mend-body-and-soul",
        "mesmer.mantra-of-recovery",
      ],
      attributeRanks: new Map(),
      equipment: unarmedResolvedEquipment(RULES.armorReferenceLevel),
      spawn: vec2(0, 0),
      facing: 0,
    };
    return new MatchSimulation({ seed: "quickening", participants: [spec] });
  }

  /** The ritualist uses each slot on itself in turn, each to its end. */
  function recharges(...slots: number[]): Map<string, number> {
    const sim = match();
    const bar = sim.get("rt")?.combatant.skillBar ?? [];
    const cast = () => sim.get("rt")?.combatant.cast;
    for (const slot of slots) {
      const skillId = bar[slot] ?? "";
      expect(sim.requestSkill("rt", slot)?.check).toEqual({ ok: true });
      for (let i = 0; i < 40 && cast()?.rechargeTotal.has(skillId) !== true; i += 1) {
        sim.step(DT);
      }
    }
    return new Map(cast()?.rechargeTotal);
  }

  it("lasts 21 s, and is an elite Communing weapon spell", () => {
    const caster = makeCombatant({ id: "caster", energy: 30, attributeRanks: COMMUNING_12 });
    const target = ally();
    use(caster, "ritualist.weapon-of-quickening", target);
    expect(target.statuses.get("weapon-of-quickening")?.remainingSeconds).toBe(21);
    expect(skill("ritualist.weapon-of-quickening")).toMatchObject({
      type: "weapon-spell",
      elite: true,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: "ritualist.communing",
    });
  });

  it("lasts 4% longer a rank of its caster's Spawning Power: 21 × 1.48 s at 12 (#1098)", () => {
    const caster = makeCombatant({
      id: "caster",
      energy: 60,
      attributeRanks: new Map([
        ["ritualist.spawning-power", 12],
        ["ritualist.communing", 12],
      ]),
    });
    const target = ally();
    use(caster, "ritualist.weapon-of-quickening", target);
    expect(target.statuses.get("weapon-of-quickening")?.remainingSeconds).toBeCloseTo(21 * 1.48, 9);
    // A status that is no weapon spell, from the same caster, stands.
    use(caster, "ranger.troll-unguent", target);
    expect(target.statuses.get("regeneration")?.remainingSeconds).toBe(13);
  });

  it("a spell finished under it recharges 33% faster, one finished before it does not", () => {
    expect(recharges(MEND).get("ritualist.mend-body-and-soul")).toBe(3);
    expect(recharges(QUICKENING, MEND).get("ritualist.mend-body-and-soul")).toBeCloseTo(
      3 * 0.67,
      9,
    );
    expect(recharges(MEND, QUICKENING).get("ritualist.mend-body-and-soul")).toBe(3);
  });

  it("cast on yourself, it shortens its own recharge: it lands before the recharge starts", () => {
    expect(recharges(QUICKENING).get("ritualist.weapon-of-quickening")).toBeCloseTo(5 * 0.67, 9);
  });

  it("with Mantra of Recovery, a spell recharges in half its time, no less", () => {
    expect(recharges(MANTRA, QUICKENING, MEND).get("ritualist.mend-body-and-soul")).toBeCloseTo(
      1.5,
      9,
    );
  });

  it("never takes a recharge below 1 s, nor raises one already under it", () => {
    expect(reducedRecharge(20, 0.5)).toBe(10);
    expect(reducedRecharge(1.25, 0.33)).toBe(1);
    expect(reducedRecharge(0.75, 0.33)).toBe(0.75);
    expect(reducedRecharge(0.75, 0)).toBe(0.75);
  });
});
