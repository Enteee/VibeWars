import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import type { CombatEvent } from "./effects.js";

/**
 * "Your spirits within earshot" (#1777): a splash that reaches only the
 * caster's own spirits, measured from the caster; a flat attack-damage
 * status on a spirit; and Draw Spirit, which pulls a spirit to you.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BOON = "ritualist.spirit-boon-strike";
const LEECH = "ritualist.spiritleech-aura";
const DRAW = "ritualist.draw-spirit";
const ANGUISH = "ritualist.anguish";
const BLOODSONG = "ritualist.bloodsong";

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [BOON, LEECH, DRAW, ANGUISH, BLOODSONG],
    attributeRanks: new Map([
      ["ritualist.channeling-magic", 12],
      ["ritualist.communing", 12],
      ["ritualist.restoration-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** A spirit of `ownerId`'s already standing, as `#summon` would make it, that attacks nothing. */
function spirit(id: string, ownerId: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    ...spec(id, team, spawn),
    skillBar: [],
    attributeRanks: new Map(),
    creature: {
      ownerId,
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
      companionSkillId: undefined,
      leaderId: undefined,
      mode: "guard",
    },
  };
}

/** `r` on team 0 at the origin, and `more`. */
function match(more: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "own-spirits",
    participants: [spec("r", 0, vec2(0, 0)), ...more],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `r` uses `skillId` at `targetId`, and steps until it has landed. */
function use(sim: MatchSimulation, skillId: string, targetId: string | undefined): CombatEvent[] {
  sim.setTarget("r", targetId);
  const slot = get(sim, "r").skillBar.indexOf(skillId);
  expect(sim.requestSkill("r", slot)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "r" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log
    .filter((entry) => entry.sourceId === "r" && entry.skillId === skillId)
    .flatMap((entry) => entry.events);
}

/** Wound `id` by `amount`, so a heal shows. */
function wound(sim: MatchSimulation, id: string, amount: number): void {
  get(sim, id).combatant.health -= amount;
}

function amountsTo(
  events: readonly CombatEvent[],
  kind: "damage" | "heal" | "life-stolen",
  targetId: string,
): number[] {
  return events.flatMap((event) =>
    event.kind === kind && event.targetId === targetId ? [event.amount] : [],
  );
}

/** The only spirit `r` made with `skillId`, once it stands. */
function summoned(sim: MatchSimulation, skillId: string): Participant {
  const found = [...sim.participants()].filter(
    (p) => p.creature?.ownerId === "r" && p.creature.skillId === skillId,
  );
  const [only] = found;
  if (found.length !== 1 || only === undefined) {
    throw new Error(`${String(found.length)} spirits of ${skillId}`);
  }
  return only;
}

describe("own-spirits splash (#1777)", () => {
  it("heals your spirits in earshot of you, not an ally's or a foe's, nor one in earshot of the target only", () => {
    const sim = match([
      spirit("mine", "r", 0, vec2(0, AREA_EARSHOT - 20)),
      spirit("allys", "a", 0, vec2(0, -(AREA_EARSHOT - 20))),
      spirit("foes", "f", 1, vec2(-(AREA_EARSHOT - 20), 0)),
      // In earshot of the target, past yours.
      spirit("far", "r", 0, vec2(RANGE_SPELL - 20, 200)),
      spec("a", 0, vec2(-30, 30)),
      // In range: you cast where you stand.
      spec("f", 1, vec2(RANGE_SPELL - 20, 0)),
    ]);
    for (const id of ["mine", "allys", "foes", "far", "a"]) {
      wound(sim, id, 50);
    }

    const events = use(sim, BOON, "f");
    expect(amountsTo(events, "damage", "f")).toHaveLength(1);
    expect(amountsTo(events, "heal", "mine")).toEqual([50]);
    for (const id of ["allys", "foes", "far", "a", "r"]) {
      expect(amountsTo(events, "heal", id), id).toEqual([]);
    }
  });

  it("Spirit Boon Strike still strikes with no spirit of yours near", () => {
    const sim = match([spec("f", 1, vec2(200, 0))]);
    const events = use(sim, BOON, "f");
    expect(amountsTo(events, "damage", "f")).toHaveLength(1);
    expect(events.some((event) => event.kind === "heal")).toBe(false);
  });

  it("Spiritleech Aura with no spirit of yours near is spent, and does nothing", () => {
    const sim = match([spirit("allys", "a", 0, vec2(0, 60)), spec("a", 0, vec2(-60, 0))]);
    const before = get(sim, "r").combatant.energy;
    use(sim, LEECH, undefined);
    expect(get(sim, "r").combatant.energy).toBeLessThan(before);
    expect(get(sim, "r").combatant.cast.rechargeRemaining.get(LEECH)).toBeGreaterThan(0);
    expect(get(sim, "allys").combatant.statuses.has("spiritleech-aura")).toBe(false);
    expect(get(sim, "r").combatant.statuses.has("spiritleech-aura")).toBe(false);
  });

  it("reads as GW1 words it", () => {
    const ranks = new Map([["ritualist.channeling-magic", 12]]);
    const skill = getSkill(BOON);
    if (skill === undefined) {
      throw new Error(`no skill ${BOON}`);
    }
    expect(JSON.stringify(describeSkill(skill, ranks))).toContain("Your spirits in earshot");
  });

  it("says Spiritleech Aura steals with the spirit's attacks, not yours", () => {
    expect(describeStatus("spiritleech-aura")).toBe(
      "attacks deal 17 less damage, physical attacks steal up to 17 Health",
    );
    const leech = getSkill(LEECH);
    if (leech === undefined) {
      throw new Error(`no skill ${LEECH}`);
    }
    const text = JSON.stringify(describeSkill(leech, new Map()));
    expect(text).toContain("physical attacks steal up to 17 Health");
    expect(text).not.toContain("your physical attacks");
  });
});

describe("a flat attack-damage status on a spirit (#1777)", () => {
  /** `r` makes `skillId`'s spirit with a foe in its reach, then puts Spiritleech Aura on it. */
  function leeched(skillId: string): { sim: MatchSimulation; spiritId: string } {
    const sim = match([spec("f", 1, vec2(0, 200))]);
    use(sim, skillId, undefined);
    const { id } = summoned(sim, skillId);
    use(sim, LEECH, undefined);
    expect(get(sim, id).combatant.statuses.has("spiritleech-aura")).toBe(true);
    return { sim, spiritId: id };
  }

  /** What `spiritId`'s attacks did over 6 s. */
  function attacks(sim: MatchSimulation, spiritId: string): CombatEvent[] {
    const events: CombatEvent[] = [];
    for (let i = 0; i < 6 * RULES.tickRateHz; i++) {
      for (const entry of sim.step(DT).log) {
        if (entry.sourceId === spiritId) {
          events.push(...entry.events);
        }
      }
    }
    return events;
  }

  it("Anguish's 17 less 17 hits for 0, never below, and still steals 17 for the spirit", () => {
    const { sim, spiritId } = leeched(ANGUISH);
    wound(sim, spiritId, 100);
    const events = attacks(sim, spiritId);
    const stolen = amountsTo(events, "life-stolen", "f");
    expect(stolen.length).toBeGreaterThan(0);
    expect(new Set(stolen)).toEqual(new Set([17]));
    expect(amountsTo(events, "damage", "f").every((amount) => amount === 0)).toBe(true);
    expect(amountsTo(events, "heal", spiritId).length).toBe(stolen.length);
  });

  it("Bloodsong steals its own and Spiritleech Aura's on each hit", () => {
    const { sim, spiritId } = leeched(BLOODSONG);
    wound(sim, spiritId, 100);
    const stolen = amountsTo(attacks(sim, spiritId), "life-stolen", "f");
    expect(stolen).toContain(21);
    expect(stolen).toContain(17);
  });

  it("without it, Anguish hits for more than 0", () => {
    const sim = match([spec("f", 1, vec2(0, 200))]);
    use(sim, ANGUISH, undefined);
    const { id } = summoned(sim, ANGUISH);
    const events = attacks(sim, id);
    expect(amountsTo(events, "damage", "f").some((amount) => amount > 0)).toBe(true);
  });
});

describe("Draw Spirit (#1777)", () => {
  it("puts an ally's spirit beside you, emits teleported, and keeps its owner and timer", () => {
    const sim = match([
      spirit("allys", "a", 0, vec2(RANGE_SPELL - 50, 0)),
      spec("a", 0, vec2(0, 300)),
    ]);
    const planted = get(sim, "allys").creature;
    if (planted === undefined) {
      throw new Error("allys is no creature");
    }
    planted.expiresInSeconds = 60;

    const events = use(sim, DRAW, "allys");
    expect(events).toContainEqual({ kind: "teleported", targetId: "allys", toId: "r" });
    const drawn = get(sim, "allys");
    expect(Math.hypot(drawn.position.x, drawn.position.y)).toBeLessThan(
      4 * RULES.collision.playerRadius,
    );
    expect(drawn.creature?.ownerId).toBe("a");
    expect(drawn.creature?.expiresInSeconds).toBeGreaterThan(59);

    // It does not walk back.
    for (let i = 0; i < RULES.tickRateHz; i++) {
      sim.step(DT);
    }
    expect(get(sim, "allys").position).toEqual(drawn.position);
  });
});
