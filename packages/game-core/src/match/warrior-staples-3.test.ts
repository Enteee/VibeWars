import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { gainStrikes } from "../skills/adrenaline.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Warrior staples 3 (#1658): sixteen Warrior attacks and a shout on
 * primitives that already exist, at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };

const AXE_TWIST = "warrior.axe-twist";
const AXE_RAKE = "warrior.axe-rake";
const AGONIZING_CHOP = "warrior.agonizing-chop";
const TRIPLE_CHOP = "warrior.triple-chop";
const FIERCE_BLOW = "warrior.fierce-blow";
const OVERBEARING_SMASH = "warrior.overbearing-smash";
const BELLY_SMASH = "warrior.belly-smash";
const MAGEHUNTERS_SMASH = "warrior.magehunters-smash";
const ENRAGED_SMASH = "warrior.enraged-smash";
const SEEKING_BLADE = "warrior.seeking-blade";
const SILVERWING_SLASH = "warrior.silverwing-slash";
const QUIVERING_BLADE = "warrior.quivering-blade";
const STEELFANG_SLASH = "warrior.steelfang-slash";
const MAGEHUNTER_STRIKE = "warrior.magehunter-strike";
const BODY_BLOW = "warrior.body-blow";
const COWARD = "warrior.coward";
const HEALING_SIGNET = "warrior.healing-signet";
const BAR = [
  AXE_TWIST,
  AXE_RAKE,
  AGONIZING_CHOP,
  TRIPLE_CHOP,
  FIERCE_BLOW,
  OVERBEARING_SMASH,
  BELLY_SMASH,
  MAGEHUNTERS_SMASH,
  ENRAGED_SMASH,
  SEEKING_BLADE,
  SILVERWING_SLASH,
  QUIVERING_BLADE,
  STEELFANG_SLASH,
  MAGEHUNTER_STRIKE,
  BODY_BLOW,
  COWARD,
];

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

const AXE = wielding(WEAPONS.axe, "warrior.axe-mastery");
const HAMMER = wielding(WEAPONS.hammer, "warrior.hammer-mastery");
const SWORD = wielding(WEAPONS.sword, "warrior.swordsmanship");

/** The weapon each skill swings, for `w` to hold. */
function weaponFor(skillId: string): ResolvedEquipment {
  const weapon = skill(skillId).attack?.weapon;
  return weapon === "axe" ? AXE : weapon === "hammer" ? HAMMER : SWORD;
}

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/** `w`, a rank-12 Warrior holding `skillId`'s weapon, with `BAR`, at the origin. */
function warrior(skillId: string): ParticipantSpec {
  return spec("w", 0, vec2(0, 0), {
    skillBar: BAR,
    attributeRanks: new Map([
      ["warrior.strength", 12],
      ["warrior.axe-mastery", 12],
      ["warrior.hammer-mastery", 12],
      ["warrior.swordsmanship", 12],
    ]),
    equipment: weaponFor(skillId),
  });
}

/** `w` with `skillId` in hand and its adrenaline full; `f`, its foe, in reach east unless `more` places it. */
function match(skillId: string, more: readonly ParticipantSpec[] = []) {
  const participants = [warrior(skillId), ...more];
  if (!more.some((participant) => participant.id === "f")) {
    participants.push(spec("f", 1, vec2(RANGE_MELEE / 2, 0)));
  }
  const sim = new MatchSimulation({ seed: "warrior-staples-3", ruleset: NO_CRIT, participants });
  gainStrikes(get(sim, "w").combatant, 8, 0);
  return sim;
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `w` uses `skillId` on `f`, `meanwhile` run before each step: what its skill logged until it landed. */
function used(sim: MatchSimulation, skillId: string, meanwhile?: () => void): CombatEvent[] {
  sim.setTarget("w", "f");
  expect(sim.requestSkill("w", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    meanwhile?.();
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "w" && entry.skillId === skillId)
      .flatMap((entry) => entry.events);
    if (logged.length > 0) {
      return logged;
    }
  }
  throw new Error(`${skillId} never landed`);
}

function damageTo(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );
}

type FoeState = "still" | "deep-wound" | "weakness" | "cracked-armor" | "knocked-down" | "moving";

/** What `skillId` does to `f`, in `state` when it lands. */
function hit(skillId: string, state: FoeState) {
  const sim = match(skillId);
  const foe = get(sim, "f").combatant;
  if (state === "deep-wound" || state === "weakness" || state === "cracked-armor") {
    foe.statuses.apply(state, 1000, "w", NO_RANKS);
  }
  if (state === "knocked-down") {
    foe.knockdownRemaining = 1000;
  }
  if (state === "moving") {
    // Limping away: the warrior catches it up and hits it walking.
    foe.statuses.apply("crippled", 1000, "w", NO_RANKS);
    sim.setInputDirection("f", vec2(1, 0));
  }
  if (skillId !== MAGEHUNTERS_SMASH) {
    // Count the strikes it gains on Magehunter's Smash, from 0.
    get(sim, "w").combatant.adrenaline.set(MAGEHUNTERS_SMASH, 0);
  }
  const events = used(sim, skillId);
  const strikes =
    (get(sim, "w").combatant.adrenaline.get(MAGEHUNTERS_SMASH) ?? 0) / ADRENALINE_PER_STRIKE;
  return { sim, events, damage: damageTo(events, "f"), foe, strikes };
}

describe("the Axe riders on a Deep Wound (#1658)", () => {
  it("Axe Twist: +21 and Weakness for 20 s, only on a Deep Wound", () => {
    const [plain] = hit(AXE_TWIST, "still").damage;
    const wounded = hit(AXE_TWIST, "deep-wound");
    expect(wounded.damage).toEqual([(plain ?? 0) + 21]);
    expect(wounded.foe.statuses.get("weakness")?.durationSeconds).toBe(20);
    expect(hit(AXE_TWIST, "still").foe.statuses.has("weakness")).toBe(false);
  });

  it("Axe Rake: +14 and Crippled for 15 s, only on a Deep Wound", () => {
    const [plain] = hit(AXE_RAKE, "still").damage;
    const wounded = hit(AXE_RAKE, "deep-wound");
    expect(wounded.damage).toEqual([(plain ?? 0) + 14]);
    expect(wounded.foe.statuses.get("crippled")?.durationSeconds).toBe(15);
    expect(hit(AXE_RAKE, "still").foe.statuses.has("crippled")).toBe(false);
  });

  it("Agonizing Chop: +17 always, and interrupts a foe with a Deep Wound", () => {
    expect(skill(AGONIZING_CHOP)).toMatchObject({
      cost: { kind: "adrenaline", amount: 6 },
      activationSeconds: 1,
      attack: { bonusDamage: { scaling: { attributeId: "warrior.axe-mastery", atTwelve: 17 } } },
    });
    /** Whether the chop interrupted `f`'s Healing Signet, cast over and over. */
    const interrupts = (wounded: boolean): boolean => {
      const sim = match(AGONIZING_CHOP, [
        spec("f", 1, vec2(RANGE_MELEE / 2, 0), { skillBar: [HEALING_SIGNET] }),
      ]);
      const foe = get(sim, "f").combatant;
      if (wounded) {
        foe.statuses.apply("deep-wound", 1000, "w", NO_RANKS);
      }
      const events = used(sim, AGONIZING_CHOP, () => {
        if (!foe.cast.isCasting) {
          sim.requestSkill("f", 0);
        }
      });
      return events.some((event) => event.kind === "interrupted");
    };
    expect(interrupts(true)).toBe(true);
    expect(interrupts(false)).toBe(false);
  });
});

describe("Triple Chop (#1658)", () => {
  it("an elite +34 blow on the target and each foe adjacent to it, not to you", () => {
    expect(skill(TRIPLE_CHOP)).toMatchObject({
      elite: true,
      cost: { kind: "energy", amount: 5 },
      rechargeSeconds: 10,
      area: { origin: "target", affects: "enemies" },
    });
    // g1 is adjacent to f and 50 from w; g2 is adjacent to neither.
    const sim = match(TRIPLE_CHOP, [
      spec("f", 1, vec2(RANGE_MELEE / 2, 0)),
      spec("g1", 1, vec2(RANGE_MELEE / 2 + 30, 0)),
      spec("g2", 1, vec2(RANGE_MELEE / 2, 70)),
    ]);
    const events = used(sim, TRIPLE_CHOP);
    expect(damageTo(events, "f")).toHaveLength(1);
    expect(damageTo(events, "g1")).toHaveLength(1);
    expect(damageTo(events, "g2")).toEqual([]);
  });

  it("with no foe adjacent to the target, one blow", () => {
    const events = hit(TRIPLE_CHOP, "still").events;
    expect(events.filter((event) => event.kind === "damage")).toHaveLength(1);
  });
});

describe("the Hammer attacks (#1658)", () => {
  it("Fierce Blow: Deep Wound for 7 s on a Weakened foe only", () => {
    expect(hit(FIERCE_BLOW, "weakness").foe.statuses.get("deep-wound")?.durationSeconds).toBe(7);
    expect(hit(FIERCE_BLOW, "still").foe.statuses.has("deep-wound")).toBe(false);
  });

  it("Fierce Blow then Axe Twist: the Deep Wound it left lets the Twist weaken", () => {
    // x, an axe Warrior beside w, twists.
    const sim = match(FIERCE_BLOW, [
      spec("f", 1, vec2(RANGE_MELEE / 2, 0)),
      { ...warrior(AXE_TWIST), id: "x", spawn: vec2(RANGE_MELEE, 0) },
    ]);
    const foe = get(sim, "f").combatant;
    foe.statuses.apply("weakness", 3, "w", NO_RANKS);
    used(sim, FIERCE_BLOW);
    expect(foe.statuses.get("deep-wound")?.durationSeconds).toBe(7);
    gainStrikes(get(sim, "x").combatant, 5, 0);
    sim.setTarget("x", "f");
    expect(sim.requestSkill("x", BAR.indexOf(AXE_TWIST))?.check).toEqual({ ok: true });
    for (let i = 0; i < 3 * RULES.tickRateHz; i += 1) {
      sim.step(DT);
    }
    expect(foe.statuses.get("weakness")?.durationSeconds).toBe(20);
  });

  it("Overbearing Smash: Dazed for 7 s on a knocked-down foe only", () => {
    expect(skill(OVERBEARING_SMASH)).toMatchObject({
      cost: { kind: "energy", amount: 5 },
      rechargeSeconds: 20,
    });
    expect(hit(OVERBEARING_SMASH, "knocked-down").foe.statuses.get("dazed")?.durationSeconds).toBe(
      7,
    );
    expect(hit(OVERBEARING_SMASH, "still").foe.statuses.has("dazed")).toBe(false);
  });

  it("Belly Smash on a knocked-down foe blinds the foes adjacent to it, not it", () => {
    const foes = [
      spec("f", 1, vec2(RANGE_MELEE / 2, 0)),
      spec("g1", 1, vec2(RANGE_MELEE / 2, 30)),
      spec("g2", 1, vec2(RANGE_MELEE / 2, -30)),
    ];
    const blinded = (knockedDown: boolean): string[] => {
      const sim = match(BELLY_SMASH, foes);
      if (knockedDown) {
        get(sim, "f").combatant.knockdownRemaining = 1000;
      }
      used(sim, BELLY_SMASH);
      return ["f", "g1", "g2"].filter((id) => get(sim, id).combatant.statuses.has("blind"));
    };
    expect(blinded(true)).toEqual(["g1", "g2"]);
    expect(blinded(false)).toEqual([]);
    const sim = match(BELLY_SMASH, foes);
    get(sim, "f").combatant.knockdownRemaining = 1000;
    used(sim, BELLY_SMASH);
    expect(get(sim, "g1").combatant.statuses.get("blind")?.durationSeconds).toBe(6);
  });

  it("Magehunter's Smash knocks down; a block stops it unless the foe is enchanted", () => {
    expect(hit(MAGEHUNTERS_SMASH, "still").foe.knockdownRemaining).toBeGreaterThan(0);
    const blocked = (enchanted: boolean): boolean => {
      const sim = match(MAGEHUNTERS_SMASH);
      const foe = get(sim, "f").combatant;
      foe.statuses.apply("shield-bash", 10, "f", NO_RANKS);
      if (enchanted) {
        foe.statuses.apply("armor-boost", 10, "f", NO_RANKS);
      }
      return used(sim, MAGEHUNTERS_SMASH).some((event) => event.kind === "attack-blocked");
    };
    expect(blocked(false)).toBe(true);
    expect(blocked(true)).toBe(false);
  });

  it("Enraged Smash: 3 strikes on a hit; on a moving foe +34 and a knockdown too", () => {
    const still = hit(ENRAGED_SMASH, "still");
    // Seeking Blade, an energy blow too, gains only what any hit does.
    expect(still.strikes).toBe(hit(SEEKING_BLADE, "still").strikes + 3);
    expect(still.foe.knockdownRemaining).toBe(0);
    // A chase lands it later, on another roll: the +34 is read off the rule.
    expect(skill(ENRAGED_SMASH).attack?.conditionalBonus).toEqual({
      condition: { kind: "target-moving" },
      amount: { scaling: { attributeId: "warrior.hammer-mastery", atZero: 10, atTwelve: 34 } },
    });
    const moving = hit(ENRAGED_SMASH, "moving");
    expect(moving.damage).toHaveLength(1);
    expect(moving.foe.knockdownRemaining).toBeGreaterThan(0);
  });
});

describe("the Sword attacks (#1658)", () => {
  it("Seeking Blade blocked: 16 damage and Bleeding for 25 s, and it recharges as ever", () => {
    const sim = match(SEEKING_BLADE);
    const foe = get(sim, "f").combatant;
    foe.statuses.apply("shield-bash", 10, "f", NO_RANKS);
    const events = used(sim, SEEKING_BLADE);
    expect(events.some((event) => event.kind === "attack-blocked")).toBe(true);
    expect(damageTo(events, "f")).toEqual([16]);
    expect(foe.statuses.get("bleeding")?.durationSeconds).toBe(25);
    const left = get(sim, "w").combatant.cast.rechargeRemaining.get(SEEKING_BLADE) ?? 0;
    expect(left).toBeGreaterThan(3);
    expect(left).toBeLessThanOrEqual(4);
  });

  it("Seeking Blade landing: no Bleeding", () => {
    expect(hit(SEEKING_BLADE, "still").foe.statuses.has("bleeding")).toBe(false);
  });

  it("Silverwing Slash: a +32 sword blow for 7 strikes", () => {
    expect(skill(SILVERWING_SLASH)).toMatchObject({
      cost: { kind: "adrenaline", amount: 7 },
      attack: {
        weapon: "sword",
        bonusDamage: { scaling: { attributeId: "warrior.swordsmanship", atTwelve: 32.2 } },
      },
      effects: [],
    });
  });

  it("Quivering Blade: Dazed for 10 s on a moving foe only", () => {
    expect(hit(QUIVERING_BLADE, "moving").foe.statuses.get("dazed")?.durationSeconds).toBe(10);
    expect(hit(QUIVERING_BLADE, "still").foe.statuses.has("dazed")).toBe(false);
  });

  it("Steelfang Slash: 4 strikes back on a knocked-down foe only", () => {
    expect(hit(STEELFANG_SLASH, "knocked-down").strikes).toBe(
      hit(STEELFANG_SLASH, "still").strikes + 4,
    );
  });
});

describe("the Strength attacks (#1658)", () => {
  it("Magehunter Strike: an elite +21 melee blow a block stops unless the foe is enchanted", () => {
    expect(skill(MAGEHUNTER_STRIKE)).toMatchObject({
      elite: true,
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0.5,
      rechargeSeconds: 3,
      attack: { weapon: "melee", unblockable: { kind: "target-has", category: "enchantment" } },
    });
  });

  it("Body Blow: Deep Wound for 12 s on Cracked Armor only", () => {
    expect(hit(BODY_BLOW, "cracked-armor").foe.statuses.get("deep-wound")?.durationSeconds).toBe(
      12,
    );
    expect(hit(BODY_BLOW, "still").foe.statuses.has("deep-wound")).toBe(false);
  });
});

describe('"Coward!" (#1658)', () => {
  /** `f`, walking or standing, after `w` shouts at it. */
  function shouted(moving: boolean) {
    const sim = match(COWARD, [spec("f", 1, vec2(300, 0))]);
    if (moving) {
      sim.setInputDirection("f", vec2(0, 1));
      sim.step(DT);
    }
    const w = get(sim, "w").combatant;
    sim.setTarget("w", "f");
    expect(sim.requestSkill("w", BAR.indexOf(COWARD))?.check).toEqual({ ok: true });
    sim.step(DT);
    return { foe: get(sim, "f").combatant, w };
  }

  it("knocks a moving foe down", () => {
    expect(skill(COWARD)).toMatchObject({
      type: "shout",
      elite: true,
      attributeId: undefined,
      cost: { kind: "adrenaline", amount: 4 },
      rechargeSeconds: 4,
    });
    expect(shouted(true).foe.knockdownRemaining).toBeGreaterThan(0);
  });

  it("on a foe standing still, the adrenaline is spent and nothing happens", () => {
    const { foe, w } = shouted(false);
    expect(foe.knockdownRemaining).toBe(0);
    expect(w.adrenaline.get(COWARD) ?? 0).toBe(0);
  });
});

describe("the texts (#1658)", () => {
  const ranks = warrior(AXE_TWIST).attributeRanks;
  const text = (id: string): string[] =>
    describeSkill(skill(id), ranks).effects.map((effect) => effect.text);

  it("say what the riders do", () => {
    expect(text(AXE_TWIST)).toEqual([
      "If target has Deep Wound: +21 damage",
      "If target has Deep Wound: applies Weakness for 20s (−66% weapon damage, −1 to all attributes)",
    ]);
    expect(text(BELLY_SMASH)).toEqual([
      "If target is knocked down: adjacent foes suffer Blind for 6s (90% of attacks miss)",
    ]);
    expect(text(ENRAGED_SMASH)).toEqual([
      "If target is moving: +34 damage",
      "Gain 3 strikes of adrenaline",
      "If target is moving: knocks down for 2s",
    ]);
    expect(text(SEEKING_BLADE)).toEqual([
      "+16 damage",
      "If blocked: deals 16 damage",
      "If blocked: applies Bleeding for 25s (−3 Health degeneration)",
    ]);
    expect(text(COWARD)).toEqual(["If target is moving: knocks down for 2s"]);
  });
});
