import { describe, expect, it } from "vitest";

import { vec2 } from "../../vec2.js";
import { createCursor, decide, type Behaviour } from "../behaviour.js";
import type { MatchSimulation, Participant, ParticipantSpec } from "../simulation.js";
import { roleOf } from "./role.js";
import { energyReserve } from "./rules/shared.js";
import { MONK, WARRIOR, askBot, contextFor, fighter, match } from "./rules/test-support.js";

const ORISON = "monk.orison-of-healing";
const BANISH = "monk.banish";
const PROTECTIVE_SPIRIT = "monk.protective-spirit";

/**
 * The healer "monk" at (400, 400) holding `skillBar` with `energy`, an
 * idle "ally" at `allyHealth`, and an idle "foe" in spell range.
 */
function field(
  skillBar: readonly string[],
  energy: number,
  allyHealth = 1,
  extra: Partial<ParticipantSpec> = {},
): MatchSimulation {
  const sim = match([
    fighter("monk", 0, MONK, vec2(400, 400), { skillBar: [...skillBar], ...extra }),
    fighter("ally", 0, WARRIOR, vec2(480, 400), {
      behaviour: undefined,
      startHealthFraction: allyHealth,
    }),
    fighter("foe", 1, WARRIOR, vec2(600, 400), { behaviour: undefined }),
  ]);
  who(sim, "monk").combatant.energy = energy;
  return sim;
}

/** `BOT`, firing its damage without waiting for a teammate's spike. */
const NO_SPIKE_HOLD: Behaviour = {
  kind: "play-build",
  reaction: { minSeconds: 0.25, maxSeconds: 0.25 },
  spikeHold: false,
};

/** The monk's pick with no teammate to spike with: its damage goes out at once. */
function fights(sim: MatchSimulation) {
  return decide(NO_SPIKE_HOLD, createCursor(), contextFor(sim, "monk"));
}

function who(sim: MatchSimulation, id: string): Participant {
  const one = sim.get(id);
  if (one === undefined) throw new Error(`no ${id}`);
  return one;
}

describe("a healer's Energy reserve (#4275)", () => {
  it("holds an offensive spell that would leave it below its cheapest heal", () => {
    const sim = field([ORISON, PROTECTIVE_SPIRIT, BANISH], 8);
    expect(roleOf(who(sim, "monk"))).toBe("healer");
    expect(energyReserve(who(sim, "monk"))).toBe(5);
    expect(fights(sim).useSkillId).toBeUndefined();
    expect(fights(field([ORISON, PROTECTIVE_SPIRIT, BANISH], 20))).toMatchObject({
      useSkillId: BANISH,
      targetId: "foe",
    });
  });

  it("tops up an ally only above the reserve, but heals one in real danger", () => {
    expect(askBot(field([ORISON, PROTECTIVE_SPIRIT], 6, 0.55), "monk").useSkillId).toBeUndefined();
    expect(askBot(field([ORISON, PROTECTIVE_SPIRIT], 20, 0.55), "monk")).toMatchObject({
      useSkillId: ORISON,
      targetId: "ally",
    });
    expect(askBot(field([ORISON, PROTECTIVE_SPIRIT], 6, 0.35), "monk")).toMatchObject({
      useSkillId: ORISON,
      targetId: "ally",
    });
  });

  it("protects a spiked ally below the reserve", () => {
    const sim = match([
      fighter("monk", 0, MONK, vec2(400, 400), { skillBar: [ORISON, PROTECTIVE_SPIRIT] }),
      fighter("ally", 0, WARRIOR, vec2(480, 400), { behaviour: undefined }),
      fighter("foe0", 1, WARRIOR, vec2(700, 300), { behaviour: undefined }),
      fighter("foe1", 1, WARRIOR, vec2(700, 500), { behaviour: undefined }),
    ]);
    who(sim, "monk").combatant.energy = 12;
    who(sim, "foe0").targetId = "ally";
    who(sim, "foe1").targetId = "ally";
    expect(askBot(sim, "monk")).toMatchObject({ useSkillId: PROTECTIVE_SPIRIT, targetId: "ally" });
  });

  it("keeps none for a bot that is not the healer", () => {
    const sim = match([
      fighter("w", 0, WARRIOR, vec2(400, 400), { skillBar: ["warrior.power-attack", ORISON] }),
      fighter("ally", 0, WARRIOR, vec2(480, 400), {
        behaviour: undefined,
        startHealthFraction: 0.55,
      }),
    ]);
    const warrior = who(sim, "w");
    expect(roleOf(warrior)).not.toBe("healer");
    warrior.combatant.energy = 6;
    expect(askBot(sim, "w")).toMatchObject({ useSkillId: ORISON, targetId: "ally" });
  });

  it("is 0 with no heal or protection on the bar", () => {
    expect(energyReserve(who(field([BANISH], 20), "monk"))).toBe(0);
  });

  it("is clamped so a healer at full Energy can still meet it", () => {
    const sim = field([PROTECTIVE_SPIRIT], 12, 1, { maxEnergy: 12 });
    expect(energyReserve(who(sim, "monk"))).toBe(2);
  });
});
