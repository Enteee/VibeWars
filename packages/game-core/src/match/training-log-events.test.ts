import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type { CombatEvent } from "../skills/effects.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * What the Training Ground's log reads of a use (#1735): a skill used
 * that went off, the adrenaline its user gained, and a use that did
 * nothing because its `if` did not hold.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const GLOWING_SIGNET = "paragon.glowing-signet";
const SIGNET_OF_AGGRESSION = "paragon.signet-of-aggression";
const GO_FOR_THE_EYES = "paragon.go-for-the-eyes";
const HEALING_BREEZE = "monk.healing-breeze";
const LEECH_SIGNET = "mesmer.leech-signet";

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
    maxHealth: 1e5,
    maxEnergy: 1000,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/** `c` with `skillBar` at the origin; `f`, a foe, beside it, with `foeBar`. */
function match(
  skillBar: readonly string[],
  extra: Partial<ParticipantSpec> = {},
  foeBar: readonly string[] = [],
): MatchSimulation {
  return new MatchSimulation({
    seed: "training-log-events",
    ruleset: RULES,
    participants: [
      spec("c", 0, vec2(0, 0), {
        skillBar: [...skillBar],
        attributeRanks: new Map([
          ["paragon.leadership", 12],
          ["mesmer.inspiration-magic", 12],
        ]),
        ...extra,
      }),
      spec("f", 1, vec2(35, 0), {
        skillBar: [...foeBar],
        attributeRanks: new Map([["mesmer.inspiration-magic", 12]]),
      }),
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

function events(log: readonly CombatLogEntry[]): CombatEvent[] {
  return log.flatMap((entry) => entry.events);
}

function uses(log: readonly CombatLogEntry[]): CombatEvent[] {
  return events(log).filter((event) => event.kind === "skill-used");
}

describe("skill-used (#1735)", () => {
  it("is logged once, first in its entry, for a use that went off, at its target", () => {
    const sim = match([GLOWING_SIGNET]);
    sim.setTarget("c", "f");
    expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
    const log = stepFor(sim, 1);
    expect(uses(log)).toEqual([
      { kind: "skill-used", casterId: "c", skillId: GLOWING_SIGNET, targetId: "f" },
    ]);
    expect(log.find((entry) => entry.skillId === GLOWING_SIGNET)?.events[0]?.kind).toBe(
      "skill-used",
    );
  });

  it("names no target for a skill on its own user", () => {
    const sim = match([SIGNET_OF_AGGRESSION]);
    sim.requestSkill("c", 0);
    expect(uses(stepFor(sim, 2))).toEqual([
      { kind: "skill-used", casterId: "c", skillId: SIGNET_OF_AGGRESSION, targetId: undefined },
    ]);
  });

  it("is not logged for a press refused", () => {
    const sim = match([GLOWING_SIGNET]);
    sim.setTarget("c", "f");
    sim.requestSkill("c", 0);
    stepFor(sim, 1);
    // Recharging: refused.
    expect(sim.requestSkill("c", 0)?.check.ok).toBe(false);
    expect(uses(stepFor(sim, 1))).toEqual([]);
  });

  it("is not logged for a cast interrupted", () => {
    const sim = match([HEALING_BREEZE], {}, [LEECH_SIGNET]);
    sim.requestSkill("c", 0);
    sim.setTarget("f", "c");
    expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
    const log = stepFor(sim, 3);
    expect(
      events(log).some((event) => event.kind === "interrupted" && event.targetId === "c"),
    ).toBe(true);
    expect(
      uses(log).filter((event) => event.kind === "skill-used" && event.casterId === "c"),
    ).toEqual([]);
  });
});

describe("adrenaline-gained (#1735)", () => {
  it("names the skill that gave it", () => {
    const sim = match([SIGNET_OF_AGGRESSION, GO_FOR_THE_EYES]);
    get(sim, "c").combatant.statuses.apply("fall-back", 30, "c");
    sim.requestSkill("c", 0);
    expect(events(stepFor(sim, 2)).filter((event) => event.kind === "adrenaline-gained")).toEqual([
      { kind: "adrenaline-gained", targetId: "c", strikes: 2, skillId: SIGNET_OF_AGGRESSION },
    ]);
  });

  it("names no skill for a weapon's blow, in the swing's own entry", () => {
    const sim = match([GO_FOR_THE_EYES], { equipment: SWORD });
    sim.requestAttack("c", "f");
    const swings = stepFor(sim, 3).filter((entry) => entry.cause === "weapon");
    const gained = events(swings).filter((event) => event.kind === "adrenaline-gained");
    expect(gained.length).toBeGreaterThan(0);
    expect(gained[0]).toEqual({
      kind: "adrenaline-gained",
      targetId: "c",
      strikes: 1,
      skillId: undefined,
    });
  });

  it("is not logged for someone with no adrenaline skill", () => {
    const sim = match([], { equipment: SWORD });
    sim.requestAttack("c", "f");
    const log = stepFor(sim, 3);
    expect(events(log).some((event) => event.kind === "damage" && event.targetId === "f")).toBe(
      true,
    );
    expect(events(log).filter((event) => event.kind === "adrenaline-gained")).toEqual([]);
  });
});

describe("effect-skipped (#1735)", () => {
  function glowingSignet(burning: boolean): CombatEvent[] {
    const sim = match([GLOWING_SIGNET]);
    get(sim, "c").combatant.energy = 100;
    if (burning) {
      get(sim, "f").combatant.statuses.apply("burning", 10, "x");
    }
    sim.setTarget("c", "f");
    sim.requestSkill("c", 0);
    return events(stepFor(sim, 1)).filter((event) => event.kind === "effect-skipped");
  }

  it("Glowing Signet on a foe not Burning: skipped, and why", () => {
    expect(glowingSignet(false)).toEqual([
      {
        kind: "effect-skipped",
        casterId: "c",
        skillId: GLOWING_SIGNET,
        targetId: "f",
        condition: { kind: "target-has-status", statusId: "burning" },
      },
    ]);
  });

  it("Glowing Signet on a Burning foe: not skipped", () => {
    expect(glowingSignet(true)).toEqual([]);
  });

  it("Signet of Aggression under a shout did something: not skipped", () => {
    const sim = match([SIGNET_OF_AGGRESSION, GO_FOR_THE_EYES]);
    get(sim, "c").combatant.statuses.apply("fall-back", 30, "c");
    sim.requestSkill("c", 0);
    expect(events(stepFor(sim, 2)).some((event) => event.kind === "effect-skipped")).toBe(false);
  });
});
