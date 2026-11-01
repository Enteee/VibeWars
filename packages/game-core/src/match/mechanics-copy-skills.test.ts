import { describe, expect, it } from "vitest";

import { RANGE_SPIRIT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { copyKey, slotSkill } from "../skills/cast-state.js";
import { describeSkill } from "../skills/describe.js";
import { getSkill } from "../skills/catalog.js";
import { aggregateModifiers } from "../skills/status.js";
import type { Aura } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Take what another has (#1965): Arcane Mimicry borrows an ally's elite,
 * Mirrored Stance copies a foe's stances, Signet of Binding takes a foe's
 * spirit. Each cast by `m` at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const MIMICRY = "mesmer.arcane-mimicry";
const MIRRORED = "assassin.mirrored-stance";
const BINDING = "ritualist.signet-of-binding";
const AVATAR = "dervish.avatar-of-melandru";
const WORD = "monk.word-of-healing";
const SHADOW_WALK = "assassin.shadow-walk";
const DARK_ESCAPE = "assassin.dark-escape";
const SHADOW_OF_HASTE = "assassin.shadow-of-haste";
const RECUPERATION: Aura = { statusId: "recuperation", affects: "allies", radius: RANGE_SPIRIT };

function spec(id: string, team: number, spawn: Vec2, skillBar: readonly string[]): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([
      ["assassin.shadow-arts", 12],
      ["ritualist.spawning-power", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 2000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** A spirit of `ownerId`'s already standing, with Recuperation's aura, as `#summon` would make it. */
function spirit(
  id: string,
  ownerId: string | undefined,
  team: number,
  spawn: Vec2,
): ParticipantSpec {
  return {
    ...spec(id, team, spawn, []),
    attributeRanks: new Map(),
    maxHealth: 300,
    creature: {
      ownerId,
      kind: "spirit",
      look: "spirit",
      name: id,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: RECUPERATION,
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

/** `m` on team 0 at the origin, its ally `a` with `allyBar`, the foes `f` and `g`, and `more`. */
function match(
  more: readonly ParticipantSpec[] = [],
  allyBar: readonly string[] = [AVATAR, WORD],
): MatchSimulation {
  return new MatchSimulation({
    seed: "copy-skills",
    participants: [
      spec("m", 0, vec2(0, 0), [MIMICRY, MIRRORED, BINDING]),
      spec("a", 0, vec2(0, 40), allyBar),
      spec("f", 1, vec2(200, 0), [SHADOW_WALK, DARK_ESCAPE, SHADOW_OF_HASTE]),
      spec("g", 1, vec2(200, 60), [DARK_ESCAPE]),
      ...more,
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

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
  }
}

/** `id` uses `skillId` on `targetId`, which is allowed, and its cast and aftercast run out. */
function use(sim: MatchSimulation, id: string, skillId: string, targetId: string): void {
  sim.setTarget(id, targetId);
  const slot = get(sim, id).skillBar.indexOf(skillId);
  expect(sim.requestSkill(id, slot)?.check).toEqual({ ok: true });
  stepFor(sim, 2.5);
}

/** What `m`'s `slot` holds now. */
function held(sim: MatchSimulation, slot: number) {
  const { combatant } = get(sim, "m");
  return slotSkill(combatant.skillBar, combatant.cast, slot);
}

describe("Arcane Mimicry (#1965)", () => {
  it("holds the ally's first non-form elite for 20 s, then is back on its 60 s recharge", () => {
    const sim = match();
    use(sim, "m", MIMICRY, "a");
    expect(held(sim, 0)).toEqual({ skillId: WORD, key: copyKey(WORD, 0) });

    // The copy began as the 2 s cast ended, 2 s into `use`: 19.5 s are left.
    stepFor(sim, 19.4);
    expect(held(sim, 0)?.skillId).toBe(WORD);
    stepFor(sim, 0.2);
    expect(held(sim, 0)).toEqual({ skillId: MIMICRY, key: MIMICRY });
    expect(get(sim, "m").combatant.cast.rechargeRemaining.get(MIMICRY)).toBeCloseTo(60 - 0.1, 0);
  });

  it("copies nothing from an ally whose only elite is a form, and recharges", () => {
    const sim = match([], [AVATAR]);
    use(sim, "m", MIMICRY, "a");
    expect(held(sim, 0)).toEqual({ skillId: MIMICRY, key: MIMICRY });
    expect(get(sim, "m").combatant.cast.rechargeRemaining.get(MIMICRY)).toBeGreaterThan(55);
  });

  it("cannot be cast on its caster", () => {
    const sim = match();
    sim.setTarget("m", "m");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: false, reason: "invalid-target-self" });
  });
});

describe("Mirrored Stance (#1965)", () => {
  it("puts the hexed foe's stance on its caster, the foe's duration, and nothing else", () => {
    const sim = match();
    use(sim, "m", MIRRORED, "f");
    expect(get(sim, "f").combatant.statuses.has("mirrored-stance")).toBe(true);
    const at = get(sim, "m").position;

    // Shadow Walk Shadow Steps its user and disables its skills: only its stance is copied.
    use(sim, "f", SHADOW_WALK, "m");
    expect(get(sim, "f").combatant.statuses.has("shadow-walk")).toBe(true);
    const copy = get(sim, "m").combatant.statuses.get("shadow-walk");
    expect(copy?.remainingSeconds).toBeCloseTo(15 - 2.5, 0);
    expect(copy?.sourceId).toBe("m");
    expect(get(sim, "m").position).toEqual(at);
    expect(get(sim, "m").combatant.cast.rechargeRemaining.has(BINDING)).toBe(false);
  });

  it("a copied Shadow of Haste returns its caster where it stood, and leaves the foe alone", () => {
    const sim = match();
    use(sim, "m", MIRRORED, "f");
    const mAt = get(sim, "m").position;
    use(sim, "f", SHADOW_OF_HASTE, "f");
    const fAt = get(sim, "f").position;
    expect(get(sim, "m").combatant.statuses.get("shadow-of-haste")?.returnPoint).toEqual(mAt);

    sim.setInputDirection("m", vec2(0, -1));
    sim.setInputDirection("f", vec2(0, 1));
    stepFor(sim, 2);
    sim.setInputDirection("m", vec2(0, 0));
    sim.setInputDirection("f", vec2(0, 0));
    expect(get(sim, "m").position).not.toEqual(mAt);
    stepFor(sim, 32);
    expect(get(sim, "m").combatant.statuses.has("shadow-of-haste")).toBe(false);
    expect(get(sim, "m").position).toEqual(mAt);
    expect(get(sim, "f").position).toEqual(fAt);
  });

  it("copies the stance at the foe's ranks, not its caster's (#1976)", () => {
    const sim = match([
      {
        ...spec("w", 1, vec2(200, -60), ["warrior.frenzy"]),
        attributeRanks: new Map([["warrior.strength", 12]]),
      },
    ]);
    use(sim, "m", MIRRORED, "w");
    use(sim, "w", "warrior.frenzy", "w");
    const mirrored = get(sim, "m").combatant;
    expect(mirrored.statuses.has("frenzy")).toBe(true);
    // 160% at the foe's Strength 12; the Assassin's 0 would be 200%.
    expect(aggregateModifiers(mirrored.statuses.active).damageTakenMultiplier).toBeCloseTo(1.6, 10);
    expect(mirrored.statuses.get("frenzy")?.sourceId).toBe("m");
  });

  it("a second hexed foe's stance replaces the first", () => {
    const sim = match();
    use(sim, "m", MIRRORED, "f");
    get(sim, "m").combatant.cast.endRecharge(MIRRORED);
    use(sim, "m", MIRRORED, "g");
    use(sim, "f", SHADOW_WALK, "m");
    expect(get(sim, "m").combatant.statuses.has("shadow-walk")).toBe(true);
    use(sim, "g", DARK_ESCAPE, "g");
    expect(get(sim, "m").combatant.statuses.has("dark-escape")).toBe(true);
    expect(get(sim, "m").combatant.statuses.has("shadow-walk")).toBe(false);
  });

  it("says so in its tooltip", () => {
    const skill = getSkill(MIRRORED);
    expect(skill).toBeDefined();
    if (skill !== undefined) {
      const { effects } = describeSkill(skill, new Map([["assassin.shadow-arts", 12]]));
      expect(effects.map(({ text }) => text).join("\n")).toMatch(/you enter the same stance/i);
    }
  });
});

describe("Signet of Binding (#1965)", () => {
  it("costs 80 Health and takes the foe's spirit, whose aura reaches its new side next step", () => {
    const sim = match([spirit("s", "f", 1, vec2(60, 0))]);
    stepFor(sim, 0.2);
    expect(get(sim, "m").combatant.statuses.has("recuperation")).toBe(false);

    use(sim, "m", BINDING, "s");
    const s = get(sim, "s");
    expect(s.combatant.team).toBe(0);
    expect(s.creature?.ownerId).toBe("m");
    expect(s.combatant.health).toBe(300);
    expect(get(sim, "m").combatant.statuses.has("recuperation")).toBe(true);
    expect(get(sim, "f").combatant.statuses.has("recuperation")).toBe(false);
  });

  it("kills a caster with 80 Health or less, and takes nothing", () => {
    const sim = match([spirit("s", "f", 1, vec2(60, 0))]);
    get(sim, "m").combatant.health = 80;
    sim.setTarget("m", "s");
    expect(sim.requestSkill("m", 2)?.check).toEqual({ ok: true });
    stepFor(sim, 2.5);
    expect(get(sim, "m").combatant.dead).toBe(true);
    expect(get(sim, "s").combatant.team).toBe(1);
    expect(get(sim, "s").creature?.ownerId).toBe("f");
  });

  it("refuses a map's spirit and an allied one", () => {
    const sim = match([spirit("n", undefined, 1, vec2(60, 0)), spirit("o", "a", 0, vec2(0, 60))]);
    for (const id of ["n", "o"]) {
      sim.setTarget("m", id);
      expect(sim.requestSkill("m", 2)?.check).toEqual({
        ok: false,
        reason: "invalid-target-not-enemy-spirit",
      });
    }
  });

  it("does nothing, and costs nothing, on a spirit gone as it activates", () => {
    const sim = match([spirit("s", "f", 1, vec2(60, 0))]);
    sim.setTarget("m", "s");
    expect(sim.requestSkill("m", 2)?.check).toEqual({ ok: true });
    stepFor(sim, 1);
    sim.remove("s");
    stepFor(sim, 1.5);
    // Its own 2000 less nothing: no Health regeneration at full Health.
    expect(get(sim, "m").combatant.health).toBe(2000);
  });

  it("leaves with its new owner", () => {
    const sim = match([spirit("s", "f", 1, vec2(60, 0))]);
    use(sim, "m", BINDING, "s");
    sim.remove("f");
    stepFor(sim, 0.1);
    expect(sim.get("s")).toBeDefined();
    sim.remove("m");
    stepFor(sim, 0.1);
    expect(sim.get("s")).toBeUndefined();
  });
});
