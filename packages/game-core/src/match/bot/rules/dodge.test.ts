import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../../../equipment/resolve.js";
import { WEAPONS } from "../../../equipment/weapons.js";
import type { Projectile } from "../../../skills/projectile.js";
import { vec2, type Vec2 } from "../../../vec2.js";
import type { BehaviourContext } from "../../behaviour.js";
import type { CombatLogEntry } from "../../combat-log.js";
import type { MatchSimulation } from "../../simulation.js";
import dodge from "./dodge.js";
import { DODGE_CHANCE, dodgeRoll } from "./shared.js";
import { BOT, DT, body, match, ruleFor } from "./test-support.js";

const FIREBALL = "elementalist.fireball";
/** One tick of a bot's top speed, 180 units a second. */
const STEP = 9;

/** The first projectile id at or after `from` whose coin for "dodger" is under (or over) the chance. */
function idWhere(under: boolean, from = 0): number {
  for (let id = from; ; id += 1) {
    if (dodgeRoll(id, "dodger") < DODGE_CHANCE === under) return id;
  }
}
const DODGES = idWhere(true);
const STANDS = idWhere(false);

/** A caster on team 1 at the origin with Fireball, and a bot "dodger" on team 0 at (300, 0). */
function arena(): MatchSimulation {
  return match([
    body("caster", 1, vec2(0, 0), {
      skillBar: [FIREBALL],
      attributeRanks: new Map([["elementalist.fire-magic", 12]]),
      maxEnergy: 1000,
      maxHealth: 1e6,
    }),
    body("dodger", 0, vec2(300, 0), { behaviour: BOT, maxHealth: 1e6 }),
    body("ally", 0, vec2(300, 200), { behaviour: BOT }),
  ]);
}

/** A real Fireball in flight from the caster at the dodger. */
function fireball(sim: MatchSimulation): Readonly<Projectile> {
  sim.setTarget("caster", "dodger");
  expect(sim.requestSkill("caster", 0)?.check).toEqual({ ok: true });
  for (let i = 0; i < 100 && sim.projectiles.length === 0; i += 1) sim.step(DT);
  const shot = sim.projectiles[0];
  if (shot === undefined) throw new Error("no Fireball in flight");
  return shot;
}

describe("play-build's dodge (#2590)", () => {
  const sim = arena();
  const real = fireball(sim);
  /** The real Fireball, `left` seconds from landing, with `extra` changed. */
  const shot = (left: number, extra: Partial<Projectile> = {}): Readonly<Projectile> => ({
    ...real,
    id: DODGES,
    from: vec2(0, 0),
    aimPoint: vec2(300, 0),
    flightSeconds: 1,
    elapsed: 1 - left,
    ...extra,
  });
  const dodger = () => {
    const self = sim.get("dodger");
    if (self === undefined) throw new Error("no dodger");
    return { ...self, position: vec2(300, 0) };
  };

  function ask(
    projectiles: readonly Readonly<Projectile>[],
    extra: Partial<BehaviourContext> = {},
    foeCentroid: Vec2 = vec2(0, 0),
  ) {
    return dodge.decide(
      ruleFor(
        sim,
        "dodger",
        {},
        { self: dodger(), stepUnits: STEP, foeCentroid, projectiles, ...extra },
      ),
    );
  }

  it("standing, steps across a Fireball's path, left of it with nothing to choose between", () => {
    const intent = ask([shot(0.5)]);
    expect(intent?.moveTo).toBeUndefined();
    expect(intent?.useSkillId).toBeUndefined();
    expect(intent?.moveDirection.x).toBeCloseTo(0, 9);
    expect(intent?.moveDirection.y).toBeCloseTo(1, 9);
  });

  it("stands on a coin over the chance", () => {
    expect(ask([shot(0.5, { id: STANDS })])).toBeUndefined();
  });

  it("ignores a plain weapon shot, a shot at an ally, an obstructed one, and one from an ally", () => {
    expect(ask([shot(0.5, { skillHit: undefined })])).toBeUndefined();
    expect(ask([shot(0.5, { targetId: "ally" })])).toBeUndefined();
    expect(ask([shot(0.5, { obstructed: true })])).toBeUndefined();
    expect(ask([shot(0.5, { attackerId: "ally" })])).toBeUndefined();
  });

  it("keeps fighting when too little flight is left to clear it", () => {
    expect(ask([shot(0.05)])).toBeUndefined();
    expect(ask([shot(0)])).toBeUndefined();
  });

  it("is a bot's alone: a guard or any other behaviour does not dodge", () => {
    expect(ask([shot(0.5)], { isBot: () => false })).toBeUndefined();
  });

  it("moving across the path, reverses: the aim was led ahead of it", () => {
    const intent = ask([shot(0.5, { from: vec2(0, 20), aimPoint: vec2(300, 20) })]);
    expect(intent?.moveDirection.y).toBeCloseTo(-1, 9);
  });

  it("standing, steps away from a wall, then away from the foes", () => {
    expect(ask([shot(0.5)], { sees: (point) => point.y < 0 })?.moveDirection.y).toBeCloseTo(-1, 9);
    expect(ask([shot(0.5)], {}, vec2(150, 100))?.moveDirection.y).toBeCloseTo(-1, 9);
    expect(ask([shot(0.5)], {}, vec2(150, -100))?.moveDirection.y).toBeCloseTo(1, 9);
  });

  it("follows the shot landing first", () => {
    const fromBelow = shot(0.4, { id: idWhere(true, DODGES + 1), from: vec2(300, -300) });
    for (const shots of [
      [shot(0.8), fromBelow],
      [fromBelow, shot(0.8)],
    ]) {
      const intent = ask(shots);
      expect(Math.abs(intent?.moveDirection.x ?? 0)).toBeCloseTo(1, 9);
      expect(intent?.moveDirection.y).toBeCloseTo(0, 9);
    }
  });
});

describe("dodgeRoll (#2590)", () => {
  it("is a pure function of the shot and the bot", () => {
    expect(dodgeRoll(7, "bot-a")).toBe(dodgeRoll(7, "bot-a"));
    expect(dodgeRoll(7, "bot-a")).not.toBe(dodgeRoll(7, "bot-b"));
  });

  it("is under the chance for about half of a thousand shots", () => {
    let under = 0;
    for (let id = 0; id < 1000; id += 1) {
      const roll = dodgeRoll(id, "dodger");
      expect(roll).toBeGreaterThanOrEqual(0);
      expect(roll).toBeLessThan(1);
      if (roll < DODGE_CHANCE) under += 1;
    }
    expect(under / 1000).toBeGreaterThan(0.4);
    expect(under / 1000).toBeLessThan(0.6);
  });
});

describe("a bot under fire (#2590)", () => {
  /** A wand-armed bot under ten scripted Fireballs: every Fireball entry logged. */
  function underFire(seed: string): CombatLogEntry[] {
    const sim = match(
      [
        body("caster", 1, vec2(0, 400), {
          skillBar: [FIREBALL],
          attributeRanks: new Map([["elementalist.fire-magic", 12]]),
          maxEnergy: 1000,
          maxHealth: 1e6,
        }),
        body("dodger", 0, vec2(300, 400), {
          behaviour: BOT,
          maxHealth: 1e6,
          equipment: {
            ...unarmedResolvedEquipment(60),
            mainHand: {
              weapon: WEAPONS.wand,
              attributeId: "",
              damageType: WEAPONS.wand.damageType,
              requirementMet: true,
              creatureDamageScale: undefined,
            },
          },
        }),
      ],
      seed,
    );
    sim.setTarget("caster", "dodger");
    const log: CombatLogEntry[] = [];
    let casts = 0;
    for (let t = 0; t < 120 && log.filter(landed).length < 10; t += DT) {
      const cast = sim.get("caster")?.combatant.cast;
      if (casts < 10 && cast?.isCasting === false && !cast.rechargeRemaining.has(FIREBALL)) {
        expect(sim.requestSkill("caster", 0)?.check).toEqual({ ok: true });
        casts += 1;
      }
      log.push(...sim.step(DT).log.filter((entry) => entry.skillId === FIREBALL));
    }
    return log;
  }
  const landed = (entry: CombatLogEntry) =>
    entry.events.some((event) => event.kind !== "skill-used");

  it("is missed by some of ten Fireballs, not all, the same on a replay", () => {
    const log = underFire("dodge");
    const shots = log.filter(landed);
    expect(shots).toHaveLength(10);
    const dodged = shots.filter((entry) =>
      entry.events.some((event) => event.kind === "attack-dodged"),
    ).length;
    expect(dodged).toBeGreaterThanOrEqual(2);
    expect(dodged).toBeLessThanOrEqual(8);
    expect(underFire("dodge")).toEqual(log);
  });
});
