import { describe, expect, it } from "vitest";

import { getSkill } from "../../../skills/catalog.js";
import { vec2 } from "../../../vec2.js";
import type { MatchSimulation } from "../../simulation.js";
import { type ParticipantSpec } from "../../simulation.js";
import { onlyInterrupts } from "../skill-intent.js";
import { botRoll, INTERRUPT_CHANCE } from "./shared.js";
import {
  CONTEXT_SEED,
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

    it("never on a plain blow (#2633), however far into it", () => {
      for (const elapsed of [0.2, 1.2]) {
        const sim = interrupter([BLOW], swinger());
        swinging(sim, elapsed);
        expect(askBot(sim, "bot").useSkillId).toBeUndefined();
      }
    });

    it("on a foe swinging an attack skill (#2633)", () => {
      const sim = interrupter([BLOW], swinger("busy"));
      sim.get("busy")?.combatant.cast.beginCast("warrior.power-attack", "bot", 2, undefined);
      expect(askBot(sim, "bot")).toMatchObject({ targetId: "busy", useSkillId: BLOW });
    });

    it("keeps it for a caster over a swinger in the same think", () => {
      const sim = interrupter(
        [BLOW],
        swinger(),
        fighter("elementalist", 1, ELEMENTALIST, vec2(400, 440), { behaviour: undefined }),
      );
      swinging(sim, 0.2);
      sim.setTarget("elementalist", "bot");
      sim.requestSkill("elementalist", slotOf(ELEMENTALIST, "elementalist.chain-lightning"));
      expect(askBot(sim, "bot")).toMatchObject({ targetId: "elementalist", useSkillId: BLOW });
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

describe("Complicate's crowd (#2165)", () => {
  const COMPLICATE = "mesmer.complicate";

  it("interrupts the casting foe with another foe in its area over a lone one", () => {
    const sim = match([
      fighter("bot", 0, WARRIOR, vec2(400, 400), { behaviour: undefined, skillBar: [COMPLICATE] }),
      fighter("solo", 1, ELEMENTALIST, vec2(700, 400), { behaviour: undefined }),
      fighter("busy", 1, ELEMENTALIST, vec2(400, 700), { behaviour: undefined }),
      fighter("beside", 1, ELEMENTALIST, vec2(460, 700), { behaviour: undefined }),
    ]);
    for (const id of ["solo", "busy"]) {
      sim.setTarget(id, "bot");
      sim.requestSkill(id, slotOf(ELEMENTALIST, "elementalist.chain-lightning"));
    }
    expect(askBot(sim, "bot")).toMatchObject({ targetId: "busy", useSkillId: COMPLICATE });
  });

  it("with nobody beside either, takes the first casting foe as before", () => {
    const sim = match([
      fighter("bot", 0, WARRIOR, vec2(400, 400), { behaviour: undefined, skillBar: [COMPLICATE] }),
      fighter("solo", 1, ELEMENTALIST, vec2(700, 400), { behaviour: undefined }),
      fighter("busy", 1, ELEMENTALIST, vec2(400, 700), { behaviour: undefined }),
    ]);
    for (const id of ["solo", "busy"]) {
      sim.setTarget(id, "bot");
      sim.requestSkill(id, slotOf(ELEMENTALIST, "elementalist.chain-lightning"));
    }
    expect(askBot(sim, "bot")).toMatchObject({ targetId: "solo", useSkillId: COMPLICATE });
  });
});

describe("which casts are worth an interrupt (#2633)", () => {
  const BLOW = "warrior.distracting-blow";
  const POWER_DRAIN = "mesmer.power-drain";
  const HEAL = "monk.orison-of-healing";
  const HEX = "necromancer.faintheartedness";
  const REZ = "monk.restore-life";

  /*
   * Each foe's first cast rolls `botRoll(CONTEXT_SEED, 0, "bot>" + id)`:
   * "healer", "hexer", "reviver" and "busy" are under INTERRUPT_CHANCE,
   * "mage" over it.
   */
  it("the foes' ids roll as the tests assume", () => {
    const rolled = (foe: string) => botRoll(CONTEXT_SEED, 0, `bot>${foe}`) < INTERRUPT_CHANCE;
    expect(["healer", "hexer", "reviver", "busy"].map(rolled)).toEqual([true, true, true, true]);
    expect(rolled("mage")).toBe(false);
  });

  /** A bot holding `skillBar` beside a still foe for each id. */
  function interrupter(skillBar: readonly string[], ...ids: string[]) {
    return match([
      fighter("bot", 0, WARRIOR, vec2(400, 400), { behaviour: undefined, skillBar }),
      ...ids.map((id, index) =>
        fighter(id, 1, ELEMENTALIST, vec2(440, 400 + 40 * index), {
          behaviour: undefined,
          maxHealth: 1e6,
        }),
      ),
    ]);
  }
  /** `id` begins a 2 s cast of `skillId`. */
  function casting(sim: MatchSimulation, id: string, skillId: string) {
    sim.get(id)?.combatant.cast.beginCast(skillId, undefined, 2, undefined);
  }

  it("a heal over a hex, both beatable", () => {
    const sim = interrupter([BLOW], "hexer", "healer");
    casting(sim, "hexer", HEX);
    casting(sim, "healer", HEAL);
    expect(askBot(sim, "bot")).toMatchObject({ targetId: "healer", useSkillId: BLOW });
  });

  it("never a spell that neither heals, protects, revives, is elite nor hits", () => {
    const sim = interrupter([BLOW], "hexer");
    casting(sim, "hexer", HEX);
    expect(askBot(sim, "bot").useSkillId).toBeUndefined();
  });

  it("a resurrection over a heal", () => {
    const sim = interrupter([BLOW], "healer", "reviver");
    casting(sim, "healer", HEAL);
    casting(sim, "reviver", REZ);
    expect(askBot(sim, "bot")).toMatchObject({ targetId: "reviver", useSkillId: BLOW });
  });

  it("at rank 0 too: a Power Drain with no Domination Magic picks the heal", () => {
    const sim = interrupter([POWER_DRAIN], "hexer", "healer");
    casting(sim, "hexer", HEX);
    casting(sim, "healer", HEAL);
    expect(askBot(sim, "bot")).toMatchObject({ targetId: "healer", useSkillId: POWER_DRAIN });
  });

  it("a cast whose roll fails it leaves alone, on every think", () => {
    const sim = interrupter([BLOW], "mage");
    casting(sim, "mage", HEAL);
    expect(askBot(sim, "bot").useSkillId).toBeUndefined();
    sim.step(DT);
    expect(sim.get("mage")?.combatant.cast.isCasting).toBe(true);
    expect(askBot(sim, "bot").useSkillId).toBeUndefined();
  });

  it("tries about INTERRUPT_CHANCE of 200 heals", () => {
    const sim = interrupter([BLOW], "healer");
    let tried = 0;
    for (let cast = 0; cast < 200; cast += 1) {
      casting(sim, "healer", HEAL);
      if (askBot(sim, "bot").useSkillId === BLOW) tried += 1;
    }
    expect(tried / 200).toBeGreaterThanOrEqual(0.65);
    expect(tried / 200).toBeLessThanOrEqual(0.85);
  });
});
