import { describe, expect, it } from "vitest";

import { NO_RANKS } from "../../../skills/status.js";
import { distance, vec2, type Vec2 } from "../../../vec2.js";
import { createCursor } from "../../behaviour.js";
import type { MatchSimulation } from "../../simulation.js";
import { KITE_REST_SECONDS } from "./kite.js";
import { KITE_DISTANCE } from "./shared.js";
import {
  BOT,
  DT,
  ELEMENTALIST,
  RANGER,
  WARRIOR,
  askBot,
  body,
  fighter,
  match,
} from "./test-support.js";

describe("play-build fights (#1189, #1193, #1965)", () => {
  it("steps away from a melee foe at its elbow and shoots it, or by a wall stands and shoots, however fast it thinks (#2545)", () => {
    // By the field's left edge, and in the middle of it.
    for (const x of [10, 800]) {
      for (const thinkSeconds of [0, 0.25]) {
        const sim = match([
          // No skills: only the bow can do the damage.
          fighter("ranger", 0, RANGER, vec2(x, 400), {
            behaviour: { kind: "play-build", thinkSeconds },
            skillBar: [],
          }),
          fighter("foe", 1, WARRIOR, vec2(x + 40, 400), { behaviour: undefined, maxHealth: 1e6 }),
        ]);
        let hits = 0;
        let stood: Vec2 | undefined;
        // Its step away (#2545) costs it half a second of shooting.
        for (let t = 0; t < 12; t += DT) {
          for (const entry of sim.step(DT).log) {
            if (entry.sourceId === "ranger" && entry.weaponId !== undefined) {
              hits += entry.events.filter(
                (event) => event.kind === "damage" && event.targetId === "foe",
              ).length;
            }
          }
          // Where it stands once the field's edge has placed it.
          stood ??= { ...(sim.get("ranger")?.position ?? vec2(Number.NaN, Number.NaN)) };
        }
        const label = `x ${String(x)}, thinkSeconds ${String(thinkSeconds)}`;
        expect(hits, label).toBeGreaterThan(3);
        const ranger = sim.get("ranger")?.position ?? vec2(Number.NaN, Number.NaN);
        if (x === 10) {
          // Cornered: it never leaves.
          expect(ranger, label).toEqual(stood);
        } else {
          expect(distance(ranger, vec2(x + 40, 400)), label).toBeGreaterThan(KITE_DISTANCE);
        }
      }
    }
  });

  it("picks one foe for the team: the lowest health fraction", () => {
    const sim = match([
      fighter("a", 0, ELEMENTALIST, vec2(400, 400)),
      fighter("b", 0, ELEMENTALIST, vec2(400, 460)),
      fighter("whole", 1, WARRIOR, vec2(700, 400), { behaviour: undefined }),
      fighter("hurt", 1, WARRIOR, vec2(700, 600), {
        behaviour: undefined,
        startHealthFraction: 0.7,
      }),
    ]);
    sim.step(DT);
    expect(sim.get("a")?.targetId).toBe("hurt");
    expect(sim.get("b")?.targetId).toBe("hurt");
  });

  it("fights the foe its team called over the most hurt one, and drops the call when it dies (#1193)", () => {
    const sim = match([
      fighter("a", 0, ELEMENTALIST, vec2(400, 400)),
      fighter("b", 0, ELEMENTALIST, vec2(400, 460)),
      fighter("called", 1, WARRIOR, vec2(700, 400), { behaviour: undefined, maxHealth: 1 }),
      fighter("hurt", 1, WARRIOR, vec2(700, 600), {
        behaviour: undefined,
        startHealthFraction: 0.7,
      }),
    ]);
    sim.setCalledTarget(0, "called");
    sim.step(DT);
    expect(sim.get("a")?.targetId).toBe("called");
    expect(sim.get("b")?.targetId).toBe("called");
    for (let t = 0; t < 10 && sim.get("called")?.combatant.dead === false; t += DT) sim.step(DT);
    expect(sim.get("called")?.combatant.dead).toBe(true);
    for (let t = 0; t < 5; t += DT) sim.step(DT);
    expect(sim.get("a")?.targetId).toBe("hurt");
    expect(sim.get("b")?.targetId).toBe("hurt");
  });

  it("casts Mirrored Stance only on a foe with a stance on its bar", () => {
    const at = (foeBar: readonly string[]) =>
      match([
        body("a", 0, vec2(0, 0), { behaviour: BOT, skillBar: ["assassin.mirrored-stance"] }),
        body("foe", 1, vec2(300, 0), { skillBar: foeBar }),
      ]);
    expect(askBot(at(["assassin.dash"]), "a")).toMatchObject({
      targetId: "foe",
      useSkillId: "assassin.mirrored-stance",
    });
    expect(askBot(at(["monk.word-of-healing"]), "a").useSkillId).toBeUndefined();
  });

  it("Signet of Midnight only at a melee foe attacking at its elbow, never with attacks of its own (#2132)", () => {
    const MIDNIGHT = "mesmer.signet-of-midnight";
    const at = (skillBar: string[], foeX: number, attacking: boolean) => {
      const sim = match([
        fighter("m", 0, ELEMENTALIST, vec2(400, 400), { skillBar }),
        fighter("foe", 1, WARRIOR, vec2(foeX, 400), { behaviour: undefined }),
      ]);
      const foe = sim.get("foe");
      if (foe !== undefined && attacking) {
        foe.combatant.attack = { targetId: "m", swingElapsed: 0.1, unreachableSeconds: 0 };
      }
      // Resting from a kite (#2545): a foe at its elbow is one to fight.
      return askBot(sim, "m", { ...createCursor(), kiteSeconds: KITE_REST_SECONDS });
    };
    expect(at([MIDNIGHT], 430, true)).toMatchObject({ useSkillId: MIDNIGHT, targetId: "foe" });
    expect(at([MIDNIGHT], 430, false).useSkillId).toBeUndefined();
    expect(at([MIDNIGHT], 700, true).useSkillId).toBeUndefined();
    expect(at([MIDNIGHT, "warrior.sever-artery"], 430, true).useSkillId).not.toBe(MIDNIGHT);
  });

  it("shouts one that only acts on a state only while it holds (#2096)", () => {
    const at = (bar: readonly string[], foeFraction: number, corpse: boolean) => {
      const sim = match([
        body("a", 0, vec2(0, 0), { behaviour: BOT, skillBar: [...bar] }),
        body("dead", 0, vec2(0, 200)),
        body("foe", 1, vec2(300, 0)),
      ]);
      const foe = sim.get("foe")?.combatant;
      const dead = sim.get("dead")?.combatant;
      if (foe === undefined || dead === undefined) throw new Error("no bodies");
      foe.health = foe.maxHealth * foeFraction;
      dead.dead = corpse;
      return sim;
    };
    const youWillDie = ["warrior.you-will-die"];
    expect(askBot(at(youWillDie, 0.89, false), "a").useSkillId).toBe("warrior.you-will-die");
    expect(askBot(at(youWillDie, 1, false), "a").useSkillId).toBeUndefined();
    expect(askBot(at(["warrior.retreat"], 1, true), "a")).toMatchObject({
      targetId: "a",
      useSkillId: "warrior.retreat",
    });
    expect(askBot(at(["warrior.retreat"], 1, false), "a").useSkillId).toBeUndefined();
  });

  it("holding Protector's Defense, stands rather than walk to a foe out of reach (#2096)", () => {
    const sim = match([
      body("a", 0, vec2(0, 0), { behaviour: BOT, skillBar: [] }),
      body("foe", 1, vec2(300, 0)),
    ]);
    sim.get("a")?.combatant.statuses.apply("protectors-defense", 7, "a", NO_RANKS);
    expect(askBot(sim, "a")).toMatchObject({
      targetId: "foe",
      moveTo: undefined,
      attackTargetId: undefined,
    });
  });
});

describe("play-build's Ranger attacks (#2159)", () => {
  const OATH = "ranger.oath-shot";
  const SCREAM = "ranger.screaming-shot";
  const oath = (expertise: number, recharging: readonly string[]): MatchSimulation => {
    const bar = [OATH, "ranger.power-shot", "ranger.savage-shot", "ranger.distracting-shot"];
    const sim = match([
      fighter("r", 0, RANGER, vec2(400, 400), {
        behaviour: undefined,
        skillBar: bar,
        attributeRanks: new Map([["ranger.expertise", expertise]]),
      }),
      fighter("foe", 1, WARRIOR, vec2(700, 400), { behaviour: undefined, skillBar: [] }),
    ]);
    for (const id of recharging) {
      sim.get("r")?.combatant.cast.startRecharge(id, 10);
    }
    return sim;
  };

  it("holds Oath Shot at Expertise 7, or with fewer than two others recharging", () => {
    const two = ["ranger.power-shot", "ranger.savage-shot"];
    expect(askBot(oath(7, two), "r").useSkillId).not.toBe(OATH);
    expect(askBot(oath(8, ["ranger.power-shot"]), "r").useSkillId).not.toBe(OATH);
    expect(askBot(oath(8, []), "r").useSkillId).not.toBe(OATH);
  });

  it("uses Oath Shot at Expertise 8 with two others recharging", () => {
    expect(
      askBot(oath(8, ["ranger.power-shot", "ranger.savage-shot", "ranger.distracting-shot"]), "r"),
    ).toMatchObject({ useSkillId: OATH, targetId: "foe" });
  });

  it("shoots Screaming Shot at a foe within earshot not yet Bleeding", () => {
    const sim = match([
      fighter("r", 0, RANGER, vec2(400, 400), { behaviour: undefined, skillBar: [SCREAM] }),
      fighter("foe", 1, WARRIOR, vec2(600, 400), { behaviour: undefined, skillBar: [] }),
      fighter("near", 1, WARRIOR, vec2(600, 440), { behaviour: undefined, skillBar: [] }),
    ]);
    sim.setTarget("r", "foe");
    expect(askBot(sim, "r")).toMatchObject({ useSkillId: SCREAM, targetId: "foe" });
    sim.get("foe")?.combatant.statuses.apply("bleeding", 10, "x", NO_RANKS);
    expect(askBot(sim, "r")).toMatchObject({ useSkillId: SCREAM, targetId: "near" });
    sim.get("near")?.combatant.statuses.apply("bleeding", 10, "x", NO_RANKS);
    expect(askBot(sim, "r")).toMatchObject({ useSkillId: SCREAM, targetId: "foe" });
  });
});
