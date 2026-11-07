import { describe, expect, it } from "vitest";

import { distance, vec2, type Vec2 } from "../../../vec2.js";
import type { ParticipantSpec } from "../../simulation.js";
import raise from "./raise.js";
import { BOT, body, match, ruleFor } from "./test-support.js";

/**
 * The raiser at the origin with Restore Life, `corpses` dead where they
 * lie, everyone else alive, and `targeting` the one foe on it: what it
 * would raise, nearest first.
 */
function raised(
  corpses: readonly (readonly [string, Vec2])[],
  others: readonly ParticipantSpec[],
  raiser: Partial<ParticipantSpec> = {},
  targeting?: string,
): string | undefined {
  const sim = match([
    body("raiser", 0, vec2(0, 0), { behaviour: BOT, skillBar: ["monk.restore-life"], ...raiser }),
    ...corpses.map(([id, at]) => body(id, 0, at)),
    ...others,
  ]);
  for (const [id] of corpses) {
    const dead = sim.get(id)?.combatant;
    if (dead === undefined) throw new Error(`no ${id}`);
    dead.dead = true;
  }
  if (targeting !== undefined) {
    const watcher = sim.get(targeting);
    if (watcher === undefined) throw new Error(`no ${targeting}`);
    watcher.targetId = "raiser";
  }
  const rule = ruleFor(sim, "raiser");
  const intent = raise.decide({
    ...rule,
    nearestFirst: (bodies) =>
      [...bodies].sort(
        (a, b) =>
          distance(a.position, rule.self.position) - distance(b.position, rule.self.position),
      ),
  });
  return intent?.useSkillId === undefined ? undefined : intent.targetId;
}

const foe = (id: string, at: Vec2): ParticipantSpec => body(id, 1, at);
const ally = (id: string, at: Vec2): ParticipantSpec => body(id, 0, at);

describe("raise rezzes only where the ground is ours (#2628)", () => {
  const corpse = ["corpse", vec2(300, 0)] as const;
  const twoFoes = [foe("f1", vec2(500, 0)), foe("f2", vec2(500, 100))];

  it("leaves a corpse with two foes and only itself near", () => {
    expect(raised([corpse], twoFoes)).toBeUndefined();
  });

  it("raises the same corpse with three allies near", () => {
    expect(
      raised([corpse], [...twoFoes, ally("a1", vec2(300, 100)), ally("a2", vec2(300, -100))]),
    ).toBe("corpse");
  });

  it("raises a corpse with no foe near, however far from its allies", () => {
    expect(raised([["far", vec2(-1500, 0)]], twoFoes)).toBe("far");
  });

  it("passes the nearer corpse among the foes for the farther safe one", () => {
    expect(raised([corpse, ["safe", vec2(-600, 0)]], twoFoes)).toBe("safe");
  });

  it("takes the corpse with fewer foes near before the nearer one", () => {
    const allies = [ally("a1", vec2(300, 100)), ally("a2", vec2(300, -100))];
    const one = ["one", vec2(-500, 0)] as const;
    const lone = foe("f3", vec2(-700, 0));
    const helpers = [ally("a3", vec2(-500, 100)), ally("a4", vec2(-500, -100))];
    expect(raised([corpse, one], [...twoFoes, ...allies, lone, ...helpers])).toBe("one");
  });

  it("raises nothing while a foe targets it", () => {
    const far = [foe("f1", vec2(2000, 0))];
    expect(raised([["near", vec2(-300, 0)]], far)).toBe("near");
    expect(raised([["near", vec2(-300, 0)]], far, {}, "f1")).toBeUndefined();
  });

  it("raises the nearest with no foe alive", () => {
    expect(
      raised(
        [
          ["far", vec2(-800, 0)],
          ["near", vec2(200, 0)],
        ],
        [],
      ),
    ).toBe("near");
  });

  it("keeps to the same checks at rank 0 in the skill's attribute", () => {
    const rank0 = { attributeRanks: new Map<string, number>() };
    expect(raised([corpse], twoFoes, rank0)).toBeUndefined();
    expect(raised([["far", vec2(-1500, 0)]], twoFoes, rank0)).toBe("far");
  });
});
