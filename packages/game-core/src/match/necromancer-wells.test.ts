import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { Skill } from "../skills/types.js";
import { attackMissChanceOf } from "../skills/tick.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Wells 2 (#1732): Well of the Profane, Silence, Darkness and Ruin, each
 * a corpse well as Well of Suffering is, each projecting its status on
 * the foes inside it.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const PROFANE = "necromancer.well-of-the-profane";
const SILENCE = "necromancer.well-of-silence";
const DARKNESS = "necromancer.well-of-darkness";
const RUIN = "necromancer.well-of-ruin";
const DEATH = "necromancer.death-magic";
const CURSES = "necromancer.curses";
const GUARDIAN = "monk.guardian";
const AEGIS = "monk.aegis";
const OBSIDIAN_FLESH = "elementalist.obsidian-flesh";
const NEVER_SURRENDER = "paragon.never-surrender";
const ANTHEM_OF_FLAME = "paragon.anthem-of-flame";
const FLARE = "elementalist.flare";

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[],
  equipment: ResolvedEquipment = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([
      [DEATH, 12],
      [CURSES, 12],
    ]),
    equipment,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

function sword(): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS.sword,
      attributeId: "warrior.swordsmanship",
      damageType: WEAPONS.sword.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** Where the well sits: `x`'s corpse. */
const WELL_AT = vec2(100, 0);
/** Outside the well, within earshot of it. */
const OUTSIDE = vec2(100, 300);

/**
 * `n`, the team-0 Necromancer with the four wells, at the origin; `x`, a
 * foe whose corpse the wells exploit; `f` and `g`, foes inside the well
 * once it stands; `h`, their ally outside it; `w`, a team-0 swordsman and
 * `e`, a team-0 Elementalist with Flare.
 */
function match(): MatchSimulation {
  const foeBar = [GUARDIAN, AEGIS, OBSIDIAN_FLESH, NEVER_SURRENDER, ANTHEM_OF_FLAME];
  const sim = new MatchSimulation({
    seed: "necromancer-wells",
    participants: [
      spec("n", 0, vec2(0, 0), [PROFANE, SILENCE, DARKNESS, RUIN]),
      spec("w", 0, vec2(100, 60), [], sword()),
      spec("e", 0, vec2(0, 60), [FLARE]),
      spec("x", 1, WELL_AT, []),
      spec("f", 1, vec2(100, 25), foeBar),
      spec("g", 1, vec2(100, -25), foeBar),
      spec("h", 1, OUTSIDE, foeBar),
    ],
  });
  const x = get(sim, "x");
  x.combatant.statuses.apply("burning", 10, "n", NO_RANKS);
  x.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(x.combatant.dead).toBe(true);
  return sim;
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
  }
}

/** `n` casts the well in `slot` through to the end. */
function well(sim: MatchSimulation, slot: number): void {
  expect(sim.requestSkill("n", slot)?.check).toEqual({ ok: true });
  const activation = skill([PROFANE, SILENCE, DARKNESS, RUIN][slot] ?? "").activationSeconds;
  stepFor(sim, activation + RULES.combat.aftercastSeconds + 2 * DT);
  expect(sim.groundEffects).toHaveLength(1);
}

describe("the four wells (#1732)", () => {
  it.each([
    [PROFANE, 94, DEATH, 25, 3, 10, 17.6],
    [SILENCE, 1660, CURSES, 10, 1, 20, 26],
    [DARKNESS, 1366, CURSES, 10, 1, 20, 41],
    [RUIN, 2236, CURSES, 10, 1, 20, 25],
  ])("%s is the corpus's", (id, gwId, attributeId, energy, activation, recharge, lasts) => {
    expect(getSkill(id)).toMatchObject({
      gwId,
      type: "well",
      attributeId,
      cost: { kind: "energy", amount: energy },
      activationSeconds: activation,
      rechargeSeconds: recharge,
      target: "self",
      corpse: { radius: expect.any(Number), elseSacrificePercent: 66 },
    });
    const sim = match();
    well(sim, [PROFANE, SILENCE, DARKNESS, RUIN].indexOf(id));
    expect(sim.groundEffects[0]?.position).toEqual(WELL_AT);
    // It stood since its activation ended, under a second ago.
    expect(sim.groundEffects[0]?.remainingSeconds).toBeLessThan(lasts);
    expect(sim.groundEffects[0]?.remainingSeconds).toBeGreaterThan(lasts - 1);
  });

  it("names what each does in its text", () => {
    const texts = [PROFANE, SILENCE, DARKNESS, RUIN].map((id) =>
      describeSkill(skill(id), new Map([[skill(id).attributeId ?? "", 12]])).effects.map(
        ({ text }) => text,
      ),
    );
    expect(texts).toEqual([
      [
        "Exploits the nearest corpse, or sacrifices 66% Health if none is near",
        "Creates a well at its location for 18 seconds",
        "Non-spirit foes in the area: stripped of all enchantments, and cannot be enchanted",
      ],
      [
        "Exploits the nearest corpse, or sacrifices 66% Health if none is near",
        "Creates a well at its location for 26 seconds",
        "Non-spirit foes in the area: −3 Health degeneration, cannot use shouts or chants",
      ],
      [
        "Exploits the nearest corpse, or sacrifices 66% Health if none is near",
        "Creates a well at its location for 41 seconds",
        "Non-spirit foes in the area: while under a hex: 50% of attacks miss",
      ],
      [
        "Exploits the nearest corpse, or sacrifices 66% Health if none is near",
        "Creates a well at its location for 25 seconds",
        "Non-spirit foes in the area: whenever it takes physical damage: applies Cracked Armor for 17s (−20 armor (not below 60))",
      ],
    ]);
  });
});

describe("Well of the Profane (#1732)", () => {
  it("strips every enchantment on a foe inside it, maintained ones included, their end triggers answering", () => {
    const sim = match();
    const f = get(sim, "f").combatant;
    f.statuses.apply("shielding-hands", 8, "g", NO_RANKS);
    f.statuses.apply("suffering", 10, "n", NO_RANKS);
    f.statuses.maintain("holy-veil", "g", 0, NO_RANKS);
    f.health = 100;
    well(sim, 0);
    expect(f.statuses.has("well-of-the-profane")).toBe(true);
    expect(f.statuses.has("shielding-hands")).toBe(false);
    expect(f.statuses.has("holy-veil")).toBe(false);
    // Holy Veil's end took the hex; Shielding Hands' healed.
    expect(f.statuses.has("suffering")).toBe(false);
    expect(f.health).toBeGreaterThan(100);
  });

  it("keeps an enchantment from landing inside it, and an area one skips who stands there", () => {
    const sim = match();
    well(sim, 0);
    const f = get(sim, "f");
    expect(sim.setTarget("h", "f")).toBe(true);
    // Guardian at a foe inside it: refused, and nothing paid.
    const energy = get(sim, "h").combatant.energy;
    expect(sim.requestSkill("h", 0)?.check).toEqual({
      ok: false,
      reason: "invalid-target-unenchantable",
    });
    expect(get(sim, "h").combatant.energy).toBe(energy);
    // Its bearer's own self-enchantment: refused too.
    expect(sim.requestSkill("f", 2)?.check).toEqual({
      ok: false,
      reason: "invalid-target-unenchantable",
    });
    // Aegis from outside: the caster gets it, the two inside do not.
    expect(sim.requestSkill("h", 1)?.check).toEqual({ ok: true });
    stepFor(sim, skill(AEGIS).activationSeconds + 2 * DT);
    expect(get(sim, "h").combatant.statuses.has("aegis")).toBe(true);
    expect(f.combatant.statuses.has("aegis")).toBe(false);
    expect(get(sim, "g").combatant.statuses.has("aegis")).toBe(false);
  });

  it("lets enchantments land again once its foe walks out, and strips them again walking back in", () => {
    const sim = match();
    well(sim, 0);
    const f = get(sim, "f");
    f.position = vec2(100, 400);
    stepFor(sim, DT);
    expect(f.combatant.statuses.has("well-of-the-profane")).toBe(false);
    expect(sim.setTarget("h", "f")).toBe(true);
    expect(sim.requestSkill("h", 0)?.check).toEqual({ ok: true });
    stepFor(sim, skill(GUARDIAN).activationSeconds + 2 * DT);
    expect(f.combatant.statuses.has("guardian")).toBe(true);
    f.position = vec2(100, 25);
    stepFor(sim, DT);
    expect(f.combatant.statuses.has("guardian")).toBe(false);
  });
});

describe("Well of Silence (#1732)", () => {
  it("refuses a shout and a chant inside it, not a spell, and nothing is paid", () => {
    const sim = match();
    well(sim, 1);
    const f = get(sim, "f").combatant;
    expect(f.statuses.has("well-of-silence")).toBe(true);
    const energy = f.energy;
    expect(sim.requestSkill("f", 3)?.check).toEqual({ ok: false, reason: "cannot-shout-or-chant" });
    expect(sim.requestSkill("f", 4)?.check).toEqual({ ok: false, reason: "cannot-shout-or-chant" });
    expect(f.energy).toBe(energy);
    expect(sim.requestSkill("f", 2)?.check).toEqual({ ok: true });
    // Outside it, its ally shouts.
    expect(sim.requestSkill("h", 3)?.check).toEqual({ ok: true });
  });

  it("refuses a shout mid-cast too, where one would otherwise go off (#1725)", () => {
    const sim = match();
    well(sim, 1);
    expect(sim.requestSkill("f", 2)?.check).toEqual({ ok: true });
    sim.step(DT);
    expect(get(sim, "f").combatant.cast.activeCast).toBeDefined();
    expect(sim.requestSkill("f", 3)?.check).toEqual({ ok: false, reason: "cannot-shout-or-chant" });
    get(sim, "f").position = OUTSIDE;
    sim.step(DT);
    expect(get(sim, "f").combatant.statuses.has("well-of-silence")).toBe(false);
    expect(sim.requestSkill("f", 3)?.check).toEqual({ ok: true });
  });
});

describe("Well of Darkness (#1732)", () => {
  it("makes a foe inside it miss half its attacks only while hexed", () => {
    const sim = match();
    well(sim, 2);
    const f = get(sim, "f").combatant;
    const h = get(sim, "h").combatant;
    expect(f.statuses.has("well-of-darkness")).toBe(true);
    expect(attackMissChanceOf(f)).toBe(0);
    f.statuses.apply("suffering", 10, "n", NO_RANKS);
    h.statuses.apply("suffering", 10, "n", NO_RANKS);
    expect(attackMissChanceOf(f)).toBe(0.5);
    expect(attackMissChanceOf(h)).toBe(0);
    // It joins Blind as miss chances join: the worst counts.
    f.statuses.apply("blind", 5, "n", NO_RANKS);
    expect(attackMissChanceOf(f)).toBe(0.9);
  });
});

describe("Well of Ruin (#1732)", () => {
  it("cracks the armor of a foe inside it on each physical hit, not on an elemental one", () => {
    const sim = match();
    well(sim, 3);
    const f = get(sim, "f").combatant;
    expect(f.statuses.has("well-of-ruin")).toBe(true);
    expect(sim.setTarget("e", "f")).toBe(true);
    expect(sim.requestSkill("e", 0)?.check).toEqual({ ok: true });
    const health = f.health;
    stepFor(sim, 3);
    expect(f.health).toBeLessThan(health);
    expect(f.statuses.has("cracked-armor")).toBe(false);
    expect(sim.requestAttack("w", "f")).toEqual({ ok: true });
    for (let i = 0; i < 5 / DT && !f.statuses.has("cracked-armor"); i += 1) {
      sim.step(DT);
    }
    expect(f.statuses.get("cracked-armor")?.remainingSeconds).toBeGreaterThan(16);
  });
});
