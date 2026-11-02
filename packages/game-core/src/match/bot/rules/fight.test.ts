import { describe, expect, it } from "vitest";

import { vec2, type Vec2 } from "../../../vec2.js";
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
  it("stands and fights a melee foe at its elbow with the bow, by a wall or in the open, however fast it thinks", () => {
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
        for (let t = 0; t < 10; t += DT) {
          for (const entry of sim.step(DT).log) {
            if (entry.sourceId === "ranger" && entry.weaponId !== undefined) {
              hits += entry.events.filter(
                (event) => event.kind === "damage" && event.targetId === "foe",
              ).length;
            }
          }
          // Where it stands once the field's edge has placed it: it never leaves.
          stood ??= { ...(sim.get("ranger")?.position ?? vec2(Number.NaN, Number.NaN)) };
        }
        expect(hits, `x ${String(x)}, thinkSeconds ${String(thinkSeconds)}`).toBeGreaterThan(3);
        expect(sim.get("ranger")?.position).toEqual(stood);
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
});
