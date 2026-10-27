import { describe, expect, it } from "vitest";

import type { CastRefusedMessage } from "@vibewars/game-protocol";
import type { PlayerSnapshot } from "@vibewars/game-session";

import { DEFAULT_KEYMAP } from "../input/keymap.js";
import { isEliteSkill } from "./icons.js";

import {
  describeOutcome,
  describeRefusal,
  formatClock,
  isAttackingTarget,
  lostHealthPercent,
  muteButtonState,
  skillSlotHtml,
  castRowSkill,
  targetCast,
  targetHealthLabel,
  targetHealthPercent,
  targetHint,
  targetHintDismissed,
  targetProfessionIcons,
  targetWeaponIcon,
} from "./hud.js";

/** A target on team 1, at full health of 480 and casting nothing. */
function player(fields: Partial<PlayerSnapshot>): PlayerSnapshot {
  return {
    sessionId: "foe",
    name: "Mhenlo",
    x: 0,
    y: 0,
    facing: 0,
    targetSessionId: undefined,
    attackTargetSessionId: undefined,
    walking: false,
    health: 480,
    maxHealth: 480,
    energy: 20,
    maxEnergy: 50,
    adrenaline: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 1,
    dead: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    healthPips: 0,
    energyPips: 0,
    statuses: [],
    ...fields,
  };
}

describe("targetHealthPercent (#484)", () => {
  it("rounds down, but never reads 0% for the living", () => {
    expect(targetHealthPercent(player({}))).toBe(100);
    expect(targetHealthPercent(player({ health: 479 }))).toBe(99);
    expect(targetHealthPercent(player({ health: 1 }))).toBe(1);
    expect(targetHealthPercent(player({ health: 0, dead: true }))).toBe(0);
  });

  it("is of the current maximum, which can shrink", () => {
    expect(targetHealthPercent(player({ health: 200, maxHealth: 400 }))).toBe(50);
  });
});

describe("lostHealthPercent (#764)", () => {
  it("greys the share of the bar a deep wound took", () => {
    expect(lostHealthPercent(player({}))).toBe(0);
    expect(lostHealthPercent(player({ health: 384, statuses: ["deep-wound"] }))).toBe(20);
    expect(lostHealthPercent(player({ maxHealth: 600, statuses: ["deep-wound"] }))).toBeCloseTo(
      16.667,
      2,
    );
  });

  it("ignores a status id it does not know", () => {
    expect(lostHealthPercent(player({ statuses: ["no-such-status"] }))).toBe(0);
  });

  it("greys nothing on a corpse", () => {
    expect(lostHealthPercent(player({ health: 0, dead: true, statuses: ["deep-wound"] }))).toBe(0);
  });
});

describe("targetHealthLabel (#484)", () => {
  it("shows a foe's percentage alone", () => {
    expect(targetHealthLabel(player({ health: 412 }), 0)).toBe("85%");
    expect(targetHealthLabel(player({ health: 412 }), undefined)).toBe("85%");
  });

  it("adds the hit points for an ally or yourself", () => {
    expect(targetHealthLabel(player({ health: 412 }), 1)).toBe("85% · 412 / 480");
  });

  it("says dead", () => {
    expect(targetHealthLabel(player({ health: 0, dead: true }), 0)).toBe("0% · dead");
  });
});

describe("targetCast (#484)", () => {
  const casting = (castRemaining: number): PlayerSnapshot =>
    player({ castingSkillId: "ranger.troll-unguent", castRemaining, castTotal: 3 });

  it("names the skill and fills from 0 to 1 as the cast runs", () => {
    expect(targetCast(casting(3))).toEqual({
      skillId: "ranger.troll-unguent",
      name: "Troll Unguent",
      progress: 0,
    });
    expect(targetCast(casting(1.5))?.progress).toBe(0.5);
    expect(targetCast(casting(0))?.progress).toBe(1);
  });

  it("shows an unknown skill by its id, with no badge", () => {
    expect(
      targetCast(player({ castingSkillId: "mystery.skill", castRemaining: 1, castTotal: 2 })),
    ).toEqual({ skillId: "mystery.skill", name: "mystery.skill", progress: 0.5 });
  });

  it("is nothing while not casting, or for an instant skill", () => {
    expect(targetCast(player({}))).toBeUndefined();
    expect(
      targetCast(
        player({ castingSkillId: "ranger.troll-unguent", castRemaining: 0, castTotal: 0 }),
      ),
    ).toBeUndefined();
  });
});

describe("castRowSkill (#727)", () => {
  it("gives the skill's icon, type badge and name", () => {
    const skill = castRowSkill("ranger.troll-unguent");
    expect(skill.icon).toBe("/icons/skill/ranger.troll-unguent.svg");
    expect(skill.badgeHtml).toContain("skill-type-badge");
    expect(skill.name).toBe("Troll Unguent");
  });

  it("shows an unknown skill on the bare plate, with no badge, by its id", () => {
    expect(castRowSkill("mystery.skill")).toEqual({
      icon: "/icons/skill/unknown.svg",
      badgeHtml: "",
      name: "mystery.skill",
    });
  });
});

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

describe("targetHint (#253, #302)", () => {
  it("tells a new player how to target and how to see every name, by their keys", () => {
    expect(targetHint(DEFAULT_KEYMAP)).toBe(
      "Click an enemy or press Tab to target · hold Shift for names",
    );
    expect(targetHint(DEFAULT_KEYMAP)).not.toContain("Ctrl");
  });

  it("leaves out a clause whose action has no key", () => {
    expect(targetHint({ ...DEFAULT_KEYMAP, "target-next": [], "show-names": [] })).toBe(
      "Click an enemy to target",
    );
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
    walking: false,
    health: 500,
    maxHealth: 500,
    energy: 20,
    maxEnergy: 50,
    adrenaline: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 0,
    dead: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    healthPips: 0,
    energyPips: 0,
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

  it("names the weapon an attack skill needs", () => {
    const refused = (skillId: string): CastRefusedMessage => ({
      kind: "skill",
      slot: 0,
      skillId,
      reason: "wrong-weapon",
    });
    expect(describeRefusal(refused("warrior.swift-chop"))).toBe("Needs an axe.");
    expect(describeRefusal(refused("ranger.barrage"))).toBe("Needs a bow.");
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
    walking: false,
    health: 500,
    maxHealth: 500,
    energy: 20,
    maxEnergy: 50,
    adrenaline: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 0,
    dead: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    healthPips: 0,
    energyPips: 0,
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
    expect(skillSlotHtml(slot("elementalist.fireball"))).toContain('alt="Spell"');
    expect(skillSlotHtml(slot("necromancer.faintheartedness"))).toContain('alt="Hex"');
  });

  it("has no badge for a skill this client does not know", () => {
    expect(skillSlotHtml(slot("nobody.unknown"))).not.toContain("skill-type-badge");
  });
});

describe("isEliteSkill (#459)", () => {
  it("frames Barrage, Backbreaker and Broad Head Arrow, not Fireball or an unknown skill", () => {
    for (const id of ["ranger.barrage", "warrior.backbreaker", "ranger.broad-head-arrow"]) {
      expect(isEliteSkill(id), id).toBe(true);
    }
    expect(isEliteSkill("elementalist.fireball")).toBe(false);
    expect(isEliteSkill("nobody.unknown")).toBe(false);
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

describe("targetProfessionIcons (#281)", () => {
  const target = (
    primaryProfession: PlayerSnapshot["primaryProfession"],
    secondaryProfession: PlayerSnapshot["secondaryProfession"],
  ): PlayerSnapshot => ({
    sessionId: "foe",
    name: "foe",
    x: 0,
    y: 0,
    facing: 0,
    targetSessionId: undefined,
    attackTargetSessionId: undefined,
    walking: false,
    health: 500,
    maxHealth: 500,
    energy: 20,
    maxEnergy: 50,
    adrenaline: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession,
    secondaryProfession,
    team: 1,
    dead: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    healthPips: 0,
    energyPips: 0,
    statuses: [],
  });

  it("shows the primary, then the secondary, each named for alt and title", () => {
    const icons = targetProfessionIcons(target("warrior", "monk"));
    expect(icons.map((icon) => icon.name)).toEqual(["Warrior", "Monk"]);
    expect(icons[0]?.src).toMatch(/icons\/profession\/warrior\.svg$/);
    expect(icons[1]?.src).toMatch(/icons\/profession\/monk\.svg$/);
  });

  it("shows the primary alone with no secondary, and nothing with no profession", () => {
    expect(targetProfessionIcons(target("ranger", undefined)).map((icon) => icon.name)).toEqual([
      "Ranger",
    ]);
    expect(targetProfessionIcons(target(undefined, undefined))).toEqual([]);
    expect(targetProfessionIcons(undefined)).toEqual([]);
  });
});

describe("targetWeaponIcon (#419)", () => {
  const armed = (weaponId: PlayerSnapshot["weaponId"]): PlayerSnapshot =>
    ({ weaponId, primaryProfession: undefined, secondaryProfession: undefined }) as PlayerSnapshot;

  it("names the target's weapon for alt and title", () => {
    const icon = targetWeaponIcon(armed("longbow"));
    expect(icon?.name).toBe("Longbow");
    expect(icon?.src).toMatch(/icons\/weapon\/longbow\.svg$/);
  });

  it("is nothing with no target, no weapon or an unknown one", () => {
    expect(targetWeaponIcon(undefined)).toBeUndefined();
    expect(targetWeaponIcon(armed(undefined))).toBeUndefined();
    expect(targetWeaponIcon(armed("lightsaber"))).toBeUndefined();
  });
});
