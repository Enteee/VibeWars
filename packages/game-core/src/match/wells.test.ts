import { describe, expect, it } from "vitest";

import { AREA_IN_THE_AREA } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { MatchRules } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { HEALTH_PER_PIP } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Wells (#1104): a ground effect anchored on the corpse its skill
 * exploited, projecting a status on whoever its aura reaches. Well of
 * Suffering is the first, and the first aura on foes.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const WELL = "necromancer.well-of-suffering";
const SOUL_FEAST = "necromancer.soul-feast";
const DEATH = "necromancer.death-magic";
/** The well's activation and aftercast, and a tick to spare. */
const CAST_SECONDS = 1 + RULES.combat.aftercastSeconds + 2 * DT;

function spec(id: string, team: number, spawn: Vec2, death = 12): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [WELL, SOUL_FEAST],
    attributeRanks: new Map([[DEATH, death]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/**
 * Necromancers `n` and `o` on team 0 at the origin; `x`, a foe at 100,
 * whose corpse the tests make; `f`, a foe exactly at the well's edge
 * round it; `a`, an ally beside it; `far`, a foe past the well's reach to
 * the caster.
 */
function match(death = 12, rules?: MatchRules): MatchSimulation {
  return new MatchSimulation({
    seed: "wells",
    matchRules: rules,
    participants: [
      spec("n", 0, vec2(0, 0), death),
      spec("o", 0, vec2(0, -10), death),
      spec("x", 1, vec2(100, 0)),
      spec("f", 1, vec2(100 + AREA_IN_THE_AREA, 0)),
      spec("a", 0, vec2(100, 50)),
      spec("far", 1, vec2(0, 1000)),
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

/** Kill `id` as burning would. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "n");
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

/** `caster` casts Well of Suffering through to the end. */
function well(sim: MatchSimulation, caster = "n"): void {
  expect(sim.requestSkill(caster, 0)?.check).toEqual({ ok: true });
  stepFor(sim, CAST_SECONDS);
}

function suffers(sim: MatchSimulation, id: string): boolean {
  return get(sim, id).combatant.statuses.has("well-of-suffering");
}

/** The Health `id` loses over the next second. */
function lostOverASecond(sim: MatchSimulation, id: string): number {
  const before = get(sim, id).combatant.health;
  stepFor(sim, 1);
  return before - get(sim, id).combatant.health;
}

describe("Well of Suffering (#1104)", () => {
  it("is the corpus's: 10 energy, 1 s, 10 s recharge, a Death Magic well spell", () => {
    expect(getSkill(WELL)).toMatchObject({
      type: "well",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: DEATH,
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 1,
      rechargeSeconds: 10,
      target: "self",
    });
  });

  it("is refused with no corpse in range, and nothing is paid", () => {
    const sim = match();
    kill(sim, "far");
    const n = get(sim, "n");
    const energy = n.combatant.energy;
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: false, reason: "no-corpse" });
    stepFor(sim, DT);
    expect(n.combatant.energy).toBeGreaterThanOrEqual(energy);
    expect(n.combatant.cast.activeCast).toBeUndefined();
    expect(sim.groundEffects).toEqual([]);
  });

  it("sits on the corpse it exploits, not on its caster, for 26 seconds at rank 12", () => {
    const sim = match();
    kill(sim, "x");
    well(sim);
    expect(get(sim, "x").corpseExploited).toBe(true);
    const [placed, ...others] = sim.groundEffects;
    expect(others).toEqual([]);
    expect(placed).toMatchObject({
      skillId: WELL,
      ownerId: "n",
      team: 0,
      position: vec2(100, 0),
      durationSeconds: 26,
    });
    expect(placed?.act).toEqual({
      kind: "aura",
      aura: {
        statusId: "well-of-suffering",
        affects: "foes",
        radius: AREA_IN_THE_AREA,
      },
    });
  });

  it("takes the nearer of two corpses", () => {
    const sim = match();
    kill(sim, "f");
    kill(sim, "x");
    well(sim);
    expect(get(sim, "x").corpseExploited).toBe(true);
    expect(get(sim, "f").corpseExploited).toBe(false);
    expect(sim.groundEffects[0]?.position).toEqual(vec2(100, 0));
  });

  it("degenerates a foe at its edge by 5 pips, and leaves an ally alone", () => {
    const sim = match();
    kill(sim, "x");
    well(sim);
    expect(suffers(sim, "f")).toBe(true);
    expect(suffers(sim, "a")).toBe(false);
    expect(suffers(sim, "n")).toBe(false);
    const a = get(sim, "a").combatant;
    a.health = a.maxHealth - 100;
    expect(lostOverASecond(sim, "f")).toBeCloseTo(5 * HEALTH_PER_PIP, 5);
    expect(a.health).toBeGreaterThanOrEqual(a.maxHealth - 100);
  });

  it.each([
    [0, 10],
    [12, 26],
  ])("at Death Magic %i lasts %i seconds, then the foe stops suffering", (death, seconds) => {
    const sim = match(death);
    kill(sim, "x");
    well(sim);
    expect(sim.groundEffects[0]?.durationSeconds).toBe(seconds);
    while (sim.groundEffects.length > 0) {
      expect(suffers(sim, "f")).toBe(true);
      sim.step(DT);
    }
    expect(suffers(sim, "f")).toBe(false);
  });

  it("gives its status once from two overlapping wells, and keeps it when the first ends", () => {
    const sim = match();
    kill(sim, "x");
    well(sim);
    stepFor(sim, 5);
    // A second corpse beside the first, for `o`'s well.
    sim.add(spec("x2", 1, vec2(110, 0)));
    kill(sim, "x2");
    well(sim, "o");
    expect(sim.groundEffects.map((placed) => placed.position)).toEqual([
      vec2(100, 0),
      vec2(110, 0),
    ]);
    expect(
      get(sim, "f").combatant.statuses.active.filter((s) => s.id === "well-of-suffering"),
    ).toHaveLength(1);
    stepFor(sim, sim.groundEffects[0]?.remainingSeconds ?? 0);
    expect(sim.groundEffects).toHaveLength(1);
    expect(suffers(sim, "f")).toBe(true);
  });

  it("stays when its corpse respawns, and the body standing in it suffers it", () => {
    const sim = match(12, {
      victory: "kill-count",
      scoreToWin: 15,
      timeLimitSeconds: 600,
      deathRule: "respawn",
      respawnSeconds: 3,
      deathPenalty: false,
    });
    kill(sim, "x");
    well(sim);
    stepFor(sim, 3);
    expect(get(sim, "x").combatant.dead).toBe(false);
    expect(sim.groundEffects[0]?.position).toEqual(vec2(100, 0));
    expect(suffers(sim, "f")).toBe(true);
    // Up again at its spawn, where it fell: inside a foe's well, it suffers it.
    expect(suffers(sim, "x")).toBe(true);
  });

  it("lands with no well, paid for, when the corpse was used up during the cast", () => {
    const sim = match();
    kill(sim, "x");
    const o = get(sim, "o");
    const energy = o.combatant.energy;
    // Both cast at once; `n`'s Soul Feast resolves first, in participant order.
    expect(sim.requestSkill("n", 1)?.check).toEqual({ ok: true });
    expect(sim.requestSkill("o", 0)?.check).toEqual({ ok: true });
    stepFor(sim, CAST_SECONDS);
    expect(get(sim, "x").corpseExploited).toBe(true);
    expect(sim.groundEffects).toEqual([]);
    expect(o.combatant.energy).toBeLessThan(energy);
  });

  it("says what it does, and to whom", () => {
    const skill = getSkill(WELL);
    if (skill === undefined) {
      throw new Error(`no skill ${WELL}`);
    }
    const lines = describeSkill(skill, new Map([[DEATH, 12]]));
    expect(lines.effects.map(({ text }) => text)).toEqual([
      "Exploits the nearest corpse",
      "Creates a well at its location for 26 seconds",
      "Non-spirit foes in the area: −5 Health degeneration",
    ]);
  });
});
