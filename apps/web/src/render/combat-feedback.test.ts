import { describe, expect, it } from "vitest";

import type { MatchSnapshot, PlayerSnapshot } from "../net/match-connection.js";
import { teamColour, type AreaFlash, type FloatingText } from "./arena-snapshot.js";
import { showCombatFeedback } from "./combat-feedback.js";

function player(sessionId: string): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    x: 100,
    y: 100,
    targetSessionId: undefined,
    attackTargetSessionId: undefined,
    health: 400,
    maxHealth: 500,
    energy: 20,
    maxEnergy: 50,
    adrenaline: 0,
    armor: 60,
    weaponId: undefined,
    team: 0,
    dead: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    statuses: [],
  };
}

const SNAPSHOT: MatchSnapshot = {
  selfSessionId: "me",
  players: [player("me"), player("them")],
  scoreTeam0: 0,
  scoreTeam1: 0,
  elapsedSeconds: 0,
  phase: "active",
  winningTeam: undefined,
  endReason: undefined,
  projectiles: [],
};

type Events = { kind: string; targetId?: string; amount?: number }[];

/** What a scene would have been asked to float, for these events. */
function floatedTexts(events: Events, cause: "skill" | "weapon" = "skill"): FloatingText[] {
  const texts: FloatingText[] = [];
  showCombatFeedback(
    { addFloatingText: (text) => texts.push(text), addAreaFlash: () => undefined },
    cause === "skill"
      ? { casterSessionId: "me", cause, skillId: "elementalist.fireball", events }
      : { casterSessionId: "me", cause, skillId: "", events },
    SNAPSHOT,
  );
  return texts;
}

function floated(events: Events): string[] {
  return floatedTexts(events).map((text) => text.text);
}

describe("showCombatFeedback", () => {
  it("signs damage with a real minus and heals with a plus, so colour is never needed", () => {
    expect(
      floated([
        { kind: "damage", targetId: "them", amount: 91.4 },
        { kind: "heal", targetId: "me", amount: 40 },
      ]),
    ).toEqual(["−91", "+40"]);
  });

  it("floats a blinded attack's miss over its target", () => {
    expect(floated([{ kind: "attack-missed", targetId: "them" }])).toEqual(["miss"]);
  });

  it("floats a weapon's numbers smaller than a skill's, and its misses as words", () => {
    const hit = [{ kind: "damage", targetId: "them", amount: 18 }];
    expect(floatedTexts(hit, "weapon")[0]?.size).toBe("small");
    expect(floatedTexts(hit, "skill")[0]?.size).toBe("full");
    expect(
      floatedTexts(
        [
          { kind: "attack-dodged", targetId: "them" },
          { kind: "attack-obstructed", targetId: "them" },
        ],
        "weapon",
      ).map((text) => text.text),
    ).toEqual(["dodge", "obstructed"]);
  });

  it("skips events about nobody it can see", () => {
    expect(floated([{ kind: "damage", targetId: "gone", amount: 5 }])).toEqual([]);
  });
});

describe("showCombatFeedback and areas", () => {
  const snapshot: MatchSnapshot = {
    ...SNAPSHOT,
    players: [player("me"), player("friend"), { ...player("them"), team: 1 }],
  };
  /** The flashes a scene would have been asked to draw. */
  function flashed(casterSessionId: string, area?: { x: number; y: number; radius: number }) {
    const flashes: AreaFlash[] = [];
    showCombatFeedback(
      { addFloatingText: () => undefined, addAreaFlash: (flash) => flashes.push(flash) },
      {
        casterSessionId,
        cause: "skill",
        skillId: "elementalist.fireball",
        events: [],
        ...(area && { area }),
      },
      snapshot,
    );
    return flashes;
  }

  it("flashes where the area landed, at its radius, in the caster's side's colour", () => {
    const area = { x: 300, y: 120, radius: 81 };
    expect(flashed("friend", area)).toMatchObject([
      { position: { x: 300, y: 120 }, radius: 81, colour: teamColour("ally") },
    ]);
    expect(flashed("me", area)[0]?.colour).toBe(teamColour("ally"));
    expect(flashed("them", area)[0]?.colour).toBe(teamColour("enemy"));
  });

  it("flashes nothing for a skill with no area", () => {
    expect(flashed("them")).toEqual([]);
  });
});
