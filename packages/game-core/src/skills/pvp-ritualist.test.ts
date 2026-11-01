import { createRng } from "../rng.js";
import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import {
  MatchSimulation,
  type CreatureKind,
  type Participant,
  type ParticipantSpec,
} from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { mitigate, skillDamage } from "./damage.js";
import { describeSkill, describeStatus } from "./describe.js";
import type { CombatEvent } from "./effects.js";
import { attackDamageDeltaOf } from "./tick.js";

/**
 * The PvP Communing pair (#1827): Armor of Unfeeling's damage reduction
 * only while casting a binding ritual, and Signet of Ghostly Might's
 * attack damage on an allied summoned creature, which it destroys as it
 * runs out.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ARMOR = "ritualist.armor-of-unfeeling";
const SIGNET = "ritualist.signet-of-ghostly-might";
const ANGUISH = "ritualist.anguish";
const BOON = "ritualist.boon-of-creation";

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [ARMOR, SIGNET, ANGUISH, BOON],
    attributeRanks: new Map([
      ["ritualist.communing", 12],
      ["ritualist.channeling-magic", 12],
      ["ritualist.spawning-power", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** A creature of `ownerId`'s already standing, that attacks nothing. */
function creature(
  id: string,
  ownerId: string,
  team: number,
  spawn: Vec2,
  kind: CreatureKind = "spirit",
): ParticipantSpec {
  return {
    ...spec(id, team, spawn),
    skillBar: [],
    attributeRanks: new Map(),
    creature: {
      ownerId,
      kind,
      look: kind === "spirit" ? "spirit" : kind === "pet" ? "beast" : "bone-minion",
      name: id,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
      onDeath: kind === "pet" ? "lie" : "vanish",
      ownerDisableSeconds: 0,
      deathBurst: undefined,
      onDeathInRange: undefined,
      companionSkillId: undefined,
      leaderId: undefined,
      mode: "guard",
      replacedBy: undefined,
      corpsesLeft: 0,
    },
  };
}

/** `r` on team 0 at the origin, and `more`. */
function match(more: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "pvp-ritualist",
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

/** `r` starts `skillId` and steps once, so it is mid-activation. */
function start(sim: MatchSimulation, skillId: string): void {
  sim.setTarget("r", undefined);
  expect(sim.requestSkill("r", get(sim, "r").skillBar.indexOf(skillId))?.check.ok).toBe(true);
  sim.step(DT);
  expect(get(sim, "r").combatant.cast.activeCast?.skillId).toBe(skillId);
}

/** Why `r` may not use `skillId` at `targetId`, or `undefined` when it may. */
function refusal(sim: MatchSimulation, skillId: string, targetId: string): string | undefined {
  sim.setTarget("r", targetId);
  const check = sim.requestSkill("r", get(sim, "r").skillBar.indexOf(skillId))?.check;
  return check === undefined || check.ok ? undefined : check.reason;
}

/** What 50 typeless damage does to `r` now. */
function taken(sim: MatchSimulation, amount = 50): number {
  return mitigate(
    skillDamage(amount, "typeless", 0),
    get(sim, "r").combatant,
    RULES.combat,
    null,
    createRng(1),
  );
}

/** Every log entry over `seconds`. */
function run(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < seconds * RULES.tickRateHz; i++) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

function events(log: readonly CombatLogEntry[]): CombatEvent[] {
  return log.flatMap((entry) => entry.events);
}

describe("Armor of Unfeeling (#1827)", () => {
  it("takes 10 off each packet only while you cast a binding ritual", () => {
    const sim = match([]);
    expect(taken(sim)).toBe(50);
    start(sim, ANGUISH);
    // Not under it yet: casting a ritual alone takes nothing off.
    expect(taken(sim)).toBe(50);
    get(sim, "r").combatant.cast.cancelCast();
    run(sim, 1);

    use(sim, ARMOR, undefined);
    expect(get(sim, "r").combatant.statuses.has("armor-of-unfeeling")).toBe(true);
    // Idle under it: nothing.
    expect(taken(sim)).toBe(50);
    run(sim, 1);

    start(sim, ANGUISH);
    expect(taken(sim)).toBe(40);
    // Never below 0.
    expect(taken(sim, 5)).toBe(0);

    // Interrupted: over the moment the activation is.
    get(sim, "r").combatant.cast.cancelCast();
    expect(taken(sim)).toBe(50);
  });

  it("takes nothing off while you cast a spell that is no binding ritual", () => {
    const sim = match([]);
    use(sim, ARMOR, undefined);
    run(sim, 1);
    start(sim, BOON);
    expect(taken(sim)).toBe(50);
  });

  it("lasts its rank-12 30 s", () => {
    const sim = match([]);
    use(sim, ARMOR, undefined);
    run(sim, 29);
    expect(get(sim, "r").combatant.statuses.has("armor-of-unfeeling")).toBe(true);
    run(sim, 1.5);
    expect(get(sim, "r").combatant.statuses.has("armor-of-unfeeling")).toBe(false);
  });

  it("reads as GW1 words it", () => {
    expect(describeStatus("armor-of-unfeeling")).toBe(
      "−10 damage taken while casting binding rituals",
    );
  });
});

describe("Signet of Ghostly Might (#1827)", () => {
  it("lands on an allied spirit or minion, whoever made it, and refuses a pet, a player, a foe's creature and you", () => {
    const sim = match([
      spec("a", 0, vec2(0, 100)),
      creature("s", "a", 0, vec2(100, 0)),
      creature("m", "a", 0, vec2(-100, 0), "minion"),
      creature("pet", "a", 0, vec2(0, -100), "pet"),
      creature("fs", "f", 1, vec2(200, 0)),
      spec("f", 1, vec2(300, 0)),
    ]);
    for (const target of ["pet", "a", "fs", "f", "r"]) {
      expect(refusal(sim, SIGNET, target), target).toBe(
        "invalid-target-not-allied-summoned-creature",
      );
    }
    use(sim, SIGNET, "m");
    expect(get(sim, "m").combatant.statuses.has("signet-of-ghostly-might")).toBe(true);
    expect(attackDamageDeltaOf(get(sim, "m").combatant)).toBe(29);
    run(sim, 6);
    use(sim, SIGNET, "s");
    expect(get(sim, "s").combatant.statuses.has("signet-of-ghostly-might")).toBe(true);
  });

  it("makes a spirit's attacks deal 29 more damage", () => {
    /** What Anguish's blows on the foe dealt over 4 s, with or without the signet. */
    function blows(signet: boolean): number[] {
      const sim = match([spec("f", 1, vec2(0, 200))]);
      use(sim, ANGUISH, undefined);
      const anguish = [...sim.participants()].find(
        (p) => p.creature?.ownerId === "r" && p.creature.skillId === ANGUISH,
      );
      if (anguish === undefined) {
        throw new Error("no Anguish");
      }
      if (signet) {
        use(sim, SIGNET, anguish.id);
      }
      return events(run(sim, 4).filter((entry) => entry.sourceId === anguish.id)).flatMap(
        (event) => (event.kind === "damage" && event.targetId === "f" ? [event.amount] : []),
      );
    }
    const without = blows(false);
    const withSignet = blows(true);
    expect(without.length).toBeGreaterThan(0);
    expect(withSignet.length).toBeGreaterThan(0);
    expect(new Set(withSignet)).toEqual(new Set(without.map((amount) => amount + 29)));
  });

  it("destroys a spirit and a minion after 10 s: no corpse, no death", () => {
    const sim = match([
      creature("s", "r", 0, vec2(100, 0)),
      creature("m", "r", 0, vec2(-100, 0), "minion"),
    ]);
    sim.step(DT);
    expect(get(sim, "r").combatant.controlled.spirit).toBe(1);
    expect(get(sim, "r").combatant.controlled.minion).toBe(1);

    use(sim, SIGNET, "s");
    run(sim, 6);
    use(sim, SIGNET, "m");

    const early = run(sim, 1.5);
    expect(sim.get("s")).toBeDefined();
    const log = [...early, ...run(sim, 9)];
    const all = events(log);
    expect(
      all.filter((event) => event.kind === "creature-destroyed").map((e) => e.targetId),
    ).toEqual(["s", "m"]);
    expect(all.some((event) => event.kind === "death")).toBe(false);
    expect(sim.get("s")).toBeUndefined();
    expect(sim.get("m")).toBeUndefined();
    // Blamed on whoever used the signet.
    expect(
      log.filter((entry) => entry.events.some((event) => event.kind === "creature-destroyed")),
    ).toEqual([
      expect.objectContaining({ sourceId: "r" }),
      expect.objectContaining({ sourceId: "r" }),
    ]);
    sim.step(DT);
    expect(get(sim, "r").combatant.controlled.spirit).toBe(0);
    expect(get(sim, "r").combatant.controlled.minion).toBe(0);
  });

  it("destroys nothing when it is removed before its time", () => {
    const sim = match([creature("s", "r", 0, vec2(100, 0))]);
    use(sim, SIGNET, "s");
    run(sim, 5);
    expect(get(sim, "s").combatant.statuses.remove("signet-of-ghostly-might")).toBe(true);
    const all = events(run(sim, 7));
    expect(all.some((event) => event.kind === "creature-destroyed")).toBe(false);
    expect(get(sim, "s").combatant.dead).toBe(false);
  });

  it("reads as GW1 words it", () => {
    expect(describeStatus("signet-of-ghostly-might")).toBe(
      "attacks deal 29 more damage, the bearer is destroyed when it expires",
    );
    const signet = getSkill(SIGNET);
    if (signet === undefined) {
      throw new Error(`no skill ${SIGNET}`);
    }
    expect(JSON.stringify(describeSkill(signet, new Map()))).toContain(
      "An allied summoned creature",
    );
  });
});
