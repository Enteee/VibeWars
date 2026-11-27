import { describe, expect, it } from "vitest";

import { NO_RANKS, type StatusId } from "../../skills/status.js";
import { vec2 } from "../../vec2.js";
import { createCursor, decide, type BehaviourContext } from "../behaviour.js";
import type { MatchSimulation, ParticipantSpec } from "../simulation.js";
import { BOT, RANGER, WARRIOR, contextFor, fighter, match } from "./rules/test-support.js";

/** A bar of `skills`, the rest empty. */
const bar = (...skills: string[]) => [...skills, ...Array<null>(8 - skills.length).fill(null)];

/**
 * Team 0: the bot `self` at (400, 400). Team 1: the warrior `t` at
 * (440, 400), hurt so it is the team's target, and the warrior `o` at
 * (470, 440) unless `alone`.
 */
function field(self: ParticipantSpec, alone = false): MatchSimulation {
  const sim = match([
    self,
    fighter("t", 1, WARRIOR, vec2(440, 400), { skillBar: bar() }),
    ...(alone ? [] : [fighter("o", 1, WARRIOR, vec2(470, 440), { skillBar: bar() })]),
  ]);
  const target = sim.get("t")?.combatant;
  if (target === undefined) throw new Error("no t");
  target.health = target.maxHealth * 0.8;
  return sim;
}

const warrior = (...skills: string[]) =>
  fighter("w", 0, WARRIOR, vec2(400, 400), { skillBar: bar(...skills) });
const ranger = (...skills: string[]) =>
  fighter("r", 0, RANGER, vec2(400, 400), { skillBar: bar(...skills) });

function blocks(sim: MatchSimulation, statusId: StatusId) {
  sim.get("t")?.combatant.statuses.apply(statusId, 10, "t", NO_RANKS);
}

function ask(sim: MatchSimulation, id: string, extra: Partial<BehaviourContext> = {}) {
  return decide(BOT, createCursor(), contextFor(sim, id, extra));
}

describe("block swap (#4204)", () => {
  it("swings at the other foe in range while the target blocks 75%, and back once it ends", () => {
    const sim = field(warrior());
    expect(ask(sim, "w").attackTargetId).toBe("t");
    blocks(sim, "bonettis-defense");
    const swapped = ask(sim, "w");
    expect(swapped.attackTargetId).toBe("o");
    // A teammate's target follows the swap (`heldTarget`): pinned, not a bug.
    expect(swapped.targetId).toBe("o");
    sim.get("t")?.combatant.statuses.clear();
    expect(ask(sim, "w").attackTargetId).toBe("t");
  });

  it("keeps hitting the blocker with no other foe in range", () => {
    const sim = field(warrior(), true);
    blocks(sim, "bonettis-defense");
    expect(ask(sim, "w").attackTargetId).toBe("t");
  });

  it("swaps a melee bot off a melee-only block, but not a bow bot", () => {
    const melee = field(warrior());
    blocks(melee, "riposte");
    expect(ask(melee, "w").attackTargetId).toBe("o");
    const bow = field(ranger());
    blocks(bow, "riposte");
    expect(ask(bow, "r").attackTargetId).toBe("t");
  });

  it("swings at a block of attack skills only, but takes an attack skill elsewhere", () => {
    const swing = field(warrior());
    blocks(swing, "wary-stance");
    expect(ask(swing, "w").attackTargetId).toBe("t");
    const skill = field(warrior("warrior.power-attack"));
    blocks(skill, "wary-stance");
    const intent = ask(skill, "w");
    expect(intent.useSkillId).toBe("warrior.power-attack");
    expect(intent.targetId).toBe("o");
  });

  it("keeps an attack skill that is unblockable now on the blocker", () => {
    const sim = field(warrior("warrior.pure-strike"));
    blocks(sim, "bonettis-defense");
    const intent = ask(sim, "w");
    expect(intent.useSkillId).toBe("warrior.pure-strike");
    expect(intent.targetId).toBe("t");
  });

  it("never swaps off a human's call", () => {
    const sim = field(warrior());
    blocks(sim, "bonettis-defense");
    expect(ask(sim, "w", { calledTargetId: "t" }).attackTargetId).toBe("t");
  });

  it("casts its spells at the team's target and shoots the other foe", () => {
    const sim = field(ranger("elementalist.flare"));
    blocks(sim, "bonettis-defense");
    const intent = ask(sim, "r");
    expect(intent.useSkillId).toBe("elementalist.flare");
    expect(intent.targetId).toBe("t");
    // Flare recharging: the bow.
    const recharging = ask(sim, "r", {
      check: (skillId) =>
        skillId === "elementalist.flare" ? { ok: false, reason: "still-recharging" } : { ok: true },
    });
    expect(recharging.useSkillId).toBeUndefined();
    expect(recharging.attackTargetId).toBe("o");
  });
});
