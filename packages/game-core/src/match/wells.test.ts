import { describe, expect, it } from "vitest";

import { AREA_IN_THE_AREA } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { MatchRules } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { NO_RANKS, HEALTH_PER_PIP } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Wells (#1104): a ground effect anchored on the corpse its skill
 * exploited, projecting a status on whoever its aura reaches. Well of
 * Suffering is the first, and the first aura on foes. With no corpse, a
 * well sacrifices 66% of its caster's Health and sits where it stands
 * (#1730).
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
  victim.combatant.statuses.apply("burning", 10, "n", NO_RANKS);
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

  it("with no corpse in range, sacrifices 66% of its caster's max Health and sits on it (#1730)", () => {
    const sim = match();
    kill(sim, "far");
    const n = get(sim, "n").combatant;
    const before = n.health;
    well(sim);
    expect(before - n.health).toBe(Math.round(n.maxHealth * 0.66));
    expect(get(sim, "far").corpseExploited).toBe(false);
    // Where it stood as the well went off: `o` beside it nudges it off the origin.
    expect(sim.groundEffects.map(({ position }) => position)).toEqual([get(sim, "n").position]);
  });

  it("with a corpse in range, sacrifices nothing (#1730)", () => {
    const sim = match();
    kill(sim, "x");
    const n = get(sim, "n").combatant;
    const before = n.health;
    well(sim);
    expect(n.health).toBeGreaterThanOrEqual(before);
  });

  it("is still made by a caster its sacrifice kills (#1730)", () => {
    const sim = match();
    const n = get(sim, "n").combatant;
    n.health = n.maxHealth * 0.3;
    well(sim);
    expect(n.dead).toBe(true);
    // Where it stood as the well went off: `o` beside it nudges it off the origin.
    expect(sim.groundEffects.map(({ position }) => position)).toEqual([get(sim, "n").position]);
  });

  it("leaves a corpse skill that is no well refused with no corpse, and unpaid (#1730)", () => {
    const sim = match();
    const n = get(sim, "n");
    const energy = n.combatant.energy;
    expect(sim.requestSkill("n", 1)?.check).toEqual({ ok: false, reason: "no-corpse" });
    stepFor(sim, DT);
    expect(n.combatant.energy).toBeGreaterThanOrEqual(energy);
    expect(n.combatant.cast.activeCast).toBeUndefined();
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

  it("sacrifices, and sits on its caster, when the corpse was used up during the cast (#1730)", () => {
    const sim = match();
    kill(sim, "x");
    const o = get(sim, "o").combatant;
    const before = o.health;
    // Both cast at once; `n`'s Soul Feast resolves first, in participant order.
    expect(sim.requestSkill("n", 1)?.check).toEqual({ ok: true });
    expect(sim.requestSkill("o", 0)?.check).toEqual({ ok: true });
    stepFor(sim, CAST_SECONDS);
    expect(get(sim, "x").corpseExploited).toBe(true);
    expect(before - o.health).toBe(Math.round(o.maxHealth * 0.66));
    expect(sim.groundEffects.map(({ position }) => position)).toEqual([vec2(0, -10)]);
  });

  it("says what it does, and to whom", () => {
    const skill = getSkill(WELL);
    if (skill === undefined) {
      throw new Error(`no skill ${WELL}`);
    }
    const lines = describeSkill(skill, new Map([[DEATH, 12]]));
    expect(lines.effects.map(({ text }) => text)).toEqual([
      "Exploits the nearest corpse, or sacrifices 66% Health if none is near",
      "Creates a well at its location for 26 seconds",
      "Non-spirit foes in the area: −5 Health degeneration",
    ]);
  });
});

describe("Wells of Blood, Power and Weariness (#1730)", () => {
  it.each([
    [
      "necromancer.well-of-blood",
      92,
      false,
      "necromancer.blood-magic",
      10,
      2,
      "well-of-blood",
      "allies",
      18,
    ],
    [
      "necromancer.well-of-power",
      91,
      true,
      "necromancer.blood-magic",
      5,
      10,
      "well-of-power",
      "allies",
      26,
    ],
    [
      "necromancer.well-of-weariness",
      818,
      false,
      "necromancer.curses",
      5,
      5,
      "well-of-weariness",
      "foes",
      46,
    ],
  ] as const)(
    "%s is GW1's: gwId %i, elite %s, %s, %i energy, 1 s, %i s recharge, %s on %s for %i s at 12",
    (id, gwId, elite, attributeId, energy, recharge, statusId, affects, seconds) => {
      const skill = getSkill(id);
      expect(skill).toMatchObject({
        gwId,
        type: "well",
        elite,
        attributeId,
        cost: { kind: "energy", amount: energy },
        activationSeconds: 1,
        rechargeSeconds: recharge,
        target: "self",
        corpse: { elseSacrificePercent: 66 },
      });
      expect(skill?.effects).toMatchObject([
        {
          kind: "create-ground-effect",
          anchor: "corpse",
          act: { kind: "aura", aura: { statusId, affects, radius: AREA_IN_THE_AREA } },
        },
      ]);
      const sim = new MatchSimulation({
        seed: "wells-1730",
        participants: [
          {
            ...spec("n", 0, vec2(0, 0)),
            skillBar: [id],
            attributeRanks: new Map([[attributeId, 12]]),
          },
          spec("x", 1, vec2(100, 0)),
        ],
      });
      kill(sim, "x");
      expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
      stepFor(sim, CAST_SECONDS);
      expect(sim.groundEffects[0]?.durationSeconds).toBe(seconds);
    },
  );

  it("Well of Blood with no corpse sits on its caster, who regenerates in it", () => {
    const sim = new MatchSimulation({
      seed: "wells-1730",
      participants: [
        {
          ...spec("n", 0, vec2(0, 0)),
          skillBar: ["necromancer.well-of-blood"],
          attributeRanks: new Map([["necromancer.blood-magic", 12]]),
        },
      ],
    });
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
    stepFor(sim, CAST_SECONDS);
    const n = get(sim, "n").combatant;
    expect(n.statuses.has("well-of-blood")).toBe(true);
    expect(lostOverASecond(sim, "n")).toBeCloseTo(-5 * HEALTH_PER_PIP, 5);
  });

  it("Well of Power is worn by allies in it, Weariness by foes", () => {
    const sim = new MatchSimulation({
      seed: "wells-1730",
      participants: [
        {
          ...spec("n", 0, vec2(0, 0)),
          skillBar: ["necromancer.well-of-power", "necromancer.well-of-weariness"],
          attributeRanks: new Map([
            ["necromancer.blood-magic", 12],
            ["necromancer.curses", 12],
          ]),
        },
        spec("f", 1, vec2(30, 0)),
      ],
    });
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
    stepFor(sim, CAST_SECONDS);
    // Healed again, or the second sacrifice would kill it.
    const n = get(sim, "n").combatant;
    n.health = n.maxHealth;
    expect(sim.requestSkill("n", 1)?.check).toEqual({ ok: true });
    stepFor(sim, CAST_SECONDS);
    expect(get(sim, "n").combatant.statuses.has("well-of-power")).toBe(true);
    expect(get(sim, "f").combatant.statuses.has("well-of-weariness")).toBe(true);
    expect(get(sim, "f").combatant.statuses.has("well-of-power")).toBe(false);
    expect(get(sim, "n").combatant.statuses.has("well-of-weariness")).toBe(false);
  });
});
