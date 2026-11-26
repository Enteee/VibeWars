import { AREA_EARSHOT, SKILLS_BY_ID, vec2, type SkillType } from "@vibewars/game-core";
import type { CombatMessage } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import {
  MAX_SHOUT_MARKS,
  SHOUT_RING_SECONDS,
  addShoutMarks,
  chevronAlpha,
  decayShoutMarks,
  shoutChevron,
  shoutMarksFor,
  shoutRingRadius,
  type ShoutBody,
  type ShoutMark,
} from "./shout-marks.js";

/** The first skill of `type` in the catalogue. */
function skillOf(type: SkillType): string {
  const skill = [...SKILLS_BY_ID.values()].find((s) => s.type === type);
  if (skill === undefined) {
    throw new Error(`no ${type} skill`);
  }
  return skill.id;
}

function message(
  skillId: string,
  targets: readonly string[],
  cause: CombatMessage["cause"] = "skill",
): CombatMessage {
  return {
    casterSessionId: "me",
    cause,
    skillId: cause === "skill" ? skillId : "",
    weaponId: cause === "weapon" ? "sword" : "",
    attributeId: "",
    events: targets.map((targetId) => ({ kind: "heal", targetId, amount: 10 })),
    doubleStrike: false,
  };
}

const BODIES: Record<string, ShoutBody> = {
  me: { team: 0, position: vec2(100, 200), layer: 1, radius: 14 },
  ally: { team: 0, position: vec2(150, 200), layer: 1, radius: 14 },
  friend: { team: 0, position: vec2(180, 200), layer: 1, radius: 14 },
  foe: { team: 1, position: vec2(300, 200), layer: 1, radius: 14 },
};
const bodyOf = (id: string): ShoutBody | undefined => BODIES[id];

/** Each mark as kind and body. */
function shown(marks: readonly ShoutMark[]): string[] {
  return marks.map((mark) => `${mark.kind} ${mark.anchorId}`);
}

describe("shoutMarksFor", () => {
  it("gives a shout one ring at the caster and a chevron over each ally it targets", () => {
    const marks = shoutMarksFor(
      message(skillOf("shout"), ["me", "ally", "foe", "ally", "friend"]),
      bodyOf,
    );
    expect(shown(marks)).toEqual(["ring me", "chevron me", "chevron ally", "chevron friend"]);
    expect(marks[0]).toMatchObject({ position: vec2(100, 200), layer: 1, from: 14 });
  });

  it("gives a chant the same", () => {
    expect(shown(shoutMarksFor(message(skillOf("chant"), ["ally"]), bodyOf))).toEqual([
      "ring me",
      "chevron ally",
    ]);
  });

  it("gives an echo, a spell or a weapon hit nothing", () => {
    expect(shoutMarksFor(message(skillOf("echo"), ["ally"]), bodyOf)).toEqual([]);
    expect(shoutMarksFor(message(skillOf("spell"), ["ally"]), bodyOf)).toEqual([]);
    expect(shoutMarksFor(message("", ["foe"], "weapon"), bodyOf)).toEqual([]);
  });

  it("gives a foe-only shout its ring and no chevron", () => {
    expect(shown(shoutMarksFor(message(skillOf("shout"), ["foe"]), bodyOf))).toEqual(["ring me"]);
  });

  it("gives a foe's shout chevrons over the foes it helped", () => {
    const foeShout = { ...message(skillOf("shout"), ["foe", "ally"]), casterSessionId: "foe" };
    expect(shown(shoutMarksFor(foeShout, bodyOf))).toEqual(["ring foe", "chevron foe"]);
  });

  it("gives nothing for a caster not in the state", () => {
    const gone = { ...message(skillOf("shout"), ["ally"]), casterSessionId: "gone" };
    expect(shoutMarksFor(gone, bodyOf)).toEqual([]);
  });
});

describe("shoutRingRadius", () => {
  it("grows from the body's edge to earshot in its time, fading, then is gone", () => {
    expect(shoutRingRadius(0, 14, false)).toEqual({ radius: 14, alpha: 0.9 });
    const half = shoutRingRadius(SHOUT_RING_SECONDS / 2, 14, false);
    expect(half?.radius).toBeCloseTo(14 + (AREA_EARSHOT - 14) / 2);
    expect(half?.alpha).toBeCloseTo(0.45);
    expect(shoutRingRadius(SHOUT_RING_SECONDS, 14, false)?.radius).toBeCloseTo(AREA_EARSHOT);
    expect(shoutRingRadius(SHOUT_RING_SECONDS + 0.01, 14, false)).toBeUndefined();
  });

  it("holds one still ring at half earshot under reduced motion", () => {
    for (const age of [0, 0.1, 0.2, SHOUT_RING_SECONDS]) {
      expect(shoutRingRadius(age, 14, true)).toEqual({ radius: AREA_EARSHOT / 2, alpha: 0.5 });
    }
  });
});

describe("chevronAlpha", () => {
  it("is whole, fades over its last 0.3 s, and is gone at 1 s", () => {
    expect(chevronAlpha(0)).toBe(1);
    expect(chevronAlpha(0.6)).toBe(1);
    expect(chevronAlpha(0.8)).toBeLessThan(1);
    expect(chevronAlpha(0.8)).toBeGreaterThan(0);
    expect(chevronAlpha(1)).toBe(0);
  });
});

describe("shoutChevron", () => {
  it("points up over the health bar, and over a hex halo when there is one", () => {
    const [left, tip, right] = shoutChevron(100, 200, 14, undefined);
    expect(tip.y).toBeLessThan(left.y);
    expect(left.y).toBe(right.y);
    expect(left.y).toBeLessThan(200 - 14 - 12);
    const [overHalo] = shoutChevron(100, 200, 14, 40);
    expect(overHalo.y).toBeLessThan(200 - 40);
  });
});

describe("addShoutMarks and decayShoutMarks", () => {
  it("refreshes a body's chevron rather than stacking a second", () => {
    const live: ShoutMark[] = [];
    addShoutMarks(live, shoutMarksFor(message(skillOf("shout"), ["ally"]), bodyOf));
    decayShoutMarks(live, 0.5);
    addShoutMarks(live, shoutMarksFor(message(skillOf("chant"), ["ally"]), bodyOf));
    const chevrons = live.filter((mark) => mark.kind === "chevron");
    expect(chevrons).toHaveLength(1);
    expect(chevrons[0]?.ageSeconds).toBe(0);
  });

  it("ages marks in place and drops the spent", () => {
    const live: ShoutMark[] = [];
    addShoutMarks(live, shoutMarksFor(message(skillOf("shout"), ["ally"]), bodyOf));
    const chevron = live[1];
    decayShoutMarks(live, 0.5);
    expect(shown(live)).toEqual(["chevron ally"]);
    expect(live[0]).toBe(chevron);
    decayShoutMarks(live, 0.5);
    expect(live).toEqual([]);
  });

  it("holds at most the cap, the oldest dropped", () => {
    const live: ShoutMark[] = [];
    for (let n = 0; n < MAX_SHOUT_MARKS + 10; n += 1) {
      addShoutMarks(live, shoutMarksFor(message(skillOf("shout"), []), bodyOf));
    }
    expect(live).toHaveLength(MAX_SHOUT_MARKS);
  });
});
