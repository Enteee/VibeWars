import { describe, expect, it, vi } from "vitest";

import type { PlayerBuild } from "../../build.js";
import { AREA_ADJACENT } from "../../distances.js";
import { resolveLoadout, unarmedResolvedEquipment } from "../../equipment/resolve.js";
import { loadoutOf } from "../../join-loadout.js";
import { ANNIHILATION_MATCH_RULES } from "../../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../../ruleset.js";
import { getSkill } from "../../skills/catalog.js";
import { STARTER_BUILDS } from "../../starter-builds.js";
import { vec2, type Vec2 } from "../../vec2.js";
import { createCursor, decide, type Behaviour } from "../behaviour.js";
import type { CombatLogEntry } from "../combat-log.js";
import { MatchSimulation, loadoutSpec, type ParticipantSpec } from "../simulation.js";
import { botUses, onlyInterrupts } from "./skill-intent.js";
import { NO_RANKS } from "../../skills/status.js";

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULESET.tickRateHz;
/** A field with edges, as every map has. */
const BOUNDS = { width: 1600, height: 800 };
const BOT: Behaviour = { kind: "play-build", thinkSeconds: 0.25 };

function starter(name: string): PlayerBuild {
  const build = STARTER_BUILDS.find((candidate) => candidate.name === name);
  if (build === undefined) throw new Error(`no starter build ${name}`);
  return build;
}

const WARRIOR = starter("Warrior/Monk");
const RANGER = starter("Ranger/Mesmer");
const MONK = starter("Monk/Elementalist");
const ELEMENTALIST = starter("Elementalist/Mesmer");

/** A fighter playing `build`, a bot unless `behaviour` is `undefined`. */
function fighter(
  id: string,
  team: number,
  build: PlayerBuild,
  spawn: Vec2,
  extra: Partial<ParticipantSpec> = {},
): ParticipantSpec {
  const loadout = loadoutOf(build);
  const resolved = resolveLoadout(
    {
      primaryProfession: loadout.primaryProfession,
      secondaryProfession: loadout.secondaryProfession,
      allocatedRanks: loadout.attributeRanks,
      equipment: loadout.equipment,
    },
    RULESET.combat,
  );
  return {
    id,
    team,
    skillBar: loadout.skillBar,
    ...loadoutSpec(resolved),
    baseEnergyPips: loadout.baseEnergyPips,
    spawn,
    facing: 0,
    behaviour: BOT,
    ...extra,
  };
}

function match(participants: readonly ParticipantSpec[], seed = "bot"): MatchSimulation {
  return new MatchSimulation({ seed, ruleset: RULESET, bounds: BOUNDS, participants });
}

/** Every skill `id` used, in order, over `seconds`. */
function skillsUsed(sim: MatchSimulation, id: string, seconds: number): string[] {
  const used: string[] = [];
  for (let t = 0; t < seconds; t += DT) {
    for (const entry of sim.step(DT).log) {
      if (entry.sourceId === id && entry.skillId !== undefined) used.push(entry.skillId);
    }
  }
  return used;
}

function slotOf(build: PlayerBuild, skillId: string): number {
  return build.skillBar.indexOf(skillId);
}

/** What the bot `id` would do now, with every skill allowed. */
function askBot(sim: MatchSimulation, id: string) {
  const self = sim.get(id);
  if (self === undefined) throw new Error(`no ${id}`);
  return decide(BOT, createCursor(), {
    self,
    participants: [...sim.participants()],
    dt: DT,
    stepUnits: 1,
    check: () => ({ ok: true }),
    isBot: () => true,
    calledTargetId: undefined,
    sees: () => true,
  });
}

function uses(skillId: string | undefined) {
  const skill = skillId === undefined ? undefined : getSkill(skillId);
  return skill === undefined ? [] : botUses(skill);
}

describe("play-build (#1189)", () => {
  it("heals the ally at 40% rather than attacking", () => {
    const sim = match([
      fighter("monk", 0, MONK, vec2(400, 400)),
      fighter("ally", 0, WARRIOR, vec2(480, 400), {
        behaviour: undefined,
        startHealthFraction: 0.4,
      }),
      fighter("foe", 1, WARRIOR, vec2(600, 400), { behaviour: undefined }),
    ]);
    sim.step(DT);
    const cast = sim.get("monk")?.combatant.cast.activeCast;
    expect(cast?.targetId).toBe("ally");
    expect(uses(cast?.skillId)).toContain("healing");
    expect(sim.get("monk")?.combatant.attack).toBeUndefined();
  });

  it("stands and fights a melee foe at its elbow with the bow, by a wall or in the open, however fast it thinks", () => {
    // By the field's left edge, and in the middle of it.
    for (const x of [10, 800]) {
      for (const thinkSeconds of [0, 0.25]) {
        const sim = match([
          // No skills: only the bow can do the damage.
          fighter("ranger", 0, RANGER, vec2(x, 400), {
            behaviour: { kind: "play-build", thinkSeconds },
            skillBar: [],
          }),
          fighter("foe", 1, WARRIOR, vec2(x + 40, 400), { behaviour: undefined, maxHealth: 1e6 }),
        ]);
        let hits = 0;
        let stood: Vec2 | undefined;
        for (let t = 0; t < 10; t += DT) {
          for (const entry of sim.step(DT).log) {
            if (entry.sourceId === "ranger" && entry.weaponId !== undefined) {
              hits += entry.events.filter(
                (event) => event.kind === "damage" && event.targetId === "foe",
              ).length;
            }
          }
          // Where it stands once the field's edge has placed it: it never leaves.
          stood ??= { ...(sim.get("ranger")?.position ?? vec2(Number.NaN, Number.NaN)) };
        }
        expect(hits, `x ${String(x)}, thinkSeconds ${String(thinkSeconds)}`).toBeGreaterThan(3);
        expect(sim.get("ranger")?.position).toEqual(stood);
      }
    }
  });

  it("holds an interrupt with no foe casting", () => {
    const sim = match([
      fighter("ranger", 0, RANGER, vec2(400, 400)),
      fighter("foe", 1, WARRIOR, vec2(700, 400), { behaviour: undefined, maxHealth: 1e6 }),
    ]);
    const used = skillsUsed(sim, "ranger", 20);
    expect(used.length).toBeGreaterThan(0);
    expect(used).not.toContain("mesmer.power-drain");
  });

  it("interrupts a 2 s cast, and not one with 0.1 s left", () => {
    const sim = match([
      fighter("ranger", 0, RANGER, vec2(400, 400), { behaviour: undefined }),
      fighter("foe", 1, ELEMENTALIST, vec2(700, 400), { behaviour: undefined }),
    ]);
    sim.setTarget("foe", "ranger");
    sim.requestSkill("foe", slotOf(ELEMENTALIST, "elementalist.chain-lightning"));
    expect(sim.get("foe")?.combatant.cast.activeCast?.remainingSeconds).toBe(2);
    const early = askBot(sim, "ranger");
    expect(early).toMatchObject({ targetId: "foe", useSkillId: "ranger.savage-shot" });

    while ((sim.get("foe")?.combatant.cast.activeCast?.remainingSeconds ?? 0) > 0.1) {
      sim.step(DT);
    }
    expect(sim.get("foe")?.combatant.cast.isCasting).toBe(true);
    const late = getSkill(askBot(sim, "ranger").useSkillId ?? "");
    expect(late === undefined || !onlyInterrupts(late)).toBe(true);
  });

  describe("interrupting a plain swing (#1713)", () => {
    const BLOW = "warrior.distracting-blow";
    const POWER_DRAIN = "mesmer.power-drain";

    /** A bot holding `skillBar` beside a still, unarmed-by-bot foe or two. */
    function interrupter(skillBar: readonly string[], ...foes: ParticipantSpec[]) {
      return match([
        fighter("bot", 0, WARRIOR, vec2(400, 400), { behaviour: undefined, skillBar }),
        ...foes,
      ]);
    }
    const swinger = (id = "foe") =>
      fighter(id, 1, WARRIOR, vec2(440, 400), { behaviour: undefined, maxHealth: 1e6 });
    /** `id` `elapsed` seconds into a swing at the bot. */
    function swinging(sim: MatchSimulation, elapsed: number, id = "foe") {
      const foe = sim.get(id)?.combatant;
      if (foe === undefined) throw new Error(`no ${id}`);
      foe.attack = { targetId: "bot", swingElapsed: elapsed, unreachableSeconds: 0 };
      return foe;
    }

    it("uses an interrupt of an action on a foe mid-swing", () => {
      const sim = interrupter([BLOW], swinger());
      swinging(sim, 0.2);
      expect(askBot(sim, "bot")).toMatchObject({ targetId: "foe", useSkillId: BLOW });
    });

    it("not on a foe walking to its target, nor on a swing nearly done", () => {
      const walking = interrupter([BLOW], swinger());
      swinging(walking, 0.2).moving = true;
      expect(askBot(walking, "bot").useSkillId).toBeUndefined();

      const late = interrupter([BLOW], swinger());
      swinging(late, 1.2);
      expect(askBot(late, "bot").useSkillId).toBeUndefined();
    });

    it("keeps it for a caster over a swinger in the same think", () => {
      const sim = interrupter(
        [BLOW],
        swinger(),
        fighter("caster", 1, ELEMENTALIST, vec2(400, 440), { behaviour: undefined }),
      );
      swinging(sim, 0.2);
      sim.setTarget("caster", "bot");
      sim.requestSkill("caster", slotOf(ELEMENTALIST, "elementalist.chain-lightning"));
      expect(askBot(sim, "bot")).toMatchObject({ targetId: "caster", useSkillId: BLOW });
    });

    it("never fires a spell interrupt at a signet cast nor at a swing", () => {
      const signet = interrupter([POWER_DRAIN], swinger());
      signet
        .get("foe")
        ?.combatant.cast.beginCast("warrior.healing-signet", undefined, 2, undefined);
      expect(askBot(signet, "bot").useSkillId).toBeUndefined();

      const swing = interrupter([POWER_DRAIN], swinger());
      swinging(swing, 0.2);
      expect(askBot(swing, "bot").useSkillId).toBeUndefined();
    });
  });

  it("takes a condition off an ally", () => {
    const sim = match([
      fighter("warrior", 0, WARRIOR, vec2(400, 400)),
      fighter("ally", 0, MONK, vec2(480, 400), { behaviour: undefined }),
      fighter("hexer", 1, WARRIOR, vec2(1550, 750), {
        behaviour: {
          kind: "apply-status-cadence",
          statusId: "bleeding",
          durationSeconds: 20,
          everySeconds: 60,
          targeting: { kind: "fixed", participantId: "ally" },
        },
      }),
    ]);
    // The bleeding lands after the bot's first think: it sees it on its second.
    for (let t = 0; t < 0.5; t += DT) sim.step(DT);
    const cast = sim.get("warrior")?.combatant.cast.activeCast;
    expect(cast).toMatchObject({ skillId: "monk.mend-condition", targetId: "ally" });
    skillsUsed(sim, "warrior", 2);
    expect(sim.get("ally")?.combatant.statuses.has("bleeding")).toBe(false);
  });

  it("casts Healing Ring for a hurt ally beside it, never for itself alone (#1870)", () => {
    const ring = { skillBar: ["monk.healing-ring"], startHealthFraction: 0.3 };
    const alone = match([
      fighter("monk", 0, MONK, vec2(400, 400), ring),
      fighter("foe", 1, WARRIOR, vec2(400 + AREA_ADJACENT / 2, 400), { behaviour: undefined }),
    ]);
    expect(askBot(alone, "monk").useSkillId).toBeUndefined();
    const beside = match([
      fighter("monk", 0, MONK, vec2(400, 400), { ...ring, startHealthFraction: 1 }),
      fighter("ally", 0, WARRIOR, vec2(400 + AREA_ADJACENT / 2, 400), {
        behaviour: undefined,
        startHealthFraction: 0.3,
      }),
    ]);
    expect(askBot(beside, "monk")).toMatchObject({
      useSkillId: "monk.healing-ring",
      targetId: "monk",
    });
  });

  it("walks in to an out-of-range ally to heal them", () => {
    const sim = match([
      fighter("monk", 0, MONK, vec2(400, 400)),
      fighter("ally", 0, WARRIOR, vec2(1550, 400), {
        behaviour: undefined,
        startHealthFraction: 0.4,
      }),
    ]);
    sim.step(DT);
    expect(sim.get("monk")?.pendingSkill?.targetId).toBe("ally");
    const before = sim.get("ally")?.combatant.health ?? 0;
    const used = skillsUsed(sim, "monk", 15);
    expect(used.some((id) => uses(id).includes("healing"))).toBe(true);
    expect(sim.get("ally")?.combatant.health).toBeGreaterThan(before);
  });

  it("picks one foe for the team: the lowest health fraction", () => {
    const sim = match([
      fighter("a", 0, ELEMENTALIST, vec2(400, 400)),
      fighter("b", 0, ELEMENTALIST, vec2(400, 460)),
      fighter("whole", 1, WARRIOR, vec2(700, 400), { behaviour: undefined }),
      fighter("hurt", 1, WARRIOR, vec2(700, 600), {
        behaviour: undefined,
        startHealthFraction: 0.7,
      }),
    ]);
    sim.step(DT);
    expect(sim.get("a")?.targetId).toBe("hurt");
    expect(sim.get("b")?.targetId).toBe("hurt");
  });

  it("fights the foe its team called over the most hurt one, and drops the call when it dies (#1193)", () => {
    const sim = match([
      fighter("a", 0, ELEMENTALIST, vec2(400, 400)),
      fighter("b", 0, ELEMENTALIST, vec2(400, 460)),
      fighter("called", 1, WARRIOR, vec2(700, 400), { behaviour: undefined, maxHealth: 1 }),
      fighter("hurt", 1, WARRIOR, vec2(700, 600), {
        behaviour: undefined,
        startHealthFraction: 0.7,
      }),
    ]);
    sim.setCalledTarget(0, "called");
    sim.step(DT);
    expect(sim.get("a")?.targetId).toBe("called");
    expect(sim.get("b")?.targetId).toBe("called");
    for (let t = 0; t < 10 && sim.get("called")?.combatant.dead === false; t += DT) sim.step(DT);
    expect(sim.get("called")?.combatant.dead).toBe(true);
    for (let t = 0; t < 5; t += DT) sim.step(DT);
    expect(sim.get("a")?.targetId).toBe("hurt");
    expect(sim.get("b")?.targetId).toBe("hurt");
  });

  it("asks for at most one skill per think", () => {
    const sim = match([
      fighter("ranger", 0, RANGER, vec2(400, 400)),
      fighter("foe", 1, ELEMENTALIST, vec2(700, 400)),
    ]);
    const requestSkill = vi.spyOn(sim, "requestSkill");
    const seconds = 10;
    for (let t = 0; t < seconds; t += DT) sim.step(DT);
    const thinks = Math.ceil(seconds / 0.25) + 1;
    const asked = requestSkill.mock.calls.filter(([id]) => id === "ranger").length;
    expect(asked).toBeGreaterThan(0);
    expect(asked).toBeLessThanOrEqual(thinks);
  });

  it("asks for nothing while dead", () => {
    const sim = new MatchSimulation({
      seed: "respawn",
      ruleset: RULESET,
      bounds: BOUNDS,
      matchRules: { ...ANNIHILATION_MATCH_RULES, deathRule: "respawn", respawnSeconds: 1 },
      participants: [
        fighter("monk", 0, MONK, vec2(400, 400), { maxHealth: 1 }),
        fighter("foe", 1, WARRIOR, vec2(430, 400), { behaviour: undefined }),
        fighter("spare", 0, WARRIOR, vec2(1550, 750), { behaviour: undefined }),
      ],
    });
    sim.requestAttack("foe", "monk");
    let died = false;
    for (let t = 0; t < 10 && !died; t += DT) {
      died = sim
        .step(DT)
        .log.some((entry) =>
          entry.events.some((event) => event.kind === "death" && event.targetId === "monk"),
        );
    }
    expect(died).toBe(true);
    const requestSkill = vi.spyOn(sim, "requestSkill");
    sim.step(DT);
    expect(sim.get("monk")?.combatant.dead).toBe(true);
    expect(requestSkill).not.toHaveBeenCalled();
  });
});

describe("play-build and a well's sacrifice (#1730)", () => {
  const WELL_OF_BLOOD = "necromancer.well-of-blood";

  /** A bot whose only skill is Well of Blood, at `fraction` of its Health, a foe far off. */
  function wellBot(fraction: number, corpse: boolean): MatchSimulation {
    const sim = match([
      fighter("n", 0, MONK, vec2(400, 400), {
        skillBar: [WELL_OF_BLOOD],
        startHealthFraction: fraction,
      }),
      fighter("foe", 1, WARRIOR, vec2(1400, 400), { behaviour: undefined }),
      fighter("fallen", 1, WARRIOR, vec2(450, 400), { behaviour: undefined }),
    ]);
    if (corpse) {
      const fallen = sim.get("fallen")?.combatant;
      if (fallen === undefined) throw new Error("no fallen");
      fallen.statuses.apply("burning", 10, "foe", NO_RANKS);
      fallen.health = 0.2;
      sim.step(DT);
      expect(fallen.dead).toBe(true);
    } else {
      sim.remove("fallen");
    }
    return sim;
  }

  it.each([
    [0.55, false, true],
    [0.4, false, false],
    [0.4, true, true],
  ])("at %d of its Health, a corpse near: %s, uses the well: %s", (fraction, corpse, used) => {
    const sim = wellBot(fraction, corpse);
    expect(askBot(sim, "n").useSkillId === WELL_OF_BLOOD).toBe(used);
  });
});

describe("play-build in a whole match (#1189)", () => {
  /** Every log entry of a 1v1 of two bots, to its end or `seconds`. */
  function duel(seed: string, seconds: number): { log: CombatLogEntry[]; sim: MatchSimulation } {
    const sim = new MatchSimulation({
      seed,
      ruleset: RULESET,
      bounds: BOUNDS,
      matchRules: ANNIHILATION_MATCH_RULES,
      participants: [
        fighter("warrior", 0, WARRIOR, vec2(400, 400)),
        fighter("necro", 1, starter("Necromancer/Elementalist"), vec2(1000, 400)),
      ],
    });
    const log: CombatLogEntry[] = [];
    for (let t = 0; t < seconds && sim.phase === "active"; t += DT) {
      log.push(...sim.step(DT).log);
    }
    return { log, sim };
  }

  it("plays a 1v1 of two starter builds to its end within 5 minutes", () => {
    const { sim } = duel("duel", 300);
    expect(sim.phase).toBe("finished");
  });

  it("plays the same match from the same seed", () => {
    expect(duel("same", 60).log).toEqual(duel("same", 60).log);
  });

  it("keeps a warrior alive longer with a bot monk beside it", () => {
    function survival(withMonk: boolean): number {
      const participants = [
        // A warrior that does not fight back or heal itself, against a ranger
        // that will not fall: only the monk can keep it up.
        fighter("warrior", 0, WARRIOR, vec2(400, 400), { behaviour: undefined, maxHealth: 150 }),
        fighter("foe", 1, RANGER, vec2(800, 400), { maxHealth: 1e5 }),
      ];
      if (withMonk) participants.push(fighter("monk", 0, MONK, vec2(250, 400)));
      const sim = new MatchSimulation({
        seed: "outlive",
        ruleset: RULESET,
        bounds: BOUNDS,
        matchRules: ANNIHILATION_MATCH_RULES,
        participants,
      });
      let t = 0;
      while (t < 300 && sim.get("warrior")?.combatant.dead === false) {
        sim.step(DT);
        t += DT;
      }
      return t;
    }
    expect(survival(true)).toBeGreaterThan(survival(false));
  });
});

describe("play-build's way out (#1930)", () => {
  /** A bare body, a bot unless it is a creature. */
  const bare = (id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) =>
    ({
      id,
      team,
      skillBar: [],
      attributeRanks: new Map(),
      equipment: unarmedResolvedEquipment(60),
      maxEnergy: 60,
      spawn,
      facing: 0,
      ...extra,
    }) satisfies ParticipantSpec;
  const spirit = (id: string, spawn: Vec2): ParticipantSpec =>
    bare(id, 0, spawn, {
      creature: {
        ownerId: "sin",
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
        replacedBy: undefined,
        corpsesLeft: 0,
        companionSkillId: undefined,
        leaderId: undefined,
        mode: "guard",
      },
    });
  /** An assassin with Spirit Walk at `health`, a foe at its elbow, a spirit by the foe and one far off. */
  const cornered = (health: number) => {
    const sim = match([
      bare("sin", 0, vec2(0, 0), { skillBar: ["assassin.spirit-walk"], behaviour: BOT }),
      bare("foe", 1, vec2(AREA_ADJACENT, 0)),
      spirit("near", vec2(AREA_ADJACENT, 60)),
      spirit("far", vec2(-300, 0)),
    ]);
    const sin = sim.get("sin")?.combatant;
    if (sin === undefined) throw new Error("no sin");
    sin.health = sin.maxHealth * health;
    return sim;
  };

  it("steps to the spirit farthest from the foe when hurt", () => {
    expect(askBot(cornered(0.4), "sin")).toMatchObject({
      targetId: "far",
      useSkillId: "assassin.spirit-walk",
    });
  });

  it("stays while it is not hurt", () => {
    expect(askBot(cornered(0.9), "sin").useSkillId).toBeUndefined();
  });
});

describe("play-build renews a spirit near its end (#1947)", () => {
  const ritualist = (id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) =>
    ({
      id,
      team,
      skillBar: ["ritualist.gaze-of-fury"],
      attributeRanks: new Map([["ritualist.channeling-magic", 12]]),
      equipment: unarmedResolvedEquipment(60),
      maxEnergy: 60,
      spawn,
      facing: 0,
      ...extra,
    }) satisfies ParticipantSpec;
  /** `r`'s spirit with `left` of its 60 s, and a foe `foeAt` away from it. */
  const ending = (left: number, foeAt: number) =>
    match([
      ritualist("r", 0, vec2(0, 0), { behaviour: BOT }),
      ritualist("foe", 1, vec2(300 + foeAt, 0), { skillBar: [] }),
      ritualist("s", 0, vec2(300, 0), {
        skillBar: [],
        creature: {
          ownerId: "r",
          kind: "spirit",
          look: "spirit",
          name: "s",
          expiresInSeconds: left,
          ageSeconds: 60 - left,
          summonedAtTick: 0,
          skillId: undefined,
          aura: undefined,
          onDeath: "vanish",
          ownerDisableSeconds: 0,
          deathBurst: undefined,
          onDeathInRange: undefined,
          replacedBy: undefined,
          corpsesLeft: 0,
          companionSkillId: undefined,
          leaderId: undefined,
          mode: "guard",
        },
      }),
    ]);

  it("casts Gaze of Fury on its own spirit with under a quarter of its life left, a foe in its reach", () => {
    expect(askBot(ending(10, 200), "r")).toMatchObject({
      targetId: "s",
      useSkillId: "ritualist.gaze-of-fury",
    });
  });

  it("leaves a spirit with most of its life, or one no foe is near", () => {
    expect(askBot(ending(30, 200), "r").useSkillId).toBeUndefined();
    expect(askBot(ending(10, 2000), "r").useSkillId).toBeUndefined();
  });
});

describe("setups (#1975)", () => {
  const DARK = "assassin.dark-apostasy";
  const ORDER = "necromancer.order-of-apostasy";
  const sim = (skillBar: string[]): MatchSimulation =>
    match([
      fighter("a", 0, WARRIOR, vec2(400, 400), { behaviour: undefined, skillBar }),
      fighter("b", 0, WARRIOR, vec2(400, 440), { behaviour: undefined, skillBar: [] }),
      fighter("foe", 1, WARRIOR, vec2(480, 400), { behaviour: undefined, skillBar: [] }),
    ]);
  const enchant = (fight: MatchSimulation): void => {
    fight.get("foe")?.combatant.statuses.apply("vital-blessing", 30, "x", NO_RANKS);
  };

  it("casts Dark Apostasy only at an enchanted foe", () => {
    const bare = sim([DARK]);
    expect(askBot(bare, "a").useSkillId).toBeUndefined();
    const fight = sim([DARK]);
    enchant(fight);
    expect(askBot(fight, "a")).toMatchObject({ useSkillId: DARK, targetId: "a" });
  });

  it("casts Order of Apostasy once two of the party hit an enchanted foe", () => {
    const fight = sim([ORDER]);
    enchant(fight);
    fight.requestAttack("a", "foe");
    expect(askBot(fight, "a").useSkillId).toBeUndefined();
    fight.requestAttack("b", "foe");
    expect(askBot(fight, "a")).toMatchObject({ useSkillId: ORDER, targetId: "a" });
  });
});

describe("play-build takes what another has (#1965)", () => {
  const body = (id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) =>
    ({
      id,
      team,
      skillBar: [],
      attributeRanks: new Map([
        ["assassin.shadow-arts", 12],
        ["ritualist.spawning-power", 12],
      ]),
      equipment: unarmedResolvedEquipment(60),
      maxHealth: 600,
      maxEnergy: 60,
      spawn,
      facing: 0,
      ...extra,
    }) satisfies ParticipantSpec;
  const spirit = (id: string, ownerId: string, team: number, spawn: Vec2) =>
    body(id, team, spawn, {
      creature: {
        ownerId,
        kind: "spirit",
        look: "spirit",
        name: id,
        expiresInSeconds: 60,
        ageSeconds: 0,
        summonedAtTick: 0,
        skillId: undefined,
        aura: undefined,
        onDeath: "vanish",
        ownerDisableSeconds: 0,
        deathBurst: undefined,
        onDeathInRange: undefined,
        replacedBy: undefined,
        corpsesLeft: 0,
        companionSkillId: undefined,
        leaderId: undefined,
        mode: "guard",
      },
    });

  it("casts Signet of Binding on a foe's spirit in reach, with Health to spare", () => {
    const binder = () =>
      match([
        body("r", 0, vec2(0, 0), { behaviour: BOT, skillBar: ["ritualist.signet-of-binding"] }),
        body("foe", 1, vec2(1500, 0)),
        spirit("s", "foe", 1, vec2(300, 0)),
      ]);
    expect(askBot(binder(), "r")).toMatchObject({
      targetId: "s",
      useSkillId: "ritualist.signet-of-binding",
    });
    const hurt = binder();
    const r = hurt.get("r");
    if (r !== undefined) {
      r.combatant.health = 200;
    }
    expect(askBot(hurt, "r").useSkillId).toBeUndefined();
  });

  it("casts Mirrored Stance only on a foe with a stance on its bar", () => {
    const at = (foeBar: readonly string[]) =>
      match([
        body("a", 0, vec2(0, 0), { behaviour: BOT, skillBar: ["assassin.mirrored-stance"] }),
        body("foe", 1, vec2(300, 0), { skillBar: foeBar }),
      ]);
    expect(askBot(at(["assassin.dash"]), "a")).toMatchObject({
      targetId: "foe",
      useSkillId: "assassin.mirrored-stance",
    });
    expect(askBot(at(["monk.word-of-healing"]), "a").useSkillId).toBeUndefined();
  });

  it("casts Arcane Mimicry on an ally's elite with no foe in reach, never an attack or its own", () => {
    const at = (allyBar: readonly string[], ownBar: readonly string[] = []) =>
      match([
        body("m", 0, vec2(0, 0), {
          behaviour: BOT,
          skillBar: ["mesmer.arcane-mimicry", ...ownBar],
        }),
        body("ally", 0, vec2(0, 60), { skillBar: allyBar }),
        body("foe", 1, vec2(1500, 0)),
      ]);
    expect(askBot(at(["monk.word-of-healing"]), "m")).toMatchObject({
      targetId: "ally",
      useSkillId: "mesmer.arcane-mimicry",
    });
    expect(askBot(at(["warrior.eviscerate"]), "m").useSkillId).toBeUndefined();
    expect(
      askBot(at(["monk.word-of-healing"], ["monk.word-of-healing"]), "m").useSkillId,
    ).toBeUndefined();
  });
});

describe("play-build raises a mantra before it is needed (#1964)", () => {
  const mesmer = (id: string, team: number, spawn: Vec2, skillBar: string[]) =>
    ({
      id,
      team,
      skillBar,
      attributeRanks: new Map([["mesmer.inspiration-magic", 12]]),
      equipment: unarmedResolvedEquipment(60),
      maxEnergy: 60,
      spawn,
      facing: 0,
      behaviour: team === 0 ? BOT : undefined,
    }) satisfies ParticipantSpec;

  it("Mantra of Flame against a foe in reach whose skills burn, not one whose skills freeze", () => {
    const bar = ["mesmer.mantra-of-flame"];
    const burning = match([
      mesmer("m", 0, vec2(0, 0), bar),
      mesmer("e", 1, vec2(300, 0), ["elementalist.fireball", "elementalist.flare"]),
    ]);
    expect(askBot(burning, "m")).toMatchObject({ useSkillId: "mesmer.mantra-of-flame" });
    const freezing = match([
      mesmer("m", 0, vec2(0, 0), bar),
      mesmer("e", 1, vec2(300, 0), ["elementalist.ice-spikes"]),
    ]);
    expect(askBot(freezing, "m").useSkillId).toBeUndefined();
  });

  it("Mantra of Concentration with a long cast on its bar and an interrupter in reach", () => {
    const bar = ["mesmer.mantra-of-concentration", "elementalist.kinetic-armor"];
    const threatened = match([
      mesmer("m", 0, vec2(0, 0), bar),
      mesmer("e", 1, vec2(300, 0), ["mesmer.power-spike"]),
    ]);
    expect(askBot(threatened, "m")).toMatchObject({
      useSkillId: "mesmer.mantra-of-concentration",
    });
    const safe = match([
      mesmer("m", 0, vec2(0, 0), bar),
      mesmer("e", 1, vec2(300, 0), ["elementalist.flare"]),
    ]);
    expect(askBot(safe, "m").useSkillId).not.toBe("mesmer.mantra-of-concentration");
  });

  it("aims no interrupt at a foe whose guard would stop it", () => {
    const sim = match([
      fighter("ranger", 0, RANGER, vec2(400, 400), {
        behaviour: undefined,
        skillBar: ["mesmer.power-drain"],
      }),
      fighter("foe", 1, ELEMENTALIST, vec2(700, 400), { behaviour: undefined }),
    ]);
    sim.get("foe")?.combatant.statuses.apply("mantra-of-concentration", 31, "foe", NO_RANKS);
    sim.setTarget("foe", "ranger");
    sim.requestSkill("foe", slotOf(ELEMENTALIST, "elementalist.chain-lightning"));
    expect(sim.get("foe")?.combatant.cast.activeCast?.remainingSeconds).toBe(2);
    expect(askBot(sim, "ranger").useSkillId).toBeUndefined();
  });
});
