import { describe, expect, it, vi } from "vitest";

import { AREA_IN_THE_AREA } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type * as Catalog from "../skills/catalog.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { blockChanceOf } from "../skills/tick.js";
import type { StatusId } from "../skills/status.js";
import type { Aura, Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import {
  MAX_GROUND_EFFECTS,
  MatchSimulation,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";

/**
 * Ground effects (#1087): a circle that is not a body, projecting a status
 * on whoever its aura reaches while it lasts. Ward Against Melee is the
 * catalog's; these tests add instant wards of their own for the cap and
 * for an aura on foes.
 */

const TEST_SKILLS = vi.hoisted(() => new Map<string, Skill>());

vi.mock("../skills/catalog.js", async (importOriginal) => {
  const original = await importOriginal<typeof Catalog>();
  return {
    ...original,
    getSkill: (id: string) => TEST_SKILLS.get(id) ?? original.getSkill(id),
  };
});

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const WARD = "elementalist.ward-against-melee";
const EARTH = "elementalist.earth-magic";

/** An instant, free ward lasting `seconds`, whose aura `affects` this. */
function testWard(id: string, affects: Aura["affects"], seconds: number): string {
  TEST_SKILLS.set(id, {
    id,
    name: id,
    type: "ward",
    gwId: undefined,
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: EARTH,
    cost: undefined,
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: 0,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "caster",
        durationSeconds: { flat: seconds },
        act: {
          kind: "aura",
          aura: { statusId: "ward-against-melee", affects, radius: AREA_IN_THE_AREA },
        },
      },
    ],
  });
  return id;
}

const ON_FOES = testWard("test.ward-on-foes", "foes", 10);
const LONG = testWard("test.ward-long", "allies", 100);

function spec(id: string, team: number, spawn: Vec2, earth = 12): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [WARD, ON_FOES, LONG, "ranger.winnowing"],
    attributeRanks: new Map([
      [EARTH, earth],
      ["ranger.wilderness-survival", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/**
 * `e` on team 0 at the origin; `a`, its ally, exactly at the ward's edge;
 * `out`, its ally, one unit past it; `f`, a foe, inside it.
 */
function match(earth = 12, ...more: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "ground-effects",
    participants: [
      spec("e", 0, vec2(0, 0), earth),
      spec("a", 0, vec2(0, AREA_IN_THE_AREA)),
      spec("out", 0, vec2(0, -(AREA_IN_THE_AREA + 1))),
      spec("f", 1, vec2(AREA_IN_THE_AREA - 10, 0)),
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

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `by` casts `skillId` from its bar, and the steps until it has gone off. */
function cast(sim: MatchSimulation, skillId: string, by = "e"): CombatLogEntry[] {
  const slot = get(sim, by).skillBar.indexOf(skillId);
  expect(sim.requestSkill(by, slot)?.check.ok).toBe(true);
  const activation = getSkill(skillId)?.activationSeconds ?? 0;
  return stepFor(sim, activation + 2 * DT);
}

function wears(
  sim: MatchSimulation,
  id: string,
  statusId: StatusId = "ward-against-melee",
): boolean {
  return get(sim, id).combatant.statuses.has(statusId);
}

describe("Ward Against Melee (#1087)", () => {
  it("is the corpus's: 15 energy, 1 s, 30 s recharge, an Earth Magic ward spell", () => {
    expect(getSkill(WARD)).toMatchObject({
      type: "ward",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: EARTH,
      cost: { kind: "energy", amount: 15 },
      activationSeconds: 1,
      rechargeSeconds: 30,
      target: "self",
    });
  });

  it("lands where its caster stands, on its team, for 17 seconds at rank 12", () => {
    const sim = match();
    cast(sim, WARD);
    const [ward, ...others] = sim.groundEffects;
    expect(others).toEqual([]);
    expect(ward).toMatchObject({
      id: 1,
      skillId: WARD,
      ownerId: "e",
      team: 0,
      position: vec2(0, 0),
      durationSeconds: 17,
    });
    expect(ward?.act).toMatchObject({ kind: "aura", aura: { radius: AREA_IN_THE_AREA } });
  });

  it("is worn by an ally at its edge, not one a unit past it, nor a foe inside it", () => {
    const sim = match();
    cast(sim, WARD);
    expect(wears(sim, "e")).toBe(true);
    expect(wears(sim, "a")).toBe(true);
    expect(wears(sim, "out")).toBe(false);
    expect(wears(sim, "f")).toBe(false);
  });

  it("blocks half of melee attacks and no projectiles", () => {
    const sim = match();
    cast(sim, WARD);
    const { combatant } = get(sim, "a");
    expect(blockChanceOf(combatant, "melee", false)).toBe(0.5);
    expect(blockChanceOf(combatant, "projectile", false)).toBe(0);
  });

  it("is lost the step after its wearer walks out", () => {
    const sim = match();
    cast(sim, WARD);
    sim.setInputDirection("a", vec2(0, 1));
    let steps = 0;
    while (get(sim, "a").position.y <= AREA_IN_THE_AREA) {
      sim.step(DT);
      steps += 1;
      expect(steps).toBeLessThan(100);
    }
    expect(wears(sim, "a")).toBe(true);
    sim.step(DT);
    expect(wears(sim, "a")).toBe(false);
  });

  it.each([
    [0, 5],
    [12, 17],
  ])(
    "at Earth Magic %i lasts %i seconds, then is gone from the ground and from everyone",
    (earth, seconds) => {
      const sim = match(earth);
      cast(sim, WARD);
      const ward = sim.groundEffects[0];
      expect(ward?.durationSeconds).toBe(seconds);
      // Placed as the cast ended, a step before `cast` returned.
      let lasted = DT;
      while (sim.groundEffects.length > 0) {
        expect(wears(sim, "a")).toBe(true);
        sim.step(DT);
        lasted += DT;
      }
      expect(lasted).toBeCloseTo(seconds, 1);
      expect(wears(sim, "a")).toBe(false);
    },
  );

  it("gives its status once from two overlapping wards, and keeps it when the first ends", () => {
    const sim = match();
    cast(sim, WARD);
    stepFor(sim, 5);
    // A second ward: its own cast, from a second elementalist beside the first.
    sim.add(spec("e2", 0, vec2(0, 40)));
    cast(sim, WARD, "e2");
    expect(sim.groundEffects.map((ward) => ward.id)).toEqual([1, 2]);
    expect(
      get(sim, "a").combatant.statuses.active.filter((s) => s.id === "ward-against-melee"),
    ).toHaveLength(1);
    stepFor(sim, sim.groundEffects[0]?.remainingSeconds ?? 0);
    expect(sim.groundEffects.map((ward) => ward.id)).toEqual([2]);
    expect(wears(sim, "a")).toBe(true);
  });

  it("outlives its owner", () => {
    const sim = match();
    cast(sim, WARD);
    const owner = get(sim, "e").combatant;
    owner.health = 0;
    owner.dead = true;
    stepFor(sim, 1);
    expect(sim.groundEffects).toHaveLength(1);
    expect(wears(sim, "a")).toBe(true);
  });

  it("makes a new ward on a recast, and the old one stays", () => {
    const sim = match();
    cast(sim, LONG);
    sim.setInputDirection("e", vec2(1, 0));
    stepFor(sim, 1);
    sim.setInputDirection("e", vec2(0, 0));
    cast(sim, LONG);
    const [first, second] = sim.groundEffects;
    expect(first?.position).toEqual(vec2(0, 0));
    expect(second?.position.x).toBeGreaterThan(0);
  });

  it(`holds at most ${String(MAX_GROUND_EFFECTS)}: the next ends the oldest`, () => {
    const sim = match();
    for (let i = 0; i <= MAX_GROUND_EFFECTS; i += 1) {
      cast(sim, LONG);
    }
    const ids = sim.groundEffects.map((ward) => ward.id);
    expect(ids).toHaveLength(MAX_GROUND_EFFECTS);
    expect(ids[0]).toBe(2);
    expect(ids.at(-1)).toBe(MAX_GROUND_EFFECTS + 1);
  });

  it("lives beside a spirit's aura: neither strips the other", () => {
    const sim = match();
    cast(sim, WARD);
    // Planted by the foe, as it reaches both teams: no nudge moves anyone out of the ward.
    cast(sim, "ranger.winnowing", "f");
    stepFor(sim, 1);
    expect(wears(sim, "a", "winnowing")).toBe(true);
    expect(wears(sim, "a")).toBe(true);
  });

  it("with an aura on foes, reaches foes only", () => {
    const sim = match();
    cast(sim, ON_FOES);
    expect(wears(sim, "f")).toBe(true);
    expect(wears(sim, "e")).toBe(false);
    expect(wears(sim, "a")).toBe(false);
  });

  it("is deterministic: the same seed places the same wards and logs the same", () => {
    const run = () => {
      const sim = match();
      const log = [...cast(sim, WARD), ...cast(sim, LONG), ...stepFor(sim, 3)];
      return { log, wards: sim.groundEffects.map((ward) => ({ ...ward })) };
    };
    expect(run()).toEqual(run());
  });

  it("says what it does, and to whom", () => {
    const skill = getSkill(WARD);
    if (skill === undefined) {
      throw new Error(`no skill ${WARD}`);
    }
    const lines = describeSkill(skill, new Map([[EARTH, 12]]));
    expect(lines.effects.map(({ text }) => text)).toEqual([
      "Creates a ward at your location for 17 seconds",
      "Non-spirit allies in the area: 50% chance to block melee attacks",
    ]);
  });
});
