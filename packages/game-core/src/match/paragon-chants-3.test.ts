import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { gainStrikes } from "../skills/adrenaline.js";
import { getSkill } from "../skills/catalog.js";
import { describeStatus } from "../skills/describe.js";
import { applyEffects } from "../skills/effects.js";
import type { StatusId } from "../skills/status.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Paragon chants 3 (#1505): a chant that holds how the bearer's next skill
 * of a kind goes (`nextSkillRule`) is spent as that skill starts: it
 * cannot be interrupted, cannot be blocked, or costs less. Anthem of
 * Envy's bonus is in the next attack skill's blow (`nextAttackSkillBonus`).
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

/** An enchantment, so a spell: 0.75 s to cast, long enough to interrupt. */
const SPELL = "elementalist.armor-of-earth";
const SIGNET = "warrior.dolyak-signet";
/** A shout, instant, 5 Energy. */
const SHOUT = "warrior.for-great-justice";
/** A chant with a 1 s activation, 10 Energy. */
const CHANT_10 = "paragon.zealous-anthem";
/** An axe attack skill, instant, 5 Energy, 4 s recharge. */
const ATTACK = "warrior.swift-chop";

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

/** "p", a rank-12 paragon with an axe and `bar`, and a foe "f" beside it with far more Health. */
function match(bar: readonly string[]): MatchSimulation {
  return new MatchSimulation({
    seed: "paragon-chants-3",
    participants: [
      spec("p", 0, vec2(0, 0), {
        skillBar: [...bar],
        equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
        attributeRanks: new Map([
          ["warrior.axe-mastery", 12],
          ["paragon.command", 12],
          ["paragon.motivation", 12],
        ]),
        maxEnergy: 100,
      }),
      spec("f", 1, vec2(30, 0), { maxHealth: 1e6, maxEnergy: 100 }),
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

/** `id` on "p", from "p", for `seconds`. */
function put(sim: MatchSimulation, id: StatusId, seconds = 10): void {
  get(sim, "p").combatant.statuses.apply(id, seconds, "p", NO_RANKS);
}

function has(sim: MatchSimulation, id: StatusId, on = "p"): boolean {
  return get(sim, on).combatant.statuses.has(id);
}

/** "p" starts its skill in `slot` on the foe, one tick in. */
function start(sim: MatchSimulation, slot: number): CombatLogEntry[] {
  sim.setTarget("p", "f");
  expect(sim.requestSkill("p", slot)?.check).toEqual({ ok: true });
  return [...sim.step(DT).log];
}

/** "p" uses its skill in `slot` on the foe, and finishes it: the log meanwhile. */
function use(sim: MatchSimulation, slot: number): CombatLogEntry[] {
  return [...start(sim, slot), ...stepFor(sim, 1.5)];
}

/** The foe interrupts "p" and deals it 30 damage, in one skill. */
function interruptAndHit(sim: MatchSimulation) {
  return applyEffects(
    [
      { kind: "interrupt" },
      { kind: "damage", amount: { flat: 30 }, type: "typeless", armorPenetration: 0 },
    ],
    {
      surroundings: new Map(),
      caster: get(sim, "f").combatant,
      target: get(sim, "p").combatant,
      rng: createRng(1505),
      rules: RULES.combat,
    },
  );
}

describe("nextSkillRule (#1505)", () => {
  it("is spent as the skill starts, and the cast cannot be interrupted; the rest lands", () => {
    const sim = match([SPELL]);
    put(sim, "song-of-concentration");
    const log = start(sim, 0);
    const paragon = get(sim, "p").combatant;
    expect(paragon.cast.isCasting).toBe(true);
    expect(has(sim, "song-of-concentration")).toBe(false);
    expect(
      log.some(
        (entry) =>
          entry.skillId === "paragon.song-of-concentration" &&
          entry.events.some(({ kind }) => kind === "status-expired"),
      ),
    ).toBe(true);
    const health = paragon.health;
    const events = interruptAndHit(sim);
    expect(events.some(({ kind }) => kind === "interrupted")).toBe(false);
    expect(paragon.health).toBe(health - 30);
    expect(paragon.cast.activeCast?.skillId).toBe(SPELL);
    stepFor(sim, 1.5);
    expect(has(sim, "armor-boost")).toBe(true);
  });

  it("a 0-cost signet spends Song of Concentration: the next spell is interruptible again", () => {
    const sim = match([SIGNET, SPELL]);
    put(sim, "song-of-concentration");
    use(sim, 0);
    expect(has(sim, "song-of-concentration")).toBe(false);
    start(sim, 1);
    expect(interruptAndHit(sim).some(({ kind }) => kind === "interrupted")).toBe(true);
  });

  it("an interrupted skill still spent it, and paid the lower cost", () => {
    const sim = match([CHANT_10]);
    put(sim, "energizing-chorus");
    const paragon = get(sim, "p").combatant;
    const energy = paragon.energy;
    start(sim, 0);
    expect(paragon.energy).toBe(energy - 4);
    expect(interruptAndHit(sim).some(({ kind }) => kind === "interrupted")).toBe(true);
    expect(has(sim, "energizing-chorus")).toBe(false);
  });

  it("the discount floors at 0", () => {
    const sim = match([SHOUT]);
    put(sim, "energizing-chorus");
    const paragon = get(sim, "p").combatant;
    paragon.energy = 20;
    use(sim, 0);
    expect(paragon.energy).toBe(20);
    expect(has(sim, "energizing-chorus")).toBe(false);
  });

  it("an adrenaline chant pays its strikes in full, and still spends it", () => {
    const sim = match(["paragon.anthem-of-guidance"]);
    put(sim, "energizing-chorus");
    const paragon = get(sim, "p").combatant;
    gainStrikes(paragon, 2, 0);
    const energy = paragon.energy;
    use(sim, 0);
    expect(paragon.adrenaline.get("paragon.anthem-of-guidance") ?? 0).toBe(0);
    expect(paragon.energy).toBe(energy);
    expect(has(sim, "energizing-chorus")).toBe(false);
  });

  it("Energizing Chorus is not spent by the chant that put it on its chanter", () => {
    const sim = match(["paragon.energizing-chorus"]);
    gainStrikes(get(sim, "p").combatant, 3, 0);
    use(sim, 0);
    expect(has(sim, "energizing-chorus")).toBe(true);
  });

  it("a kind that does not answer leaves it: a spell keeps Anthem of Guidance", () => {
    const sim = match([SPELL]);
    put(sim, "anthem-of-guidance");
    use(sim, 0);
    expect(has(sim, "anthem-of-guidance")).toBe(true);
  });

  it("Anthem of Guidance: the attack skill's blows land through Bonetti's Defense", () => {
    /** Ten Swift Chops at a foe in a 75% block stance: how many were blocked. */
    function blocked(guided: boolean): number {
      const sim = match([ATTACK]);
      let count = 0;
      for (let chop = 0; chop < 10; chop += 1) {
        get(sim, "f").combatant.statuses.apply("bonettis-defense", 60, "f", NO_RANKS);
        if (guided) {
          put(sim, "anthem-of-guidance");
        }
        const log = use(sim, 0);
        count += log
          .filter((entry) => entry.skillId === ATTACK)
          .flatMap(({ events }) => events)
          .filter(({ kind }) => kind === "attack-blocked").length;
        expect(has(sim, "anthem-of-guidance")).toBe(false);
        stepFor(sim, 4);
      }
      return count;
    }
    expect(blocked(false)).toBeGreaterThan(0);
    expect(blocked(true)).toBe(0);
  });

  it("describes each rule", () => {
    expect(describeStatus("song-of-concentration", new Map())).toBe(
      "your next skill cannot be interrupted",
    );
    expect(describeStatus("anthem-of-guidance", new Map())).toBe(
      "your next attack skill cannot be blocked",
    );
    expect(describeStatus("energizing-chorus", new Map())).toBe(
      "your next shout or chant costs 6 less energy",
    );
    expect(describeStatus("anthem-of-envy", new Map())).toContain("+18 damage");
  });
});

describe("Anthem of Envy (#1505): +18 in the blow, against a foe above half Health", () => {
  /** The damage "p"'s Swift Chop deals the foe at `fraction` of its Health. */
  function chop(envied: boolean, fraction: number): number {
    const sim = match([ATTACK]);
    const foe = get(sim, "f").combatant;
    foe.health = foe.maxHealth * fraction;
    if (envied) {
      put(sim, "anthem-of-envy");
    }
    const before = foe.health;
    use(sim, 0);
    expect(has(sim, "anthem-of-envy")).toBe(false);
    return before - foe.health;
  }

  it("adds 18, read before the blow lands", () => {
    expect(chop(true, 1) - chop(false, 1)).toBe(18);
    // Just above half: the blow takes it under, and the bonus still counts.
    expect(chop(true, 0.5 + 1e-6) - chop(false, 0.5 + 1e-6)).toBe(18);
  });

  it("adds nothing against a foe at 40%, and is spent all the same", () => {
    expect(chop(true, 0.4)).toBe(chop(false, 0.4));
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

describe("the four chants (#1505), numbers from the corpus at rank 12", () => {
  it("Song of Concentration: 8 adrenaline, 2 s, 5 s recharge, no attribute", () => {
    expect(skill("paragon.song-of-concentration")).toMatchObject({
      ...CHANT,
      gwId: 1567,
      elite: false,
      attributeId: undefined,
      cost: { kind: "adrenaline", amount: 8 },
      activationSeconds: 2,
      rechargeSeconds: 5,
      effects: [{ kind: "apply-status", statusId: "song-of-concentration", durationSeconds: 10 }],
    });
  });

  it("Anthem of Guidance, elite: 2 adrenaline, 1 s, Command", () => {
    expect(skill("paragon.anthem-of-guidance")).toMatchObject({
      ...CHANT,
      gwId: 1568,
      elite: true,
      attributeId: "paragon.command",
      cost: { kind: "adrenaline", amount: 2 },
      activationSeconds: 1,
      rechargeSeconds: 0,
      effects: [{ kind: "apply-status", statusId: "anthem-of-guidance", durationSeconds: 10 }],
    });
  });

  it("Energizing Chorus: 3 adrenaline, 1 s, Motivation", () => {
    expect(skill("paragon.energizing-chorus")).toMatchObject({
      ...CHANT,
      gwId: 1569,
      elite: false,
      attributeId: "paragon.motivation",
      cost: { kind: "adrenaline", amount: 3 },
      activationSeconds: 1,
      rechargeSeconds: 0,
      effects: [{ kind: "apply-status", statusId: "energizing-chorus", durationSeconds: 10 }],
    });
  });

  it("Anthem of Envy (PvP): 6 adrenaline, 1 s, 6 s recharge, Command", () => {
    expect(skill("paragon.anthem-of-envy")).toMatchObject({
      ...CHANT,
      gwId: 1559,
      elite: false,
      attributeId: "paragon.command",
      cost: { kind: "adrenaline", amount: 6 },
      activationSeconds: 1,
      rechargeSeconds: 6,
      effects: [{ kind: "apply-status", statusId: "anthem-of-envy", durationSeconds: 10 }],
    });
  });
});
