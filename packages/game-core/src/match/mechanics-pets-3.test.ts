import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { NO_RANKS } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Pets 3 (#1957): pet attacks that pay their owner or count the owner's
 * recharging skills, Melandru's Assault's splash, and Heal as One.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CHARM = "ranger.charm-animal";
const POUNCE = "ranger.predators-pounce";
const SCAVENGER = "ranger.scavenger-strike";
const FEROCIOUS = "ranger.ferocious-strike";
const MELANDRU = "ranger.melandrus-assault";
const LUNGE = "ranger.enraged-lunge";
const HEAL_AS_ONE = "ranger.heal-as-one";
const HAMMER_BASH = "warrior.hammer-bash";
const OTHER_BEAST_MASTERY = [
  "ranger.brutal-strike",
  "ranger.maiming-strike",
  "ranger.disrupting-lunge",
  "ranger.comfort-animal",
];
const BAR = [CHARM, POUNCE, SCAVENGER, FEROCIOUS, MELANDRU, LUNGE, HEAL_AS_ONE, HAMMER_BASH];

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxEnergy: 100,
    ...extra,
  };
  return result;
}

/** Ranger `r` with `bar` at Beast Mastery 12, at the origin; foe `a` 60 off, `b` 30 from `a`. */
function match(bar: readonly string[] = BAR, seed = "pets-3"): MatchSimulation {
  return new MatchSimulation({
    seed,
    participants: [
      spec("r", 0, vec2(0, 0), {
        skillBar: bar,
        attributeRanks: new Map([["ranger.beast-mastery", 12]]),
      }),
      spec("a", 1, vec2(60, 0)),
      spec("b", 1, vec2(60, 30)),
    ],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function wolf(sim: MatchSimulation): Participant {
  const pet = [...sim.participants()].find((other) => other.creature?.ownerId === "r");
  if (pet === undefined) {
    throw new Error("r has no pet");
  }
  return pet;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `r` presses `skillId` from its bar. */
function press(sim: MatchSimulation, skillId: string) {
  return sim.requestSkill("r", get(sim, "r").skillBar.indexOf(skillId));
}

/** What `entry` gave `targetId` of `kind`, summed. */
function total(
  entry: CombatLogEntry | undefined,
  kind: "damage" | "heal" | "energy-gain",
  targetId: string,
): number {
  return (entry?.events ?? []).reduce(
    (sum, event) => (event.kind === kind && event.targetId === targetId ? sum + event.amount : sum),
    0,
  );
}

/**
 * The wolf's first blow on `a` within 4 s: armed with `skillId` by `r`,
 * which has `a` selected, or plain, sent at `a`; `prepare`d first. The
 * same seed rolls the same weapon damage.
 */
function firstBlow(
  skillId: string | undefined,
  prepare: (sim: MatchSimulation) => void = () => undefined,
  seed?: string,
): { entry: CombatLogEntry | undefined; sim: MatchSimulation } {
  const sim = match(BAR, seed);
  const pet = wolf(sim);
  // Room for what the pet attack gives back.
  get(sim, "r").combatant.energy = 50;
  prepare(sim);
  if (skillId === undefined) {
    expect(sim.requestAttack(pet.id, "a")).toEqual({ ok: true });
  } else {
    sim.setTarget("r", "a");
    expect(press(sim, skillId)?.check).toEqual({ ok: true });
  }
  const entry = stepFor(sim, 4).find(
    (each) =>
      each.sourceId === pet.id &&
      each.events.some(
        (event) =>
          (event.kind === "damage" && event.targetId === "a") ||
          event.kind === "attack-blocked" ||
          event.kind === "attack-missed",
      ),
  );
  return { entry, sim };
}

describe("Predator's Pounce (#1957)", () => {
  it("heals the pet 41 on a hit", () => {
    const { entry, sim } = firstBlow(POUNCE, (each) => {
      wolf(each).combatant.health = 100;
    });
    expect(entry).toMatchObject({ skillId: POUNCE });
    expect(total(entry, "heal", wolf(sim).id)).toBe(41);
  });
});

describe("Scavenger Strike (#1957)", () => {
  it("gives the Ranger 13 Energy against a foe with a condition, none against a clean one", () => {
    const bleeding = firstBlow(SCAVENGER, (sim) => {
      get(sim, "a").combatant.statuses.apply("bleeding", 30, "x", NO_RANKS);
    });
    expect(total(bleeding.entry, "energy-gain", "r")).toBe(13);
    const clean = firstBlow(SCAVENGER);
    expect(clean.entry).toMatchObject({ skillId: SCAVENGER });
    expect(total(clean.entry, "energy-gain", "r")).toBe(0);
  });
});

describe("Ferocious Strike (#1957)", () => {
  it("gives the Ranger 9 Energy and 1 strike of adrenaline on a hit", () => {
    const { entry, sim } = firstBlow(FEROCIOUS);
    expect(total(entry, "energy-gain", "r")).toBe(9);
    expect(entry?.events).toContainEqual(
      expect.objectContaining({ kind: "adrenaline-gained", targetId: "r", strikes: 1 }),
    );
    expect(get(sim, "r").combatant.adrenaline.get(HAMMER_BASH)).toBe(ADRENALINE_PER_STRIKE);
  });

  it("gives neither on a blocked blow", () => {
    const blocked = Array.from({ length: 20 }, (_, i) =>
      firstBlow(
        FEROCIOUS,
        (sim) => {
          get(sim, "a").combatant.statuses.apply("bonettis-defense", 30, "x", NO_RANKS);
        },
        `blocked-${String(i)}`,
      ),
    ).find(({ entry }) => entry?.events.some((event) => event.kind === "attack-blocked"));
    expect(blocked).toBeDefined();
    expect(total(blocked?.entry, "energy-gain", "r")).toBe(0);
    expect(blocked?.entry?.events).not.toContainEqual(
      expect.objectContaining({ kind: "adrenaline-gained" }),
    );
  });
});

describe("Melandru's Assault (#1957)", () => {
  const enchant = (sim: MatchSimulation): void => {
    get(sim, "a").combatant.statuses.apply("windborne-speed", 30, "x", NO_RANKS);
  };

  it("deals +29 more to an enchanted foe, and 29 to a foe adjacent to it", () => {
    const plain = firstBlow(undefined, enchant);
    const { entry } = firstBlow(MELANDRU, enchant);
    expect(total(entry, "damage", "a") - total(plain.entry, "damage", "a")).toBeCloseTo(17 + 29, 5);
    expect(total(entry, "damage", "b")).toBeCloseTo(29, 5);
  });

  it("splashes nobody off an unenchanted foe", () => {
    const plain = firstBlow(undefined);
    const { entry } = firstBlow(MELANDRU);
    expect(total(entry, "damage", "a") - total(plain.entry, "damage", "a")).toBeCloseTo(17, 5);
    expect(total(entry, "damage", "b")).toBe(0);
  });
});

describe("Enraged Lunge (#1957)", () => {
  /** Its blow's bonus over a plain one, with `recharging` other Beast Mastery skills recharging. */
  function bonus(recharging: number): number {
    const bar = [CHARM, LUNGE, ...OTHER_BEAST_MASTERY];
    const blow = (skillId: string | undefined): number => {
      const sim = match(bar);
      const pet = wolf(sim);
      for (const id of OTHER_BEAST_MASTERY.slice(0, recharging)) {
        get(sim, "r").combatant.cast.startRecharge(id, 30);
      }
      if (skillId === undefined) {
        expect(sim.requestAttack(pet.id, "a")).toEqual({ ok: true });
      } else {
        sim.setTarget("r", "a");
        expect(press(sim, skillId)?.check).toEqual({ ok: true });
      }
      const entry = stepFor(sim, 4).find(
        (each) => each.sourceId === pet.id && total(each, "damage", "a") > 0,
      );
      return total(entry, "damage", "a");
    };
    return blow(LUNGE) - blow(undefined);
  }

  it("deals +19 for itself and each other recharging Beast Mastery skill", () => {
    expect(bonus(0)).toBeCloseTo(19, 5);
    expect(bonus(1)).toBeCloseTo(38, 5);
  });

  it("caps the bonus at 60", () => {
    expect(bonus(4)).toBeCloseTo(60, 5);
  });
});

describe("Heal as One (#1957)", () => {
  it("heals the Ranger below 75% and the pet 121 each", () => {
    const sim = match();
    const owner = get(sim, "r");
    const pet = wolf(sim);
    owner.combatant.health = owner.combatant.maxHealth / 2;
    pet.combatant.health = 100;
    expect(press(sim, HEAL_AS_ONE)?.check).toEqual({ ok: true });
    const entry = stepFor(sim, 2).find((each) => each.skillId === HEAL_AS_ONE);
    expect(total(entry, "heal", "r")).toBe(121);
    expect(total(entry, "heal", pet.id)).toBe(121);
  });

  it("resurrects a dead pet at 50% and heals the Ranger", () => {
    const sim = match();
    const owner = get(sim, "r");
    const pet = wolf(sim);
    pet.combatant.statuses.apply("burning", 10, "x", NO_RANKS);
    pet.combatant.health = 0.2;
    stepFor(sim, DT);
    expect(pet.combatant.dead).toBe(true);
    // Its death disables the bar a while: wait it out.
    while (press(sim, HEAL_AS_ONE)?.check.ok !== true) {
      stepFor(sim, 1);
    }
    owner.combatant.health = owner.combatant.maxHealth / 2;
    const entry = stepFor(sim, 2).find((each) => each.skillId === HEAL_AS_ONE);
    expect(entry?.events).toContainEqual(
      expect.objectContaining({ kind: "resurrected", targetId: pet.id }),
    );
    expect(pet.combatant.dead).toBe(false);
    expect(pet.combatant.health).toBeCloseTo(pet.combatant.maxHealth / 2, 0);
    expect(total(entry, "heal", "r")).toBe(121);
  });

  it("does nothing when both are above 75%", () => {
    const sim = match();
    const pet = wolf(sim);
    pet.combatant.health = pet.combatant.maxHealth * 0.8;
    expect(press(sim, HEAL_AS_ONE)?.check).toEqual({ ok: true });
    const entry = stepFor(sim, 2).find((each) => each.skillId === HEAL_AS_ONE);
    expect(entry).toBeDefined();
    expect(total(entry, "heal", "r") + total(entry, "heal", pet.id)).toBe(0);
  });
});
