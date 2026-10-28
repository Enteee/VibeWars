import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChainRole } from "@vibewars/game-core";
import type { CastRefusedMessage } from "@vibewars/game-protocol";
import type { PlayerSnapshot } from "@vibewars/game-session";

import { DEFAULT_KEYMAP } from "../input/keymap.js";
import { isEliteSkill } from "./icons.js";

import {
  createHud,
  describeOutcome,
  describeRefusal,
  enemyPips,
  formatClock,
  isAttackingTarget,
  lostHealthPercent,
  moraleLabel,
  muteButtonState,
  scoreboardText,
  skillSlotHtml,
  castRowSkill,
  targetCast,
  targetHealthLabel,
  targetHealthPercent,
  targetHint,
  targetHintDismissed,
  targetEffectRows,
  targetProfessionIcons,
  targetChainIcon,
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
    overcast: 0,
    morale: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 1,
    dead: false,
    corpseExploited: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
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

describe("moraleLabel (#843)", () => {
  it("shows the death penalty and a boost as GW1 does, and nothing at 0", () => {
    expect(moraleLabel(-15)).toBe("−15%");
    expect(moraleLabel(-60)).toBe("−60%");
    expect(moraleLabel(10)).toBe("+10%");
    expect(moraleLabel(0)).toBeUndefined();
  });
});

describe("lostHealthPercent (#764)", () => {
  const deepWound = [
    { id: "deep-wound", endsAt: 20, durationSeconds: 20, casterId: "foe" },
  ] as const;

  it("greys the share of the bar a deep wound took", () => {
    expect(lostHealthPercent(player({}))).toBe(0);
    expect(lostHealthPercent(player({ health: 384, statuses: deepWound }))).toBe(20);
    expect(lostHealthPercent(player({ maxHealth: 600, statuses: deepWound }))).toBeCloseTo(
      16.667,
      2,
    );
  });

  it("greys nothing on a corpse", () => {
    expect(lostHealthPercent(player({ health: 0, dead: true, statuses: deepWound }))).toBe(0);
  });

  it("draws the band on every bar, not only a corpse's (#805)", () => {
    // Node has no layout to measure, so read the rule itself: comments
    // out, every selector that styles the band is the band alone.
    const css = fs
      .readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...css.matchAll(/([^{}]*\.hud-bar-lost[^{}]*)\{/g)].map((match) =>
      (match[1] ?? "").trim(),
    );
    expect(selectors).toEqual([".hud-bar-lost"]);
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

describe("enemyPips (#881)", () => {
  const players = [
    player({ sessionId: "a", name: "Ally", team: 0 }),
    player({ sessionId: "f1", name: "Foe", team: 1 }),
    player({ sessionId: "f2", name: "Fallen", team: 1, dead: true }),
    player({ sessionId: "b", name: "Buddy", team: 0, dead: true }),
  ];

  it("holds every foe in snapshot order, the dead hollow", () => {
    expect(enemyPips(players, 0)).toEqual([
      { name: "Foe", team: 1, dead: false },
      { name: "Fallen", team: 1, dead: true },
    ]);
    expect(enemyPips(players, 1)).toEqual([
      { name: "Ally", team: 0, dead: false },
      { name: "Buddy", team: 0, dead: true },
    ]);
  });

  it("gives a spectator every player, grouped by team", () => {
    expect(enemyPips(players, undefined).map((pip) => pip.name)).toEqual([
      "Ally",
      "Buddy",
      "Foe",
      "Fallen",
    ]);
  });

  it("has no pip for a creature (#1052)", () => {
    const minion = player({
      sessionId: "f1/c1",
      team: 1,
      creature: { ownerId: "f1", kind: "minion" },
    });
    expect(enemyPips([...players, minion], 0)).toEqual(enemyPips(players, 0));
  });

  it("has no pip for a seat nobody is in", () => {
    expect(enemyPips([player({ sessionId: "a", team: 0 })], 0)).toEqual([]);
  });
});

describe("scoreboardText (#881)", () => {
  const players = [
    player({ sessionId: "a", team: 0 }),
    player({ sessionId: "b", team: 0 }),
    player({ sessionId: "c", team: 1 }),
    player({ sessionId: "d", team: 1, dead: true }),
  ];

  it("counts the living per side, your own first, beside the clock", () => {
    expect(scoreboardText(players, 0, 42)).toBe("2 v 1 · 0:42");
    expect(scoreboardText(players, 1, 42)).toBe("1 v 2 · 0:42");
  });

  it("counts no creature, alive or not (#1052)", () => {
    const minion = (sessionId: string, team: number) =>
      player({ sessionId, team, creature: { ownerId: "a", kind: "minion" } });
    expect(scoreboardText([...players, minion("a/c1", 0), minion("c/c1", 1)], 0, 42)).toBe(
      "2 v 1 · 0:42",
    );
  });

  it("reads team 1 first for a spectator", () => {
    expect(scoreboardText(players, undefined, 432)).toBe("2 v 1 · 7:12");
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

  it("reads an annihilation win plainly and a win at time as by morale (#846)", () => {
    expect(describeOutcome(0, "annihilation", 0)).toBe("Victory");
    expect(describeOutcome(0, "annihilation", 1)).toBe("Defeat");
    expect(describeOutcome(1, "morale", 1)).toBe("Victory (morale)");
    expect(describeOutcome(1, "morale", 0)).toBe("Defeat (morale)");
    expect(describeOutcome(1, "morale", undefined)).toBe("Team 2 wins (morale)");
  });

  it("calls an annihilation match nobody won a defeat for both teams, never a draw (#846)", () => {
    expect(describeOutcome(undefined, "annihilation", 0)).toBe("Defeat");
    expect(describeOutcome(undefined, "annihilation", 1)).toBe("Defeat");
    expect(describeOutcome(undefined, "morale", 0)).toBe("Defeat (morale)");
    expect(describeOutcome(undefined, "annihilation", undefined)).toBe("No winner");
    expect(describeOutcome(undefined, "morale", undefined)).toBe("No winner (morale)");
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
    overcast: 0,
    morale: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 0,
    dead: false,
    corpseExploited: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
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
    expect(describeRefusal(cast("no-corpse"))).toBe("No corpse in range.");
  });

  it("says a spent skill waits for a morale boost (#474)", () => {
    expect(describeRefusal(cast("spent-until-morale-boost"))).toBe(
      "That skill recharges only on a morale boost.",
    );
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
    overcast: 0,
    morale: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 0,
    dead: false,
    corpseExploited: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
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

  it("shows the skill's 48 px icon, and no name or cost (#719)", () => {
    const html = skillSlotHtml(slot("elementalist.fireball"));
    expect(html).toContain('src="/icons/skill/elementalist.fireball.svg"');
    expect(html).toContain('width="48"');
    expect(html).not.toContain("hud-skill-name");
    expect(html).not.toContain("hud-skill-cost");
  });

  it("lays an adrenaline skill's gauge over its icon, under its hotkey (#826)", () => {
    const html = skillSlotHtml({ ...slot("warrior.rush"), energyCost: 0, adrenalineCost: 4 });
    expect(html.indexOf("skill-icon")).toBeLessThan(html.indexOf("adrenaline-gauge"));
    expect(html.indexOf("adrenaline-gauge")).toBeLessThan(html.indexOf("hud-skill-key"));
    expect(skillSlotHtml(slot("elementalist.fireball"))).not.toContain("adrenaline-gauge");
  });

  it("has the bare plate and no badge for a skill this client does not know", () => {
    const html = skillSlotHtml(slot("nobody.unknown"));
    expect(html).toContain('src="/icons/skill/unknown.svg"');
    expect(html).not.toContain("skill-type-badge");
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
    overcast: 0,
    morale: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession,
    secondaryProfession,
    team: 1,
    dead: false,
    corpseExploited: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
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

describe("targetChainIcon (#916)", () => {
  const foe = (sessionId: string): PlayerSnapshot => ({ sessionId }) as PlayerSnapshot;
  const marks = new Map<string, ChainRole>([
    ["bob", "lead"],
    ["cy", "off-hand"],
    ["dee", "dual"],
  ]);
  const yours = (targetId: string): ChainRole | undefined => marks.get(targetId);

  it("shows your mark on the target, named for alt and title", () => {
    const icon = targetChainIcon(foe("bob"), yours);
    expect(icon?.name).toBe("lead attack landed");
    expect(icon?.src).toMatch(/icons\/ui\/chain-lead\.svg$/);
    expect(targetChainIcon(foe("cy"), yours)?.src).toMatch(/icons\/ui\/chain-off-hand\.svg$/);
    expect(targetChainIcon(foe("dee"), yours)?.name).toBe("dual attack landed");
  });

  it("follows the target: another target shows its own mark, or none", () => {
    expect(targetChainIcon(foe("cy"), yours)?.name).toBe("off-hand attack landed");
    expect(targetChainIcon(foe("eve"), yours)).toBeUndefined();
    expect(targetChainIcon(foe("bob"), yours)?.name).toBe("lead attack landed");
  });

  it("is nothing with no target, or once the mark has run out", () => {
    expect(targetChainIcon(undefined, yours)).toBeUndefined();
    marks.delete("bob");
    expect(targetChainIcon(foe("bob"), yours)).toBeUndefined();
  });
});

describe("targetEffectRows (#835)", () => {
  const self = player({ sessionId: "me", team: 0 });
  const names = new Map([
    ["me", "Ann"],
    ["foe", "Mhenlo"],
    ["ally", "Cynn"],
  ]);
  const foe = player({
    statuses: [
      { id: "bleeding", endsAt: 20, durationSeconds: 10, casterId: "me" },
      { id: "crippled", endsAt: 15, durationSeconds: 10, casterId: "ally" },
    ],
  });
  const ally = player({
    sessionId: "ally",
    team: 0,
    statuses: [{ id: "armor-boost", endsAt: 18, durationSeconds: 10, casterId: "me" }],
  });

  it("shows the target's statuses in the order the host sent them", () => {
    const rows = targetEffectRows(self, foe, names, 10);
    expect(rows.map((row) => [row.id, row.casterName, row.fraction])).toEqual([
      ["bleeding", "you", 1],
      ["crippled", "Cynn", 0.5],
    ]);
  });

  it("replaces them with the new target's when the target changes", () => {
    expect(targetEffectRows(self, ally, names, 10).map((row) => row.id)).toEqual(["armor-boost"]);
  });

  it("ticks an enchantment you put on an ally, never a condition you put on a foe", () => {
    expect(targetEffectRows(self, ally, names, 10)[0]?.yours).toBe(true);
    expect(targetEffectRows(self, foe, names, 10)[0]?.yours).toBe(false);
  });

  it("shows nothing with no target, a dead one, or no match clock", () => {
    expect(targetEffectRows(self, undefined, names, 10)).toEqual([]);
    expect(targetEffectRows(self, { ...foe, dead: true }, names, 10)).toEqual([]);
    expect(targetEffectRows(self, foe, names, undefined)).toEqual([]);
  });

  it("shows what your own monitor does when you target yourself", () => {
    const me = { ...ally, sessionId: "me" };
    expect(targetEffectRows(me, me, names, 10)).toEqual([
      expect.objectContaining({ id: "armor-boost", yours: true, casterName: "you" }),
    ]);
  });
});

/** Just enough of an element for `createHud` to build into, without jsdom. */
class FakeNode {
  className = "";
  hidden = false;
  readonly children: FakeNode[] = [];
  readonly style = { setProperty: (): void => undefined };
  readonly setAttribute = (): void => undefined;

  appendChild(child: FakeNode): FakeNode {
    this.children.push(child);
    return child;
  }

  append(...children: (FakeNode | string)[]): void {
    for (const child of children) {
      if (typeof child !== "string") {
        this.appendChild(child);
      }
    }
  }
}

/** `node` and everything under it, in document order. */
function descendants(node: FakeNode): FakeNode[] {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

describe("createHud's layout (#1042)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const build = (): { parent: FakeNode; hud: ReturnType<typeof createHud> } => {
    vi.stubGlobal("document", { createElement: () => new FakeNode() });
    const parent = new FakeNode();
    const hud = createHud(parent as unknown as HTMLElement, () => undefined);
    return { parent, hud };
  };
  const named = (nodes: FakeNode[], names: readonly string[]): string[] =>
    nodes
      .map((node) => node.className.split(" "))
      .flatMap((classes) => names.filter((name) => classes.includes(name)));

  it("stacks your block, top down: hint, message, effects, morale and gear, health, energy, skills", () => {
    const { hud } = build();
    const order = [
      "hud-hint",
      "hud-message",
      "effects-monitor",
      "hud-morale",
      "hud-gear",
      "hud-bar-health",
      "hud-bar-energy",
      "hud-skills",
    ];
    expect(named(descendants(hud.root as unknown as FakeNode), order)).toEqual(order);
  });

  it("puts the target frame under the scoreboard, outside your block", () => {
    const { parent, hud } = build();
    const top = hud.top as unknown as FakeNode;
    expect(parent.children).toContain(top);
    expect(top.children.map((node) => node.className)).toEqual(["hud-scoreboard", "hud-target"]);
    expect(descendants(hud.root as unknown as FakeNode)).not.toContain(hud.targetPanel);
  });

  it("grows the target frame's effects below its cast row", () => {
    const { hud } = build();
    const rows = (hud.targetPanel as unknown as FakeNode).children.map((node) => node.className);
    expect(rows).toEqual([
      "hud-target-header",
      "hud-target-health-row",
      "hud-target-cast",
      "effects-monitor",
    ]);
  });
});
