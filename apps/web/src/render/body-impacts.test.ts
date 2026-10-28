import type { CombatMessage } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import {
  IMPACT_REACH,
  IMPACT_SECONDS,
  MAX_IMPACTS,
  impactMarks,
  impactsFor,
  mergeImpacts,
  type Impact,
} from "./body-impacts.js";

const DAMAGE = 0xff7b72;
const CONDITION = 0xffa657;
const HEAL = 0x7ee787;
const HEX = 0xd2a8ff;
const ENCHANTMENT = 0x56d4dd;

function message(
  skillId: string,
  events: CombatMessage["events"],
  cause: CombatMessage["cause"] = "skill",
): CombatMessage {
  return {
    casterSessionId: "me",
    cause,
    skillId: cause === "skill" ? skillId : "",
    weaponId: cause === "weapon" ? "sword" : "",
    attributeId: "",
    events,
    doubleStrike: false,
  };
}

/** Each impact as body, shape and colour. */
function shapes(m: CombatMessage): readonly (readonly [string, string, number])[] {
  return impactsFor(m).map((impact) => [impact.anchorId, impact.shape, impact.colour]);
}

describe("impactsFor (#1139)", () => {
  it("bursts a damage spell in damage and glows a heal in heal", () => {
    expect(
      shapes(
        message("elementalist.fireball", [
          { kind: "damage", targetId: "foe", amount: 50, critical: false },
        ]),
      ),
    ).toEqual([["foe", "burst", DAMAGE]]);
    expect(
      shapes(message("monk.orison-of-healing", [{ kind: "heal", targetId: "ally", amount: 60 }])),
    ).toEqual([["ally", "glow", HEAL]]);
  });

  it("colours by the skill type where the palette has one", () => {
    expect(
      shapes(
        message("necromancer.faintheartedness", [
          {
            kind: "status-applied",
            targetId: "foe",
            statusId: "faintheartedness",
            durationSeconds: 8,
          },
        ]),
      ),
    ).toEqual([["foe", "burst", HEX]]);
    expect(
      shapes(
        message("monk.guardian", [
          { kind: "status-applied", targetId: "ally", statusId: "guardian", durationSeconds: 5 },
        ]),
      ),
    ).toEqual([["ally", "glow", ENCHANTMENT]]);
  });

  it("bursts in condition when it only applied conditions, in damage when it also hurt", () => {
    expect(
      shapes(
        message("necromancer.enfeeble", [
          { kind: "status-applied", targetId: "foe", statusId: "weakness", durationSeconds: 10 },
        ]),
      ),
    ).toEqual([["foe", "burst", CONDITION]]);
    expect(
      shapes(
        message("warrior.sever-artery", [
          { kind: "damage", targetId: "foe", amount: 30, critical: false },
          { kind: "status-applied", targetId: "foe", statusId: "bleeding", durationSeconds: 15 },
        ]),
      ),
    ).toEqual([["foe", "burst", DAMAGE]]);
  });

  it("bursts the drained body and glows the caster on life steal", () => {
    expect(
      shapes(
        message("necromancer.vampiric-gaze", [
          { kind: "life-stolen", targetId: "foe", amount: 20 },
          { kind: "heal", targetId: "me", amount: 20 },
        ]),
      ),
    ).toEqual([
      ["foe", "burst", DAMAGE],
      ["me", "glow", HEAL],
    ]);
  });

  it("lets harm beat help on one body, and flashes every body an area touched", () => {
    expect(
      shapes(
        message("elementalist.fireball", [
          { kind: "heal", targetId: "foe", amount: 5 },
          { kind: "damage", targetId: "foe", amount: 50, critical: false },
        ]),
      ),
    ).toEqual([["foe", "burst", DAMAGE]]);
    const area = message(
      "elementalist.fireball",
      ["a", "b", "c"].map((targetId) => ({
        kind: "damage" as const,
        targetId,
        amount: 40,
        critical: false,
      })),
    );
    expect(impactsFor(area).map((impact) => impact.anchorId)).toEqual(["a", "b", "c"]);
  });

  it("flashes nothing for a swing, a tick, a lone miss or block, or a skill it does not know", () => {
    const hit = { kind: "damage", targetId: "foe", amount: 10, critical: false } as const;
    expect(impactsFor(message("", [hit], "weapon"))).toEqual([]);
    expect(impactsFor(message("", [hit], "degeneration"))).toEqual([]);
    expect(
      impactsFor(message("warrior.swift-chop", [{ kind: "attack-blocked", targetId: "foe" }])),
    ).toEqual([]);
    expect(
      impactsFor(message("warrior.swift-chop", [{ kind: "attack-missed", targetId: "foe" }])),
    ).toEqual([]);
    expect(impactsFor(message("nobody.no-such-skill", [hit]))).toEqual([]);
  });
});

function impact(anchorId: string, remainingSeconds = IMPACT_SECONDS): Impact {
  return { anchorId, shape: "burst", colour: DAMAGE, remainingSeconds };
}

describe("mergeImpacts (#1139)", () => {
  it("replaces an older impact on the same body with the newer", () => {
    const merged = mergeImpacts([impact("a", 0.1)], [{ ...impact("a"), shape: "glow" }], 0.05);
    expect(merged).toEqual([{ ...impact("a"), shape: "glow" }]);
  });

  it("ages the live ones and drops the spent", () => {
    const merged = mergeImpacts([impact("a", 0.25), impact("b", 0.05)], [], 0.1);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.anchorId).toBe("a");
    expect(merged[0]?.remainingSeconds).toBeCloseTo(0.15, 9);
  });

  it("keeps at most 64, dropping the oldest", () => {
    const live = Array.from({ length: MAX_IMPACTS }, (_, k) => impact(`old-${String(k)}`));
    const merged = mergeImpacts(live, [impact("new")], 0);
    expect(merged).toHaveLength(MAX_IMPACTS);
    expect(merged[0]?.anchorId).toBe("old-1");
    expect(merged.at(-1)?.anchorId).toBe("new");
  });
});

describe("impactMarks (#1139)", () => {
  /** Every mark's furthest reach from the centre. */
  function reach(marks: ReturnType<typeof impactMarks>): number {
    return Math.max(
      ...marks.map((mark) =>
        mark.kind === "spike" ? Math.hypot(mark.to.x, mark.to.y) : mark.radius,
      ),
    );
  }

  it("stays inside r + 6 for both shapes, every moment, both motion settings", () => {
    for (const radius of [14, 10]) {
      for (const shape of ["burst", "glow"] as const) {
        for (let step = 0; step <= 10; step += 1) {
          const remainingSeconds = (IMPACT_SECONDS * step) / 10;
          for (const reducedMotion of [false, true]) {
            const marks = impactMarks(
              { ...impact("a", remainingSeconds), shape },
              radius,
              reducedMotion,
            );
            expect(reach(marks)).toBeLessThanOrEqual(radius + IMPACT_REACH + 1e-9);
          }
        }
      }
    }
  });

  it("bursts 8 spikes that grow out and fade, and glows a ring that contracts", () => {
    const start = impactMarks(impact("a"), 14, false);
    expect(start).toHaveLength(8);
    expect(reach(start)).toBeCloseTo(17, 9);
    expect(start[0]?.alpha).toBe(1);
    const late = impactMarks(impact("a", IMPACT_SECONDS / 2), 14, false);
    expect(reach(late)).toBeCloseTo(18.5, 9);
    expect(late[0]?.alpha).toBeCloseTo(0.5, 9);

    const glow = impactMarks({ ...impact("a"), shape: "glow" }, 14, false);
    expect(glow).toEqual([
      { kind: "tint", radius: 14, alpha: 0.35 },
      { kind: "ring", radius: 20, alpha: 1 },
    ]);
  });

  it("holds a frozen form at full alpha under reduced motion, whatever the time left", () => {
    for (const shape of ["burst", "glow"] as const) {
      const fresh = impactMarks({ ...impact("a"), shape }, 14, true);
      const late = impactMarks({ ...impact("a", 0.01), shape }, 14, true);
      expect(late).toEqual(fresh);
    }
    expect(impactMarks({ ...impact("a"), shape: "glow" }, 14, true)).toEqual([
      { kind: "tint", radius: 14, alpha: 0.35 },
      { kind: "ring", radius: 18, alpha: 1 },
    ]);
    const burst = impactMarks(impact("a"), 14, true);
    expect(burst.every((mark) => mark.alpha === 1)).toBe(true);
    expect(reach(burst)).toBeCloseTo(18.5, 9);
  });
});
