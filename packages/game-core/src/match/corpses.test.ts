import { describe, expect, it } from "vitest";

import { vec2, type Vec2 } from "../vec2.js";
import { isFreshCorpse, nearestFreshCorpse, type CorpseCandidate } from "./corpses.js";

function body(
  id: string,
  position: Vec2,
  extra: { dead?: boolean; creature?: boolean; exploited?: boolean } = {},
): CorpseCandidate {
  return {
    id,
    position,
    combatant: { dead: extra.dead ?? true },
    creature:
      extra.creature === true
        ? {
            ownerId: "n",
            kind: "minion",
            name: "Bone Minion",
            expiresInSeconds: Number.POSITIVE_INFINITY,
            ageSeconds: 0,
            summonedAtTick: 0,
            skillId: "necromancer.animate-bone-minions",
            aura: undefined,
            onDeath: "vanish",
            ownerDisableSeconds: 0,
            companionSkillId: undefined,
            mode: "guard",
          }
        : undefined,
    corpseExploited: extra.exploited ?? false,
  };
}

const ORIGIN = vec2(0, 0);

describe("isFreshCorpse (#466)", () => {
  it("is a dead player or dummy no skill has used", () => {
    expect(isFreshCorpse(body("a", ORIGIN))).toBe(true);
    expect(isFreshCorpse(body("a", ORIGIN, { dead: false }))).toBe(false);
    expect(isFreshCorpse(body("a", ORIGIN, { exploited: true }))).toBe(false);
    expect(isFreshCorpse(body("a", ORIGIN, { creature: true }))).toBe(false);
  });
});

describe("nearestFreshCorpse (#466)", () => {
  it("picks the nearest dead body, ignoring the living, creatures and exploited corpses", () => {
    const bodies = [
      body("alive", vec2(10, 0), { dead: false }),
      body("minion", vec2(20, 0), { creature: true }),
      body("used", vec2(30, 0), { exploited: true }),
      body("far", vec2(200, 0)),
      body("near", vec2(0, 100)),
    ];
    expect(nearestFreshCorpse(ORIGIN, 420, bodies)?.id).toBe("near");
  });

  it("breaks a tie by the smaller id, whatever the order", () => {
    const b = body("b", vec2(100, 0));
    const a = body("a", vec2(-100, 0));
    expect(nearestFreshCorpse(ORIGIN, 420, [b, a])?.id).toBe("a");
    expect(nearestFreshCorpse(ORIGIN, 420, [a, b])?.id).toBe("a");
  });

  it("finds a body at exactly the radius, and not one beyond it", () => {
    expect(nearestFreshCorpse(ORIGIN, 420, [body("edge", vec2(420, 0))])?.id).toBe("edge");
    expect(nearestFreshCorpse(ORIGIN, 420, [body("past", vec2(420.01, 0))])).toBeUndefined();
  });

  it("is undefined when there is none", () => {
    expect(nearestFreshCorpse(ORIGIN, 420, [])).toBeUndefined();
  });
});
