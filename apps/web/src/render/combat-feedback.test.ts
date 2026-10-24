import { describe, expect, it } from "vitest";

import type { MatchSnapshot, PlayerSnapshot } from "../net/match-connection.js";
import type { FloatingText } from "./arena-snapshot.js";
import { showCombatFeedback } from "./combat-feedback.js";

function player(sessionId: string): PlayerSnapshot {
  return {
    sessionId,
    x: 100,
    y: 100,
    targetSessionId: undefined,
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
};

/** The texts a scene would have been asked to float, for these events. */
function floated(events: { kind: string; targetId?: string; amount?: number }[]): string[] {
  const texts: FloatingText[] = [];
  showCombatFeedback(
    { addFloatingText: (text) => texts.push(text) },
    { casterSessionId: "me", skillId: "elementalist.fireball", events },
    SNAPSHOT,
  );
  return texts.map((text) => text.text);
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

  it("skips events about nobody it can see", () => {
    expect(floated([{ kind: "damage", targetId: "gone", amount: 5 }])).toEqual([]);
  });
});
