import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { NO_RANKS, getStatusDefinition } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * The corpus's last two PvP skills (#1205): Meteor Shower, three meteors
 * 3 s apart on where its target stood, and Contemplation of Purity, your
 * enchantments traded for health and a hex and a condition each.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SHOWER = "elementalist.meteor-shower";
const FIRE = "elementalist.fire-magic";
const PURITY = "monk.contemplation-of-purity";
const DIVINE_FAVOR = "monk.divine-favor";

function spec(id: string, team: number, spawn: Vec2, divineFavor = 12): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [SHOWER, PURITY],
    attributeRanks: new Map([
      [FIRE, 12],
      [DIVINE_FAVOR, divineFavor],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/**
 * `e`, the caster, on team 0 at the origin with `divineFavor`, `f` a foe
 * at (200, 0), and whoever else `others` adds.
 */
function match(others: ParticipantSpec[] = [], divineFavor = 12): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "meteor-shower-contemplation",
    participants: [spec("e", 0, vec2(0, 0), divineFavor), spec("f", 1, vec2(200, 0)), ...others],
    walls: [],
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

/** `e` casts Meteor Shower at `f`, and the steps until it lands. */
function castShower(sim: MatchSimulation): CombatLogEntry[] {
  sim.setTarget("e", "f");
  expect(sim.requestSkill("e", 0)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  while (sim.groundEffects.length === 0) {
    const stepped = sim.step(DT);
    log.push(...stepped.log);
    expect(stepped.tick).toBeLessThan(6 / DT);
  }
  return log;
}

/** The log rows of the shower's meteors: the ones with an area. */
function meteors(log: readonly CombatLogEntry[]): CombatLogEntry[] {
  return log.filter((entry) => entry.skillId === SHOWER && entry.area !== undefined);
}

/** What `log`'s meteors did to `id`: its damage numbers and knockdowns, in order. */
function struck(log: readonly CombatLogEntry[], id: string): string[] {
  return meteors(log).flatMap((entry) =>
    entry.events.flatMap((event) => {
      if (event.kind === "damage" && event.targetId === id) {
        return [`${String(event.amount)} fire`];
      }
      return event.kind === "knocked-down" && event.targetId === id ? ["down"] : [];
    }),
  );
}

describe("Meteor Shower (#1205)", () => {
  it("is the corpus's: 25 energy, overcast 10, 5 s, 60 s recharge, a Fire Magic spell at a foe", () => {
    expect(getSkill(SHOWER)).toMatchObject({
      type: "spell",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: FIRE,
      cost: { kind: "energy", amount: 25 },
      overcast: 10,
      activationSeconds: 5,
      rechargeSeconds: 60,
      target: "single-enemy",
    });
  });

  it("drops three meteors 3 s apart where its target stood, each striking and knocking down", () => {
    // Near is 30 from where f stands, inside adjacent; far is 50, past it.
    const sim = match([spec("near", 1, vec2(200, 30)), spec("far", 1, vec2(200, 50))]);
    const log = castShower(sim);
    expect(sim.groundEffects[0]).toMatchObject({
      skillId: SHOWER,
      position: vec2(200, 0),
      durationSeconds: 9,
    });
    log.push(...stepFor(sim, 9 + DT));
    const landed = meteors(log);
    expect(landed.map((entry) => entry.atSeconds - (landed[0]?.atSeconds ?? 0))).toEqual([
      0,
      expect.closeTo(3, 6),
      expect.closeTo(6, 6),
    ]);
    expect(struck(log, "f")).toEqual(["91 fire", "down", "91 fire", "down", "91 fire", "down"]);
    expect(struck(log, "near")).toHaveLength(6);
    expect(struck(log, "far")).toEqual([]);
    expect(sim.groundEffects).toEqual([]);
  });

  it("misses a foe who stepped out after the first meteor", () => {
    const sim = match();
    const log = castShower(sim);
    get(sim, "f").position = vec2(200 + AREA_ADJACENT + 50, 0);
    log.push(...stepFor(sim, 9));
    expect(struck(log, "f")).toEqual(["91 fire", "down"]);
  });

  it("drops nothing when its cast is interrupted", () => {
    const sim = match();
    sim.setTarget("e", "f");
    expect(sim.requestSkill("e", 0)?.check.ok).toBe(true);
    stepFor(sim, 1);
    get(sim, "e").combatant.cast.cancelCast();
    expect(meteors(stepFor(sim, 10))).toEqual([]);
    expect(sim.groundEffects).toEqual([]);
  });
});

describe("Contemplation of Purity (#1205)", () => {
  it("is the corpus's: 5 energy, ¼ s, 10 s recharge, a Divine Favor skill on yourself", () => {
    expect(getSkill(PURITY)).toMatchObject({
      type: "skill",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: DIVINE_FAVOR,
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0.25,
      rechargeSeconds: 10,
      target: "self",
    });
  });

  /** `e` uses Contemplation of Purity, and the log until it resolves. */
  function contemplate(sim: MatchSimulation): CombatLogEntry {
    expect(sim.requestSkill("e", 1)?.check.ok).toBe(true);
    const entry = stepFor(sim, 1).find((row) => row.skillId === PURITY);
    if (entry === undefined) {
      throw new Error("Contemplation of Purity never resolved");
    }
    return entry;
  }

  function removed(entry: CombatLogEntry): string[] {
    return entry.events.flatMap((event) =>
      event.kind === "status-removed" && event.targetId === "e"
        ? [getStatusDefinition(event.statusId).category]
        : [],
    );
  }

  it("trades 3 enchantments for 3 × 64 Health, the hex and 3 of 5 conditions, at Divine Favor 12", () => {
    const sim = match();
    const self = get(sim, "e").combatant;
    self.health = 100;
    // A maintained enchantment of your own counts, and ends, too (#462).
    // No weakness: it would take a rank off Divine Favor for the heal.
    self.statuses.maintain("holy-veil", "e", 0, NO_RANKS);
    self.statuses.apply("guardian", 30, "e", NO_RANKS);
    self.statuses.apply("armor-boost", 30, "e", NO_RANKS);
    self.statuses.apply("malaise", 30, "f", NO_RANKS);
    for (const condition of ["blind", "crippled", "poison", "dazed", "bleeding"] as const) {
      self.statuses.apply(condition, 30, "f", NO_RANKS);
    }
    const entry = contemplate(sim);
    expect(entry.events.filter((event) => event.kind === "heal")).toEqual([
      { kind: "heal", targetId: "e", amount: 192 },
    ]);
    expect(removed(entry).sort()).toEqual([
      "condition",
      "condition",
      "condition",
      "enchantment",
      "enchantment",
      "enchantment",
      "hex",
    ]);
    expect(self.statuses.countByCategory("enchantment")).toBe(0);
    expect(self.statuses.countByCategory("hex")).toBe(0);
    expect(self.statuses.countByCategory("condition")).toBe(2);
  });

  it("caps the hexes and conditions at its maximum: 1 at Divine Favor 0, however many enchantments went", () => {
    const sim = match([], 0);
    const self = get(sim, "e").combatant;
    self.statuses.apply("guardian", 30, "e", NO_RANKS);
    self.statuses.apply("armor-boost", 30, "e", NO_RANKS);
    self.statuses.apply("vow-of-strength", 30, "e", NO_RANKS);
    self.statuses.apply("malaise", 30, "f", NO_RANKS);
    self.statuses.apply("faintheartedness", 30, "f", NO_RANKS);
    self.statuses.apply("blind", 30, "f", NO_RANKS);
    self.statuses.apply("crippled", 30, "f", NO_RANKS);
    const entry = contemplate(sim);
    expect(removed(entry).sort()).toEqual([
      "condition",
      "enchantment",
      "enchantment",
      "enchantment",
      "hex",
    ]);
  });

  it("with no enchantment only costs: no heal, the hex and conditions kept", () => {
    const sim = match();
    const self = get(sim, "e").combatant;
    self.health = 100;
    self.statuses.apply("malaise", 30, "f", NO_RANKS);
    self.statuses.apply("blind", 30, "f", NO_RANKS);
    const energy = self.energy;
    const entry = contemplate(sim);
    expect(entry.events.filter((event) => event.kind === "heal")).toEqual([]);
    expect(removed(entry)).toEqual([]);
    expect(self.statuses.has("malaise")).toBe(true);
    expect(self.statuses.has("blind")).toBe(true);
    expect(self.energy).toBeLessThan(energy);
  });
});
