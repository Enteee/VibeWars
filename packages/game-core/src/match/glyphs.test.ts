import { describe, expect, it } from "vitest";

import { defaultBuildEquipment, validatePlayerBuild, type PlayerBuild } from "../build.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { energyCostOf, payCost } from "../skills/activation.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { EXCLUSIVE_CATEGORIES, getStatusDefinition } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const GLYPH = "elementalist.glyph-of-lesser-energy";
const FIREBALL = "elementalist.fireball";
const HEALING_SIGNET = "warrior.healing-signet";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

/** An elementalist with the glyph, Fireball and a signet, facing a dummy in range. */
function elementalist(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [GLYPH, FIREBALL, HEALING_SIGNET],
    attributeRanks: new Map([
      ["elementalist.energy-storage", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(60),
    spawn,
    facing: 0,
  };
}

/** A sturdy foe that does nothing. */
function dummy(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn,
    facing: Math.PI,
  };
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** A match with the glyph already cast, the dummy targeted, energy full. */
function glyphed(): MatchSimulation {
  const match = new MatchSimulation({
    seed: "glyph",
    participants: [elementalist("e", vec2(0, 0)), dummy("d", vec2(300, 0))],
  });
  expect(match.requestSkill("e", 0)?.check).toEqual({ ok: true });
  // The 1 s cast, then its aftercast.
  stepFor(match, 2);
  match.setTarget("e", "d");
  return match;
}

describe("Glyph of Lesser Energy (#526)", () => {
  it("is a 1 s cast for 5 energy that holds the next 2 spells for 15 s", () => {
    const match = glyphed();
    const caster = get(match, "e").combatant;
    expect(caster.energy).toBe(caster.maxEnergy - 5);
    expect(caster.statuses.get("glyph-of-lesser-energy")).toMatchObject({ spellsLeft: 2 });
    expect(caster.statuses.get("glyph-of-lesser-energy")?.remainingSeconds).toBeCloseTo(14, 6);
  });

  it("the next 2 spells cost 16 less; the third pays in full", () => {
    const match = glyphed();
    const caster = get(match, "e").combatant;
    const fireball = skill(FIREBALL).cost?.amount ?? 0;
    for (const _ of [1, 2]) {
      const before = caster.energy;
      expect(match.requestSkill("e", 1)?.check).toEqual({ ok: true });
      // Fireball costs 10: 16 less is 0, never a refund.
      expect(caster.energy).toBe(before);
      // Past Fireball's cast and 7 s recharge, inside the glyph's 15 s.
      stepFor(match, 8.5);
    }
    expect(caster.statuses.has("glyph-of-lesser-energy")).toBe(false);
    const before = caster.energy;
    expect(match.requestSkill("e", 1)?.check).toEqual({ ok: true });
    expect(caster.energy).toBe(before - fireball);
  });

  it("a costlier spell costs 16 less, for the check and the payment both", () => {
    const caster = makeCombatant({ id: "e" });
    const dear: Skill = { ...skill(FIREBALL), cost: { kind: "energy", amount: 25 } };
    expect(energyCostOf(dear, caster)).toBe(25);
    caster.statuses.apply("glyph-of-lesser-energy", 15, "e");
    expect(energyCostOf(dear, caster)).toBe(9);
    // A glyph is no spell: it does not cheapen itself, nor a signet.
    expect(energyCostOf(skill(GLYPH), caster)).toBe(5);
  });

  it("shows on the bar what the payment takes, glyph and all (#637)", () => {
    const caster = makeCombatant({ id: "e" });
    const dear: Skill = { ...skill(FIREBALL), cost: { kind: "energy", amount: 25 } };
    caster.statuses.apply("glyph-of-lesser-energy", 15, "e");
    const shown = energyCostOf(dear, caster);
    const before = caster.energy;
    payCost(dear, caster);
    expect(before - caster.energy).toBe(shown);
    expect(shown).toBe(9);
  });

  it("lets a spell go off that the caster could not otherwise afford", () => {
    const match = glyphed();
    const caster = get(match, "e").combatant;
    caster.energy = 3;
    expect(match.requestSkill("e", 1)?.check).toEqual({ ok: true });
    expect(caster.energy).toBe(3);
  });

  it("a spell interrupted or cancelled once begun has used its charge", () => {
    const match = glyphed();
    const caster = get(match, "e").combatant;
    expect(match.requestSkill("e", 1)?.check).toEqual({ ok: true });
    expect(caster.cast.isCasting).toBe(true);
    match.cancelAction("e");
    expect(caster.cast.isCasting).toBe(false);
    expect(caster.statuses.get("glyph-of-lesser-energy")?.spellsLeft).toBe(1);
  });

  it("the spell that uses the last charge logs the glyph's end", () => {
    const match = glyphed();
    get(match, "e").combatant.statuses.countSpellStarted();
    match.requestSkill("e", 1);
    const log = stepFor(match, DT);
    expect(log).toContainEqual(
      expect.objectContaining({
        cause: "skill",
        sourceId: "e",
        skillId: FIREBALL,
        events: [{ kind: "status-expired", targetId: "e", statusId: "glyph-of-lesser-energy" }],
      }),
    );
  });

  it("a signet does not use it, nor a spell refused before it starts", () => {
    const match = glyphed();
    const caster = get(match, "e").combatant;
    expect(match.requestSkill("e", 2)?.check).toEqual({ ok: true });
    stepFor(match, 3);
    expect(caster.statuses.get("glyph-of-lesser-energy")?.spellsLeft).toBe(2);
    expect(match.requestSkill("e", 1)?.check).toEqual({ ok: true });
    stepFor(match, 2);
    expect(match.requestSkill("e", 1)?.check).toEqual({ ok: false, reason: "still-recharging" });
    expect(caster.statuses.get("glyph-of-lesser-energy")?.spellsLeft).toBe(1);
  });

  it("a spell queued behind an aftercast uses it when it starts, not when pressed", () => {
    const match = new MatchSimulation({
      seed: "glyph",
      participants: [elementalist("e", vec2(0, 0)), dummy("d", vec2(300, 0))],
    });
    const caster = get(match, "e").combatant;
    match.requestSkill("e", 0);
    stepFor(match, 1);
    expect(caster.cast.inAftercast).toBe(true);
    match.setTarget("e", "d");
    expect(match.requestSkill("e", 1)).toMatchObject({ check: { ok: true }, queued: true });
    expect(caster.statuses.get("glyph-of-lesser-energy")?.spellsLeft).toBe(2);
    stepFor(match, 1);
    expect(caster.cast.activeCast?.skillId).toBe(FIREBALL);
    expect(caster.statuses.get("glyph-of-lesser-energy")?.spellsLeft).toBe(1);
  });

  it("a second glyph ends the first and starts afresh", () => {
    const caster = makeCombatant({ id: "e" });
    caster.statuses.apply("glyph-of-lesser-energy", 15, "e");
    caster.statuses.countSpellStarted();
    caster.statuses.apply("glyph-of-lesser-energy", 15, "e");
    expect(caster.statuses.get("glyph-of-lesser-energy")).toMatchObject({
      remainingSeconds: 15,
      spellsLeft: 2,
    });
  });

  it("is a glyph: one at a time, and its tooltip says what it does", () => {
    expect(getStatusDefinition("glyph-of-lesser-energy").category).toBe("glyph");
    expect(EXCLUSIVE_CATEGORIES.has("glyph")).toBe(true);
    const described = describeSkill(skill(GLYPH));
    expect(described.typeText).toBe("Glyph.");
    expect(described.effects.map((effect) => effect.text)).toEqual([
      "For 15s, your next 2 spells cost 16 less energy",
    ]);
  });

  it("an elementalist with the glyph is a legal build", () => {
    const build: PlayerBuild = {
      name: "Glyph",
      primaryProfession: "elementalist",
      secondaryProfession: undefined,
      attributes: [],
      skillBar: [GLYPH, null, null, null, null, null, null, null],
      equipment: defaultBuildEquipment("elementalist"),
    };
    expect(validatePlayerBuild(build, RULES.attributes)).toEqual([]);
  });
});
