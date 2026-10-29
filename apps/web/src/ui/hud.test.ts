import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChainRole, StatusId } from "@vibewars/game-core";
import type { CastRefusedMessage } from "@vibewars/game-protocol";
import type { MatchSnapshot, PlayerSnapshot, StatusSnapshot } from "@vibewars/game-session";

import { DEFAULT_KEYMAP } from "../input/keymap.js";
import { isEliteSkill } from "./icons.js";

import {
  carriedBundle,
  objectTargetName,
  changedSlots,
  createHud,
  type HudElements,
  describeOutcome,
  describeRefusal,
  enemyPips,
  formatClock,
  ghostLeaderLabel,
  ghostLeaderToast,
  ghostNameplate,
  invulnerableLabel,
  isAttackingTarget,
  lostHealthPercent,
  moraleLabel,
  muteButtonState,
  refreshSkillBar,
  scoreboardParts,
  scoreboardText,
  objectiveScoreToast,
  standBoostToast,
  carrierLines,
  type ScoreboardMatch,
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
    guildTag: undefined,
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
    invulnerableSeconds: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    bot: false,
    statuses: [],
    ...fields,
  };
}

describe("changedSlots (#469)", () => {
  const slot = (id: string) => ({
    id,
    name: id,
    energyCost: 0,
    adrenalineCost: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    copyEndsAt: null,
  });

  it("names a slot whose skill changed: an echo's copy, and the echo back", () => {
    const painted = ["mesmer.arcane-echo", null, "elementalist.fireball"];
    const copied = [slot("elementalist.fireball"), null, slot("elementalist.fireball")];
    expect(changedSlots(painted, copied)).toEqual([0]);
    expect(
      changedSlots(["elementalist.fireball", null], [slot("mesmer.arcane-echo"), null]),
    ).toEqual([0]);
  });

  it("names none when every slot holds what it was painted with", () => {
    const painted = ["mesmer.arcane-echo", null];
    expect(changedSlots(painted, [slot("mesmer.arcane-echo"), null])).toEqual([]);
  });

  it("repaints a slot clean of the recharge mark its old skill left (#1154)", () => {
    const classes = new Set(["hud-skill", "is-recharging"]);
    const button = {
      dataset: { skillId: "mesmer.arcane-echo" } as Record<string, string>,
      innerHTML: "",
      classList: {
        remove: (name: string) => classes.delete(name),
        toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
      },
      querySelector: () => null,
      setAttribute: (): void => undefined,
    };
    const hud = {
      skillBar: { querySelectorAll: () => [button] },
      slotTips: { repainted: (): void => undefined },
    } as unknown as HudElements;
    refreshSkillBar(hud, [{ ...slot("elementalist.fireball"), copyEndsAt: 30 }]);
    expect(button.dataset.skillId).toBe("elementalist.fireball");
    expect(classes.has("is-recharging")).toBe(false);
    expect(button.innerHTML).toContain("echo-strip");
  });
});

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

describe("invulnerableLabel (#1233)", () => {
  it("counts the seconds left, rounded up, as a clock", () => {
    expect(invulnerableLabel(4.2)).toBe("Invulnerable 0:05");
    expect(invulnerableLabel(4)).toBe("Invulnerable 0:04");
    expect(invulnerableLabel(0.01)).toBe("Invulnerable 0:01");
  });
});

describe("objectTargetName (#1225)", () => {
  const NOBODY = { holder: undefined, heldSeconds: 0 };

  it("names the stand and a flag by whose it is, and nothing else", () => {
    expect(objectTargetName("flag-stand", 0, NOBODY)).toBe("Flag Stand");
    expect(objectTargetName("flag/0", 0, NOBODY)).toBe("Your flag");
    expect(objectTargetName("flag/1", 0, NOBODY)).toBe("Enemy flag");
    expect(objectTargetName("relic/0", 0, undefined)).toBe("Your relic");
    expect(objectTargetName("relic/0", 1, undefined)).toBe("Enemy relic");
    expect(objectTargetName("peer-1", 0, NOBODY)).toBeUndefined();
    expect(objectTargetName(undefined, 0, NOBODY)).toBeUndefined();
  });

  it("names the stand's holder (#1226)", () => {
    const red = { holder: 1, heldSeconds: 30 };
    expect(objectTargetName("flag-stand", 0, red)).toBe("Flag Stand: held by the enemy");
    expect(objectTargetName("flag-stand", 1, red)).toBe("Flag Stand: held by your team");
  });
});

describe("carrierLines (#1226)", () => {
  const players = [
    player({ sessionId: "me", name: "Mhenlo", team: 0 }),
    player({ sessionId: "foe", name: "Cynn", team: 1 }),
  ];

  it("names each flag's carrier, yours first, and a dropped one; none at home", () => {
    const carried = (team: number, carrierId: string) => ({
      team,
      place: { kind: "carried" as const, carrierId },
    });
    const flags = [carried(1, "me"), carried(0, "foe")];
    expect(carrierLines({ flags, relics: [], players }, 0)).toEqual([
      { team: 0, text: "⚑ Cynn" },
      { team: 1, text: "⚑ Mhenlo" },
    ]);
    expect(carrierLines({ flags, relics: [], players }, 1)).toEqual([
      { team: 1, text: "⚑ Mhenlo" },
      { team: 0, text: "⚑ Cynn" },
    ]);
    expect(
      carrierLines(
        {
          flags: [
            { team: 0, place: { kind: "ground", position: { x: 1, y: 2 } } },
            { team: 1, place: { kind: "spawn" } },
          ],
          relics: [],
          players,
        },
        0,
      ),
    ).toEqual([{ team: 0, text: "⚑ dropped" }]);
    expect(
      carrierLines({ flags: [{ team: 1, place: { kind: "stand" } }], relics: [], players }, 0),
    ).toEqual([]);
  });

  it("shows where each relic is in the flags' slot, at base too, yours first (#1374)", () => {
    const relics = [
      { team: 0, place: { kind: "spawn" as const } },
      { team: 1, place: { kind: "carried" as const, carrierId: "foe" } },
    ];
    expect(carrierLines({ flags: [], relics, players }, 1)).toEqual([
      { team: 1, text: "✦ Cynn" },
      { team: 0, text: "✦ at base" },
    ]);
    const lying = [{ team: 0, place: { kind: "ground" as const, position: { x: 1, y: 2 } } }];
    expect(carrierLines({ flags: [], relics: lying, players }, 0)).toEqual([
      { team: 0, text: "✦ dropped" },
    ]);
  });

  it("reads a carrier no longer in the snapshot as dropped", () => {
    const flags = [{ team: 0, place: { kind: "carried" as const, carrierId: "gone" } }];
    expect(carrierLines({ flags, relics: [], players }, 0)).toEqual([
      { team: 0, text: "⚑ dropped" },
    ]);
  });
});

describe("objectiveScoreToast in a Relic Run (#1387)", () => {
  const relics = [{ team: 0, place: { kind: "spawn" as const } }];
  const score = (scoreTeam0: number, scoreTeam1: number) => ({
    scoreTeam0,
    scoreTeam1,
    relics,
    altar: undefined,
  });
  const ours = { text: "Relic scored!", side: "ours" };
  const theirs = { text: "Enemy relic scored", side: "theirs" };
  const toast = (
    before: Parameters<typeof objectiveScoreToast>[0],
    after: Parameters<typeof objectiveScoreToast>[1],
    selfTeam: number | undefined,
  ) => objectiveScoreToast(before, after, selfTeam, "relic-run");

  it("toasts your side's point as ours and the foe's as theirs", () => {
    expect(toast(score(0, 0), score(1, 0), 0)).toEqual(ours);
    expect(toast(score(0, 0), score(1, 0), 1)).toEqual(theirs);
    expect(toast(score(2, 3), score(2, 4), 1)).toEqual(ours);
    expect(toast(score(2, 3), score(2, 4), 0)).toEqual(theirs);
  });

  it("reads a spectator's side as team 0's", () => {
    expect(toast(score(0, 0), score(1, 0), undefined)).toEqual(ours);
    expect(toast(score(0, 0), score(0, 1), undefined)).toEqual(theirs);
  });

  it("toasts two points missed between frames once", () => {
    expect(toast(score(1, 0), score(3, 0), 0)).toEqual(ours);
    // Both sides scored meanwhile: yours is the one toast.
    expect(toast(score(1, 1), score(2, 2), 1)).toEqual(ours);
  });

  it("says nothing without a score, on the first snapshot, or outside a Relic Run", () => {
    expect(toast(score(1, 1), score(1, 1), 0)).toBeUndefined();
    expect(toast(undefined, score(1, 0), 0)).toBeUndefined();
    // A kill-count match raises the score too, silently.
    expect(objectiveScoreToast(score(4, 0), score(5, 0), 0, "kill-count")).toBeUndefined();
  });

  it("says nothing on a mid-match rejoin, whose first frame follows the 0-0 placeholder", () => {
    const placeholder = { scoreTeam0: 0, scoreTeam1: 0, relics: [], altar: undefined };
    expect(toast(placeholder, score(2, 1), 0)).toBeUndefined();
  });
});

describe("objectiveScoreToast in King of the Hill (#1399)", () => {
  const altar = { x: 0, y: 0 };
  const score = (scoreTeam0: number, scoreTeam1: number) => ({
    scoreTeam0,
    scoreTeam1,
    relics: [],
    altar,
  });
  const ours = { text: "Altar point!", side: "ours" };
  const theirs = { text: "Enemy altar point", side: "theirs" };
  const toast = (
    before: Parameters<typeof objectiveScoreToast>[0],
    after: Parameters<typeof objectiveScoreToast>[1],
    selfTeam: number | undefined,
  ) => objectiveScoreToast(before, after, selfTeam, "king-of-the-hill");

  it("toasts your side's point as ours and the foe's as theirs", () => {
    expect(toast(score(0, 0), score(1, 0), 0)).toEqual(ours);
    expect(toast(score(0, 0), score(1, 0), 1)).toEqual(theirs);
    expect(toast(score(2, 3), score(2, 4), 1)).toEqual(ours);
    expect(toast(score(2, 3), score(2, 4), 0)).toEqual(theirs);
  });

  it("reads a spectator's side as team 0's", () => {
    expect(toast(score(0, 0), score(1, 0), undefined)).toEqual(ours);
    expect(toast(score(0, 0), score(0, 1), undefined)).toEqual(theirs);
  });

  it("toasts two points between frames once", () => {
    expect(toast(score(1, 0), score(3, 0), 0)).toEqual(ours);
  });

  it("says nothing without a point, on the first snapshot, or after the placeholder", () => {
    expect(toast(score(1, 1), score(1, 1), 0)).toBeUndefined();
    expect(toast(undefined, score(1, 0), 0)).toBeUndefined();
    const placeholder = { scoreTeam0: 0, scoreTeam1: 0, relics: [], altar: undefined };
    expect(toast(placeholder, score(2, 1), 0)).toBeUndefined();
  });

  it("stays silent in Kill Count and Annihilation", () => {
    expect(objectiveScoreToast(score(4, 0), score(5, 0), 0, "kill-count")).toBeUndefined();
    expect(objectiveScoreToast(score(4, 0), score(5, 0), 0, "annihilation")).toBeUndefined();
  });
});

describe("standBoostToast (#1226)", () => {
  /** A snapshot's stand at a match time. */
  const at = (elapsedSeconds: number, holder: number | undefined, heldSeconds: number) => ({
    elapsedSeconds,
    stand: { holder, heldSeconds },
  });

  it("toasts the boost to its side and the foe's, once, as the count starts again", () => {
    expect(standBoostToast(at(200, 0, 119.95), at(200.05, 0, 0), 0)).toEqual({
      text: "Morale boost! +10%",
      side: "ours",
    });
    expect(standBoostToast(at(200, 0, 119.95), at(200.05, 0, 0), 1)).toEqual({
      text: "Enemy morale boost",
      side: "theirs",
    });
    expect(standBoostToast(at(200, 1, 119.9), at(200.2, 1, 0.1), undefined)).toEqual({
      text: "Enemy morale boost",
      side: "theirs",
    });
    // Frames missed across it: still the boost.
    expect(standBoostToast(at(200, 0, 110), at(215, 0, 5), 0)).toEqual({
      text: "Morale boost! +10%",
      side: "ours",
    });
    expect(standBoostToast(at(200.05, 0, 0), at(200.1, 0, 0.05), 0)).toBeUndefined();
  });

  it("says nothing for a lose and retake between two snapshots", () => {
    // Lost at 50 s held, retaken: the count restarts short of a boost.
    expect(standBoostToast(at(200, 0, 50), at(210, 0, 3), 0)).toBeUndefined();
    // A reconnect after 30 s away, the stand retaken meanwhile.
    expect(standBoostToast(at(200, 0, 100), at(230, 0, 25), 0)).toBeUndefined();
  });

  it("says nothing for a taking, a loss or no stand", () => {
    expect(standBoostToast(at(0, undefined, 0), at(1, 0, 0), 0)).toBeUndefined();
    expect(standBoostToast(at(0, 1, 50), at(1, 0, 0), 0)).toBeUndefined();
    expect(standBoostToast(at(0, 0, 50), at(1, undefined, 0), 0)).toBeUndefined();
    expect(standBoostToast(undefined, at(1, 0, 0), 0)).toBeUndefined();
    expect(
      standBoostToast({ elapsedSeconds: 0, stand: undefined }, at(1, 0, 0), 0),
    ).toBeUndefined();
  });
});

describe("carriedBundle (#1225, #1374)", () => {
  const match = (
    flags: MatchSnapshot["flags"],
    relics: MatchSnapshot["relics"] = [],
  ): MatchSnapshot => ({
    selfSessionId: "me",
    players: [],
    scoreTeam0: 0,
    scoreTeam1: 0,
    elapsedSeconds: 0,
    phase: "active",
    winningTeam: undefined,
    endReason: undefined,
    projectiles: [],
    groundEffects: [],
    traps: [],
    flags,
    stand: { holder: undefined, heldSeconds: 0 },
    aggression: [],
    relics,
    altar: undefined,
    altarHolder: undefined,
    altarHeldSeconds: 0,
    capturePoints: [],
    summary: undefined,
  });

  it("shows the Drop button only to the flag's carrier", () => {
    const carried = match([{ team: 0, place: { kind: "carried", carrierId: "me" } }]);
    expect(carriedBundle(carried, "me")).toBe("flag");
    expect(carriedBundle(carried, "ally")).toBeUndefined();
    expect(carriedBundle(match([{ team: 0, place: { kind: "spawn" } }]), "me")).toBeUndefined();
    expect(carriedBundle(match([]), "me")).toBeUndefined();
  });

  it("names a relic for its carrier's Drop button (#1374)", () => {
    const carried = match([], [{ team: 1, place: { kind: "carried", carrierId: "me" } }]);
    expect(carriedBundle(carried, "me")).toBe("relic");
    expect(carriedBundle(carried, "ally")).toBeUndefined();
  });

  it("shows the Drop button to a Ritualist holding ashes, named for them (#1434)", () => {
    const status = (id: StatusId): StatusSnapshot => ({
      id,
      endsAt: 10,
      durationSeconds: 51,
      casterId: "me",
    });
    const holding = {
      ...match([]),
      players: [
        player({ sessionId: "me", statuses: [status("blind-was-mingson")] }),
        player({ sessionId: "ally", statuses: [status("regeneration")] }),
      ],
    };
    expect(carriedBundle(holding, "me")).toBe("ashes");
    expect(carriedBundle(holding, "ally")).toBeUndefined();
  });

  it("starts hidden", () => {
    vi.stubGlobal("document", { createElement: () => new FakeNode() });
    const hud = createHud(
      new FakeNode() as unknown as HTMLElement,
      () => undefined,
      () => undefined,
    );
    vi.unstubAllGlobals();
    expect(hud.dropFlag.hidden).toBe(true);
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
      creature: {
        ownerId: "f1",
        kind: "minion",
        look: "bone-minion",
        mode: null,
        armedAttack: null,
        leaderId: null,
      },
    });
    expect(enemyPips([...players, minion], 0)).toEqual(enemyPips(players, 0));
  });

  it("has no pip for a seat nobody is in", () => {
    expect(enemyPips([player({ sessionId: "a", team: 0 })], 0)).toEqual([]);
  });
});

/** The scoreboard's match with these kills, no stand and no aggression. */
function board(team0: number, team1: number): ScoreboardMatch {
  return {
    scoreTeam0: team0,
    scoreTeam1: team1,
    stand: undefined,
    aggression: [],
    altarHolder: undefined,
    altarHeldSeconds: 0,
  };
}

describe("scoreboardText (#881)", () => {
  const players = [
    player({ sessionId: "a", team: 0 }),
    player({ sessionId: "b", team: 0 }),
    player({ sessionId: "c", team: 1 }),
    player({ sessionId: "d", team: 1, dead: true }),
  ];

  it("counts the living per side, your own first, beside the clock", () => {
    expect(scoreboardText(players, 0, 42, null, "annihilation", board(0, 0))).toBe("2 v 1 · 0:42");
    expect(scoreboardText(players, 1, 42, null, "annihilation", board(0, 0))).toBe("1 v 2 · 0:42");
  });

  it("counts no creature, alive or not (#1052)", () => {
    const minion = (sessionId: string, team: number) =>
      player({
        sessionId,
        team,
        creature: {
          ownerId: "a",
          kind: "minion",
          look: "bone-minion",
          mode: null,
          armedAttack: null,
          leaderId: null,
        },
      });
    expect(
      scoreboardText(
        [...players, minion("a/c1", 0), minion("c/c1", 1)],
        0,
        42,
        null,
        "annihilation",
        board(0, 0),
      ),
    ).toBe("2 v 1 · 0:42");
  });

  it("reads team 1 first for a spectator", () => {
    expect(scoreboardText(players, undefined, 432, null, "annihilation", board(0, 0))).toBe(
      "2 v 1 · 7:12",
    );
  });

  it("counts down from the match's limit, reading 0:00 only once time is out (#476)", () => {
    expect(scoreboardText(players, 0, 0, 180, "annihilation", board(0, 0))).toBe("2 v 1 · 3:00");
    expect(scoreboardText(players, 0, 42.5, 180, "annihilation", board(0, 0))).toBe("2 v 1 · 2:18");
    expect(scoreboardText(players, 0, 179.5, 180, "annihilation", board(0, 0))).toBe(
      "2 v 1 · 0:01",
    );
    expect(scoreboardText(players, 0, 181, 180, "annihilation", board(0, 0))).toBe("2 v 1 · 0:00");
  });

  it("counts the living, not the score, in Annihilation", () => {
    expect(scoreboardText(players, 0, 42, null, "annihilation", board(4, 0))).toBe("2 v 1 · 0:42");
  });

  describe("on a Priest Annihilation map (#1199)", () => {
    const priest = (team: number, dead = false) =>
      player({
        sessionId: `priest-${String(team)}`,
        team,
        dead,
        creature: {
          ownerId: null,
          kind: "priest",
          look: "priest",
          mode: null,
          armedAttack: null,
          leaderId: null,
        },
      });
    const priests = (dead0: boolean, dead1: boolean) => [
      ...players,
      priest(0, dead0),
      priest(1, dead1),
    ];

    it("counts the living, not the priests, then each priest and the next raise", () => {
      expect(
        scoreboardText(priests(false, false), 0, 73, 720, "priest-annihilation", board(0, 0)),
      ).toBe("2 v 1 · ✚ ✚ · raise 0:47 · 10:47");
    });

    it("strikes out a dead priest, your own side's first", () => {
      expect(
        scoreboardParts(priests(false, true), 0, 73, 720, "priest-annihilation", board(0, 0)),
      ).toContainEqual({ kind: "priest", team: 1, alive: false });
      expect(
        scoreboardParts(
          priests(false, true),
          1,
          73,
          720,
          "priest-annihilation",
          board(0, 0),
        ).filter((part) => part.kind === "priest"),
      ).toEqual([
        { kind: "priest", team: 1, alive: false },
        { kind: "priest", team: 0, alive: true },
      ]);
    });

    it("reads raise — once both priests are dead", () => {
      expect(
        scoreboardText(priests(true, true), 0, 73, 720, "priest-annihilation", board(0, 0)),
      ).toBe("2 v 1 · ✚ ✚ · raise — · 10:47");
    });

    it("counts down to the next wave, every 2 minutes of match clock", () => {
      const raise = (elapsed: number) =>
        scoreboardParts(
          priests(false, false),
          0,
          elapsed,
          720,
          "priest-annihilation",
          board(0, 0),
        ).find((part) => part.kind === "raise");
      expect(raise(0)).toEqual({ kind: "raise", text: "raise 2:00", soon: false });
      expect(raise(119)).toEqual({ kind: "raise", text: "raise 0:01", soon: true });
      expect(raise(120)).toEqual({ kind: "raise", text: "raise 2:00", soon: false });
      expect(raise(121)).toEqual({ kind: "raise", text: "raise 1:59", soon: false });
      expect(raise(114.5)).toEqual({ kind: "raise", text: "raise 0:06", soon: false });
      expect(raise(115)).toEqual({ kind: "raise", text: "raise 0:05", soon: true });
    });

    it("drops the raise once time is out", () => {
      expect(
        scoreboardText(priests(false, false), 0, 720, 720, "priest-annihilation", board(0, 0)),
      ).toBe("2 v 1 · ✚ ✚ · 0:00");
    });

    it("leaves the other modes' scoreboards without priests", () => {
      expect(scoreboardText(priests(false, false), 0, 42, null, "annihilation", board(0, 0))).toBe(
        "2 v 1 · 0:42",
      );
    });
  });

  it("counts each team's kills in Kill Count, your own first (#1200)", () => {
    expect(scoreboardText(players, 0, 35, 180, "kill-count", board(4, 0))).toBe("4 – 0 · 2:25");
    expect(scoreboardText(players, 1, 35, 180, "kill-count", board(4, 0))).toBe("0 – 4 · 2:25");
  });

  it("counts each team's relic points in a Relic Run, your own first (#1374)", () => {
    expect(scoreboardText(players, 0, 80, 480, "relic-run", board(2, 1))).toBe("2 – 1 · 6:40");
    expect(scoreboardText(players, 1, 80, 480, "relic-run", board(2, 1))).toBe("1 – 2 · 6:40");
  });

  it("reads team 1's kills first for a spectator, and 0 – 0 before any (#1200)", () => {
    expect(scoreboardText(players, undefined, 35, 180, "kill-count", board(4, 1))).toBe(
      "4 – 1 · 2:25",
    );
    expect(scoreboardText(players, 0, 0, 180, "kill-count", board(0, 0))).toBe("0 – 0 · 3:00");
  });
});

describe("the Guild Battle scoreboard (#1226)", () => {
  const lord = (team: number, health: number, dead = false) =>
    player({
      sessionId: `guild-lord/${String(team)}`,
      team,
      health,
      maxHealth: 1000,
      dead,
      creature: {
        ownerId: null,
        kind: "guild-lord",
        look: "guild-lord",
        mode: null,
        armedAttack: null,
        leaderId: null,
      },
    });
  const players = [
    player({ sessionId: "a", team: 0 }),
    player({ sessionId: "c", team: 1 }),
    lord(0, 829),
    lord(1, 640),
  ];
  const held = (
    holder: number | undefined,
    heldSeconds: number,
    aggression: number[] = [],
  ): ScoreboardMatch => ({
    ...board(0, 0),
    stand: { holder, heldSeconds },
    aggression,
  });
  const LIMIT = 28 * 60;

  it("reads both lords, the stand held to its boost, the wave and the clock, yours first", () => {
    expect(scoreboardText(players, 0, 73, LIMIT, "guild-battle", held(0, 48))).toBe(
      "Lord 82% · 64% · ⚑ 1:12 · raise 0:47 · 26:47",
    );
    expect(scoreboardText(players, 1, 73, LIMIT, "guild-battle", held(0, 48))).toBe(
      "Lord 64% · 82% · ⚑ 1:12 · raise 0:47 · 26:47",
    );
    // A spectator reads team 0 first.
    expect(scoreboardText(players, undefined, 73, LIMIT, "guild-battle", held(0, 48))).toBe(
      "Lord 82% · 64% · ⚑ 1:12 · raise 0:47 · 26:47",
    );
  });

  it("reads a stand held by nobody as a grey ⚑ —, and the holder's in its side's colour", () => {
    const parts = scoreboardParts(players, 0, 73, LIMIT, "guild-battle", held(undefined, 0));
    expect(parts).toContainEqual({ kind: "side", team: undefined, text: "⚑ —", dead: false });
    expect(scoreboardParts(players, 0, 73, LIMIT, "guild-battle", held(1, 0))).toContainEqual({
      kind: "side",
      team: 1,
      text: "⚑ 2:00",
      dead: false,
    });
  });

  it("reads a lord at 0.4% as 1%, and a dead one as 0%, struck out", () => {
    const parts = scoreboardParts(
      [...players.slice(0, 2), lord(0, 4), lord(1, 0, true)],
      0,
      73,
      LIMIT,
      "guild-battle",
      held(undefined, 0),
    );
    expect(parts.slice(0, 2)).toEqual([
      { kind: "side", team: 0, text: "Lord 1%", dead: false },
      { kind: "side", team: 1, text: "0%", dead: true },
    ]);
  });

  it("ticks the shrines' wave with no priest, pulsing its last seconds", () => {
    const parts = scoreboardParts(players, 0, 117, LIMIT, "guild-battle", held(undefined, 0));
    expect(parts).toContainEqual({ kind: "raise", text: "raise 0:03", soon: true });
  });

  it("adds each side's aggression, yours first, only in the last 3 minutes", () => {
    const aggression = [1240, 980];
    expect(
      scoreboardText(
        players,
        0,
        LIMIT - 181,
        LIMIT,
        "guild-battle",
        held(undefined, 0, aggression),
      ),
    ).not.toContain("agg");
    expect(
      scoreboardText(
        players,
        0,
        LIMIT - 180,
        LIMIT,
        "guild-battle",
        held(undefined, 0, aggression),
      ),
    ).toBe("Lord 82% · 64% · ⚑ — · raise 1:00 · agg 1,240 v 980 · 3:00");
    expect(
      scoreboardText(players, 1, LIMIT + 1, LIMIT, "guild-battle", held(undefined, 0, aggression)),
    ).toContain("agg 980 v 1,240 · 0:00");
  });
});

describe("King of the Hill's scoreboard (#1377)", () => {
  const players = [player({ sessionId: "a", team: 0 }), player({ sessionId: "c", team: 1 })];

  it("reads the points, then the altar's holder and the time to its next point in the stand's slot", () => {
    const held = { ...board(2, 1), altarHolder: 1, altarHeldSeconds: 12.5 };
    expect(scoreboardText(players, 0, 80, 480, "king-of-the-hill", held)).toBe(
      "2 – 1 · ▲ 0:18 · 6:40",
    );
    expect(scoreboardParts(players, 1, 80, 480, "king-of-the-hill", held)).toContainEqual({
      kind: "side",
      team: 1,
      text: "▲ 0:18",
      dead: false,
    });
    expect(scoreboardParts(players, 0, 80, 480, "king-of-the-hill", board(0, 0))).toContainEqual({
      kind: "side",
      team: undefined,
      text: "▲ —",
      dead: false,
    });
  });
});

describe("describeOutcome", () => {
  it("reads as victory for the winning team's own players", () => {
    expect(describeOutcome(0, "score", 0, [])).toBe("Victory");
  });

  it("reads as defeat for the losing team's players", () => {
    expect(describeOutcome(0, "score", 1, [])).toBe("Defeat");
  });

  it("calls out a draw", () => {
    expect(describeOutcome(undefined, "time", 0, [])).toBe("Draw (time)");
  });

  it("notes when a match ended on the clock rather than on score", () => {
    expect(describeOutcome(1, "time", 1, [])).toBe("Victory (time)");
    expect(describeOutcome(1, "score", 1, [])).toBe("Victory");
  });

  it("falls back to naming the team for a spectator with no team of their own", () => {
    expect(describeOutcome(1, "score", undefined, [])).toBe("Team 2 wins");
  });

  it("reads an annihilation win plainly and a win at time as by morale (#846)", () => {
    expect(describeOutcome(0, "annihilation", 0, [])).toBe("Victory");
    expect(describeOutcome(0, "annihilation", 1, [])).toBe("Defeat");
    expect(describeOutcome(1, "morale", 1, [])).toBe("Victory (morale)");
    expect(describeOutcome(1, "morale", 0, [])).toBe("Defeat (morale)");
    expect(describeOutcome(1, "morale", undefined, [])).toBe("Team 2 wins (morale)");
  });

  it("says why a Guild Battle ended: a lord slain, or aggression at time, both sides' (#1222, #1226)", () => {
    expect(describeOutcome(0, "guild-lord", 0, [])).toBe("Victory (Guild Lord slain)");
    expect(describeOutcome(0, "guild-lord", 1, [])).toBe("Defeat (Guild Lord slain)");
    expect(describeOutcome(1, "aggression", 1, [980, 1240])).toBe(
      "Victory (aggression 1,240 v 980)",
    );
    expect(describeOutcome(undefined, "guild-lord", 0, [])).toBe("Defeat (Guild Lord slain)");
    expect(describeOutcome(undefined, "aggression", 1, [500, 500])).toBe(
      "Defeat (aggression 500 v 500)",
    );
  });

  it("keeps a Guild Battle's line short enough for one line of the banner at 1100 px (#1226)", () => {
    // 1.8rem capitals spaced 0.15em are about 23 px each: 40 of them, 920 px.
    const lines = [0, 1, undefined].flatMap((winner) =>
      [0, 1, undefined].flatMap((self) => [
        describeOutcome(winner, "guild-lord", self, []),
        describeOutcome(winner, "aggression", self, [99_999, 99_999]),
      ]),
    );
    for (const line of lines) {
      expect(line.length, line).toBeLessThanOrEqual(40);
    }
  });

  it("calls an annihilation match nobody won a defeat for both teams, never a draw (#846)", () => {
    expect(describeOutcome(undefined, "annihilation", 0, [])).toBe("Defeat");
    expect(describeOutcome(undefined, "annihilation", 1, [])).toBe("Defeat");
    expect(describeOutcome(undefined, "morale", 0, [])).toBe("Defeat (morale)");
    expect(describeOutcome(undefined, "annihilation", undefined, [])).toBe("No winner");
    expect(describeOutcome(undefined, "morale", undefined, [])).toBe("No winner (morale)");
  });
});

describe("targetHint (#253, #302)", () => {
  it("tells a new player how to target and how to see every name, by their keys", () => {
    expect(targetHint(DEFAULT_KEYMAP, "annihilation")).toBe(
      "Click an enemy or press Tab to target · hold Shift for names",
    );
    expect(targetHint(DEFAULT_KEYMAP, "annihilation")).not.toContain("Ctrl");
  });

  it("leaves out a clause whose action has no key", () => {
    expect(
      targetHint({ ...DEFAULT_KEYMAP, "target-next": [], "show-names": [] }, "annihilation"),
    ).toBe("Click an enemy to target");
  });

  it("in King of the Hill, tells you to lead your own ghost first, by the attack key (#1377)", () => {
    expect(targetHint(DEFAULT_KEYMAP, "king-of-the-hill")).toBe(
      "Right-click your Ghostly Hero, then Space: it follows you to the altar",
    );
    expect(targetHint({ ...DEFAULT_KEYMAP, attack: [] }, "king-of-the-hill")).toBe(
      "Click an enemy or press Tab to target · hold Shift for names",
    );
  });
});

describe("a Ghostly Hero's leader (#1377, #1419)", () => {
  const me = player({ sessionId: "me", name: "me", team: 0 });
  const names = new Map([
    ["me", "me"],
    ["ally", "Devona"],
  ]);
  const ghost = (team: number, leaderId: string | null): PlayerSnapshot =>
    player({
      sessionId: `ghost/${String(team)}`,
      name: "Ghostly Hero",
      team,
      creature: {
        ownerId: null,
        kind: "ghostly-hero",
        look: "ghostly-hero",
        mode: null,
        armedAttack: null,
        leaderId,
      },
    });
  /** A snapshot of both teams' ghosts, team 0's following `ours` and team 1's `theirs`. */
  const ghosts = (ours: string | null, theirs: string | null = null) => ({
    players: [me, ghost(0, ours), ghost(1, theirs)],
  });
  const toast = (
    before: ReturnType<typeof ghosts> | undefined,
    after: ReturnType<typeof ghosts>,
    selfTeam: number | undefined = 0,
  ) => ghostLeaderToast(before, after, "me", selfTeam, names);

  describe("ghostLeaderLabel", () => {
    it("says whom your team's ghost follows, or that it stays", () => {
      expect(ghostLeaderLabel(me, ghost(0, "me"), names)).toBe("follows you");
      expect(ghostLeaderLabel(me, ghost(0, "ally"), names)).toBe("follows Devona");
      expect(ghostLeaderLabel(me, ghost(0, null), names)).toBe("stays");
    });

    it("says nothing of the foe's ghost, a dead one, or any other target", () => {
      expect(ghostLeaderLabel(me, ghost(1, "foe"), names)).toBeUndefined();
      expect(ghostLeaderLabel(me, { ...ghost(0, "me"), dead: true }, names)).toBeUndefined();
      expect(ghostLeaderLabel(me, player({ team: 0 }), names)).toBeUndefined();
      expect(ghostLeaderLabel(me, undefined, names)).toBeUndefined();
    });
  });

  describe("ghostLeaderToast", () => {
    it("toasts whom your team's ghost now follows, or that it stays", () => {
      expect(toast(ghosts(null), ghosts("me"))).toBe("Ghostly Hero follows you");
      expect(toast(ghosts(null), ghosts("ally"))).toBe("Ghostly Hero follows Devona");
      expect(toast(ghosts("me"), ghosts(null))).toBe("Ghostly Hero stays");
    });

    it("toasts a leader handed from one ally to another once, as the new one", () => {
      expect(toast(ghosts("ally"), ghosts("me"))).toBe("Ghostly Hero follows you");
      expect(toast(ghosts("me"), ghosts("me"))).toBeUndefined();
    });

    it("says nothing of the foe's ghost, to a spectator, or on the first snapshot", () => {
      expect(toast(ghosts(null, null), ghosts(null, "foe"))).toBeUndefined();
      expect(ghostLeaderToast(ghosts(null), ghosts("me"), "me", undefined, names)).toBeUndefined();
      expect(toast(undefined, ghosts("me"))).toBeUndefined();
    });

    it("says nothing as the ghost dies or rises", () => {
      const dead = { players: [me, { ...ghost(0, "me"), dead: true }] };
      expect(toast(ghosts("me"), dead)).toBeUndefined();
      expect(toast(dead, ghosts(null))).toBeUndefined();
    });
  });

  describe("ghostNameplate", () => {
    it("names the leader of your team's ghost, and of both to a spectator", () => {
      expect(ghostNameplate(ghost(0, "me"), me, names)).toBe("Ghostly Hero › you");
      expect(ghostNameplate(ghost(0, "ally"), me, names)).toBe("Ghostly Hero › Devona");
      expect(ghostNameplate(ghost(1, "ally"), undefined, names)).toBe("Ghostly Hero › Devona");
    });

    it("keeps a staying ghost's, a foe's ghost's and anyone else's plain name", () => {
      expect(ghostNameplate(ghost(0, null), me, names)).toBe("Ghostly Hero");
      expect(ghostNameplate(ghost(1, "foe"), me, names)).toBe("Ghostly Hero");
      expect(ghostNameplate(me, me, names)).toBe("me");
    });
  });
});

describe("targetHintDismissed", () => {
  const self = (targetSessionId: string | undefined): PlayerSnapshot => ({
    sessionId: "me",
    name: "me",
    guildTag: undefined,
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
    invulnerableSeconds: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    bot: false,
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
    guildTag: undefined,
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
    invulnerableSeconds: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    bot: false,
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
    copyEndsAt: null,
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
    guildTag: undefined,
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
    invulnerableSeconds: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    bot: false,
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
  readonly addEventListener = (): void => undefined;

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
    const hud = createHud(
      parent as unknown as HTMLElement,
      () => undefined,
      () => undefined,
    );
    return { parent, hud };
  };
  const named = (nodes: FakeNode[], names: readonly string[]): string[] =>
    nodes
      .map((node) => node.className.split(" "))
      .flatMap((classes) => names.filter((name) => classes.includes(name)));

  it("stacks your block, top down: hint, message, effects, morale, gear and Drop, health, energy, skills", () => {
    const { hud } = build();
    const order = [
      "hud-hint",
      "hud-message",
      "effects-monitor",
      "hud-morale",
      "hud-gear",
      "hud-drop",
      "hud-bar-health",
      "hud-bar-energy",
      "hud-skills",
    ];
    expect(named(descendants(hud.root as unknown as FakeNode), order)).toEqual(order);
  });

  it("puts the target frame under the scoreboard and its flag carriers (#1226), outside your block", () => {
    const { parent, hud } = build();
    const top = hud.top as unknown as FakeNode;
    expect(parent.children).toContain(top);
    expect(top.children.map((node) => node.className)).toEqual([
      "hud-scoreboard",
      "hud-carriers",
      "hud-target",
    ]);
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
