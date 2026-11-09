import { describe, expect, it } from "vitest";

import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import type { Polygon, Segment } from "../geometry.js";
import { createRng } from "../rng.js";
import { NO_RANKS } from "../skills/status.js";
import { PLAIN_BLOW, landBlow, weaponSnapshotOf } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import {
  BOUNDS,
  DT,
  ELEMENTALIST,
  fighter,
  RANGER,
  RULESET,
  WARRIOR,
} from "./bot/rules/test-support.js";
import {
  MatchSimulation,
  type Creature,
  type MatchLayers,
  type MatchSimulationOptions,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";

const FIREBALL = "elementalist.fireball";
const WARD = "elementalist.ward-against-melee";

const rect = (x: number, y: number, width: number, height: number): Polygon => [
  vec2(x, y),
  vec2(x + width, y),
  vec2(x + width, y + height),
  vec2(x, y + height),
];
const wall = (x: number, y: number, width: number, height: number): Segment[] => {
  const corners = rect(x, y, width, height);
  return corners.flatMap((a, at) => {
    const b = corners[(at + 1) % corners.length];
    return b === undefined ? [] : [{ a, b }];
  });
};
const WALL_ON_DECK = wall(698, 300, 4, 200);
const WALL_ON_GROUND = wall(238, 300, 4, 200);
const LAYERS: MatchLayers = {
  count: 2,
  walls: [WALL_ON_GROUND, WALL_ON_DECK],
  decks: [{ layer: 1, footprint: rect(500, 300, 600, 200) }],
  transitions: [{ from: 0, to: 1, area: rect(350, 300, 170, 200) }],
};

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULESET.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

const swordOf = (): Partial<ParticipantSpec> => ({
  equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
  attributeRanks: new Map([["warrior.swordsmanship", 12]]),
});
/** A bow reaching 200, dealing `damage` however it rolls. */
const bow = (damage = 80): Partial<ParticipantSpec> => ({
  equipment: wielding(
    { ...WEAPONS.flatbow, range: 200, damageMin: damage, damageMax: damage },
    "ranger.marksmanship",
  ),
  attributeRanks: new Map([["ranger.marksmanship", 12]]),
});

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  layer: number,
  extra: Partial<ParticipantSpec> = {},
): ParticipantSpec {
  return fighter(id, team, RANGER, spawn, {
    layer,
    behaviour: undefined,
    skillBar: [null, null, null, null, null, null, null, null],
    ...extra,
  });
}

/** An Elementalist with `skillId` on its bar, on `layer`. */
function caster(
  id: string,
  team: number,
  spawn: Vec2,
  layer: number,
  skillId: string,
): ParticipantSpec {
  return fighter(id, team, ELEMENTALIST, spawn, {
    layer,
    behaviour: undefined,
    skillBar: [skillId, null, null, null, null, null, null, null],
  });
}

function arena(
  participants: readonly ParticipantSpec[],
  options: Partial<MatchSimulationOptions> = {},
): MatchSimulation {
  return new MatchSimulation({
    seed: "layer-combat",
    ruleset: RULESET,
    bounds: BOUNDS,
    walls: [],
    layers: LAYERS,
    participants,
    ...options,
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function run(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < seconds / DT; i += 1) {
    sim.step(DT);
  }
}

const health = (sim: MatchSimulation, id: string): number => get(sim, id).combatant.health;

/** Whether `id` lost Health over `seconds`. */
function hurt(sim: MatchSimulation, id: string, seconds: number): boolean {
  const before = health(sim, id);
  run(sim, seconds);
  return health(sim, id) < before;
}

describe("melee across layers (ADR-0051)", () => {
  it("strikes on the same layer", () => {
    const sim = arena([
      spec("a", 0, vec2(600, 400), 1, swordOf()),
      spec("foe", 1, vec2(620, 400), 1),
    ]);
    sim.requestAttack("a", "foe");
    expect(hurt(sim, "foe", 2.5)).toBe(true);
  });

  it("does not strike a body at the same point on another layer", () => {
    const sim = arena(
      [spec("a", 0, vec2(600, 400), 0, swordOf()), spec("foe", 1, vec2(600, 400), 1)],
      { layers: { ...LAYERS, transitions: [] } },
    );
    sim.requestAttack("a", "foe");
    expect(hurt(sim, "foe", 2.5)).toBe(false);
  });

  it("walks the ramp to a foe on the deck, and strikes it there", () => {
    const sim = arena([
      spec("a", 0, vec2(300, 400), 0, swordOf()),
      spec("foe", 1, vec2(560, 400), 1),
    ]);
    sim.requestAttack("a", "foe");
    run(sim, 10);
    expect(get(sim, "a").layer).toBe(1);
    expect(health(sim, "foe")).toBeLessThan(get(sim, "foe").combatant.maxHealth);
  });

  it("reaches a body on a ramp from either layer it connects", () => {
    const sim = arena([
      spec("a", 0, vec2(430, 400), 0, swordOf()),
      spec("foe", 1, vec2(450, 400), 1),
    ]);
    sim.requestAttack("a", "foe");
    expect(hurt(sim, "foe", 2.5)).toBe(true);
  });

  it("strikes from a ramp a foe under the deck's footprint: the deck rule is for shots", () => {
    const sim = arena([
      spec("a", 0, vec2(510, 400), 1, swordOf()),
      spec("foe", 1, vec2(530, 400), 0),
    ]);
    sim.requestAttack("a", "foe");
    expect(hurt(sim, "foe", 2.5)).toBe(true);
    expect(get(sim, "a").position).toEqual(vec2(510, 400));
  });

  it("lets a melee skill land from there too, where a spell is refused", () => {
    const sim = arena([
      spec("a", 0, vec2(510, 400), 1, {
        ...swordOf(),
        skillBar: ["warrior.power-attack", null, null, null, null, null, null, null],
      }),
      spec("foe", 1, vec2(530, 400), 0),
    ]);
    sim.setTarget("a", "foe");
    sim.requestSkill("a", 0);
    expect(hurt(sim, "foe", 1.5)).toBe(true);
    expect(get(sim, "a").position).toEqual(vec2(510, 400));
    const spell = arena([
      caster("a", 0, vec2(510, 400), 1, FIREBALL),
      spec("foe", 1, vec2(530, 400), 0),
    ]);
    spell.setTarget("a", "foe");
    spell.requestSkill("a", 0);
    expect(get(spell, "a").combatant.cast.activeCast).toBeUndefined();
  });

  it("stops striking when its foe climbs off its floor", () => {
    const sim = arena([
      spec("a", 0, vec2(300, 400), 0, {
        ...swordOf(),
        behaviour: { kind: "auto-attack", targeting: { kind: "nearest-enemy" }, reach: 60 },
      }),
      spec("foe", 1, vec2(320, 400), 0),
    ]);
    run(sim, 0.5);
    sim.walkTo("foe", vec2(600, 400), 1);
    run(sim, 2);
    const after = health(sim, "foe");
    expect(get(sim, "foe").layer).toBe(1);
    run(sim, 0.5);
    expect(health(sim, "foe")).toBe(after);
  });
});

describe("sight across layers (ADR-0051)", () => {
  /** Whether a Fireball goes off at once, in range and in sight. */
  const casts = (from: Vec2, fromLayer: number, to: Vec2, toLayer: number): boolean => {
    const sim = arena([caster("a", 0, from, fromLayer, FIREBALL), spec("foe", 1, to, toLayer)]);
    sim.setTarget("a", "foe");
    sim.requestSkill("a", 0);
    return get(sim, "a").combatant.cast.activeCast !== undefined;
  };

  it("stops a ground shot at a bridge's support, but not a shot from the deck over it", () => {
    expect(casts(vec2(200, 400), 0, vec2(300, 400), 0)).toBe(false);
    expect(casts(vec2(530, 400), 1, vec2(200, 400), 0)).toBe(true);
  });

  it("uses that layer's walls on one layer", () => {
    expect(casts(vec2(650, 400), 1, vec2(750, 400), 1)).toBe(false);
    expect(casts(vec2(650, 400), 0, vec2(750, 400), 0)).toBe(true);
  });

  it("reads the upper layer's walls alone, from above", () => {
    expect(casts(vec2(530, 400), 1, vec2(200, 400), 0)).toBe(true);
  });

  it("reads the lower layer's walls alone, from below", () => {
    expect(casts(vec2(200, 400), 0, vec2(530, 400), 1)).toBe(false);
  });

  it("does not let a deck shoot a target under its footprint", () => {
    expect(casts(vec2(600, 400), 1, vec2(640, 400), 0)).toBe(false);
  });

  it("does not let a target on a deck be shot from under it", () => {
    expect(casts(vec2(600, 400), 0, vec2(640, 400), 1)).toBe(false);
  });

  it("lets a shot past the footprint cross layers", () => {
    expect(casts(vec2(1200, 400), 0, vec2(1000, 400), 1)).toBe(true);
  });

  it("hits a target that climbs in flight, still within reach of the aim point", () => {
    const sim = arena([spec("a", 0, vec2(530, 400), 1, bow()), spec("foe", 1, vec2(430, 400), 0)]);
    sim.requestAttack("a", "foe");
    for (let t = 0; t < 4 && sim.projectiles.length === 0; t += DT) {
      sim.step(DT);
    }
    expect(sim.projectiles.length).toBeGreaterThan(0);
    const before = health(sim, "foe");
    sim.walkTo("foe", vec2(440, 400), 1);
    run(sim, 1);
    expect(get(sim, "foe").layer).toBe(1);
    expect(health(sim, "foe")).toBeLessThan(before);
  });
});

describe("area effects across layers (ADR-0051)", () => {
  it("bursts on the target's floor, sparing those under it", () => {
    const sim = arena([
      caster("a", 0, vec2(1200, 400), 0, FIREBALL),
      spec("foe", 1, vec2(1000, 400), 1),
      spec("beside", 1, vec2(1020, 400), 1),
      spec("under", 1, vec2(1000, 410), 0),
    ]);
    sim.setTarget("a", "foe");
    sim.requestSkill("a", 0);
    run(sim, 3);
    expect(health(sim, "foe")).toBeLessThan(get(sim, "foe").combatant.maxHealth);
    expect(health(sim, "beside")).toBeLessThan(get(sim, "beside").combatant.maxHealth);
    expect(health(sim, "under")).toBe(get(sim, "under").combatant.maxHealth);
  });

  it("reaches a body on a ramp from either layer", () => {
    const sim = arena([
      caster("a", 0, vec2(200, 300), 0, FIREBALL),
      spec("foe", 1, vec2(300, 400), 0),
      spec("ramp", 1, vec2(355, 400), 1),
    ]);
    sim.setTarget("a", "foe");
    sim.requestSkill("a", 0);
    run(sim, 3);
    expect(health(sim, "ramp")).toBeLessThan(get(sim, "ramp").combatant.maxHealth);
  });

  it("bursts only on its target's own layer when the target is on a ramp", () => {
    const sim = arena([
      caster("a", 0, vec2(530, 400), 1, FIREBALL),
      spec("foe", 1, vec2(400, 400), 1),
      spec("ground", 1, vec2(345, 400), 0),
    ]);
    sim.setTarget("a", "foe");
    sim.requestSkill("a", 0);
    run(sim, 3);
    expect(health(sim, "foe")).toBeLessThan(get(sim, "foe").combatant.maxHealth);
    expect(health(sim, "ground")).toBe(get(sim, "ground").combatant.maxHealth);
  });

  it("fixes a ward to its caster's layer, and covers only that floor", () => {
    const sim = arena([
      caster("a", 0, vec2(800, 400), 1, WARD),
      fighter("ally", 0, RANGER, vec2(820, 400), { layer: 1, behaviour: undefined }),
      fighter("under", 0, RANGER, vec2(800, 420), { layer: 0, behaviour: undefined }),
    ]);
    expect(sim.requestSkill("a", 0)?.check.ok).toBe(true);
    run(sim, 2);
    expect(sim.groundEffects[0]?.layer).toBe(1);
    expect(get(sim, "ally").combatant.statuses.active.map(({ id }) => id)).toContain(
      "ward-against-melee",
    );
    expect(get(sim, "under").combatant.statuses.active).toHaveLength(0);
  });
});

describe("spirits and spreading conditions across layers (ADR-0051)", () => {
  /** A standing spirit of team 0 on `layer`, its act given by `creature`. */
  const spirit = (
    id: string,
    at: Vec2,
    layer: number,
    creature: Partial<Creature>,
  ): ParticipantSpec =>
    spec(id, 0, at, layer, {
      creature: {
        ownerId: "owner",
        kind: "spirit",
        look: "spirit",
        name: id,
        expiresInSeconds: Number.POSITIVE_INFINITY,
        ageSeconds: 0,
        summonedAtTick: 0,
        skillId: undefined,
        aura: undefined,
        onDeath: "vanish",
        ownerDisableSeconds: 0,
        deathBurst: undefined,
        onDeathInRange: undefined,
        pulse: undefined,
        replacedBy: undefined,
        corpsesLeft: 0,
        companionSkillId: undefined,
        leaderId: undefined,
        bondStatusId: undefined,
        mode: "guard",
        ...creature,
      },
    });

  it("a spirit's pulse heals on its own layer, not the ally under the deck", () => {
    const sim = arena([
      spec("owner", 0, vec2(900, 400), 1),
      spirit("s", vec2(600, 400), 1, {
        skillId: "ritualist.restoration-magic",
        pulse: { everySeconds: 1, heal: 40, radius: 300, pulsed: 0 },
      }),
      spec("under", 0, vec2(640, 400), 0, { startHealthFraction: 0.2 }),
    ]);
    const before = health(sim, "under");
    run(sim, 2.5);
    expect(health(sim, "under")).toBeLessThanOrEqual(before);
  });

  it("a spirit's pulse still reaches the same layer", () => {
    const sim = arena([
      spec("owner", 0, vec2(900, 400), 1),
      spirit("s", vec2(600, 400), 1, {
        skillId: "ritualist.restoration-magic",
        pulse: { everySeconds: 1, heal: 40, radius: 300, pulsed: 0 },
      }),
      spec("level", 0, vec2(640, 400), 1, { startHealthFraction: 0.2 }),
    ]);
    const before = health(sim, "level");
    run(sim, 2.5);
    expect(health(sim, "level")).toBeGreaterThan(before);
  });

  it("Pestilence spreads to the bodies on the corpse's layer, not those under it", () => {
    const sim = arena([
      spec("r", 0, vec2(600, 400), 1, {
        skillBar: ["ranger.pestilence", null, null, null, null, null, null, null],
        attributeRanks: new Map([["ranger.wilderness-survival", 12]]),
        maxEnergy: 100,
      }),
      spec("dies", 1, vec2(640, 400), 1),
      spec("level", 1, vec2(680, 400), 1),
      spec("under", 1, vec2(680, 430), 0),
    ]);
    expect(sim.requestSkill("r", 0)?.check).toEqual({ ok: true });
    run(sim, 6);
    get(sim, "dies").combatant.statuses.apply("bleeding", 12, "x", NO_RANKS);
    get(sim, "level").combatant.statuses.apply("poison", 5, "x", NO_RANKS);
    get(sim, "under").combatant.statuses.apply("poison", 5, "x", NO_RANKS);
    get(sim, "dies").combatant.statuses.apply("burning", 10, "x", NO_RANKS);
    get(sim, "dies").combatant.health = 0.2;
    run(sim, 0.2);
    expect(get(sim, "dies").combatant.dead).toBe(true);
    expect(get(sim, "level").combatant.statuses.has("bleeding")).toBe(true);
    expect(get(sim, "under").combatant.statuses.has("bleeding")).toBe(false);
  });
});

describe("the height modifier in play (ADR-0051)", () => {
  it("reaches past flat range from above", () => {
    const sim = arena([spec("a", 0, vec2(530, 400), 1, bow()), spec("foe", 1, vec2(320, 400), 0)]);
    sim.requestAttack("a", "foe");
    run(sim, 4);
    expect(get(sim, "a").position).toEqual(vec2(530, 400));
    expect(health(sim, "foe")).toBeLessThan(get(sim, "foe").combatant.maxHealth);
  });

  it("does not attack from below at flat range, and closes instead", () => {
    const sim = arena([spec("a", 0, vec2(345, 400), 0, bow()), spec("foe", 1, vec2(530, 400), 1)]);
    sim.requestAttack("a", "foe");
    run(sim, 0.5);
    expect(get(sim, "a").position.x).toBeGreaterThan(345);
  });

  /** Damage dealt by one 80-a-shot arrow from `above` or the ground, at 90 units. */
  function shot(fromLayer: number, foeLayer: number): number {
    const sim = arena([
      spec("a", 0, fromLayer === 1 ? vec2(1090, 400) : vec2(1180, 400), fromLayer, bow()),
      spec("foe", 1, foeLayer === 1 ? vec2(1090, 400) : vec2(1180, 400), foeLayer),
    ]);
    sim.requestAttack("a", "foe");
    const before = health(sim, "foe");
    run(sim, 3);
    return before - health(sim, "foe");
  }

  it("shoots harder from above and softer from below", () => {
    const level = shot(0, 0);
    expect(shot(1, 0) / level).toBeCloseTo(1.1, 1);
    expect(shot(0, 1) / level).toBeCloseTo(0.9, 1);
  });

  it("gives a spell no range", () => {
    const sim = arena([
      caster("a", 0, vec2(1090, 400), 1, FIREBALL),
      spec("foe", 1, vec2(1540, 400), 0),
    ]);
    sim.setTarget("a", "foe");
    sim.requestSkill("a", 0);
    expect(get(sim, "a").combatant.cast.activeCast).toBeUndefined();
  });

  it("adds nothing between a ramp and a layer it connects", () => {
    // Inside flat range but outside the reduced one; a level shot need not walk.
    const sim = arena([spec("a", 0, vec2(330, 400), 0, bow()), spec("foe", 1, vec2(515, 400), 1)]);
    sim.requestAttack("a", "foe");
    run(sim, 3);
    expect(get(sim, "a").position).toEqual(vec2(330, 400));
    expect(health(sim, "foe")).toBeLessThan(get(sim, "foe").combatant.maxHealth);
  });
});

describe("a critical hit and the height modifier (ADR-0051)", () => {
  const attacker = (): Participant => get(arena([spec("a", 0, vec2(200, 100), 0, bow(50))]), "a");
  const victim = (): Participant => get(arena([spec("v", 1, vec2(0, 0), 0)]), "v");

  function dealt(multiplier: number, forceCritical: boolean): number {
    const by = attacker();
    const on = victim();
    const before = on.combatant.health;
    const snapshot = { ...weaponSnapshotOf(by.combatant), preventsCriticals: !forceCritical };
    landBlow(
      snapshot,
      by.combatant,
      on.combatant,
      forceCritical ? { ...PLAIN_BLOW, criticalWhen: "always" } : PLAIN_BLOW,
      false,
      createRng(5),
      RULESET.combat,
      [],
      new Map(),
      multiplier,
    );
    return before - on.combatant.health;
  }

  it("scales a non-critical blow", () => {
    expect(dealt(1.1, false) / dealt(1, false)).toBeCloseTo(1.1, 1);
    expect(dealt(0.9, false) / dealt(1, false)).toBeCloseTo(0.9, 1);
  });

  it("leaves a critical blow alone, either way", () => {
    expect(dealt(1.1, true)).toBe(dealt(1, true));
    expect(dealt(0.9, true)).toBe(dealt(1, true));
  });
});

describe("bots and decks (ADR-0051)", () => {
  it("does not pick a foe it cannot see through a deck", () => {
    const sim = arena([
      fighter("a", 0, WARRIOR, vec2(600, 400), {
        layer: 1,
        behaviour: { kind: "auto-attack", targeting: { kind: "nearest-enemy" }, reach: 300 },
        skillBar: [null, null, null, null, null, null, null, null],
        ...bow(),
      }),
      spec("foe", 1, vec2(640, 400), 0),
    ]);
    run(sim, 1);
    expect(get(sim, "a").targetId).toBeUndefined();
    expect(get(sim, "a").combatant.attack).toBeUndefined();
  });

  it("picks a foe clear of the footprint", () => {
    const sim = arena([
      fighter("a", 0, WARRIOR, vec2(1090, 400), {
        layer: 1,
        behaviour: { kind: "auto-attack", targeting: { kind: "nearest-enemy" }, reach: 300 },
        skillBar: [null, null, null, null, null, null, null, null],
        ...bow(),
      }),
      spec("foe", 1, vec2(1180, 400), 0),
    ]);
    run(sim, 1);
    expect(get(sim, "a").targetId).toBe("foe");
  });
});
