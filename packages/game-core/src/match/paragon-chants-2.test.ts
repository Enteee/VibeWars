import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { gainStrikes } from "../skills/adrenaline.js";
import { getSkill } from "../skills/catalog.js";
import { describeStatus } from "../skills/describe.js";
import { applyEffects } from "../skills/effects.js";
import { NO_RANKS, StatusSet, type StatusId } from "../skills/status.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Paragon chants 2 (#1483): a chant that holds the bearer's next skill of
 * a kind (`nextSkill`) resolves on the bearer once such a use completes,
 * and ends after its count; three more ride the next attack skill.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

/** An enchantment, so a spell: 0.75 s to cast, long enough to interrupt. */
const SPELL = "elementalist.armor-of-earth";
const SIGNET = "warrior.dolyak-signet";
const SHOUT = "warrior.for-great-justice";
/** An axe attack skill, instant, 5 Energy. */
const ATTACK = "warrior.swift-chop";
/** An adrenaline skill on the bar, whose pool shows the strikes gained. */
const ADRENAL = "warrior.backbreaker";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
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

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/**
 * "p", a rank-12 paragon with an axe and `bar`, and a foe "f" beside it
 * with `foeBar`, far more Health and no armour to speak of.
 */
function match(bar: readonly string[], foeBar: readonly string[] = []): MatchSimulation {
  return new MatchSimulation({
    seed: "paragon-chants-2",
    participants: [
      spec("p", 0, vec2(0, 0), {
        skillBar: [...bar],
        equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
        attributeRanks: new Map([
          ["warrior.axe-mastery", 12],
          ["paragon.command", 12],
          ["paragon.leadership", 12],
          ["paragon.motivation", 12],
        ]),
        maxEnergy: 100,
      }),
      spec("f", 1, vec2(30, 0), { skillBar: [...foeBar], maxHealth: 1e6, maxEnergy: 100 }),
    ],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** "p" with `energy` of its 100, room for a gain to show. */
function spent(sim: MatchSimulation, energy = 20): void {
  get(sim, "p").combatant.energy = energy;
}

/** `id` on "p", from "p", for `seconds`. */
function put(sim: MatchSimulation, id: StatusId, seconds = 10): void {
  get(sim, "p").combatant.statuses.apply(id, seconds, "p", NO_RANKS);
}

/** "p" uses its skill in `slot` on the foe, and finishes it: the log meanwhile. */
function use(sim: MatchSimulation, slot: number): CombatLogEntry[] {
  sim.setTarget("p", "f");
  expect(sim.requestSkill("p", slot)?.check).toEqual({ ok: true });
  return stepFor(sim, 1.5);
}

/** The events `skillId`'s chant logged on its bearer. */
function answered(log: readonly CombatLogEntry[], skillId: string) {
  return log
    .filter((entry) => entry.skillId === skillId && entry.sourceId === "p")
    .flatMap(({ events }) => events);
}

function has(sim: MatchSimulation, id: StatusId, on = "p"): boolean {
  return get(sim, on).combatant.statuses.has(id);
}

describe("StatusSet.useNextSkill (#1483)", () => {
  it("answers each kind, counts down and ends at 0", () => {
    const kinds: [StatusId, string, string][] = [
      ["zealous-anthem", ATTACK, SPELL],
      ["aria-of-zeal", SPELL, SIGNET],
      ["lyric-of-zeal", SIGNET, SHOUT],
      ["chorus-of-restoration", "paragon.incoming", ATTACK],
      ["chorus-of-restoration", "paragon.anthem-of-flame", SIGNET],
    ];
    for (const [id, yes, no] of kinds) {
      const set = new StatusSet();
      set.apply(id, 10, "p", NO_RANKS);
      expect(set.useNextSkill(skill(no), new Set()).answered, `${id} ${no}`).toEqual([]);
      expect(set.useNextSkill(skill(yes), new Set()).ended, `${id} ${yes}`).toEqual([id]);
      expect(set.has(id)).toBe(false);
    }
  });

  it("with a count of 5 answers any five skills, then ends", () => {
    const set = new StatusSet();
    set.apply("song-of-purification", 20, "p", NO_RANKS);
    for (const id of [SPELL, SIGNET, SHOUT, ATTACK]) {
      expect(set.useNextSkill(skill(id), new Set()).ended).toEqual([]);
    }
    expect(set.get("song-of-purification")?.skillsLeft).toBe(1);
    expect(set.useNextSkill(skill(SPELL), new Set()).ended).toEqual(["song-of-purification"]);
  });

  it("leaves one the skill put on its own user", () => {
    const set = new StatusSet();
    set.apply("chorus-of-restoration", 10, "p", NO_RANKS);
    const spared = new Set<StatusId>(["chorus-of-restoration"]);
    expect(set.useNextSkill(skill("paragon.chorus-of-restoration"), spared).answered).toEqual([]);
    expect(set.get("chorus-of-restoration")?.skillsLeft).toBe(1);
  });
});

describe("a next-skill chant in a match (#1483)", () => {
  it("resolves on its bearer once a matching use completes, and ends", () => {
    const sim = match([SIGNET, SPELL]);
    put(sim, "aria-of-zeal");
    spent(sim);
    expect(answered(use(sim, 0), "paragon.aria-of-zeal")).toEqual([]);
    expect(has(sim, "aria-of-zeal")).toBe(true);
    expect(answered(use(sim, 1), "paragon.aria-of-zeal")).toEqual([
      { kind: "energy-gain", targetId: "p", amount: 5 },
      { kind: "status-expired", targetId: "p", statusId: "aria-of-zeal" },
    ]);
    expect(has(sim, "aria-of-zeal")).toBe(false);
  });

  it("answers no interrupted spell, and stays for the next one", () => {
    const sim = match([SPELL]);
    put(sim, "aria-of-zeal");
    sim.setTarget("p", "f");
    sim.requestSkill("p", 0);
    const log = [...sim.step(DT).log];
    const paragon = get(sim, "p").combatant;
    expect(paragon.cast.isCasting).toBe(true);
    applyEffects([{ kind: "interrupt" }], {
      surroundings: new Map(),
      caster: get(sim, "f").combatant,
      target: paragon,
      rng: createRng(1483),
      rules: RULES.combat,
    });
    log.push(...stepFor(sim, 1.5));
    expect(answered(log, "paragon.aria-of-zeal")).toEqual([]);
    expect(has(sim, "aria-of-zeal")).toBe(true);
  });

  it("answers no weapon swing", () => {
    const sim = match([]);
    put(sim, "zealous-anthem");
    expect(sim.requestAttack("p", "f")?.ok).toBe(true);
    const log = stepFor(sim, 3);
    expect(log.some((entry) => entry.cause === "weapon" && entry.sourceId === "p")).toBe(true);
    expect(has(sim, "zealous-anthem")).toBe(true);
  });

  it("two that answer the same spell both fire", () => {
    const sim = match([SPELL]);
    put(sim, "aria-of-zeal");
    spent(sim);
    put(sim, "aria-of-restoration");
    get(sim, "p").combatant.health = 100;
    const log = use(sim, 0);
    expect(answered(log, "paragon.aria-of-zeal")[0]).toMatchObject({ kind: "energy-gain" });
    expect(answered(log, "paragon.aria-of-restoration")[0]).toMatchObject({ kind: "heal" });
  });

  it("Chorus of Restoration does not answer its own cast: the next shout heals", () => {
    const sim = match(["paragon.chorus-of-restoration", SHOUT]);
    const paragon = get(sim, "p").combatant;
    gainStrikes(paragon, 4, 0);
    paragon.health = 100;
    const cast = use(sim, 0);
    const heals = answered(cast, "paragon.chorus-of-restoration").filter(
      ({ kind }) => kind === "heal",
    );
    expect(heals).toEqual([]);
    expect(has(sim, "chorus-of-restoration")).toBe(true);
    expect(answered(use(sim, 1), "paragon.chorus-of-restoration")[0]).toEqual({
      kind: "heal",
      targetId: "p",
      amount: 78,
    });
  });

  it("Song of Purification uses a count on a skill even with no condition to remove", () => {
    const sim = match([SIGNET, SHOUT]);
    put(sim, "song-of-purification", 20);
    get(sim, "p").combatant.statuses.apply("bleeding", 20, "f", NO_RANKS);
    use(sim, 0);
    expect(has(sim, "bleeding")).toBe(false);
    use(sim, 1);
    expect(get(sim, "p").combatant.statuses.get("song-of-purification")?.skillsLeft).toBe(3);
  });

  it("each says what it does", () => {
    expect(describeStatus("aria-of-zeal", new Map())).toBe("with your next spell: gain 5 energy");
    expect(describeStatus("song-of-purification", new Map())).toBe(
      "with your next 5 skills: removes 1 condition",
    );
  });
});

/** The parts of a chant every one of these shares (#1483). */
const CHANT = {
  type: "chant",
  flash: false,
  disabledAfterUseSeconds: undefined,
  profession: "paragon",
  overcast: 0,
  target: "self",
  area: { origin: "caster", affects: "allies", includesCaster: true },
};

describe("the twelve chants (#1483)", () => {
  it("Zealous Anthem: 7 Energy with the next attack skill", () => {
    expect(skill("paragon.zealous-anthem")).toMatchObject({
      ...CHANT,
      gwId: 1561,
      elite: false,
      attributeId: "paragon.motivation",
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 1,
      rechargeSeconds: 10,
      effects: [
        { kind: "apply-status", statusId: "zealous-anthem", durationSeconds: { flat: 10 } },
      ],
    });
    const sim = match([ATTACK]);
    put(sim, "zealous-anthem");
    spent(sim);
    expect(answered(use(sim, 0), "paragon.zealous-anthem")[0]).toEqual({
      kind: "energy-gain",
      targetId: "p",
      amount: 7,
    });
  });

  it("Aria of Zeal: 5 Energy with the next spell", () => {
    expect(skill("paragon.aria-of-zeal")).toMatchObject({
      ...CHANT,
      gwId: 1562,
      elite: false,
      attributeId: "paragon.motivation",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 10,
      effects: [{ kind: "apply-status", statusId: "aria-of-zeal", durationSeconds: { flat: 10 } }],
    });
  });

  it("Lyric of Zeal: 7 Energy with the next signet", () => {
    expect(skill("paragon.lyric-of-zeal")).toMatchObject({
      ...CHANT,
      gwId: 1563,
      elite: false,
      attributeId: "paragon.motivation",
      cost: { kind: "adrenaline", amount: 6 },
      activationSeconds: 1,
      rechargeSeconds: 0,
      effects: [{ kind: "apply-status", statusId: "lyric-of-zeal", durationSeconds: { flat: 10 } }],
    });
    const sim = match([SIGNET]);
    put(sim, "lyric-of-zeal");
    spent(sim);
    expect(answered(use(sim, 0), "paragon.lyric-of-zeal")[0]).toEqual({
      kind: "energy-gain",
      targetId: "p",
      amount: 7,
    });
  });

  it("Aria of Restoration: a 78 heal with the next spell", () => {
    expect(skill("paragon.aria-of-restoration")).toMatchObject({
      ...CHANT,
      gwId: 1566,
      elite: false,
      attributeId: "paragon.motivation",
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 1,
      rechargeSeconds: 10,
      effects: [
        { kind: "apply-status", statusId: "aria-of-restoration", durationSeconds: { flat: 10 } },
      ],
    });
    const sim = match([SPELL]);
    put(sim, "aria-of-restoration");
    get(sim, "p").combatant.health = 100;
    expect(answered(use(sim, 0), "paragon.aria-of-restoration")[0]).toEqual({
      kind: "heal",
      targetId: "p",
      amount: 78,
    });
  });

  it("Chorus of Restoration: a 78 heal with the next shout or chant", () => {
    expect(skill("paragon.chorus-of-restoration")).toMatchObject({
      ...CHANT,
      gwId: 1565,
      elite: false,
      attributeId: "paragon.motivation",
      cost: { kind: "adrenaline", amount: 4 },
      activationSeconds: 1,
      rechargeSeconds: 5,
      effects: [
        { kind: "apply-status", statusId: "chorus-of-restoration", durationSeconds: { flat: 10 } },
      ],
    });
  });

  it("Lyric of Purification: a condition lost with the next signet, for 17 s", () => {
    expect(skill("paragon.lyric-of-purification")).toMatchObject({
      ...CHANT,
      gwId: 1772,
      elite: false,
      attributeId: "paragon.motivation",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 10,
      effects: [
        {
          kind: "apply-status",
          statusId: "lyric-of-purification",
          durationSeconds: {
            scaling: { attributeId: "paragon.motivation", atZero: 5, atTwelve: 17 },
          },
        },
      ],
    });
    const sim = match([SIGNET]);
    put(sim, "lyric-of-purification");
    get(sim, "p").combatant.statuses.apply("poison", 20, "f", NO_RANKS);
    use(sim, 0);
    expect(has(sim, "poison")).toBe(false);
  });

  it("Song of Purification, elite: a condition lost with each of the next 5 skills", () => {
    expect(skill("paragon.song-of-purification")).toMatchObject({
      ...CHANT,
      gwId: 1570,
      elite: true,
      attributeId: "paragon.motivation",
      cost: { kind: "adrenaline", amount: 3 },
      activationSeconds: 2,
      rechargeSeconds: 0,
      effects: [
        { kind: "apply-status", statusId: "song-of-purification", durationSeconds: { flat: 20 } },
      ],
    });
  });

  it("Hexbreaker Aria: a hex lost with the next spell; no attribute", () => {
    expect(skill("paragon.hexbreaker-aria")).toMatchObject({
      ...CHANT,
      gwId: 1571,
      elite: false,
      attributeId: undefined,
      cost: { kind: "adrenaline", amount: 8 },
      activationSeconds: 2,
      rechargeSeconds: 0,
      effects: [
        { kind: "apply-status", statusId: "hexbreaker-aria", durationSeconds: { flat: 10 } },
      ],
    });
    const sim = match([SPELL]);
    put(sim, "hexbreaker-aria");
    get(sim, "p").combatant.statuses.apply("empathy", 20, "f", NO_RANKS);
    use(sim, 0);
    expect(has(sim, "empathy")).toBe(false);
  });

  it("Anthem of Fury, elite: 4 strikes of adrenaline with the next attack skill", () => {
    expect(skill("paragon.anthem-of-fury")).toMatchObject({
      ...CHANT,
      gwId: 1553,
      elite: true,
      attributeId: "paragon.leadership",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 10,
      effects: [
        { kind: "apply-status", statusId: "anthem-of-fury", durationSeconds: { flat: 10 } },
      ],
    });
    const pool = (withAnthem: boolean): number => {
      const sim = match([ATTACK, ADRENAL]);
      if (withAnthem) {
        put(sim, "anthem-of-fury");
      }
      use(sim, 0);
      return get(sim, "p").combatant.adrenaline.get(ADRENAL) ?? 0;
    };
    expect(pool(true) - pool(false)).toBe(4 * ADRENALINE_PER_STRIKE);
  });

  it("Anthem of Weariness: the next attack skill weakens for 13 s", () => {
    expect(skill("paragon.anthem-of-weariness")).toMatchObject({
      ...CHANT,
      gwId: 2017,
      elite: false,
      attributeId: "paragon.command",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 10,
      effects: [
        { kind: "apply-status", statusId: "anthem-of-weariness", durationSeconds: { flat: 8 } },
      ],
    });
    const sim = match([ATTACK]);
    put(sim, "anthem-of-weariness");
    use(sim, 0);
    expect(get(sim, "f").combatant.statuses.get("weakness")?.durationSeconds).toBe(13);
    expect(has(sim, "anthem-of-weariness")).toBe(false);
  });

  it("Crippling Anthem, elite: the next attack skill cripples for 13 s", () => {
    expect(skill("paragon.crippling-anthem")).toMatchObject({
      ...CHANT,
      gwId: 1554,
      elite: true,
      attributeId: "paragon.command",
      cost: { kind: "adrenaline", amount: 3 },
      activationSeconds: 1,
      rechargeSeconds: 0,
      effects: [
        { kind: "apply-status", statusId: "crippling-anthem", durationSeconds: { flat: 10 } },
      ],
    });
    const sim = match([ATTACK]);
    put(sim, "crippling-anthem");
    use(sim, 0);
    expect(get(sim, "f").combatant.statuses.get("crippled")?.durationSeconds).toBe(13);
  });

  it("Anthem of Disruption (PvP): the next attack skill interrupts, for 8 s", () => {
    expect(skill("paragon.anthem-of-disruption")).toMatchObject({
      ...CHANT,
      gwId: 2018,
      elite: false,
      attributeId: "paragon.command",
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 2,
      rechargeSeconds: 15,
      effects: [
        {
          kind: "apply-status",
          statusId: "anthem-of-disruption",
          durationSeconds: {
            scaling: { attributeId: "paragon.command", atZero: 1, atTwelve: 8.2 },
          },
        },
      ],
    });
    const sim = match([ATTACK], ["warrior.healing-signet"]);
    put(sim, "anthem-of-disruption");
    sim.setTarget("f", "f");
    expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
    sim.step(DT);
    expect(get(sim, "f").combatant.cast.isCasting).toBe(true);
    const log = use(sim, 0);
    expect(log.some(({ events }) => events.some(({ kind }) => kind === "interrupted"))).toBe(true);
  });
});
