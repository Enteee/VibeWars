import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Traps (#1105): set at the setter's feet, easily interrupted while being
 * set, sprung by the first living foe to step within its trigger radius,
 * on every foe its area takes. Barbed Trap is the catalog's.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BARBED = "ranger.barbed-trap";
const WILDERNESS = "ranger.wilderness-survival";

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

function spec(id: string, team: number, spawn: Vec2, sword = false): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [BARBED, "elementalist.fireball"],
    attributeRanks: new Map([
      [WILDERNESS, 12],
      ["warrior.swordsmanship", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: sword ? SWORD : unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** `r`, the setter, on team 0 at the origin, and whoever else `others` adds. */
function match(...others: ParticipantSpec[]): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "traps",
    participants: [spec("r", 0, vec2(0, 0)), ...others],
  });
  for (const participant of sim.participants()) {
    participant.combatant.maxHealth = 1e4;
    participant.combatant.health = 1e4;
  }
  return sim;
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

/** `r` sets Barbed Trap, and the steps until it has gone off. */
function setTrap(sim: MatchSimulation): CombatLogEntry[] {
  expect(sim.requestSkill("r", 0)?.check.ok).toBe(true);
  return stepFor(sim, 2 + 2 * DT);
}

/** The log rows of Barbed Trap's spring. */
function springs(log: readonly CombatLogEntry[]): CombatLogEntry[] {
  return log.filter((entry) => entry.skillId === BARBED && entry.events.length > 0);
}

/** Who `log`'s spring damaged, in order. */
function damaged(log: readonly CombatLogEntry[]): string[] {
  return springs(log).flatMap((entry) =>
    entry.events.flatMap((event) => (event.kind === "damage" ? [event.targetId] : [])),
  );
}

describe("Barbed Trap (#1105)", () => {
  it("is the corpus's: 10 energy, 2 s, 20 s recharge, a Wilderness Survival trap", () => {
    expect(getSkill(BARBED)).toMatchObject({
      type: "trap",
      elite: false,
      attributeId: WILDERNESS,
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 2,
      rechargeSeconds: 20,
      target: "self",
    });
  });

  it("reads as a trap that is easily interrupted, its spring's numbers at rank 12", () => {
    const skill = getSkill(BARBED);
    if (skill === undefined) {
      throw new Error("no Barbed Trap");
    }
    const lines = describeSkill(skill, new Map([[WILDERNESS, 12]])).effects.map(({ text }) => text);
    expect(lines).toEqual([
      "Sets a trap at your location for 90 seconds",
      "When sprung, foes nearby: deals 20 damage",
      "When sprung, foes nearby: applies Crippled for 21s (moves at 50% speed)",
      "When sprung, foes nearby: applies Bleeding for 21s (−3 Health degeneration)",
      "Easily interrupted",
    ]);
  });
});

describe("setting a trap (#1105)", () => {
  it("lands where its setter stands after 2 s, on its team, for 90 s", () => {
    const sim = match();
    expect(sim.requestSkill("r", 0)?.check.ok).toBe(true);
    stepFor(sim, 2 - 2 * DT);
    expect(sim.groundEffects).toEqual([]);
    stepFor(sim, 4 * DT);
    const [trap, ...others] = sim.groundEffects;
    expect(others).toEqual([]);
    expect(trap).toMatchObject({
      skillId: BARBED,
      ownerId: "r",
      team: 0,
      position: vec2(0, 0),
      durationSeconds: 90,
      act: { kind: "trap", trap: { triggerRadius: AREA_ADJACENT } },
    });
  });

  it("is interrupted by a swing that lands while it is being set: paid, recharging, no trap", () => {
    const sim = match(spec("w", 1, vec2(AREA_ADJACENT - 10, 0), true));
    expect(sim.requestSkill("r", 0)?.check.ok).toBe(true);
    expect(sim.requestAttack("w", "r")).toEqual({ ok: true });
    const log = stepFor(sim, 2 + 2 * DT);
    const events = log.flatMap((entry) => entry.events);
    expect(events).toContainEqual({ kind: "interrupted", targetId: "r", skillId: BARBED });
    expect(sim.groundEffects).toEqual([]);
    const ranger = get(sim, "r").combatant;
    expect(ranger.energy).toBeLessThan(100);
    expect(ranger.cast.rechargeRemaining.has(BARBED)).toBe(true);
  });

  it("is not interrupted by a spell's damage", () => {
    const sim = match(spec("e", 1, vec2(200, 0)));
    sim.setTarget("e", "r");
    expect(sim.requestSkill("r", 0)?.check.ok).toBe(true);
    expect(sim.requestSkill("e", 1)?.check.ok).toBe(true);
    const log = stepFor(sim, 2 + 2 * DT);
    const events = log.flatMap((entry) => entry.events);
    expect(events).toContainEqual(expect.objectContaining({ kind: "damage", targetId: "r" }));
    expect(events.map(({ kind }) => kind)).not.toContain("interrupted");
    expect(sim.groundEffects).toHaveLength(1);
  });

  it("is cancelled by moving", () => {
    const sim = match();
    expect(sim.requestSkill("r", 0)?.check.ok).toBe(true);
    stepFor(sim, 1);
    sim.walkTo("r", vec2(100, 0));
    stepFor(sim, 2);
    expect(sim.groundEffects).toEqual([]);
  });
});

describe("springing a trap (#1105)", () => {
  it("is not sprung by a foe one unit past its trigger radius", () => {
    const sim = match(spec("f", 1, vec2(AREA_ADJACENT + 1, 0)));
    const log = setTrap(sim).concat(stepFor(sim, 1));
    expect(springs(log)).toEqual([]);
    expect(sim.groundEffects).toHaveLength(1);
  });

  it("springs on a foe at its trigger radius: every foe nearby is struck, crippled and bleeding", () => {
    const sim = match(
      spec("f", 1, vec2(AREA_ADJACENT, 0)),
      spec("near", 1, vec2(0, AREA_NEARBY)),
      spec("far", 1, vec2(0, -(AREA_NEARBY + 1))),
      spec("pal", 0, vec2(-30, 0)),
    );
    const log = setTrap(sim);
    const [spring, ...again] = springs(log);
    expect(again).toEqual([]);
    expect(spring).toMatchObject({
      cause: "skill",
      sourceId: "r",
      skillId: BARBED,
      area: { x: 0, y: 0, radius: AREA_NEARBY },
    });
    expect(damaged(log).sort()).toEqual(["f", "near"]);
    for (const id of ["f", "near"]) {
      expect(spring?.events).toContainEqual({
        kind: "status-applied",
        targetId: id,
        statusId: "crippled",
        durationSeconds: 21,
      });
      expect(spring?.events).toContainEqual({
        kind: "status-applied",
        targetId: id,
        statusId: "bleeding",
        durationSeconds: 21,
      });
    }
    expect(get(sim, "pal").combatant.health).toBe(1e4);
    expect(get(sim, "far").combatant.statuses.has("crippled")).toBe(false);
    expect(sim.groundEffects).toEqual([]);
  });

  it("springs on a foe that walks onto it, once", () => {
    const sim = match(spec("f", 1, vec2(300, 0)));
    setTrap(sim);
    sim.walkTo("f", vec2(0, 0));
    const log = stepFor(sim, 5);
    expect(damaged(log)).toEqual(["f"]);
    expect(sim.groundEffects).toEqual([]);
  });

  it("is never sprung by an ally", () => {
    const sim = match(spec("pal", 0, vec2(30, 0)));
    const log = setTrap(sim).concat(stepFor(sim, 1));
    expect(springs(log)).toEqual([]);
    expect(sim.groundEffects).toHaveLength(1);
  });

  it("is never sprung by a dead foe", () => {
    const sim = match(spec("f", 1, vec2(300, 0)));
    setTrap(sim);
    const foe = get(sim, "f").combatant;
    foe.health = 0;
    foe.dead = true;
    sim.walkTo("f", vec2(0, 0));
    const log = stepFor(sim, 5);
    expect(springs(log)).toEqual([]);
    expect(sim.groundEffects).toHaveLength(1);
  });

  it("still springs with its owner dead, the damage the owner's", () => {
    const sim = match(spec("f", 1, vec2(300, 0)));
    setTrap(sim);
    const ranger = get(sim, "r").combatant;
    ranger.health = 0;
    ranger.dead = true;
    sim.walkTo("f", vec2(0, 0));
    const log = stepFor(sim, 5);
    expect(springs(log)).toEqual([expect.objectContaining({ sourceId: "r" })]);
    expect(damaged(log)).toEqual(["f"]);
  });

  it("is gone with no effect once its owner has left the match", () => {
    const sim = match(spec("f", 1, vec2(300, 0)));
    setTrap(sim);
    sim.remove("r");
    stepFor(sim, DT);
    expect(sim.groundEffects).toEqual([]);
  });

  it("ends after 90 s unsprung", () => {
    const sim = match();
    setTrap(sim);
    stepFor(sim, 89);
    expect(sim.groundEffects).toHaveLength(1);
    stepFor(sim, 1.5);
    expect(sim.groundEffects).toEqual([]);
  });

  it("is deterministic: the same seed springs the same events", () => {
    const run = (): CombatLogEntry[] => {
      const sim = match(spec("f", 1, vec2(300, 0)));
      setTrap(sim);
      sim.walkTo("f", vec2(0, 0));
      return springs(stepFor(sim, 5));
    };
    expect(run()).toEqual(run());
  });
});
