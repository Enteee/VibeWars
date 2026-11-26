import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type { CombatEvent } from "../skills/effects.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * What the Training Ground log reads that changes no number (#1735): a
 * use that went off, adrenaline gained, and a use whose only effect's
 * condition did not hold.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

const GLOWING_SIGNET = "paragon.glowing-signet";
const SIGNET_OF_AGGRESSION = "paragon.signet-of-aggression";
const HEALING_BREEZE = "monk.healing-breeze";
const POWER_SPIKE = "mesmer.power-spike";
const SEVER_ARTERY = "warrior.sever-artery";

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

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 1000,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/** `c` with `skillBar` at the origin, rank 12 in Leadership, and a foe `f` beside it. */
function match(skillBar: readonly string[], foe: Partial<ParticipantSpec> = {}) {
  const caster = spec("c", 0, vec2(0, 0), {
    skillBar: [...skillBar],
    attributeRanks: new Map([["paragon.leadership", 12]]),
  });
  return new MatchSimulation({
    seed: skillBar.join(),
    ruleset: RULES,
    participants: [caster, spec("f", 1, vec2(50, 0), foe)],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** Every event logged over `seconds`. */
function run(sim: MatchSimulation, seconds: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < seconds * RULES.tickRateHz; i += 1) {
    events.push(...sim.step(DT).log.flatMap((entry) => entry.events));
  }
  return events;
}

function ofKind<Kind extends CombatEvent["kind"]>(
  events: readonly CombatEvent[],
  kind: Kind,
): Extract<CombatEvent, { kind: Kind }>[] {
  return events.filter(
    (event): event is Extract<CombatEvent, { kind: Kind }> => event.kind === kind,
  );
}

describe("skill-used (#1735)", () => {
  it("a use that goes off, at its target", () => {
    const sim = match([GLOWING_SIGNET]);
    sim.setTarget("c", "f");
    expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
    expect(ofKind(run(sim, 1), "skill-used")).toEqual([
      { kind: "skill-used", casterId: "c", skillId: GLOWING_SIGNET, targetId: "f" },
    ]);
  });

  it("a self-targeted use names the caster as its target", () => {
    const sim = match([HEALING_BREEZE]);
    expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
    expect(ofKind(run(sim, 2), "skill-used")).toEqual([
      { kind: "skill-used", casterId: "c", skillId: HEALING_BREEZE, targetId: "c" },
    ]);
  });

  it("not for a refused press", () => {
    const sim = match([HEALING_BREEZE]);
    get(sim, "c").combatant.energy = 0;
    expect(sim.requestSkill("c", 0)?.check.ok).toBe(false);
    expect(ofKind(run(sim, 1), "skill-used")).toEqual([]);
  });

  it("not for an interrupted cast; the interrupt's own use is one", () => {
    const sim = match([HEALING_BREEZE], { skillBar: [POWER_SPIKE] });
    expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
    sim.setTarget("f", "c");
    expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
    const events = run(sim, 2);
    expect(ofKind(events, "interrupted")).toEqual([
      { kind: "interrupted", targetId: "c", skillId: HEALING_BREEZE },
    ]);
    expect(ofKind(events, "skill-used").map(({ casterId }) => casterId)).toEqual(["f"]);
  });
});

describe("adrenaline-gained (#1735)", () => {
  it("a skill's, named for it", () => {
    const sim = match([SIGNET_OF_AGGRESSION, SEVER_ARTERY]);
    get(sim, "c").combatant.statuses.apply("fall-back", 30, "c", NO_RANKS);
    expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
    expect(ofKind(run(sim, 1), "adrenaline-gained")).toEqual([
      { kind: "adrenaline-gained", targetId: "c", strikes: 2, skillId: SIGNET_OF_AGGRESSION },
    ]);
  });

  it("a blow's, with no skill", () => {
    const sim = match([SEVER_ARTERY]);
    get(sim, "c").combatant.equipment = SWORD;
    expect(sim.requestAttack("c", "f")?.ok).toBe(true);
    const gained = ofKind(run(sim, 3), "adrenaline-gained");
    expect(gained.length).toBeGreaterThan(0);
    expect(gained[0]).toEqual({
      kind: "adrenaline-gained",
      targetId: "c",
      strikes: 1,
      skillId: undefined,
    });
  });

  it("none for a bar with no adrenaline skill", () => {
    const sim = match([GLOWING_SIGNET]);
    get(sim, "c").combatant.equipment = SWORD;
    expect(sim.requestAttack("c", "f")?.ok).toBe(true);
    const events = run(sim, 3);
    expect(ofKind(events, "damage").length).toBeGreaterThan(0);
    expect(ofKind(events, "adrenaline-gained")).toEqual([]);
  });
});

describe("effect-skipped (#1735)", () => {
  function signet(burning: boolean): CombatEvent[] {
    const sim = match([GLOWING_SIGNET]);
    get(sim, "c").combatant.energy = 100;
    if (burning) {
      get(sim, "f").combatant.statuses.apply("burning", 10, "x", NO_RANKS);
    }
    sim.setTarget("c", "f");
    expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
    return ofKind(run(sim, 1), "effect-skipped");
  }

  it("Glowing Signet on a foe not Burning: skipped, on that foe", () => {
    expect(signet(false)).toEqual([
      {
        kind: "effect-skipped",
        casterId: "c",
        targetId: "f",
        skillId: GLOWING_SIGNET,
        requirement: "only if target has Burning",
      },
    ]);
  });

  it("Glowing Signet on a Burning foe: nothing skipped", () => {
    expect(signet(true)).toEqual([]);
  });
});
