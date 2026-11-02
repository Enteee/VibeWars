import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { applyEffects } from "./effects.js";
import { NO_RANKS, getStatusDefinition, type StatusCategory, type StatusId } from "./status.js";
import type { Combatant } from "./types.js";

/**
 * The Monk's protection staples (#2187), each the proof of a new
 * primitive: Reversal of Damage reflects the next damage, Spotless Mind
 * and Spotless Soul pulse a removal, Mark of Protection turns damage into
 * healing, and Protective Bond's cap costs its caster Energy per hit it
 * caps.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const REVERSAL_OF_DAMAGE = 0;
const SPOTLESS_MIND = 1;
const SPOTLESS_SOUL = 2;
const MARK_OF_PROTECTION = 3;
const PROTECTIVE_BOND = 4;

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    startHealthFraction: 0.5,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/** A Monk with the five, rank 12 in both prayers; its ally `w`; a foe `f`. */
function match(): MatchSimulation {
  return new MatchSimulation({
    seed: "monk-protection",
    participants: [
      spec("monk", 0, vec2(0, 0), {
        skillBar: [
          "monk.reversal-of-damage",
          "monk.spotless-mind",
          "monk.spotless-soul",
          "monk.mark-of-protection",
          "monk.protective-bond",
        ],
        attributeRanks: new Map([
          ["monk.protection-prayers", 12],
          ["monk.smiting-prayers", 12],
          ["monk.healing-prayers", 12],
        ]),
      }),
      spec("w", 0, vec2(100, 0)),
      spec("f", 1, vec2(300, 0)),
    ],
  });
}

function get(sim: MatchSimulation, id: string): Combatant {
  const participant = sim.get(id);
  if (participant === undefined) {
    throw new Error(`no ${id}`);
  }
  return participant.combatant;
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
  }
}

/** The Monk casts `slot` on `targetId` and the cast lands on it. */
function cast(sim: MatchSimulation, slot: number, targetId: string, statusId: StatusId): void {
  sim.setTarget("monk", targetId);
  expect(sim.requestSkill("monk", slot)?.check).toEqual({ ok: true });
  for (let i = 0; i < 4 / DT && !get(sim, targetId).statuses.has(statusId); i += 1) {
    sim.step(DT);
  }
  expect(get(sim, targetId).statuses.has(statusId)).toBe(true);
}

/** `amount` typeless damage, which armor never touches, from `f` at `w`, outside any skill. */
function hit(sim: MatchSimulation, amount: number): void {
  applyEffects(
    [{ kind: "damage", amount: { flat: amount }, type: "typeless", armorPenetration: 0 }],
    {
      caster: get(sim, "f"),
      target: get(sim, "w"),
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(
        [...sim.participants()].map((participant) => [participant.id, participant]),
      ),
      usedSkill: undefined,
    },
  );
}

function count(combatant: Combatant, category: StatusCategory): number {
  return combatant.statuses.active.filter(({ id }) => getStatusDefinition(id).category === category)
    .length;
}

describe("Reversal of Damage (#2187)", () => {
  it("negates the next hit, sends it back to its source, and ends", () => {
    const sim = match();
    cast(sim, REVERSAL_OF_DAMAGE, "w", "reversal-of-damage");
    const [w, f] = [get(sim, "w").health, get(sim, "f").health];
    hit(sim, 40);
    sim.step(DT);
    expect(get(sim, "w").health).toBe(w);
    expect(get(sim, "f").health).toBe(f - 40);
    expect(get(sim, "w").statuses.has("reversal-of-damage")).toBe(false);
  });

  it("negates a hit over its cap whole, and sends back only the 61", () => {
    const sim = match();
    cast(sim, REVERSAL_OF_DAMAGE, "w", "reversal-of-damage");
    const [w, f] = [get(sim, "w").health, get(sim, "f").health];
    hit(sim, 200);
    sim.step(DT);
    expect(get(sim, "w").health).toBe(w);
    expect(get(sim, "f").health).toBe(f - 61);
  });

  it("is not spent by a hit for 0", () => {
    const sim = match();
    cast(sim, REVERSAL_OF_DAMAGE, "w", "reversal-of-damage");
    hit(sim, 0);
    sim.step(DT);
    expect(get(sim, "w").statuses.has("reversal-of-damage")).toBe(true);
  });

  it("still negates when the source is gone, and sends nothing back", () => {
    const sim = match();
    cast(sim, REVERSAL_OF_DAMAGE, "w", "reversal-of-damage");
    const w = get(sim, "w").health;
    const f = get(sim, "f");
    hit(sim, 40);
    sim.remove("f");
    sim.step(DT);
    expect(get(sim, "w").health).toBe(w);
    expect(f.health).toBe(500);
  });
});

describe("Spotless Mind and Spotless Soul (#2187)", () => {
  it("Spotless Mind takes a hex off its bearer every 5 s, the first at 5 s", () => {
    const sim = match();
    const w = get(sim, "w");
    w.statuses.apply("backfire", 30, "f", NO_RANKS);
    w.statuses.apply("empathy", 30, "f", NO_RANKS);
    cast(sim, SPOTLESS_MIND, "w", "spotless-mind");
    stepFor(sim, 4.9);
    expect(count(w, "hex")).toBe(2);
    stepFor(sim, 0.2);
    expect(count(w, "hex")).toBe(1);
    stepFor(sim, 5);
    expect(count(w, "hex")).toBe(0);
  });

  it("Spotless Soul takes a condition off its bearer every 3 s", () => {
    const sim = match();
    const w = get(sim, "w");
    w.statuses.apply("crippled", 30, "f", NO_RANKS);
    w.statuses.apply("bleeding", 30, "f", NO_RANKS);
    cast(sim, SPOTLESS_SOUL, "w", "spotless-soul");
    stepFor(sim, 2.9);
    expect(count(w, "condition")).toBe(2);
    stepFor(sim, 0.2);
    expect(count(w, "condition")).toBe(1);
  });

  it("does nothing on a bearer with nothing to remove, and goes on", () => {
    const sim = match();
    cast(sim, SPOTLESS_MIND, "w", "spotless-mind");
    stepFor(sim, 5.2);
    expect(get(sim, "w").statuses.has("spotless-mind")).toBe(true);
  });

  it("cannot be cast on the Monk itself", () => {
    const sim = match();
    sim.setTarget("monk", "monk");
    expect(sim.requestSkill("monk", SPOTLESS_MIND)?.check.ok).toBe(false);
  });
});

describe("Mark of Protection (#2187)", () => {
  it("turns every hit into healing, up to 49 a hit, and is not spent", () => {
    const sim = match();
    cast(sim, MARK_OF_PROTECTION, "w", "mark-of-protection");
    const w = get(sim, "w");
    const before = w.health;
    hit(sim, 30);
    expect(w.health).toBe(before + 30);
    hit(sim, 200);
    expect(w.health).toBe(before + 30 + 49);
    expect(w.statuses.has("mark-of-protection")).toBe(true);
  });

  it("disables the Monk's Protection Prayers for 5 s", () => {
    const sim = match();
    cast(sim, MARK_OF_PROTECTION, "w", "mark-of-protection");
    sim.setTarget("monk", "w");
    stepFor(sim, 4.9);
    expect(sim.requestSkill("monk", PROTECTIVE_BOND)?.check.ok).toBe(false);
    // Reversal of Damage is Smiting Prayers: never disabled.
    expect(sim.requestSkill("monk", REVERSAL_OF_DAMAGE)?.check).toEqual({ ok: true });
    stepFor(sim, 0.2);
    expect(sim.requestSkill("monk", PROTECTIVE_BOND)?.check).toEqual({ ok: true });
  });

  it("heals what Protective Bond leaves of a hit", () => {
    const sim = match();
    cast(sim, PROTECTIVE_BOND, "w", "protective-bond");
    cast(sim, MARK_OF_PROTECTION, "w", "mark-of-protection");
    const w = get(sim, "w");
    const before = w.health;
    hit(sim, 45);
    expect(w.health).toBe(before + 45);
    hit(sim, 200);
    // The bond caps 200 at 5% of 1000, 50; the Mark heals 49 of that.
    expect(w.health).toBe(before + 45 + 49);
  });
});

describe("Protective Bond (#2187)", () => {
  it("caps a hit at 5% of max Health for 4 of its caster's Energy", () => {
    const sim = match();
    cast(sim, PROTECTIVE_BOND, "w", "protective-bond");
    const [w, monk] = [get(sim, "w"), get(sim, "monk")];
    const [health, energy] = [w.health, monk.energy];
    hit(sim, 200);
    expect(w.health).toBe(health - 50);
    expect(monk.energy).toBe(energy - 4);
  });

  it("costs nothing for a hit already at or under the cap", () => {
    const sim = match();
    cast(sim, PROTECTIVE_BOND, "w", "protective-bond");
    const [w, monk] = [get(sim, "w"), get(sim, "monk")];
    const [health, energy] = [w.health, monk.energy];
    hit(sim, 50);
    expect(w.health).toBe(health - 50);
    expect(monk.energy).toBe(energy);
  });

  it("ends, and caps nothing, when its caster cannot pay", () => {
    const sim = match();
    cast(sim, PROTECTIVE_BOND, "w", "protective-bond");
    const [w, monk] = [get(sim, "w"), get(sim, "monk")];
    monk.energy = 3;
    const health = w.health;
    hit(sim, 200);
    expect(w.health).toBe(health - 200);
    expect(monk.energy).toBe(3);
    expect(w.statuses.has("protective-bond")).toBe(false);
  });
});
