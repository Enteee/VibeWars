import { describe, expect, it } from "vitest";

import { distance, vec2, type Vec2 } from "../../vec2.js";
import { createCursor } from "../behaviour.js";
import { MASTERLESS_TEAM } from "../minions.js";
import type { MatchSimulation, Participant } from "../simulation.js";
import {
  ESCORT_OFFSET,
  ESCORT_ROUTE_SECONDS,
  PLAN_SECONDS,
  escortSpot,
  flankParty,
  flankWaypoint,
  holdPoint,
  teamPlan,
} from "./plan.js";
import type { BotRole } from "./role.js";
import { REGROUP_SPREAD } from "./rules/shared.js";
import { MONK, RANGER, WARRIOR, body, contextFor, fighter, match } from "./rules/test-support.js";

const SEEDS = [1, 42, 0xdead_beef, 20_261_122];
const PHASES = 1000;

/** Team `team`'s plan in each of the first `PHASES` phases under `seed`. */
function plans(seed: number, team: number): string[] {
  return Array.from({ length: PHASES }, (_, phase) =>
    teamPlan(seed, team, phase * PLAN_SECONDS + PLAN_SECONDS / 2, undefined),
  );
}

describe("teamPlan (#3831, #3832)", () => {
  it("gives the same plan for the same seed, team and second", () => {
    expect(plans(7, 1)).toEqual(plans(7, 1));
  });

  it("keeps one plan through a phase", () => {
    for (const seed of SEEDS) {
      for (let phase = 0; phase < 50; phase += 1) {
        const start = teamPlan(seed, 0, phase * PLAN_SECONDS, undefined);
        expect(teamPlan(seed, 0, (phase + 1) * PLAN_SECONDS - 0.01, undefined)).toBe(start);
      }
    }
  });

  it("plays a stalemate's override until its until, then the roll again (#3834)", () => {
    const override = { plan: "flank", until: 50 } as const;
    expect(teamPlan(7, 0, 10, override)).toBe("flank");
    expect(teamPlan(7, 0, 49.99, override)).toBe("flank");
    expect(teamPlan(7, 0, 50, override)).toBe(teamPlan(7, 0, 50, undefined));
    expect(teamPlan(7, 0, 90, override)).toBe(teamPlan(7, 0, 90, undefined));
  });

  it("pushes in phase 0", () => {
    for (const seed of SEEDS) {
      for (const team of [0, 1, 2]) {
        expect(teamPlan(seed, team, 0, undefined)).toBe("push");
        expect(teamPlan(seed, team, PLAN_SECONDS - 0.01, undefined)).toBe("push");
      }
    }
  });

  it("never plays two non-push phases running", () => {
    for (const seed of SEEDS) {
      for (const team of [0, 1]) {
        const each = plans(seed, team);
        for (let phase = 1; phase < PHASES; phase += 1) {
          expect(each[phase - 1] !== "push" && each[phase] !== "push").toBe(false);
        }
      }
    }
  });

  it("holds about 0.3/1.5 of phases and flanks about 0.2/1.5", () => {
    for (const seed of SEEDS) {
      const each = plans(seed, 1);
      const share = (plan: string): number =>
        each.filter((other) => other === plan).length / PHASES;
      expect(share("hold")).toBeGreaterThanOrEqual(0.14);
      expect(share("hold")).toBeLessThanOrEqual(0.3);
      expect(share("flank")).toBeGreaterThanOrEqual(0.08);
      expect(share("flank")).toBeLessThanOrEqual(0.22);
    }
  });

  it("rolls each team on its own", () => {
    expect(plans(42, 0)).not.toEqual(plans(42, 1));
  });
});

/** The ids of team 0 in `sim` that flank in `phase`. */
function party(
  sim: MatchSimulation,
  phase: number,
  isBot = (_id: string): boolean => true,
  isIdle = (_id: string): boolean => false,
) {
  return [...sim.participants()]
    .filter((one) => one.combatant.team === 0)
    .filter((one) => flankParty(contextFor(sim, one.id, { isBot, isIdle }), one, phase))
    .map((one) => one.id);
}

/** A team 0 of `builds`, ids `t0`, `t1`, …, against one foe. */
function team(builds: readonly (typeof WARRIOR)[]): MatchSimulation {
  return match([
    ...builds.map((build, index) =>
      fighter(`t${String(index)}`, 0, build, vec2(100, 100 + index * 80)),
    ),
    fighter("foe", 1, WARRIOR, vec2(1100, 400)),
  ]);
}

describe("flankParty (#3832)", () => {
  it("sends max(1, floor(n/2)) of the team", () => {
    for (const [n, size] of [
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 2],
      [8, 4],
    ] as const) {
      const sim = team(Array.from({ length: n }, () => WARRIOR));
      for (let phase = 1; phase < 20; phase += 1) {
        expect(party(sim, phase), `n ${String(n)}`).toHaveLength(size);
      }
    }
  });

  it("sends nobody on a team of one", () => {
    expect(party(team([WARRIOR]), 1)).toEqual([]);
  });

  it("sends nobody on a team with an active human (#3833)", () => {
    const sim = team([WARRIOR, WARRIOR, WARRIOR, WARRIOR]);
    expect(party(sim, 1, (id) => id !== "t2")).toEqual([]);
  });

  it("sends half the bots, never the human, on a team whose human is idle (#3833)", () => {
    const sim = team([WARRIOR, WARRIOR, WARRIOR, WARRIOR, WARRIOR]);
    const human = (id: string): boolean => id === "t2";
    for (let phase = 1; phase < 20; phase += 1) {
      const sent = party(sim, phase, (id) => !human(id), human);
      expect(sent).toHaveLength(2);
      expect(sent).not.toContain("t2");
    }
  });

  it("rolls who flanks per phase", () => {
    const sim = team([WARRIOR, WARRIOR, WARRIOR, WARRIOR]);
    const parties = new Set(Array.from({ length: 20 }, (_, phase) => party(sim, phase + 1).join()));
    expect(parties.size).toBeGreaterThan(1);
  });

  it("chooses no healer while a non-healer is left", () => {
    const two = team([MONK, WARRIOR, MONK, WARRIOR]);
    const one = team([MONK, MONK, WARRIOR, MONK]);
    for (let phase = 1; phase < 50; phase += 1) {
      expect(party(two, phase).sort()).toEqual(["t1", "t3"]);
      expect(party(one, phase)).toContain("t2");
    }
  });
});

describe("flankWaypoint (#3832)", () => {
  // Team 0 starts round (100,500), team 1 round (1100,500): 60% of the
  // way is (700,500), 35% of the 1000 between them off to either side.
  const sim = match([
    fighter("bot", 0, WARRIOR, vec2(100, 400)),
    fighter("mate", 0, WARRIOR, vec2(100, 600)),
    fighter("foe", 1, WARRIOR, vec2(1100, 500)),
  ]);
  const sides = [vec2(700, 850), vec2(700, 150)];
  const self = (): Participant => {
    const found = sim.get("bot");
    if (found === undefined) throw new Error("no bot");
    return found;
  };
  /** The waypoint with no route within 1 of `blocked`. */
  const waypoint = (now: number, ...blocked: Vec2[]) =>
    flankWaypoint(
      contextFor(sim, "bot", {
        now,
        routeLength: (to) =>
          blocked.some((point) => distance(point, to) < 1) ? Number.POSITIVE_INFINITY : 1,
      }),
      self(),
      1,
    );

  it("swings 35% of the spawns' distance off the line, 60% of the way", () => {
    const at = waypoint(50);
    expect(sides).toContainEqual(at?.point);
    expect(at?.layer).toBe(0);
  });

  it("rolls the side per phase", () => {
    const seen = new Set(
      Array.from({ length: 20 }, (_, phase) => waypoint((phase + 1) * PLAN_SECONDS)?.point.y),
    );
    expect(seen).toEqual(new Set([150, 850]));
  });

  it("takes the other side where the rolled one has no route, then none", () => {
    const rolled = waypoint(50)?.point ?? vec2(0, 0);
    const other = sides.find((side) => side.y !== rolled.y);
    expect(waypoint(50, rolled)?.point).toEqual(other);
    expect(waypoint(50, ...sides)).toBeUndefined();
  });
});

describe("escortSpot (#3833)", () => {
  // The human `you` at (400,400), the foe east at (1100,400): forward is
  // +x, and the bots w, r, m spread -150, 0, +150 along y.
  const sim = match([
    fighter("you", 0, WARRIOR, vec2(400, 400)),
    fighter("w", 0, WARRIOR, vec2(100, 300)),
    fighter("r", 0, RANGER, vec2(100, 400)),
    fighter("m", 0, MONK, vec2(100, 500)),
    fighter("foe", 1, WARRIOR, vec2(1100, 400)),
  ]);
  const isBot = (id: string): boolean => id !== "you";
  function who(of: MatchSimulation, id: string): Participant {
    const one = of.get(id);
    if (one === undefined) throw new Error(`no ${id}`);
    return one;
  }
  function spot(id: string, role: BotRole, extra: Parameters<typeof contextFor>[2] = {}) {
    return escortSpot(contextFor(sim, id, { isBot, ...extra }), who(sim, id), role, createCursor());
  }

  it("puts a frontliner ahead, a caster beside and a healer behind the human", () => {
    expect(spot("w", "frontline")).toEqual({
      point: vec2(400 + ESCORT_OFFSET.frontline, 250),
      layer: 0,
    });
    expect(spot("r", "ranged")).toEqual({ point: vec2(400, 400), layer: 0 });
    expect(spot("m", "healer")).toEqual({ point: vec2(400 + ESCORT_OFFSET.healer, 550), layer: 0 });
  });

  it("gives the same spot every time", () => {
    expect(spot("w", "frontline")).toEqual(spot("w", "frontline"));
  });

  it("points forward at the first foe team's spawn with no foe in sight", () => {
    expect(spot("w", "frontline", { foeCentroid: undefined })).toEqual(spot("w", "frontline"));
  });

  it("points forward past a masterless creature's team with no foe in sight", () => {
    const loose = body("loose", MASTERLESS_TEAM, vec2(700, 700), {
      creature: {
        ownerId: undefined,
        kind: "minion",
        look: "bone-minion",
        name: "loose",
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
      },
    });
    const wild = match([
      fighter("you", 0, WARRIOR, vec2(400, 400)),
      fighter("w", 0, WARRIOR, vec2(100, 300)),
      fighter("r", 0, RANGER, vec2(100, 400)),
      fighter("m", 0, MONK, vec2(100, 500)),
      fighter("foe", 1, WARRIOR, vec2(1100, 400)),
      loose,
    ]);
    const context = contextFor(wild, "w", { isBot, foeCentroid: undefined });
    expect(escortSpot(context, who(wild, "w"), "frontline", createCursor())).toEqual(
      spot("w", "frontline"),
    );
  });

  it("spreads the bots along x with no foe at all, never onto the human", () => {
    const alone = match([
      fighter("you", 0, WARRIOR, vec2(400, 400)),
      fighter("w", 0, WARRIOR, vec2(100, 300)),
      fighter("m", 0, MONK, vec2(100, 500)),
    ]);
    const at = (id: string) =>
      escortSpot(
        contextFor(alone, id, { isBot, foeCentroid: undefined }),
        who(alone, id),
        "ranged",
        createCursor(),
      )?.point;
    expect(at("w")).toEqual(vec2(400 - REGROUP_SPREAD / 2, 400));
    expect(at("m")).toEqual(vec2(400 + REGROUP_SPREAD / 2, 400));
  });

  it("searches its route once per ESCORT_ROUTE_SECONDS", () => {
    const cursor = createCursor();
    let searches = 0;
    const routeLength = (): number => {
      searches += 1;
      return 1;
    };
    const ask = (now: number) =>
      escortSpot(
        contextFor(sim, "w", { isBot, routeLength, now }),
        who(sim, "w"),
        "frontline",
        cursor,
      );
    ask(0);
    ask(ESCORT_ROUTE_SECONDS / 2);
    expect(searches).toBe(1);
    ask(ESCORT_ROUTE_SECONDS);
    expect(searches).toBe(2);
  });

  it("gives n bots distinct spots within REGROUP_SPREAD/2 of the line", () => {
    for (let n = 1; n <= 7; n += 1) {
      const many = match([
        fighter("you", 0, WARRIOR, vec2(400, 400)),
        ...Array.from({ length: n }, (_, index) =>
          fighter(`b${String(index)}`, 0, RANGER, vec2(100, 100 + index * 80)),
        ),
        fighter("foe", 1, WARRIOR, vec2(1100, 400)),
      ]);
      const spots = Array.from({ length: n }, (_, index) => {
        const id = `b${String(index)}`;
        return escortSpot(contextFor(many, id, { isBot }), who(many, id), "ranged", createCursor())
          ?.point;
      });
      expect(new Set(spots.map((at) => `${String(at?.x)},${String(at?.y)}`)).size).toBe(n);
      for (const at of spots) {
        expect(Math.abs((at?.y ?? Number.NaN) - 400)).toBeLessThanOrEqual(REGROUP_SPREAD / 2);
      }
    }
  });

  it("has no spot with the human idle or dead, or with no route there", () => {
    expect(spot("w", "frontline", { isIdle: (id) => id === "you" })).toBeUndefined();
    expect(spot("w", "frontline", { routeLength: () => Number.POSITIVE_INFINITY })).toBeUndefined();
    const fallen = match([
      fighter("you", 0, WARRIOR, vec2(400, 400)),
      fighter("w", 0, WARRIOR, vec2(100, 300)),
      fighter("foe", 1, WARRIOR, vec2(1100, 400)),
    ]);
    who(fallen, "you").combatant.dead = true;
    expect(
      escortSpot(contextFor(fallen, "w", { isBot }), who(fallen, "w"), "frontline", createCursor()),
    ).toBeUndefined();
  });
});

describe("holdPoint with humans (#3833)", () => {
  const sim = match([
    fighter("you", 0, WARRIOR, vec2(100, 400)),
    fighter("w", 0, WARRIOR, vec2(100, 600)),
    fighter("foe", 1, WARRIOR, vec2(1100, 400)),
  ]);
  const self = sim.get("w");
  if (self === undefined) throw new Error("no w");
  const isBot = (id: string): boolean => id !== "you";

  it("has a hold point on a team whose only human is idle", () => {
    const idle = contextFor(sim, "w", { isBot, isIdle: (id) => id === "you" });
    expect(holdPoint(idle, self, 1)).toBeDefined();
  });

  it("has none on a team with an active human", () => {
    expect(holdPoint(contextFor(sim, "w", { isBot }), self, 1)).toBeUndefined();
  });
});
