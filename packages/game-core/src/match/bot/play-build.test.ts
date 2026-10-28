import { describe, expect, it, vi } from "vitest";

import type { PlayerBuild } from "../../build.js";
import { resolveLoadout } from "../../equipment/resolve.js";
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
