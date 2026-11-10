import { describe, expect, it } from "vitest";

import type { CombatEvent, CombatLogEntry } from "@vibewars/game-core";

import { t } from "../i18n/index.js";
import {
  EMPTY_TOTALS,
  accumulate,
  appendRows,
  combatEventToRow,
  describeCombatEvent,
  dividerRow,
  floatingCueFor,
  foldedText,
  formatAmount,
  formatRate,
  formatSimClock,
  logToneOf,
  meterRows,
  perSecond,
  shouldStickToBottom,
  StatusTickBatcher,
  type LogRow,
} from "./combat-readouts.js";

const NAMES = new Map([
  ["you", "Pyro"],
  ["dummy", "Caster dummy"],
  ["wolf", "Wolf"],
  ["priest/0", "Priest"],
]);
const nameOf = (id: string): string => NAMES.get(id) ?? id;
const CREATURES = new Set(["wolf", "priest/0"]);
const isCreature = (id: string): boolean => CREATURES.has(id);

/** "Fireball (Pyro)": what did it, and whose. */
const by = (what: string, source: string): string => t("combat.bySource", { what, source });

/** Nobody here is a creature (#2483). */
const NO_CREATURES = (): undefined => undefined;

function entry(events: CombatEvent[], extra: Partial<CombatLogEntry> = {}): CombatLogEntry {
  return {
    tick: 1,
    atSeconds: 1.5,
    cause: "skill",
    sourceId: "you",
    skillId: "elementalist.fireball",
    weaponId: undefined,
    attributeId: undefined,
    area: undefined,
    doubleStrike: false,
    events,
    ...extra,
  };
}

describe("formatSimClock", () => {
  it("reads minutes, seconds and tenths", () => {
    expect(formatSimClock(0)).toBe("0:00.0");
    expect(formatSimClock(3.46)).toBe("0:03.4");
    expect(formatSimClock(65.2)).toBe("1:05.2");
    expect(formatSimClock(-1)).toBe("0:00.0");
  });
});

describe("logToneOf", () => {
  it("gives every event kind a tone", () => {
    const kinds: CombatEvent["kind"][] = [
      "damage",
      "heal",
      "energy-gain",
      "energy-loss",
      "sacrifice",
      "health-loss",
      "death",
      "status-applied",
      "status-removed",
      "status-expired",
      "status-spread",
      "upkeep-lost",
      "health-lost",
      "interrupted",
      "interrupt-missed",
      "attack-missed",
      "attack-blocked",
      "attack-dodged",
      "invulnerable",
      "skill-used",
      "adrenaline-gained",
      "effect-skipped",
    ];
    expect(kinds.map(logToneOf)).toEqual([
      "damage",
      "heal",
      "resource",
      "resource",
      "damage",
      "damage",
      "death",
      "status",
      "status",
      "status",
      "status",
      "status",
      "damage",
      "control",
      "control",
      "control",
      "control",
      "control",
      "control",
      "status",
      "resource",
      "status",
    ]);
  });
});

describe("describeCombatEvent", () => {
  it("names the Storm Beacon as the source of its strike (#2694)", () => {
    const event = { kind: "damage", targetId: "bob", amount: 27, critical: false } as const;
    const strike = { ...entry([event]), cause: "beacon", sourceId: undefined } as const;
    expect(describeCombatEvent(strike, event, nameOf, isCreature)).toBe(
      t("combat.hit", { by: t("combat.sourceBeacon"), target: nameOf("bob"), amount: "27" }),
    );
  });

  it("names the skill, the caster, the target and the amount", () => {
    const event: CombatEvent = { kind: "damage", targetId: "dummy", amount: 63.6, critical: false };
    expect(describeCombatEvent(entry([event]), event, nameOf, isCreature)).toBe(
      t("combat.hit", { by: by("Fireball", "Pyro"), target: "Caster dummy", amount: "64" }),
    );
  });

  it("says a Fireball found its target invulnerable, and floats it (#1233)", () => {
    const event: CombatEvent = { kind: "invulnerable", targetId: "dummy" };
    expect(describeCombatEvent(entry([event]), event, nameOf, isCreature)).toBe(
      t("combat.invulnerable", { by: by("Fireball", "Pyro"), target: "Caster dummy" }),
    );
    expect(logToneOf("invulnerable")).toBe("control");
    expect(floatingCueFor("invulnerable", undefined, false)).toEqual({
      text: t("combat.floatInvulnerable"),
      tone: "neutral",
      critical: false,
    });
  });

  it("says degeneration for a status tick that hurts, regeneration for one that heals", () => {
    const hurt: CombatEvent = { kind: "damage", targetId: "dummy", amount: 3, critical: false };
    const heal: CombatEvent = { kind: "heal", targetId: "dummy", amount: 4 };
    const tick = (event: CombatEvent) =>
      entry([event], { cause: "degeneration", sourceId: undefined, skillId: undefined });
    expect(describeCombatEvent(tick(hurt), hurt, nameOf, isCreature)).toBe(
      t("combat.hit", { by: t("combat.sourceDegeneration"), target: "Caster dummy", amount: "3" }),
    );
    expect(describeCombatEvent(tick(heal), heal, nameOf, isCreature)).toBe(
      t("combat.heal", { by: t("combat.sourceRegeneration"), target: "Caster dummy", amount: "4" }),
    );
  });

  it("says who a spreading status was caught from (#765)", () => {
    const event: CombatEvent = {
      kind: "status-spread",
      targetId: "dummy",
      fromId: "you",
      statusId: "disease",
    };
    const spread = entry([event], { cause: "degeneration", skillId: undefined });
    expect(describeCombatEvent(spread, event, nameOf, isCreature)).toBe(
      t("combat.statusSpread", { target: "Caster dummy", status: "Disease", from: "Pyro" }),
    );
  });

  it("names the status for the health it took as it landed, not the skill (#800)", () => {
    const event: CombatEvent = {
      kind: "health-lost",
      targetId: "dummy",
      amount: 100,
      statusId: "deep-wound",
    };
    const chop = entry([event], { skillId: "warrior.swift-chop" });
    expect(describeCombatEvent(chop, event, nameOf, isCreature)).toBe(
      t("combat.healthLost", {
        status: by("Deep Wound", "Pyro"),
        amount: "100",
        target: "Caster dummy",
      }),
    );
    const unknown = entry([event], { sourceId: undefined, skillId: undefined });
    expect(describeCombatEvent(unknown, event, nameOf, isCreature)).toBe(
      t("combat.healthLost", { status: "Deep Wound", amount: "100", target: "Caster dummy" }),
    );
  });

  it("names a status tick's source when exactly one is known", () => {
    const hurt: CombatEvent = { kind: "damage", targetId: "dummy", amount: 3, critical: false };
    const tick = entry([hurt], { cause: "degeneration", skillId: undefined });
    expect(describeCombatEvent(tick, hurt, nameOf, isCreature)).toBe(
      t("combat.hit", {
        by: by(t("combat.sourceDegeneration"), "Pyro"),
        target: "Caster dummy",
        amount: "3",
      }),
    );
  });

  it("names a lava tick by its zone's kind, never by its id (ADR-0053, #3046)", () => {
    const hurt: CombatEvent = { kind: "damage", targetId: "dummy", amount: 14, critical: false };
    const tick = entry([hurt], {
      cause: "degeneration",
      sourceId: "zone:molten:lane-embers",
      skillId: undefined,
    });
    expect(describeCombatEvent(tick, hurt, nameOf, isCreature)).toBe(
      t("combat.hit", {
        by: by(t("combat.sourceDegeneration"), "Lava"),
        target: "Caster dummy",
        amount: "14",
      }),
    );
  });

  it("names a spring's heal tick 'Regeneration (Spring)' (#3046)", () => {
    const heal: CombatEvent = { kind: "heal", targetId: "dummy", amount: 4 };
    const tick = entry([heal], {
      cause: "degeneration",
      sourceId: "zone:spring:pool",
      skillId: undefined,
    });
    expect(describeCombatEvent(tick, heal, nameOf, isCreature)).toBe(
      t("combat.heal", {
        by: by(t("combat.sourceRegeneration"), "Spring"),
        target: "Caster dummy",
        amount: "4",
      }),
    );
  });

  it("names a malformed zone source plainly as the ground (#3046)", () => {
    const hurt: CombatEvent = { kind: "damage", targetId: "dummy", amount: 2, critical: false };
    const tick = entry([hurt], {
      cause: "degeneration",
      sourceId: "zone:nope:x",
      skillId: undefined,
    });
    expect(describeCombatEvent(tick, hurt, nameOf, isCreature)).toBe(
      t("combat.hit", {
        by: by(t("combat.sourceDegeneration"), "Ground"),
        target: "Caster dummy",
        amount: "2",
      }),
    );
  });

  it("names a weapon swing for its weapon and attacker, and an unknown weapon plainly", () => {
    const event: CombatEvent = { kind: "damage", targetId: "dummy", amount: 18, critical: false };
    const swing = entry([event], { cause: "weapon", skillId: undefined, weaponId: "sword" });
    expect(describeCombatEvent(swing, event, nameOf, isCreature)).toBe(
      t("combat.hit", { by: by("Sword", "Pyro"), target: "Caster dummy", amount: "18" }),
    );
    const crit: CombatEvent = { ...event, amount: 31.1, critical: true };
    expect(describeCombatEvent(swing, crit, nameOf, isCreature)).toBe(
      t("combat.hitCritical", { by: by("Sword", "Pyro"), target: "Caster dummy", amount: "31" }),
    );
    expect(describeCombatEvent({ ...swing, weaponId: undefined }, event, nameOf, isCreature)).toBe(
      t("combat.hit", {
        by: by(t("combat.sourceWeapon"), "Pyro"),
        target: "Caster dummy",
        amount: "18",
      }),
    );
  });

  it("names a creature's swing for the creature alone (#1144)", () => {
    const event: CombatEvent = { kind: "damage", targetId: "dummy", amount: 21, critical: false };
    const bite = entry([event], {
      cause: "weapon",
      sourceId: "wolf",
      skillId: undefined,
      weaponId: undefined,
    });
    expect(describeCombatEvent(bite, event, nameOf, isCreature)).toBe(
      t("combat.hit", { by: "Wolf", target: "Caster dummy", amount: "21" }),
    );
    const missed: CombatEvent = { kind: "attack-missed", targetId: "dummy" };
    expect(describeCombatEvent(bite, missed, nameOf, isCreature)).toBe(
      t("combat.miss", { by: "Wolf", target: "Caster dummy" }),
    );
    const swing = entry([event], { cause: "weapon", skillId: undefined, weaponId: "longbow" });
    expect(describeCombatEvent(swing, event, nameOf, isCreature)).toBe(
      t("combat.hit", { by: by("Longbow", "Pyro"), target: "Caster dummy", amount: "21" }),
    );
  });

  it("names a priest's wave for the priest (#1186)", () => {
    const event: CombatEvent = {
      kind: "resurrected",
      targetId: "dummy",
      healthFraction: 1,
      energyFraction: 1,
    };
    const wave = entry([event], { sourceId: "priest/0", skillId: undefined });
    expect(describeCombatEvent(wave, event, nameOf, isCreature)).toBe(
      t("combat.resurrected", {
        by: "Priest",
        target: "Caster dummy",
        health: "100%",
        energy: "100%",
      }),
    );
  });

  it("names a Guild Battle's wave for the shrine, which has no priest (#1222)", () => {
    const event: CombatEvent = {
      kind: "resurrected",
      targetId: "dummy",
      healthFraction: 1,
      energyFraction: 1,
    };
    const wave = entry([event], { sourceId: undefined, skillId: undefined });
    expect(describeCombatEvent(wave, event, nameOf, isCreature)).toBe(
      t("combat.resurrected", {
        by: t("combat.sourceShrine"),
        target: "Caster dummy",
        health: "100%",
        energy: "100%",
      }),
    );
  });

  it("says which attribute an attribute's energy came from (#633)", () => {
    const event: CombatEvent = { kind: "energy-gain", targetId: "you", amount: 12 };
    const reaped = entry([event], {
      cause: "attribute",
      skillId: undefined,
      attributeId: "necromancer.soul-reaping",
    });
    expect(describeCombatEvent(reaped, event, nameOf, isCreature)).toBe(
      t("combat.energyGainFrom", { target: "Pyro", amount: "12", attribute: "Soul Reaping" }),
    );
    expect(describeCombatEvent(entry([event]), event, nameOf, isCreature)).toBe(
      t("combat.energyGain", { target: "Pyro", amount: "12" }),
    );
  });

  it("names statuses and interrupted skills", () => {
    const applied: CombatEvent = {
      kind: "status-applied",
      targetId: "dummy",
      statusId: "bleeding",
      durationSeconds: 10,
    };
    expect(describeCombatEvent(entry([applied]), applied, nameOf, isCreature)).toBe(
      t("combat.statusApplied", { target: "Caster dummy", status: "Bleeding", seconds: "10" }),
    );
    const maintained: CombatEvent = {
      kind: "status-applied",
      targetId: "dummy",
      statusId: "mending",
      durationSeconds: null,
    };
    expect(describeCombatEvent(entry([maintained]), maintained, nameOf, isCreature)).toBe(
      t("combat.statusAppliedMaintained", { target: "Caster dummy", status: "Mending" }),
    );
    const lost: CombatEvent = {
      kind: "upkeep-lost",
      targetId: "dummy",
      statusId: "mending",
      casterId: "you",
    };
    expect(describeCombatEvent(entry([lost]), lost, nameOf, isCreature)).toBe(
      t("combat.upkeepLost", { status: "Mending", target: "Caster dummy", caster: "Pyro" }),
    );
    const interrupted: CombatEvent = {
      kind: "interrupted",
      targetId: "dummy",
      skillId: "elementalist.fireball",
    };
    expect(describeCombatEvent(entry([interrupted]), interrupted, nameOf, isCreature)).toBe(
      t("combat.interrupted", {
        by: by("Fireball", "Pyro"),
        target: "Caster dummy",
        skill: "Fireball",
      }),
    );
    // A plain swing Clumsiness cancelled (#1593).
    const swing: CombatEvent = { kind: "attack-interrupted", targetId: "dummy" };
    expect(describeCombatEvent(entry([swing]), swing, nameOf, isCreature)).toBe(
      t("combat.attackInterrupted", { by: by("Fireball", "Pyro"), target: "Caster dummy" }),
    );
    const missed: CombatEvent = { kind: "attack-missed", targetId: "dummy" };
    expect(describeCombatEvent(entry([missed]), missed, nameOf, isCreature)).toBe(
      t("combat.miss", { by: by("Fireball", "Pyro"), target: "Caster dummy" }),
    );
    expect(logToneOf("attack-unreachable")).toBe("control");
  });

  it("says an off-hand attack out of sequence must follow a lead attack (#831)", () => {
    const outOfSequence = (skill: string, requirement: string): string =>
      t("combat.missOutOfSequence", { by: by(skill, "Pyro"), target: "Caster dummy", requirement });
    const missed: CombatEvent = {
      kind: "attack-missed",
      targetId: "dummy",
      reason: "out-of-sequence",
    };
    expect(
      describeCombatEvent(
        entry([missed], { skillId: "assassin.fox-fangs" }),
        missed,
        nameOf,
        isCreature,
      ),
    ).toBe(outOfSequence("Fox Fangs", "must follow a lead attack"));
    expect(
      describeCombatEvent(
        entry([missed], { skillId: "assassin.death-blossom" }),
        missed,
        nameOf,
        isCreature,
      ),
    ).toBe(outOfSequence("Death Blossom", "must follow an off-hand attack"));
    expect(
      describeCombatEvent(
        entry([missed], { skillId: "assassin.moebius-strike" }),
        missed,
        nameOf,
        isCreature,
      ),
    ).toBe(outOfSequence("Moebius Strike", "must follow a dual attack"));
    expect(
      describeCombatEvent(
        entry([missed], { skillId: "assassin.falling-spider" }),
        missed,
        nameOf,
        isCreature,
      ),
    ).toBe(outOfSequence("Falling Spider", "only if target is knocked down"));
  });

  it("says why a picky interrupt let a cast through, and nothing when it found none (#796)", () => {
    const spike = { skillId: "mesmer.power-spike" };
    const refused: CombatEvent = {
      kind: "interrupt-missed",
      targetId: "dummy",
      refusedSkillId: "ranger.barrage",
    };
    expect(describeCombatEvent(entry([refused], spike), refused, nameOf, isCreature)).toBe(
      t("combat.interruptRefusedNotSpellOrChant", {
        by: by("Power Spike", "Pyro"),
        target: "Caster dummy",
        skill: "Barrage",
      }),
    );
    const idle: CombatEvent = { kind: "interrupt-missed", targetId: "dummy", refusedSkillId: null };
    expect(describeCombatEvent(entry([idle], spike), idle, nameOf, isCreature)).toBe(
      t("combat.interruptMissed", { by: by("Power Spike", "Pyro"), target: "Caster dummy" }),
    );
  });

  it("says a spell-only interrupt let a chant through: not a spell (#1008)", () => {
    const chant: CombatEvent = {
      kind: "interrupt-missed",
      targetId: "dummy",
      refusedSkillId: "paragon.anthem-of-flame",
    };
    expect(
      describeCombatEvent(
        entry([chant], { skillId: "ranger.concussion-shot" }),
        chant,
        nameOf,
        isCreature,
      ),
    ).toBe(
      t("combat.interruptRefusedNotSpell", {
        by: by("Concussion Shot", "Pyro"),
        target: "Caster dummy",
        skill: "Anthem of Flame",
      }),
    );
  });

  it("finds a spell-only interrupt in what a ground effect lands: not a spell (#1367)", () => {
    const unguent: CombatEvent = {
      kind: "interrupt-missed",
      targetId: "dummy",
      refusedSkillId: "ranger.troll-unguent",
    };
    expect(
      describeCombatEvent(
        entry([unguent], { skillId: "elementalist.maelstrom" }),
        unguent,
        nameOf,
        isCreature,
      ),
    ).toBe(
      t("combat.interruptRefusedNotSpell", {
        by: by("Maelstrom", "Pyro"),
        target: "Caster dummy",
        skill: "Troll Unguent",
      }),
    );
  });

  it("says whose skill a disable held back, and for how long (#914)", () => {
    const disabled: CombatEvent = {
      kind: "skill-disabled",
      targetId: "dummy",
      skillId: "elementalist.fireball",
      seconds: 10,
    };
    expect(
      describeCombatEvent(
        entry([disabled], { skillId: "mesmer.power-block" }),
        disabled,
        nameOf,
        isCreature,
      ),
    ).toBe(
      t("combat.skillDisabled", {
        by: by("Power Block", "Pyro"),
        target: "Caster dummy",
        skill: "Fireball",
        seconds: "10",
      }),
    );
    expect(logToneOf("skill-disabled")).toBe("control");
  });

  it("says whose skill takes longer to recharge, and by how much (#949)", () => {
    const lengthened: CombatEvent = {
      kind: "recharge-lengthened",
      targetId: "dummy",
      skillId: "elementalist.fireball",
      seconds: 47,
    };
    expect(
      describeCombatEvent(
        entry([lengthened], { skillId: "mesmer.diversion" }),
        lengthened,
        nameOf,
        isCreature,
      ),
    ).toBe(
      t("combat.rechargeLengthened", { target: "Caster dummy", skill: "Fireball", seconds: "47" }),
    );
    expect(logToneOf("recharge-lengthened")).toBe("control");
  });

  it("says who shadow stepped to whom, with no floating text (#988)", () => {
    const step: CombatEvent = { kind: "shadow-stepped", targetId: "dummy", toId: "you" };
    expect(
      describeCombatEvent(
        entry([step], { skillId: "assassin.deaths-charge" }),
        step,
        nameOf,
        isCreature,
      ),
    ).toBe(t("combat.shadowStepped", { target: "Caster dummy", to: "Pyro" }));
    expect(logToneOf("shadow-stepped")).toBe("control");
    expect(floatingCueFor("shadow-stepped", undefined, false)).toBeUndefined();
  });

  it("says who was teleported to whom, with no floating text (#474)", () => {
    const moved: CombatEvent = { kind: "teleported", targetId: "dummy", toId: "you" };
    expect(
      describeCombatEvent(entry([moved], { skillId: "monk.rebirth" }), moved, nameOf, isCreature),
    ).toBe(t("combat.teleported", { target: "Caster dummy", to: "Pyro" }));
    expect(logToneOf("teleported")).toBe("control");
    expect(floatingCueFor("teleported", undefined, false)).toBeUndefined();
  });

  it("says who knocked whom down, and for how long (#544)", () => {
    const down: CombatEvent = { kind: "knocked-down", targetId: "dummy", durationSeconds: 4 };
    expect(
      describeCombatEvent(
        entry([down], { skillId: "warrior.backbreaker" }),
        down,
        nameOf,
        isCreature,
      ),
    ).toBe(
      t("combat.knockedDown", {
        by: by("Backbreaker", "Pyro"),
        target: "Caster dummy",
        seconds: "4",
      }),
    );
    expect(logToneOf("knocked-down")).toBe("control");
    expect(floatingCueFor("knocked-down", undefined, false)).toEqual({
      text: t("combat.floatKnockedDown"),
      tone: "neutral",
      critical: false,
    });
  });

  it("says who brought whom back, and with how much (#812)", () => {
    const back: CombatEvent = {
      kind: "resurrected",
      targetId: "dummy",
      healthFraction: 0.25,
      energyFraction: 0,
    };
    expect(
      describeCombatEvent(
        entry([back], { skillId: "monk.restore-life" }),
        back,
        nameOf,
        isCreature,
      ),
    ).toBe(
      t("combat.resurrected", {
        by: by("Restore Life", "Pyro"),
        target: "Caster dummy",
        health: "25%",
        energy: "0%",
      }),
    );
    expect(logToneOf("resurrected")).toBe("heal");
  });

  it("says who lost energy to what, and floats it in blue (#793)", () => {
    const burned: CombatEvent = { kind: "energy-loss", targetId: "dummy", amount: 8 };
    expect(
      describeCombatEvent(
        entry([burned], { skillId: "mesmer.energy-burn" }),
        burned,
        nameOf,
        isCreature,
      ),
    ).toBe(
      t("combat.energyLoss", {
        target: "Caster dummy",
        amount: "8",
        by: by("Energy Burn", "Pyro"),
      }),
    );
    expect(logToneOf("energy-loss")).toBe("resource");
    expect(floatingCueFor("energy-loss", 8, false)).toEqual({
      text: t("combat.floatEnergyLoss", { amount: "8" }),
      tone: "energy",
      critical: false,
    });
  });

  it("says who stole health from whom, floats it red, and counts it taken (#935)", () => {
    const stolen: CombatEvent = { kind: "life-stolen", targetId: "you", amount: 39 };
    const steal = entry([stolen, { kind: "heal", targetId: "dummy", amount: 39 }], {
      sourceId: "dummy",
      skillId: "necromancer.insidious-parasite",
    });
    expect(describeCombatEvent(steal, stolen, nameOf, isCreature)).toBe(
      t("combat.lifeStolen", {
        by: by("Insidious Parasite", "Caster dummy"),
        amount: "39",
        target: "Pyro",
      }),
    );
    expect(logToneOf("life-stolen")).toBe("damage");
    expect(floatingCueFor("life-stolen", 39, false)).toEqual({
      text: "−39",
      tone: "damage",
      critical: false,
    });
    expect(accumulate(EMPTY_TOTALS, [steal], "you", 0.05, NO_CREATURES)).toEqual({
      damage: 0,
      weaponDamage: 0,
      healing: 0,
      taken: 39,
      seconds: 0.05,
    });
  });

  it("says a target lost health to the skill, not that it sacrificed it (#1678)", () => {
    const lost: CombatEvent = { kind: "health-loss", targetId: "you", amount: 53 };
    const touch = entry([lost], {
      sourceId: "dummy",
      skillId: "necromancer.enfeebling-touch",
    });
    expect(describeCombatEvent(touch, lost, nameOf, isCreature)).toBe(
      t("combat.healthLoss", {
        target: "Pyro",
        amount: "53",
        by: by("Enfeebling Touch", "Caster dummy"),
      }),
    );
    expect(logToneOf("health-loss")).toBe("damage");
    expect(floatingCueFor("health-loss", 53, false)).toEqual({
      text: "−53",
      tone: "damage",
      critical: false,
    });
    expect(accumulate(EMPTY_TOTALS, [touch], "you", 0.05, NO_CREATURES)).toEqual({
      damage: 0,
      weaponDamage: 0,
      healing: 0,
      taken: 53,
      seconds: 0.05,
    });
  });

  it("says a caster who moved cancels their own cast (#279)", () => {
    const cancelled: CombatEvent = {
      kind: "cancelled",
      targetId: "you",
      skillId: "elementalist.fireball",
    };
    expect(describeCombatEvent(entry([cancelled]), cancelled, nameOf, isCreature)).toBe(
      t("combat.cancelled", { target: "Pyro", skill: "Fireball" }),
    );
    expect(logToneOf("cancelled")).toBe("control");
    expect(floatingCueFor("cancelled", undefined, false)).toEqual({
      text: t("combat.floatCancelled"),
      tone: "neutral",
      critical: false,
    });
  });

  it("names a weapon entry for the weapon that swung or shot (#162)", () => {
    const shot = (event: CombatEvent): string =>
      describeCombatEvent(
        entry([event], { cause: "weapon", skillId: undefined, weaponId: "longbow" }),
        event,
        nameOf,
        isCreature,
      );
    expect(shot({ kind: "damage", targetId: "dummy", amount: 14, critical: false })).toBe(
      t("combat.hit", { by: by("Longbow", "Pyro"), target: "Caster dummy", amount: "14" }),
    );
    expect(shot({ kind: "attack-missed", targetId: "dummy" })).toBe(
      t("combat.miss", { by: by("Longbow", "Pyro"), target: "Caster dummy" }),
    );
    expect(shot({ kind: "attack-blocked", targetId: "dummy" })).toBe(
      t("combat.blocked", { target: "Caster dummy", by: by("Longbow", "Pyro") }),
    );
    expect(shot({ kind: "attack-dodged", targetId: "dummy" })).toBe(
      t("combat.dodged", { target: "Caster dummy", by: by("Longbow", "Pyro") }),
    );
    expect(shot({ kind: "attack-obstructed", targetId: "dummy" })).toBe(
      t("combat.obstructed", { by: by("Longbow", "Pyro"), target: "Caster dummy" }),
    );
    expect(shot({ kind: "attack-unreachable", targetId: "dummy" })).toBe(
      t("combat.unreachable", { by: by("Longbow", "Pyro"), target: "Caster dummy" }),
    );
  });
});

describe("combatEventToRow and dividerRow", () => {
  it("carries the time and the tone", () => {
    const event: CombatEvent = { kind: "heal", targetId: "you", amount: 40 };
    expect(combatEventToRow(entry([event]), event, nameOf, isCreature)).toEqual({
      time: "0:01.5",
      text: t("combat.heal", { by: by("Fireball", "Pyro"), target: "Pyro", amount: "40" }),
      tone: "heal",
    });
    expect(dividerRow("re-armed", 2)).toEqual({
      time: "0:02.0",
      text: "── re-armed ──",
      tone: "divider",
    });
  });
});

describe("appendRows", () => {
  const row = (text: string): LogRow => ({ time: "0:00.0", text, tone: "damage" });

  it("appends, and drops from the front past the cap", () => {
    const { rows, dropped } = appendRows([row("a"), row("b")], [row("c"), row("d")], 3);
    expect(rows.map((r) => r.text)).toEqual(["b", "c", "d"]);
    expect(dropped).toBe(1);
  });

  it("drops nothing under the cap", () => {
    expect(appendRows([row("a")], [row("b")], 3).dropped).toBe(0);
  });

  describe("folds consecutive regeneration (#590)", () => {
    /** A second of regeneration as the batcher writes it, closed at `at`. */
    const regen = (at: number, amount: number, sourceId?: string): LogRow => {
      const batcher = new StatusTickBatcher();
      batcher.push(
        entry([{ kind: "heal", targetId: "you", amount }], {
          atSeconds: at - 1,
          cause: "degeneration",
          sourceId,
          skillId: undefined,
        }),
        nameOf,
        isCreature,
      );
      const [closed] = batcher.advance(at, nameOf, isCreature);
      if (closed === undefined) {
        throw new Error("no regeneration row");
      }
      return closed;
    };
    /** "regeneration heals Pyro for 60 over 19 s", or for a single row, with no span. */
    const regenText = (amount: string, seconds?: string): string => {
      const parts = { by: t("combat.sourceRegeneration"), target: "Pyro", amount };
      return seconds === undefined
        ? t("combat.heal", parts)
        : t("combat.healOver", { ...parts, seconds });
    };
    const run = (from: number, count: number): LogRow[] =>
      Array.from({ length: count }, (_, i) => regen(from + i, 3));

    it("writes a single row as before", () => {
      expect(appendRows([], [regen(12, 3)], 100).rows.map((r) => r.text)).toEqual([regenText("3")]);
    });

    it("folds twenty rows into one, summed, at the first row's time", () => {
      const { rows, replacedLast } = appendRows([], run(12, 20), 100);
      expect(rows.map((r) => [r.time, r.text])).toEqual([["0:12.0", regenText("60", "19")]]);
      expect(replacedLast).toBe(false);
    });

    it("says no span for a fold of rows closed at the same time (#1618)", () => {
      expect(appendRows([], [regen(12, 3), regen(12, 3)], 100).rows.map((r) => r.text)).toEqual([
        regenText("6"),
      ]);
      const fold = {
        key: "k",
        amount: 3,
        startedAt: 12,
        endedAt: 12,
        by: "Mending",
        target: "Pyro",
      };
      expect(foldedText(fold)).toBe(
        t("combat.heal", { by: "Mending", target: "Pyro", amount: "3" }),
      );
      expect(foldedText({ ...fold, amount: 57, endedAt: 31 })).toBe(
        t("combat.healOver", { by: "Mending", target: "Pyro", amount: "57", seconds: "19" }),
      );
    });

    it("lets a hit or a divider end the run", () => {
      const between = [row("hit"), dividerRow("re-armed", 13)];
      for (const other of between) {
        expect(appendRows([], [regen(12, 3), other, regen(14, 3)], 100).rows).toHaveLength(3);
      }
    });

    it("keeps a different source apart", () => {
      expect(appendRows([], [regen(12, 3), regen(13, 3, "dummy")], 100).rows).toHaveLength(2);
    });

    it("folds into the last existing row and says so", () => {
      const first = appendRows([row("hit")], run(12, 2), 100);
      const second = appendRows(first.rows, run(14, 2), 100);
      expect(second.replacedLast).toBe(true);
      expect(second.added).toEqual([]);
      expect(second.rows.map((r) => r.text)).toEqual(["hit", regenText("12", "3")]);
    });

    it("drops nothing for a fold at the cap", () => {
      const full = appendRows([row("a")], [regen(12, 3)], 2);
      const { rows, dropped } = appendRows(full.rows, [regen(13, 3)], 2);
      expect(dropped).toBe(0);
      expect(rows.map((r) => r.text)).toEqual(["a", regenText("6", "1")]);
    });
  });
});

describe("shouldStickToBottom", () => {
  it("follows a reader at the bottom, leaves one who scrolled up", () => {
    expect(shouldStickToBottom(400, 500, 100)).toBe(true);
    expect(shouldStickToBottom(397, 500, 100)).toBe(true);
    expect(shouldStickToBottom(200, 500, 100)).toBe(false);
  });
});

describe("accumulate", () => {
  it("counts damage dealt, healing done and damage taken, for the player only", () => {
    const totals = accumulate(
      EMPTY_TOTALS,
      [
        entry([{ kind: "damage", targetId: "dummy", amount: 64, critical: false }]),
        entry([{ kind: "damage", targetId: "you", amount: 10, critical: false }], {
          sourceId: "dummy",
        }),
        entry([{ kind: "heal", targetId: "you", amount: 30 }]),
        // Someone else's healing is not yours.
        entry([{ kind: "heal", targetId: "dummy", amount: 99 }], { sourceId: "dummy" }),
        // Hurting yourself is damage taken, not damage dealt.
        entry([{ kind: "damage", targetId: "you", amount: 5, critical: false }]),
        // Health a status took as it landed is taken, never dealt (#800).
        entry([{ kind: "health-lost", targetId: "you", amount: 20, statusId: "deep-wound" }], {
          sourceId: "dummy",
        }),
        entry([{ kind: "health-lost", targetId: "dummy", amount: 20, statusId: "deep-wound" }]),
        // A swing counts as damage, and as the weapon's share of it.
        entry([{ kind: "damage", targetId: "dummy", amount: 12, critical: false }], {
          cause: "weapon",
          skillId: undefined,
          weaponId: "sword",
        }),
      ],
      "you",
      0.05,
      NO_CREATURES,
    );
    expect(totals).toEqual({
      damage: 76,
      weaponDamage: 12,
      healing: 30,
      taken: 35,
      seconds: 0.05,
    });
  });

  it("counts what your own creatures deal and heal as yours, on the skills side (#2483)", () => {
    const owners = new Map<string, string | undefined>([
      ["you/c1", "you"],
      ["you/c2", "you"],
      ["you/c3", "foe"],
      ["you/c4", undefined],
      ["foe/c1", "you"],
      ["other/c1", "other"],
      ["masterless/c1", undefined],
    ]);
    const totals = accumulate(
      EMPTY_TOTALS,
      [
        entry([{ kind: "heal", targetId: "you", amount: 94 }], { sourceId: "you/c1" }),
        entry([{ kind: "damage", targetId: "dummy", amount: 20, critical: false }], {
          sourceId: "you/c1",
        }),
        // A minion's own blow is its skills' share, not your weapon's.
        entry([{ kind: "damage", targetId: "dummy", amount: 15, critical: false }], {
          sourceId: "you/c2",
          cause: "weapon",
          skillId: undefined,
          weaponId: "sword",
        }),
        // Your creature hurting you is taken, never dealt.
        entry([{ kind: "damage", targetId: "you", amount: 7, critical: false }], {
          sourceId: "you/c1",
        }),
        // Someone else's creatures, and masterless ones, are not yours.
        entry([{ kind: "heal", targetId: "you", amount: 50 }], { sourceId: "other/c1" }),
        entry([{ kind: "damage", targetId: "dummy", amount: 50, critical: false }], {
          sourceId: "masterless/c1",
        }),
        // Who owns it now counts, not who raised it: one a foe took from you
        // (#1965) is theirs, one you took is yours, one gone masterless
        // (#2092) nobody's.
        entry([{ kind: "damage", targetId: "dummy", amount: 40, critical: false }], {
          sourceId: "you/c3",
        }),
        entry([{ kind: "damage", targetId: "dummy", amount: 11, critical: false }], {
          sourceId: "foe/c1",
        }),
        entry([{ kind: "damage", targetId: "dummy", amount: 30, critical: false }], {
          sourceId: "you/c4",
        }),
      ],
      "you",
      0.05,
      (id) => owners.get(id),
    );
    expect(totals).toEqual({
      damage: 46,
      weaponDamage: 0,
      healing: 94,
      taken: 7,
      seconds: 0.05,
    });
  });
});

describe("perSecond", () => {
  it("is 0, not NaN or Infinity, before any time has passed", () => {
    expect(perSecond(100, 0)).toBe(0);
    expect(perSecond(0, 0)).toBe(0);
    expect(perSecond(100, 4)).toBe(25);
  });
});

describe("formatAmount, formatRate and meterRows", () => {
  it("round amounts, give rates one decimal, and lay out the meter", () => {
    expect(formatAmount(63.6)).toBe("64");
    expect(formatRate(12.345)).toBe("12.3");
    expect(meterRows({ damage: 128, weaponDamage: 28, healing: 0, taken: 15, seconds: 4 })).toEqual(
      [
        { id: "dps", label: t("combat.meterDps"), value: "32.0" },
        { id: "hps", label: t("combat.meterHps"), value: "0.0" },
        { id: "damage", label: t("combat.meterDamage"), value: "128" },
        { id: "weapon-skills", label: t("combat.meterWeaponSkills"), value: "28 / 100" },
        { id: "healing", label: t("combat.meterHealing"), value: "0" },
        { id: "taken", label: t("combat.meterTaken"), value: "15" },
        { id: "time", label: t("combat.meterTime"), value: "0:04.0" },
      ],
    );
    expect(meterRows(EMPTY_TOTALS)[0]).toEqual({
      id: "dps",
      label: t("combat.meterDps"),
      value: "0.0",
    });
  });
});

describe("floatingCueFor", () => {
  it("signs damage with a real minus and heals with a plus", () => {
    expect(floatingCueFor("damage", 63.6, false)).toEqual({
      text: "−64",
      tone: "damage",
      critical: false,
    });
    expect(floatingCueFor("heal", 40, false)).toEqual({
      text: "+40",
      tone: "heal",
      critical: false,
    });
    // Deep wound's health as it lands looks like damage on the body (#800).
    expect(floatingCueFor("health-lost", 100, false)).toEqual({
      text: "−100",
      tone: "damage",
      critical: false,
    });
  });

  it("floats nothing for an amount that rounds to zero, like a status tick", () => {
    expect(floatingCueFor("damage", 0.4, false)).toBeUndefined();
    expect(floatingCueFor("heal", 0.2, false)).toBeUndefined();
    expect(floatingCueFor("damage", 0.6, false)).toEqual({
      text: "−1",
      tone: "damage",
      critical: false,
    });
  });

  it("calls out interrupts and deaths, and floats nothing for statuses", () => {
    expect(floatingCueFor("interrupted", undefined, false)).toEqual({
      text: t("combat.floatInterrupted"),
      tone: "neutral",
      critical: false,
    });
    expect(floatingCueFor("attack-interrupted", undefined, false)).toEqual({
      text: t("combat.floatInterrupted"),
      tone: "neutral",
      critical: false,
    });
    expect(floatingCueFor("death", undefined, false)).toEqual({
      text: t("combat.floatDefeated"),
      tone: "damage",
      critical: false,
    });
    expect(floatingCueFor("status-applied", undefined, false)).toBeUndefined();
    expect(floatingCueFor("something-new", 5, false)).toBeUndefined();
  });

  it("floats 'miss' over the target of a blinded attack", () => {
    expect(floatingCueFor("attack-missed", undefined, false)).toEqual({
      text: t("combat.floatMiss"),
      tone: "neutral",
      critical: false,
    });
    expect(floatingCueFor("attack-dodged", undefined, false)).toEqual({
      text: t("combat.floatDodge"),
      tone: "neutral",
      critical: false,
    });
    expect(floatingCueFor("attack-blocked", undefined, false)).toEqual({
      text: t("combat.floatBlock"),
      tone: "neutral",
      critical: false,
    });
    expect(floatingCueFor("attack-unreachable", undefined, false)).toEqual({
      text: t("combat.floatCantReach"),
      tone: "neutral",
      critical: false,
    });
  });

  it('marks a critical hit with a "!" (#533)', () => {
    expect(floatingCueFor("damage", 31.1, true)).toEqual({
      text: "−31!",
      tone: "damage",
      critical: true,
    });
  });

  it("treats a missing amount as 0, so floats nothing for it", () => {
    expect(floatingCueFor("damage", undefined, false)).toBeUndefined();
  });
});

describe("StatusTickBatcher (#151)", () => {
  /** A status entry at `at`, as the simulation logs one per tick. */
  const tick = (at: number, events: CombatEvent[], sourceId?: string): CombatLogEntry =>
    entry(events, { atSeconds: at, cause: "degeneration", sourceId, skillId: undefined });
  const texts = (rows: readonly LogRow[]) => rows.map((row) => row.text);
  /** Twenty ticks a second, from `from` for `count` ticks. */
  const ticks = (from: number, count: number, events: CombatEvent[]) =>
    Array.from({ length: count }, (_, i) => tick(from + i * 0.05, events));

  it("gathers a second of regeneration into one row", () => {
    const batcher = new StatusTickBatcher();
    const heal: CombatEvent = { kind: "heal", targetId: "dummy", amount: 0.2 };
    const rows = ticks(0, 20, [heal]).flatMap((t) => batcher.push(t, nameOf, isCreature));
    expect(rows).toEqual([]);
    const closed = batcher.advance(1, nameOf, isCreature);
    expect(texts(closed)).toEqual([
      t("combat.heal", { by: t("combat.sourceRegeneration"), target: "Caster dummy", amount: "4" }),
    ]);
    expect(closed[0]?.time).toBe("0:01.0");
  });

  it("keeps the two directions on one target apart", () => {
    const batcher = new StatusTickBatcher();
    const both: CombatEvent[] = [
      { kind: "damage", targetId: "dummy", amount: 0.5, critical: false },
      { kind: "heal", targetId: "dummy", amount: 0.3 },
    ];
    ticks(0, 20, both).forEach((t) => batcher.push(t, nameOf, isCreature));
    expect(texts(batcher.advance(1, nameOf, isCreature))).toEqual([
      t("combat.hit", { by: t("combat.sourceDegeneration"), target: "Caster dummy", amount: "10" }),
      t("combat.heal", { by: t("combat.sourceRegeneration"), target: "Caster dummy", amount: "6" }),
    ]);
  });

  it("gives each target its own row a second", () => {
    const batcher = new StatusTickBatcher();
    const two: CombatEvent[] = [
      { kind: "damage", targetId: "dummy", amount: 0.5, critical: false },
      { kind: "damage", targetId: "you", amount: 0.5, critical: false },
    ];
    const rows = ticks(0, 40, two).flatMap((t) => batcher.push(t, nameOf, isCreature));
    expect(texts([...rows, ...batcher.flush(2, nameOf, isCreature)])).toEqual([
      t("combat.hit", { by: t("combat.sourceDegeneration"), target: "Caster dummy", amount: "10" }),
      t("combat.hit", { by: t("combat.sourceDegeneration"), target: "Pyro", amount: "10" }),
      t("combat.hit", { by: t("combat.sourceDegeneration"), target: "Caster dummy", amount: "10" }),
      t("combat.hit", { by: t("combat.sourceDegeneration"), target: "Pyro", amount: "10" }),
    ]);
  });

  it("writes the damage before the death it caused", () => {
    const batcher = new StatusTickBatcher();
    const hurt: CombatEvent = { kind: "damage", targetId: "dummy", amount: 2, critical: false };
    batcher.push(tick(0, [hurt]), nameOf, isCreature);
    const rows = batcher.push(
      tick(0.05, [hurt, { kind: "death", targetId: "dummy" }]),
      nameOf,
      isCreature,
    );
    expect(texts(rows)).toEqual([
      t("combat.hit", { by: t("combat.sourceDegeneration"), target: "Caster dummy", amount: "4" }),
      t("combat.death", { target: "Caster dummy" }),
    ]);
  });

  it("also writes the ticks before a death by a skill", () => {
    const batcher = new StatusTickBatcher();
    batcher.push(
      tick(0, [{ kind: "damage", targetId: "dummy", amount: 2, critical: false }]),
      nameOf,
      isCreature,
    );
    const finish = entry([{ kind: "death", targetId: "dummy" }], { atSeconds: 0.5 });
    expect(texts(batcher.push(finish, nameOf, isCreature))).toEqual([
      t("combat.hit", { by: t("combat.sourceDegeneration"), target: "Caster dummy", amount: "2" }),
      t("combat.death", { target: "Caster dummy" }),
    ]);
  });

  it("writes no row for a second that sums to nothing", () => {
    const batcher = new StatusTickBatcher();
    const crumb: CombatEvent = {
      kind: "damage",
      targetId: "dummy",
      amount: 0.002,
      critical: false,
    };
    ticks(0, 20, [crumb]).forEach((t) => batcher.push(t, nameOf, isCreature));
    expect(batcher.advance(1, nameOf, isCreature)).toEqual([]);
  });

  it("flushes before a divider, so the line comes after the ticks", () => {
    const batcher = new StatusTickBatcher();
    batcher.push(
      tick(0, [{ kind: "damage", targetId: "dummy", amount: 3, critical: false }]),
      nameOf,
      isCreature,
    );
    const rows = [...batcher.flush(0.5, nameOf, isCreature), dividerRow("re-armed", 0.5)];
    expect(texts(rows)).toEqual([
      t("combat.hit", { by: t("combat.sourceDegeneration"), target: "Caster dummy", amount: "3" }),
      "── re-armed ──",
    ]);
  });

  it("never writes a row timed before one already written", () => {
    // Regeneration all the while, a skill hit mid-second, a death, a divider.
    const batcher = new StatusTickBatcher();
    const heal: CombatEvent = { kind: "heal", targetId: "you", amount: 0.2 };
    const hit: CombatEvent = { kind: "damage", targetId: "dummy", amount: 30, critical: false };
    const rows: LogRow[] = [];
    for (let i = 0; i < 50; i += 1) {
      const at = i * 0.05;
      rows.push(...batcher.push(tick(at, [heal]), nameOf, isCreature));
      if (i === 15) {
        rows.push(...batcher.push(entry([hit], { atSeconds: at }), nameOf, isCreature));
      }
      if (i === 30) {
        const death: CombatEvent = { kind: "death", targetId: "you" };
        rows.push(...batcher.push(tick(at, [death]), nameOf, isCreature));
      }
      rows.push(...batcher.advance(at, nameOf, isCreature));
    }
    rows.push(...batcher.flush(2.5, nameOf, isCreature), dividerRow("reset", 2.5));
    const times = rows.map((row) => row.time);
    expect(rows.length).toBeGreaterThan(4);
    expect(times).toEqual([...times].sort());
  });

  it("passes skill entries straight through", () => {
    const batcher = new StatusTickBatcher();
    const hit: CombatEvent = { kind: "damage", targetId: "dummy", amount: 63.6, critical: false };
    expect(texts(batcher.push(entry([hit]), nameOf, isCreature))).toEqual([
      t("combat.hit", { by: by("Fireball", "Pyro"), target: "Caster dummy", amount: "64" }),
    ]);
  });
});

describe("uses, adrenaline and skipped effects (#1735)", () => {
  const texts = (rows: readonly LogRow[]) => rows.map((row) => row.text);
  const signet = { skillId: "paragon.glowing-signet" };

  it("a use, at a target or at nobody else", () => {
    const at: CombatEvent = {
      kind: "skill-used",
      casterId: "you",
      skillId: "paragon.glowing-signet",
      targetId: "dummy",
    };
    const self: CombatEvent = {
      kind: "skill-used",
      casterId: "dummy",
      skillId: "monk.healing-breeze",
      targetId: "dummy",
    };
    expect(describeCombatEvent(entry([at], signet), at, nameOf, isCreature)).toBe(
      t("combat.skillUsedOn", { caster: "Pyro", skill: "Glowing Signet", target: "Caster dummy" }),
    );
    expect(describeCombatEvent(entry([self]), self, nameOf, isCreature)).toBe(
      t("combat.skillUsed", { caster: "Caster dummy", skill: "Healing Breeze" }),
    );
  });

  it("a skill's adrenaline is a row of its own, named for it", () => {
    const gained: CombatEvent = {
      kind: "adrenaline-gained",
      targetId: "you",
      strikes: 2,
      skillId: "paragon.signet-of-aggression",
    };
    const batcher = new StatusTickBatcher();
    expect(texts(batcher.push(entry([gained]), nameOf, isCreature))).toEqual([
      t("combat.adrenalineStrikesFrom", {
        target: "Pyro",
        count: 2,
        skill: "Signet of Aggression",
      }),
    ]);
  });

  it("a blow's adrenaline ends its hit's row", () => {
    const swing = entry(
      [
        { kind: "damage", targetId: "dummy", amount: 20, critical: false },
        { kind: "adrenaline-gained", targetId: "you", strikes: 1, skillId: undefined },
      ],
      { cause: "weapon", skillId: undefined, weaponId: "sword" },
    );
    const batcher = new StatusTickBatcher();
    const rows = [swing, swing].flatMap((each) => batcher.push(each, nameOf, isCreature));
    const swordHit = t("combat.hitAdrenaline", {
      hit: t("combat.hit", { by: by("Sword", "Pyro"), target: "Caster dummy", amount: "20" }),
      strikes: "1",
    });
    expect(texts(rows)).toEqual([swordHit, swordHit]);
    expect(appendRows([], rows, 10).rows).toHaveLength(2);
  });

  it("a skipped effect says what it waited for, in the tooltip's words", () => {
    const skipped: CombatEvent = {
      kind: "effect-skipped",
      casterId: "you",
      targetId: "dummy",
      skillId: "paragon.glowing-signet",
      requirement: "only if target has Burning",
    };
    expect(describeCombatEvent(entry([skipped], signet), skipped, nameOf, isCreature)).toBe(
      t("combat.effectSkipped", {
        by: by("Glowing Signet", "Pyro"),
        requirement: "only if target has Burning",
      }),
    );
  });
});
