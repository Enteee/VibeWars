import { describe, expect, it } from "vitest";

import { pointInPolygon } from "../../geometry.js";
import { getSkill } from "../../skills/catalog.js";
import type { GroundAct } from "../../skills/types.js";
import { vec2 } from "../../vec2.js";
import { NO_OBJECTIVES, type HostileGround } from "../behaviour.js";
import type { GroundEffect } from "../simulation.js";
import { harmAround, harmHolding, hostileGroundOf } from "./hostile-ground.js";

/** The ground effect `skillId` leaves. */
function actOf(skillId: string): GroundAct {
  const effect = getSkill(skillId)?.effects.find((each) => each.kind === "create-ground-effect");
  if (effect?.kind !== "create-ground-effect") throw new Error(`${skillId} leaves no ground`);
  return effect.act;
}

/** `act` on team 1's ground at (500, 400). */
function ground(act: GroundAct, pulsed = 0): GroundEffect {
  return {
    id: 1,
    skillId: "test",
    ownerId: "owner",
    team: 1,
    position: vec2(500, 400),
    layer: 0,
    act,
    durationSeconds: 10,
    remainingSeconds: 10,
    pulsed,
  };
}

const RADIUS = {
  radius: 100,
  origin: "caster",
  maxTargets: undefined,
  includesCaster: false,
} as const;

/** A pulse of two hitting `affects`, with no end. */
function pulse(affects: "enemies" | "allies" | "all"): Extract<GroundAct, { kind: "pulse" }> {
  return {
    kind: "pulse",
    pulse: {
      count: 2,
      everySeconds: 1,
      delaySeconds: 0,
      area: { ...RADIUS, affects },
      effects: [],
    },
  };
}

/** The areas a bot on `team` steps out of, among `effects`. */
function areasFor(effects: readonly GroundEffect[], team: number) {
  return harmAround({ ...NO_OBJECTIVES, hostileGround: hostileGroundOf(effects) }, team);
}

describe("hostile ground: a foe's harmful ground effect, as bots read it (#4193)", () => {
  it("maps an enemy Well of Suffering and Fire Storm for the other team, not the owner's", () => {
    for (const skillId of ["necromancer.well-of-suffering", "elementalist.fire-storm"]) {
      const effects = [ground(actOf(skillId))];
      expect(areasFor(effects, 0), skillId).toHaveLength(1);
      expect(areasFor(effects, 1), skillId).toHaveLength(0);
    }
  });

  it("maps an own team's pulse on all for both teams", () => {
    const effects = [ground(pulse("all"))];
    expect(areasFor(effects, 0)).toHaveLength(1);
    expect(areasFor(effects, 1)).toHaveLength(1);
  });

  it("never maps a ward for allies, an aura on all or a trap", () => {
    const effects = [
      ground(actOf("elementalist.ward-against-melee")),
      ground({ kind: "aura", aura: { statusId: "winnowing", affects: "all", radius: 100 } }),
      ground(actOf("ranger.flame-trap")),
      ground(pulse("allies")),
    ];
    expect(hostileGroundOf(effects)).toEqual([]);
  });

  it("drops a pulse with no pulse left and no end, and keeps one with an end", () => {
    expect(hostileGroundOf([ground(pulse("enemies"), 2)])).toEqual([]);
    const ending: GroundAct = {
      ...pulse("allies"),
      atEnd: { area: { ...RADIUS, radius: 150, affects: "enemies" }, effects: [] },
    };
    expect(hostileGroundOf([ground(ending, 2)])).toEqual<HostileGround[]>([
      { team: 1, hits: "foes", position: vec2(500, 400), layer: 0, radius: 150 },
    ]);
  });

  it("holds every point of the circle, even off a side's middle", () => {
    const [area] = areasFor([ground(pulse("enemies"))], 0);
    if (area === undefined) throw new Error("no area");
    // Just inside the circle, between two corners and at one.
    for (const angle of [Math.PI / 16, 0, Math.PI / 3]) {
      const point = vec2(500 + 99.9 * Math.cos(angle), 400 + 99.9 * Math.sin(angle));
      expect(pointInPolygon(point, area.polygon)).toBe(true);
    }
    expect(harmHolding([area], vec2(500, 400), 0)).toEqual([area]);
    expect(harmHolding([area], vec2(500, 400), 1)).toEqual([]);
    expect(harmHolding([area], vec2(620, 400), 0)).toEqual([]);
  });
});
