import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../../distances.js";
import { getSkill } from "../../skills/catalog.js";
import { NO_RANKS, type StatusId } from "../../skills/status.js";
import { vec2 } from "../../vec2.js";
import { createCursor, decide } from "../behaviour.js";
import type { MatchSimulation } from "../simulation.js";
import { BLOCK_SWAP_CHANCE, blockChanceAgainst } from "./block-swap.js";
import {
  BOT,
  DT,
  RANGER,
  WARRIOR,
  askBot,
  contextFor,
  fighter,
  match,
} from "./rules/test-support.js";

const POWER_ATTACK = "warrior.power-attack";
const PURE_STRIKE = "warrior.pure-strike";
const EMPATHY = "mesmer.empathy";

/**
 * Bot `id` of `build` with `skillBar` facing two foes in reach: "blocker",
 * the weaker so the team's target, and "other". Neither foe is a bot.
 */
function duel(build = WARRIOR, skillBar: string[] = [], otherAt = vec2(470, 440)): MatchSimulation {
  const sim = match([
    fighter("bot", 0, build, vec2(400, 400), { skillBar }),
    fighter("blocker", 1, WARRIOR, vec2(460, 400), { behaviour: undefined, skillBar: [] }),
    fighter("other", 1, WARRIOR, otherAt, { behaviour: undefined, skillBar: [] }),
  ]);
  const blocker = sim.get("blocker")?.combatant;
  if (blocker !== undefined) blocker.health = blocker.maxHealth * 0.6;
  return sim;
}

function stance(sim: MatchSimulation, statusId: StatusId): void {
  sim.get("blocker")?.combatant.statuses.apply(statusId, 10, "blocker", NO_RANKS);
}

describe("a bot attacker off a blocking foe (#4204)", () => {
  it("swings at the other foe in reach while its target blocks, and back once the block ends", () => {
    const sim = duel();
    expect(askBot(sim, "bot")).toMatchObject({ targetId: "blocker", attackTargetId: "blocker" });
    stance(sim, "bonettis-defense");
    // It still targets the team's target: a later bot's target does not follow its swing.
    expect(askBot(sim, "bot")).toMatchObject({ targetId: "blocker", attackTargetId: "other" });
    sim.get("blocker")?.combatant.statuses.remove("bonettis-defense");
    expect(askBot(sim, "bot")).toMatchObject({ targetId: "blocker", attackTargetId: "blocker" });
  });

  it("keeps hitting the blocker with no other foe in spell range", () => {
    const sim = duel(WARRIOR, [], vec2(400 + RANGE_SPELL + 200, 400));
    stance(sim, "bonettis-defense");
    expect(askBot(sim, "bot").attackTargetId).toBe("blocker");
  });

  it("swaps a melee bot off a melee-only block, never a bow bot", () => {
    const melee = duel();
    stance(melee, "riposte");
    expect(askBot(melee, "bot").attackTargetId).toBe("other");
    const bow = duel(RANGER, []);
    stance(bow, "riposte");
    expect(askBot(bow, "bot").attackTargetId).toBe("blocker");
  });

  it("swaps an attack skill off a block of attack skills only, never a plain swing", () => {
    const swing = duel();
    stance(swing, "burning-shield");
    expect(askBot(swing, "bot").attackTargetId).toBe("blocker");
    const skill = duel(WARRIOR, [POWER_ATTACK]);
    stance(skill, "burning-shield");
    expect(askBot(skill, "bot")).toMatchObject({ useSkillId: POWER_ATTACK, targetId: "other" });
  });

  it("keeps an attack skill on the blocker while it cannot be blocked", () => {
    const sim = duel(WARRIOR, [PURE_STRIKE]);
    stance(sim, "bonettis-defense");
    expect(askBot(sim, "bot")).toMatchObject({ useSkillId: PURE_STRIKE, targetId: "blocker" });
  });

  it("holds a human's call on the blocker", () => {
    const sim = duel();
    stance(sim, "bonettis-defense");
    const intent = decide(
      BOT,
      createCursor(),
      contextFor(sim, "bot", { calledTargetId: "blocker" }),
    );
    expect(intent).toMatchObject({ targetId: "blocker", attackTargetId: "blocker" });
  });

  it("casts its hex at the team's target and shoots the other foe", () => {
    const sim = duel(RANGER, [EMPATHY]);
    stance(sim, "bonettis-defense");
    expect(askBot(sim, "bot")).toMatchObject({ useSkillId: EMPATHY, targetId: "blocker" });
    const shooting = duel(RANGER);
    stance(shooting, "bonettis-defense");
    expect(askBot(shooting, "bot")).toMatchObject({ targetId: "blocker", attackTargetId: "other" });
  });

  it("reads no block on a knocked-down foe, and the bar's threshold", () => {
    const sim = duel();
    stance(sim, "bonettis-defense");
    const [bot, blocker] = [sim.get("bot"), sim.get("blocker")];
    if (bot === undefined || blocker === undefined) throw new Error("no bodies");
    expect(blockChanceAgainst(bot, blocker, undefined, new Map())).toBeGreaterThanOrEqual(
      BLOCK_SWAP_CHANCE,
    );
    blocker.combatant.knockdownRemaining = 2;
    expect(blockChanceAgainst(bot, blocker, getSkill(POWER_ATTACK), new Map())).toBe(0);
  });

  it("lands its blows on the other foe in the match while the stance holds", () => {
    const sim = duel();
    stance(sim, "bonettis-defense");
    const health = (id: string) => sim.get(id)?.combatant.health ?? 0;
    const [blocker, other] = [health("blocker"), health("other")];
    for (let t = 0; t < 5; t += DT) sim.step(DT);
    expect(health("other")).toBeLessThan(other);
    expect(health("blocker")).toBeGreaterThanOrEqual(blocker);
  });
});
