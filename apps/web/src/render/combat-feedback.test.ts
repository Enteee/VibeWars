import { describe, expect, it } from "vitest";

import type { CombatMessage, MatchSnapshot, PlayerSnapshot } from "../net/match-connection.js";
import { teamColour, type AreaFlash, type FloatingText } from "./arena-snapshot.js";
import { showCombatFeedback, swingFlashFor } from "./combat-feedback.js";

function player(sessionId: string): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    x: 100,
    y: 100,
    facing: 0,
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

/** The texts a scene would have been asked to float, for these events. */
function floated(
  events: { kind: string; targetId?: string; amount?: number }[],
  cause: CombatMessage["cause"] = "skill",
): string[] {
  const texts: FloatingText[] = [];
  showCombatFeedback(
    {
      addFloatingText: (text) => texts.push(text),
      addAreaFlash: () => undefined,
      addSwingFlash: () => undefined,
    },
    {
      casterSessionId: "me",
      cause,
      skillId: cause === "skill" ? "elementalist.fireball" : "",
      events,
    },
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

  it("floats a blinded attack's miss over its target", () => {
    expect(floated([{ kind: "attack-missed", targetId: "them" }])).toEqual(["miss"]);
  });

  it("floats a dodged and an obstructed shot as words", () => {
    expect(
      floated([
        { kind: "attack-dodged", targetId: "them" },
        { kind: "attack-obstructed", targetId: "them" },
      ]),
    ).toEqual(["dodge", "obstructed"]);
  });

  it("weighs weapon swings lighter than skills, so they never drown a skill number", () => {
    const weights = (cause: CombatMessage["cause"]): string[] => {
      const texts: FloatingText[] = [];
      showCombatFeedback(
        {
          addFloatingText: (text) => texts.push(text),
          addAreaFlash: () => undefined,
          addSwingFlash: () => undefined,
        },
        {
          casterSessionId: "me",
          cause,
          skillId: cause === "skill" ? "elementalist.fireball" : "",
          events: [{ kind: "damage", targetId: "them", amount: 12 }],
        },
        SNAPSHOT,
      );
      return texts.map((text) => text.weight);
    };
    expect(weights("weapon")).toEqual(["light"]);
    expect(weights("skill")).toEqual(["normal"]);
  });

  it("skips events about nobody it can see", () => {
    expect(floated([{ kind: "damage", targetId: "gone", amount: 5 }])).toEqual([]);
  });

  it("floats no degeneration ticks, which the health bar already shows (#54)", () => {
    // Burning and poison together: 11 hp/s, about 1 a tick at 20 Hz.
    const tick = [{ kind: "damage", targetId: "them", amount: 0.55 * 2 }];
    expect(floated(tick, "degeneration")).toEqual([]);
    // Dying of it still says so.
    expect(floated([{ kind: "death", targetId: "them" }], "degeneration")).toEqual(["defeated"]);
    // A real hit still floats.
    expect(floated([{ kind: "damage", targetId: "them", amount: 91 }])).toEqual(["−91"]);
  });

  it("anchors each number to whoever it happened to, so a burst can stack (#54)", () => {
    const texts: FloatingText[] = [];
    showCombatFeedback(
      {
        addFloatingText: (text) => texts.push(text),
        addAreaFlash: () => undefined,
        addSwingFlash: () => undefined,
      },
      {
        casterSessionId: "me",
        cause: "skill",
        skillId: "elementalist.fireball",
        events: [
          { kind: "damage", targetId: "them", amount: 5 },
          { kind: "heal", targetId: "me", amount: 5 },
        ],
      },
      SNAPSHOT,
    );
    expect(texts.map((text) => text.anchorId)).toEqual(["them", "me"]);
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
      {
        addFloatingText: () => undefined,
        addAreaFlash: (flash) => flashes.push(flash),
        addSwingFlash: () => undefined,
      },
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

describe("swingFlashFor (#161)", () => {
  const snapshot = (weaponId: string): MatchSnapshot => ({
    ...SNAPSHOT,
    players: [
      { ...player("me"), x: 100, y: 100, weaponId },
      { ...player("them"), x: 100, y: 200, team: 1 },
    ],
  });
  const swing = (cause: CombatMessage["cause"], kind = "damage"): CombatMessage => ({
    casterSessionId: "me",
    cause,
    skillId: "",
    events: [{ kind, targetId: "them", amount: 30 }],
  });

  it("flashes one arc around a melee attacker, toward its target", () => {
    const flash = swingFlashFor(swing("weapon"), snapshot("sword"));
    expect(flash?.centre).toEqual({ x: 100, y: 100 });
    expect(flash?.angle).toBeCloseTo(Math.PI / 2, 9);
    expect(flash?.radius).toBe(20);
    expect(flash?.colour).toBe(teamColour("ally"));
    expect(flash?.own).toBe(true);
    // A miss swings too.
    expect(swingFlashFor(swing("weapon", "attack-missed"), snapshot("daggers"))).toBeDefined();
  });

  it("flashes nothing for a bow, whose shot is the feedback, or for a skill", () => {
    expect(swingFlashFor(swing("weapon"), snapshot("longbow"))).toBeUndefined();
    expect(swingFlashFor(swing("weapon"), snapshot("wand"))).toBeUndefined();
    expect(swingFlashFor(swing("skill"), snapshot("sword"))).toBeUndefined();
  });

  it("hands the scene one arc for a melee hit, and none for a bow's", () => {
    const record = (weaponId: string): number => {
      let arcs = 0;
      showCombatFeedback(
        {
          addFloatingText: () => undefined,
          addAreaFlash: () => undefined,
          addSwingFlash: () => {
            arcs += 1;
          },
        },
        swing("weapon"),
        snapshot(weaponId),
      );
      return arcs;
    };
    expect(record("axe")).toBe(1);
    expect(record("shortbow")).toBe(0);
  });
});
