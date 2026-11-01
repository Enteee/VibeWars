import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { applyIntent } from "./apply-intent.js";
import { flagId, type FlagField } from "./flags.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Item spells (#1434): a Ritualist's ashes fill the hands as a flag does,
 * without its slowness, and drop, their drop effect firing where the
 * holder is, on expiry, death, the Drop button, another item spell, a
 * shadow step (before it moves) and taking up a flag.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SPEED = RULES.movement.maxSpeedUnitsPerSecond;
const BLIND_WAS = "ritualist.blind-was-mingson";
const SWIFT_CHOP = "warrior.swift-chop";
const FIREBALL = "elementalist.fireball";
const DEATHS_CHARGE = "assassin.deaths-charge";
/** Blind Was Mingson's ashes. */
const ASHES = "blind-was-mingson";

const FIELD: FlagField = {
  stand: vec2(1000, 300),
  spawns: [
    { team: 0, position: vec2(300, 300) },
    { team: 1, position: vec2(1700, 300) },
  ],
};

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    spawn,
    facing: 0,
  };
}

/**
 * A Ritualist "r" with an axe, an item spell, an attack skill, a spell and
 * a shadow step; a foe "x" near it, and a foe "y" at a shadow step's reach.
 */
function match(): MatchSimulation {
  const r: ParticipantSpec = {
    ...spec("r", 0, vec2(200, 300)),
    skillBar: [BLIND_WAS, SWIFT_CHOP, FIREBALL, DEATHS_CHARGE],
    attributeRanks: new Map([
      ["ritualist.restoration-magic", 12],
      ["warrior.axe-mastery", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: {
      ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      mainHand: {
        weapon: WEAPONS.axe,
        attributeId: "warrior.axe-mastery",
        damageType: WEAPONS.axe.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    maxEnergy: 100,
    maxHealth: 500,
  };
  return new MatchSimulation({
    seed: "item-spells",
    bounds: { width: 2000, height: 600 },
    flagField: FIELD,
    participants: [r, spec("x", 1, vec2(250, 300)), spec("y", 1, vec2(200, 600 - 50))],
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

/** "r" uses the skill in `slot` on `targetId`, and finishes it. */
function use(sim: MatchSimulation, slot: number, targetId = "r"): void {
  applyIntent(sim, "r", { kind: "target", targetSessionId: targetId });
  expect(applyIntent(sim, "r", { kind: "use-skill", slot })).toBeNull();
  stepFor(sim, 2);
}

function blinded(sim: MatchSimulation, id: string): boolean {
  return get(sim, id).combatant.statuses.get("blind") !== undefined;
}

function holds(sim: MatchSimulation): boolean {
  return get(sim, "r").combatant.statuses.get(ASHES) !== undefined;
}

describe("holding ashes (#1434)", () => {
  it("fills the hands: no swing and no attack skill, but a spell casts", () => {
    const sim = match();
    use(sim, 0);
    expect(holds(sim)).toBe(true);
    expect(sim.carriesBundle("r")).toBe(true);
    expect(applyIntent(sim, "r", { kind: "attack", targetId: "x" })).toEqual({
      kind: "attack",
      reason: "hands-full",
    });
    applyIntent(sim, "r", { kind: "target", targetSessionId: "x" });
    expect(applyIntent(sim, "r", { kind: "use-skill", slot: 1 })).toEqual({
      kind: "skill",
      slot: 1,
      skillId: SWIFT_CHOP,
      reason: "hands-full",
    });
    expect(applyIntent(sim, "r", { kind: "use-skill", slot: 2 })).toBeNull();
    expect(get(sim, "r").combatant.cast.activeCast?.skillId).toBe(FIREBALL);
  });

  it("does not slow the holder, as a flag does", () => {
    const sim = match();
    use(sim, 0);
    const before = get(sim, "r").position;
    applyIntent(sim, "r", { kind: "move", dirX: 0, dirY: -1 });
    stepFor(sim, 1);
    expect(before.y - get(sim, "r").position.y).toBeCloseTo(SPEED, 3);
  });

  it("is untouched by enchantment, hex and condition removal", () => {
    const sim = match();
    use(sim, 0);
    const statuses = get(sim, "r").combatant.statuses;
    for (const category of ["enchantment", "hex", "condition"] as const) {
      statuses.removeByCategory(category);
    }
    expect(holds(sim)).toBe(true);
  });
});

describe("the ashes drop, their drop effect firing (#1434)", () => {
  it("when they run out", () => {
    const sim = match();
    get(sim, "r").combatant.statuses.apply(ASHES, 0.3, "r", NO_RANKS);
    stepFor(sim, 0.5);
    expect(holds(sim)).toBe(false);
    expect(blinded(sim, "x")).toBe(true);
    expect(blinded(sim, "y")).toBe(false);
  });

  it("when the holder dies, round the body", () => {
    const sim = match();
    use(sim, 0);
    const r = get(sim, "r").combatant;
    r.statuses.apply("burning", 10, "x", NO_RANKS);
    r.health = 0.2;
    stepFor(sim, 0.2);
    expect(r.dead).toBe(true);
    expect(blinded(sim, "x")).toBe(true);
  });

  it("on the Drop button, at once", () => {
    const sim = match();
    use(sim, 0);
    expect(applyIntent(sim, "r", { kind: "drop-bundle" })).toBeNull();
    expect(holds(sim)).toBe(false);
    expect(sim.carriesBundle("r")).toBe(false);
    expect(blinded(sim, "x")).toBe(true);
  });

  it("when another item spell is cast, which then holds its full time", () => {
    const sim = match();
    use(sim, 0);
    expect(blinded(sim, "x")).toBe(false);
    get(sim, "r").combatant.cast.endRecharge(BLIND_WAS);
    use(sim, 0);
    expect(blinded(sim, "x")).toBe(true);
    expect(get(sim, "r").combatant.statuses.get(ASHES)?.remainingSeconds).toBeGreaterThan(48);
  });

  it("on a shadow step, where it began", () => {
    const sim = match();
    use(sim, 0);
    use(sim, 3, "y");
    expect(holds(sim)).toBe(false);
    expect(blinded(sim, "x")).toBe(true);
    expect(blinded(sim, "y")).toBe(false);
  });
});

describe("one bundle at a time (#1434)", () => {
  it("an item spell drops the flag carried", () => {
    const sim = match();
    get(sim, "r").position = FIELD.spawns[0]?.position ?? vec2(0, 0);
    applyIntent(sim, "r", { kind: "attack", targetId: flagId(0) });
    stepFor(sim, 0.5);
    expect(sim.flags[0]?.place).toEqual({ kind: "carried", carrierId: "r" });
    use(sim, 0);
    expect(sim.flags[0]?.place.kind).toBe("ground");
    expect(holds(sim)).toBe(true);
  });

  it("taking up a flag drops the ashes", () => {
    const sim = match();
    use(sim, 0);
    applyIntent(sim, "r", { kind: "attack", targetId: flagId(0) });
    stepFor(sim, 2);
    expect(sim.flags[0]?.place).toEqual({ kind: "carried", carrierId: "r" });
    expect(holds(sim)).toBe(false);
    expect(blinded(sim, "x")).toBe(true);
  });
});
