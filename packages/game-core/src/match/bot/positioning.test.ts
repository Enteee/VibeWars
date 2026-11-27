import { describe, expect, it, vi } from "vitest";

import { SKILL_BAR_SLOTS, type PlayerBuild } from "../../build.js";
import { distance, dot, length, sub, vec2, type Vec2 } from "../../vec2.js";
import { NO_RANKS } from "../../skills/status.js";
import type { MatchSimulation } from "../simulation.js";
import fallBack from "./rules/fall-back.js";
import { ELBOW_DISTANCE, FALL_BACK_NEAR } from "./rules/shared.js";
import { DT, ELEMENTALIST, MONK, RANGER, WARRIOR, fighter, match } from "./rules/test-support.js";

const RANGED = ["e0", "r0", "e1", "r1"];
const SECONDS = 20;
/** How often a bot thinks. */
const THINK = 0.25;

/** 4v4 (#2545): `lead`, two ranged bots and a healer a side. */
function fight(lead: PlayerBuild, seed: string): MatchSimulation {
  const side = (team: number, x: number) => [
    fighter(`w${String(team)}`, team, lead, vec2(x, 400)),
    fighter(`e${String(team)}`, team, ELEMENTALIST, vec2(x, 300)),
    fighter(`r${String(team)}`, team, RANGER, vec2(x, 500)),
    fighter(`m${String(team)}`, team, MONK, vec2(x, 600)),
  ];
  return match([...side(0, 200), ...side(1, 1400)], seed);
}

const fighters = (sim: MatchSimulation, team: number) =>
  [...sim.participants()].filter(
    (body) => body.combatant.team === team && !body.combatant.dead && body.creature === undefined,
  );

function centroid(sim: MatchSimulation, team: number): Vec2 {
  const bodies = fighters(sim, team);
  const x = bodies.reduce((sum, { position }) => sum + position.x, 0);
  const y = bodies.reduce((sum, { position }) => sum + position.y, 0);
  return vec2(x / bodies.length, y / bodies.length);
}

/** `lead`'s 4v4 played for `SECONDS`: ticks each ranged bot had no foe at its elbow, and whether each side was hurt. */
function play(lead: PlayerBuild, seed = "positions") {
  const sim = fight(lead, seed);
  const clear = new Map(RANGED.map((id) => [id, 0]));
  const hurt = [false, false];
  let ticks = 0;
  for (let t = 0; t < SECONDS; t += DT) {
    sim.step(DT);
    ticks += 1;
    for (const id of RANGED) {
      const self = sim.get(id);
      if (self === undefined) throw new Error(`no ${id}`);
      const pressed = fighters(sim, 1 - self.combatant.team).some(
        (foe) => distance(foe.position, self.position) <= ELBOW_DISTANCE,
      );
      if (!pressed) clear.set(id, (clear.get(id) ?? 0) + 1);
    }
    for (const team of [0, 1]) {
      if (fighters(sim, team).some(({ combatant }) => combatant.health < combatant.maxHealth)) {
        hurt[team] = true;
      }
    }
  }
  const positions = [...sim.participants()].map(
    ({ id, position }) => `${id}@${String(position.x)},${String(position.y)}`,
  );
  return { sim, clear, hurt, ticks, positions };
}

describe("bots take positions by role (#2545)", () => {
  it("keeps every ranged bot clear of foes most of a fight with no frontline", () => {
    const { clear, ticks } = play(MONK);
    for (const id of RANGED) {
      expect(clear.get(id) ?? 0, id).toBeGreaterThanOrEqual(ticks * 0.5);
    }
  });

  describe("with a frontline a side", () => {
    const { sim, hurt, positions } = play(WARRIOR);

    it("fights rather than stalemates", () => {
      expect(hurt).toEqual([true, true]);
    });

    it("keeps each healer farther from the foes than its frontline", () => {
      for (const team of [0, 1]) {
        const foes = centroid(sim, 1 - team);
        const healer = sim.get(`m${String(team)}`);
        const frontline = sim.get(`w${String(team)}`);
        if (healer === undefined || frontline === undefined) throw new Error("missing");
        expect(distance(healer.position, foes)).toBeGreaterThan(distance(frontline.position, foes));
      }
    });

    it("plays the same fight twice from the same seed", () => {
      expect(play(WARRIOR).positions).toEqual(positions);
    });
  });
});

/**
 * Of the 0.25 s windows a healer bot moved in, across `seeds`' 4v4s of
 * `comp` a side for `SECONDS`, the share that turned it round (#2615):
 * its step and the one before both over 5 units and against each other.
 */
function healerTurns(comp: readonly PlayerBuild[], seeds: string): number {
  let turns = 0;
  let moving = 0;
  for (const seed of seeds) {
    const side = (team: number, x: number) =>
      comp.map((build, i) =>
        fighter(`${String(team)}-${String(i)}`, team, build, vec2(x, 100 + 200 * i)),
      );
    const sim = match([...side(0, 200), ...side(1, 1400)], seed);
    const healers = [...sim.participants()].filter(({ id }) =>
      id.endsWith(`-${String(comp.indexOf(MONK))}`),
    );
    const last = new Map<string, Vec2>();
    const steps = new Map<string, Vec2>();
    let next = THINK;
    for (let t = 0; t < SECONDS; t += DT) {
      sim.step(DT);
      if (t + DT < next) continue;
      next += THINK;
      for (const { id, position, combatant } of healers) {
        const before = last.get(id);
        last.set(id, position);
        const step = before === undefined ? undefined : sub(position, before);
        const previous = steps.get(id);
        if (combatant.dead || step === undefined) {
          steps.delete(id);
          continue;
        }
        steps.set(id, step);
        if (length(step) <= 5) continue;
        moving += 1;
        if (previous !== undefined && length(previous) > 5 && dot(step, previous) < 0) turns += 1;
      }
    }
  }
  return turns / moving;
}

describe("healer bots hold their post (#2615)", () => {
  it.each([
    ["two warriors and an elementalist", [WARRIOR, WARRIOR, ELEMENTALIST, MONK]],
    ["a warrior, a ranger and an elementalist", [WARRIOR, RANGER, ELEMENTALIST, MONK]],
  ])("turns a healer beside %s round in at most 3 of every 100 windows it moves in", (_, comp) => {
    expect(healerTurns(comp, "abcd")).toBeLessThanOrEqual(0.03);
  });

  it("plays the same fight twice from the same seed", () => {
    const comp = [WARRIOR, WARRIOR, ELEMENTALIST, MONK];
    expect(healerTurns(comp, "a")).toBe(healerTurns(comp, "a"));
  });
});

describe("a dived caster falls back to its frontliner (#4151)", () => {
  /**
   * 2v2: team 0 a warrior bot and `build` 300 east of it; team 1 a
   * warrior diving that one and a monk far off, neither of them bots.
   * Over 12 s, when the dived one first stood within `FALL_BACK_NEAR` of
   * its warrior, when that warrior first stood swinging at the diver,
   * and the dived one's health at the end; `off` takes `fall-back` out.
   */
  function dive(build: PlayerBuild, seed: string, off = false) {
    const spy = off ? vi.spyOn(fallBack, "decide").mockReturnValue(undefined) : undefined;
    const sim = match(
      [
        fighter("w0", 0, WARRIOR, vec2(600, 400)),
        fighter("e0", 0, build, vec2(900, 400)),
        fighter("d", 1, WARRIOR, vec2(930, 400), { behaviour: undefined }),
        fighter("x", 1, MONK, vec2(1500, 700), { behaviour: undefined }),
      ],
      seed,
    );
    sim.requestAttack("d", "e0");
    const get = (id: string) => {
      const body = sim.get(id);
      if (body === undefined) throw new Error(`no ${id}`);
      return body;
    };
    const dived = get("e0");
    const warrior = get("w0");
    const diver = get("d");
    let met: number | undefined;
    let peeled: number | undefined;
    for (let at = 0; at < 12; at += DT) {
      sim.step(DT);
      if (met === undefined && distance(dived.position, warrior.position) <= FALL_BACK_NEAR) {
        met = at;
      }
      if (
        peeled === undefined &&
        warrior.targetId === "d" &&
        distance(warrior.position, diver.position) <= ELBOW_DISTANCE
      ) {
        peeled = at;
      }
    }
    spy?.mockRestore();
    return { met, peeled, health: dived.combatant.health };
  }

  it.each([
    ["an elementalist", ELEMENTALIST],
    ["a monk", MONK],
  ])("brings %s's diver to its warrior sooner, and it takes less damage", (_, build) => {
    const seeds = ["a", "b", "c"];
    for (const seed of seeds) {
      const on = dive(build, seed);
      const off = dive(build, seed, true);
      expect(on.met).toBeLessThan(off.met ?? Number.POSITIVE_INFINITY);
      expect(on.peeled).toBeLessThan(off.peeled ?? Number.POSITIVE_INFINITY);
      expect(on.health).toBeGreaterThan(off.health);
    }
  });
});

describe("a ranger kites a slowed diver (#4166)", () => {
  /**
   * 1v1: a ranger bot with only its bow, room to back off west, and a
   * warrior, not a bot, chasing it, Crippled if `crippled`. Over 10 s,
   * how many shots hit the warrior and the share of ticks the ranger
   * stood beyond `ELBOW_DISTANCE` of it. Its skills are left off, as a
   * cast would stand in for the shots being counted.
   */
  function chase(crippled: boolean) {
    const sim = match([
      fighter("r", 0, RANGER, vec2(1200, 400), {
        skillBar: new Array<null>(SKILL_BAR_SLOTS).fill(null),
      }),
      fighter("d", 1, WARRIOR, vec2(1230, 400), { behaviour: undefined, maxHealth: 1e6 }),
    ]);
    const ranger = sim.get("r");
    const diver = sim.get("d");
    if (ranger === undefined || diver === undefined) throw new Error("no fighters");
    if (crippled) {
      diver.combatant.statuses.apply("crippled", 1e6, "r", NO_RANKS);
    }
    sim.requestAttack("d", "r");
    let shots = 0;
    let clear = 0;
    let ticks = 0;
    for (let at = 0; at < 10; at += DT) {
      const before = diver.combatant.health;
      sim.step(DT);
      shots += diver.combatant.health < before ? 1 : 0;
      clear += distance(ranger.position, diver.position) > ELBOW_DISTANCE ? 1 : 0;
      ticks += 1;
    }
    return { shots, clear: clear / ticks };
  }

  it("keeps out of a Crippled warrior's reach most of the time, still shooting", () => {
    const { shots, clear } = chase(true);
    expect(shots).toBeGreaterThanOrEqual(2);
    expect(clear).toBeGreaterThan(0.5);
  });

  it("stands and fights a warrior at its own speed", () => {
    const { shots, clear } = chase(false);
    expect(shots).toBeGreaterThanOrEqual(3);
    expect(clear).toBeLessThanOrEqual(0.5);
  });
});

describe("a bot under Empathy (#4199)", () => {
  /** A warrior bot swinging at a foe that stands still, and a monk bot ready to heal beside it. */
  function arena(): MatchSimulation {
    return match([
      fighter("w", 0, WARRIOR, vec2(400, 400), { skillBar: [] }),
      fighter("m", 0, MONK, vec2(380, 450), { skillBar: ["monk.orison-of-healing"] }),
      fighter("f", 1, WARRIOR, vec2(440, 400), { behaviour: undefined, skillBar: [] }),
    ]);
  }

  /** Steps `sim` until `seconds` have passed. */
  function run(sim: MatchSimulation, seconds: number): void {
    for (let t = 0; t < seconds - DT / 2; t += DT) sim.step(DT);
  }

  it("takes no Empathy damage after its first think, and swings again within a think of its end", () => {
    const sim = arena();
    run(sim, 1);
    const warrior = sim.get("w")?.combatant;
    expect(warrior?.attack?.targetId).toBe("f");
    warrior?.statuses.apply("empathy", 3, "f", NO_RANKS);
    run(sim, 0.3);
    const health = warrior?.health;
    expect(warrior?.attack).toBeUndefined();
    run(sim, 2.6);
    expect(warrior?.health).toBe(health);
    expect(warrior?.attack).toBeUndefined();
    // The hex ends at 3 s; a think comes every 0.25 s.
    run(sim, 0.1 + 0.3);
    expect(warrior?.attack?.targetId).toBe("f");
  });

  it("ends a healer's swing and leaves its heal casting", () => {
    const sim = arena();
    run(sim, 1);
    const monk = sim.get("m")?.combatant;
    expect(monk?.attack?.targetId).toBe("f");
    const ally = sim.get("w")?.combatant;
    if (ally !== undefined) ally.health = 100;
    monk?.statuses.apply("empathy", 10, "f", NO_RANKS);
    run(sim, 0.3);
    expect(monk?.attack).toBeUndefined();
    expect(monk?.cast.activeCast?.skillId).toBe("monk.orison-of-healing");
  });
});
