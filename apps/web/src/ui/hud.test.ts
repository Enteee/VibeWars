import { describe, expect, it } from "vitest";

import type { CastRefusedMessage } from "@vibewars/game-protocol";

import type { PlayerSnapshot } from "../net/match-connection.js";

import {
  describeOutcome,
  describeRefusal,
  formatClock,
  isAttackingTarget,
  muteButtonState,
  skillSlotHtml,
  targetHintDismissed,
} from "./hud.js";

describe("formatClock", () => {
  it("formats seconds as m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9)).toBe("0:09");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(600)).toBe("10:00");
  });

  it("floors fractional seconds rather than showing a jittery decimal", () => {
    expect(formatClock(59.9)).toBe("0:59");
  });

  it("never shows a negative clock", () => {
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("describeOutcome", () => {
  it("reads as victory for the winning team's own players", () => {
    expect(describeOutcome(0, "score", 0)).toBe("Victory");
  });

  it("reads as defeat for the losing team's players", () => {
    expect(describeOutcome(0, "score", 1)).toBe("Defeat");
  });

  it("calls out a draw", () => {
    expect(describeOutcome(undefined, "time", 0)).toBe("Draw (time)");
  });

  it("notes when a match ended on the clock rather than on score", () => {
    expect(describeOutcome(1, "time", 1)).toBe("Victory (time)");
    expect(describeOutcome(1, "score", 1)).toBe("Victory");
  });

  it("falls back to naming the team for a spectator with no team of their own", () => {
    expect(describeOutcome(1, "score", undefined)).toBe("Team 2 wins");
  });
});

describe("targetHintDismissed", () => {
  const self = (targetSessionId: string | undefined): PlayerSnapshot => ({
    sessionId: "me",
    name: "me",
    x: 0,
    y: 0,
    facing: 0,
    targetSessionId,
    attackTargetSessionId: undefined,
    health: 500,
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
  });

  it("keeps the hint up with no target, takes it down for good at the first one", () => {
    expect(targetHintDismissed(false, self(undefined))).toBe(false);
    expect(targetHintDismissed(false, undefined)).toBe(false);
    const dismissed = targetHintDismissed(false, self("foe"));
    expect(dismissed).toBe(true);
    // Clearing the target later does not bring it back.
    expect(targetHintDismissed(dismissed, self(undefined))).toBe(true);
  });
});

describe("describeRefusal", () => {
  const cast = (reason: string): CastRefusedMessage => ({
    kind: "skill",
    slot: 0,
    skillId: "elementalist.fireball",
    reason,
  });
  const attack = (reason: string): CastRefusedMessage => ({ kind: "attack", reason });

  it("says why a cast was refused, in one short line", () => {
    expect(describeRefusal(cast("out-of-range"))).toBe("Target is out of range.");
    expect(describeRefusal(cast("no-line-of-sight"))).toBe("Target is not in line of sight.");
    expect(describeRefusal(cast("no-target"))).toBe("Select a target first.");
    expect(describeRefusal(cast("insufficient-energy"))).toBe("Not enough energy.");
  });

  it("talks about the weapon, not a skill, when an attack is refused", () => {
    expect(describeRefusal(attack("invalid-target-ally"))).toBe("You can only attack an enemy.");
    expect(describeRefusal(attack("invalid-target-self"))).toBe("You cannot attack yourself.");
    expect(describeRefusal(attack("invalid-target-dead"))).toBe("Your target is dead.");
  });

  it("still says something for a reason this client does not know", () => {
    expect(describeRefusal(cast("time-travel"))).toBe("You cannot use that skill now.");
    expect(describeRefusal(attack("time-travel"))).toBe("You cannot attack now.");
    // Not fooled by what every object has.
    expect(describeRefusal(cast("toString"))).toBe("You cannot use that skill now.");
  });
});

describe("isAttackingTarget", () => {
  const player = (sessionId: string, attackTargetSessionId?: string): PlayerSnapshot => ({
    sessionId,
    name: sessionId,
    x: 0,
    y: 0,
    facing: 0,
    targetSessionId: undefined,
    attackTargetSessionId,
    health: 500,
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
  });

  it("is whether self swings at the target the panel shows", () => {
    expect(isAttackingTarget(player("me", "dummy"), player("dummy"))).toBe(true);
    expect(isAttackingTarget(player("me", "other"), player("dummy"))).toBe(false);
    expect(isAttackingTarget(player("me"), player("dummy"))).toBe(false);
    expect(isAttackingTarget(player("me", "dummy"), undefined)).toBe(false);
  });
});

describe("skillSlotHtml", () => {
  const slot = (id: string) => ({
    id,
    name: id,
    energyCost: 10,
    adrenalineCost: 0,
    activationSeconds: 1,
    rechargeSeconds: 7,
  });

  it("carries the skill's type badge, named for a screen reader", () => {
    expect(skillSlotHtml(slot("elementalist.fireball"), 0)).toContain('alt="Spell"');
    expect(skillSlotHtml(slot("necromancer.faintheartedness"), 6)).toContain('alt="Hex"');
  });

  it("has no badge for a skill this client does not know", () => {
    expect(skillSlotHtml(slot("nobody.unknown"), 0)).not.toContain("skill-type-badge");
  });
});

describe("muteButtonState", () => {
  it("keeps one name and says with aria-pressed whether the sound is muted", () => {
    expect(muteButtonState(false)).toMatchObject({ label: "Mute sounds", pressed: "false" });
    expect(muteButtonState(true)).toMatchObject({ label: "Mute sounds", pressed: "true" });
  });

  it("shows what the sound is now, not what a click does", () => {
    expect(muteButtonState(false).icon).toMatch(/sound-on\.svg$/);
    expect(muteButtonState(true).icon).toMatch(/sound-off\.svg$/);
  });
});
