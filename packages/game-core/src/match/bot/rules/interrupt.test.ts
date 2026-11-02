import { describe, expect, it } from "vitest";

import { getSkill } from "../../../skills/catalog.js";
import { vec2 } from "../../../vec2.js";
import type { MatchSimulation } from "../../simulation.js";
import { type ParticipantSpec } from "../../simulation.js";
import { onlyInterrupts } from "../skill-intent.js";
import {
  DT,
  ELEMENTALIST,
  RANGER,
  WARRIOR,
  askBot,
  fighter,
  match,
  skillsUsed,
  slotOf,
} from "./test-support.js";

describe("play-build interrupts (#1189, #1713)", () => {
  it("holds an interrupt with no foe casting", () => {
    const sim = match([
      fighter("ranger", 0, RANGER, vec2(400, 400)),
      fighter("foe", 1, WARRIOR, vec2(700, 400), { behaviour: undefined, maxHealth: 1e6 }),
    ]);
    const used = skillsUsed(sim, "ranger", 20);
    expect(used.length).toBeGreaterThan(0);
    expect(used).not.toContain("mesmer.power-drain");
  });

  it("interrupts a 2 s cast, and not one with 0.1 s left", () => {
    const sim = match([
      fighter("ranger", 0, RANGER, vec2(400, 400), { behaviour: undefined }),
      fighter("foe", 1, ELEMENTALIST, vec2(700, 400), { behaviour: undefined }),
    ]);
    sim.setTarget("foe", "ranger");
    sim.requestSkill("foe", slotOf(ELEMENTALIST, "elementalist.chain-lightning"));
    expect(sim.get("foe")?.combatant.cast.activeCast?.remainingSeconds).toBe(2);
    const early = askBot(sim, "ranger");
    expect(early).toMatchObject({ targetId: "foe", useSkillId: "ranger.savage-shot" });

    while ((sim.get("foe")?.combatant.cast.activeCast?.remainingSeconds ?? 0) > 0.1) {
      sim.step(DT);
    }
    expect(sim.get("foe")?.combatant.cast.isCasting).toBe(true);
    const late = getSkill(askBot(sim, "ranger").useSkillId ?? "");
    expect(late === undefined || !onlyInterrupts(late)).toBe(true);
  });

  describe("interrupting a plain swing (#1713)", () => {
    const BLOW = "warrior.distracting-blow";
    const POWER_DRAIN = "mesmer.power-drain";

    /** A bot holding `skillBar` beside a still, unarmed-by-bot foe or two. */
    function interrupter(skillBar: readonly string[], ...foes: ParticipantSpec[]) {
      return match([
        fighter("bot", 0, WARRIOR, vec2(400, 400), { behaviour: undefined, skillBar }),
        ...foes,
      ]);
    }
    const swinger = (id = "foe") =>
      fighter(id, 1, WARRIOR, vec2(440, 400), { behaviour: undefined, maxHealth: 1e6 });
    /** `id` `elapsed` seconds into a swing at the bot. */
    function swinging(sim: MatchSimulation, elapsed: number, id = "foe") {
      const foe = sim.get(id)?.combatant;
      if (foe === undefined) throw new Error(`no ${id}`);
      foe.attack = { targetId: "bot", swingElapsed: elapsed, unreachableSeconds: 0 };
      return foe;
    }

    it("uses an interrupt of an action on a foe mid-swing", () => {
      const sim = interrupter([BLOW], swinger());
      swinging(sim, 0.2);
      expect(askBot(sim, "bot")).toMatchObject({ targetId: "foe", useSkillId: BLOW });
    });

    it("not on a foe walking to its target, nor on a swing nearly done", () => {
      const walking = interrupter([BLOW], swinger());
      swinging(walking, 0.2).moving = true;
      expect(askBot(walking, "bot").useSkillId).toBeUndefined();

      const late = interrupter([BLOW], swinger());
      swinging(late, 1.2);
      expect(askBot(late, "bot").useSkillId).toBeUndefined();
    });

    it("keeps it for a caster over a swinger in the same think", () => {
      const sim = interrupter(
        [BLOW],
        swinger(),
        fighter("caster", 1, ELEMENTALIST, vec2(400, 440), { behaviour: undefined }),
      );
      swinging(sim, 0.2);
      sim.setTarget("caster", "bot");
      sim.requestSkill("caster", slotOf(ELEMENTALIST, "elementalist.chain-lightning"));
      expect(askBot(sim, "bot")).toMatchObject({ targetId: "caster", useSkillId: BLOW });
    });

    it("never fires a spell interrupt at a signet cast nor at a swing", () => {
      const signet = interrupter([POWER_DRAIN], swinger());
      signet
        .get("foe")
        ?.combatant.cast.beginCast("warrior.healing-signet", undefined, 2, undefined);
      expect(askBot(signet, "bot").useSkillId).toBeUndefined();

      const swing = interrupter([POWER_DRAIN], swinger());
      swinging(swing, 0.2);
      expect(askBot(swing, "bot").useSkillId).toBeUndefined();
    });
  });
});
