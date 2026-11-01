import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { segment, type Segment } from "../geometry.js";
import { buildNavGraph, createPathFinder } from "../pathing.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, ZERO, type Vec2 } from "../vec2.js";
import { createCursor, decide, type Behaviour } from "./behaviour.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type CompanionMode, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
/** How far one tick of movement carries anyone. */
const STEP = RULES.movement.maxSpeedUnitsPerSecond * DT;

function spec(id: string, team: number, spawn: Vec2, behaviour?: Behaviour): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [FIREBALL],
    attributeRanks: new Map([["elementalist.fire-magic", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    behaviour,
  };
}

function castLoop(extra: Partial<Extract<Behaviour, { kind: "cast-loop" }>> = {}): Behaviour {
  return {
    kind: "cast-loop",
    skillIds: [FIREBALL],
    targeting: { kind: "nearest-enemy" },
    gapSeconds: 0,
    firstLegal: true,
    ...extra,
  };
}

function at(sim: MatchSimulation, id: string): Vec2 {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.position;
}

function run(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

describe("idle", () => {
  it("stands still and does nothing", () => {
    const sim = new MatchSimulation({
      seed: "idle",
      participants: [spec("dummy", 1, vec2(0, 0), { kind: "idle" }), spec("p", 0, vec2(200, 0))],
    });
    expect(run(sim, 5)).toEqual([]);
    expect(sim.get("dummy")?.position).toEqual(vec2(0, 0));
  });
});

describe("cast-loop", () => {
  it("casts at the nearest living enemy, through the same rules a player obeys", () => {
    const sim = new MatchSimulation({
      seed: "loop",
      participants: [
        spec("dummy", 1, vec2(0, 0), castLoop()),
        spec("far", 0, vec2(400, 0)),
        spec("near", 0, vec2(150, 0)),
      ],
    });
    const casts = run(sim, 10).filter((entry) => entry.cause === "skill");
    // Fireball recharges in 7 s: one cast at t=0, released at 1 s, and the
    // next at 7 s, released at 8 s. Each lands 150 units on, 0.4 s after
    // its release (#535), and only the landing does damage.
    const used = { kind: "skill-used", casterId: "dummy", skillId: FIREBALL, targetId: "near" };
    expect(casts.map((entry) => [entry.sourceId, entry.events[0]])).toEqual([
      ["dummy", used],
      ["dummy", { kind: "damage", targetId: "near", amount: 91, critical: false }],
      ["dummy", used],
      ["dummy", { kind: "damage", targetId: "near", amount: 91, critical: false }],
    ]);
  });

  it("obeys canActivate: a dummy with no energy casts nothing", () => {
    const sim = new MatchSimulation({
      seed: "broke",
      participants: [spec("dummy", 1, vec2(0, 0), castLoop()), spec("p", 0, vec2(150, 0))],
    });
    const dummy = sim.get("dummy");
    if (dummy === undefined) {
      throw new Error("no dummy");
    }
    dummy.combatant.energy = 0;
    expect(run(sim, 10)).toEqual([]);
    expect(dummy.combatant.cast.isCasting).toBe(false);
  });

  // Troll Unguent: 3 s to cast, 10 s recharge. Fireball: 1 s, 7 s. The
  // first cast begins at the end of tick 1, t=0.05; sixty 0.05 s ticks
  // leave a floating-point sliver of it, so it lands one tick later, at 3.1.
  const inOrder = (gapSeconds: number): (string | number | undefined)[][] => {
    const troll = "ranger.troll-unguent";
    const sim = new MatchSimulation({
      seed: "order",
      participants: [
        {
          ...spec(
            "dummy",
            1,
            vec2(0, 0),
            castLoop({ skillIds: [troll, FIREBALL], firstLegal: false, gapSeconds }),
          ),
          skillBar: [troll, FIREBALL],
        },
        spec("p", 0, vec2(150, 0)),
      ],
    });
    return run(sim, 8)
      .filter((entry) => entry.cause === "skill")
      .map((entry) => [entry.skillId, Math.round(entry.atSeconds * 100) / 100]);
  };

  it("takes skills in order without firstLegal, the next one queued for the end of the aftercast", () => {
    // Troll Unguent resolves at 3.1; its 0.75 s aftercast (#317) holds
    // Fireball's 1 s cast back until 3.85. The Fireball lands 150 units
    // on, 0.4 s after its release (#535).
    expect(inOrder(0)).toEqual([
      ["ranger.troll-unguent", 3.1],
      [FIREBALL, 4.85],
      [FIREBALL, 5.25],
    ]);
  });

  it("waits gapSeconds from the start of one cast to the start of the next", () => {
    expect(inOrder(5)).toEqual([
      ["ranger.troll-unguent", 3.1],
      [FIREBALL, 6.1],
      [FIREBALL, 6.5],
    ]);
  });
});

describe("a dummy obeys line of sight", () => {
  it("casts nothing at a target behind a wall", () => {
    const sim = new MatchSimulation({
      seed: "wall",
      walls: [segment(vec2(100, -500), vec2(100, 500))],
      participants: [spec("dummy", 1, vec2(0, 0), castLoop()), spec("p", 0, vec2(200, 0))],
    });
    expect(run(sim, 5)).toEqual([]);
    expect(sim.get("dummy")?.combatant.energy).toBe(sim.get("dummy")?.combatant.maxEnergy);
  });
});

describe("patrol", () => {
  const square = [vec2(100, 0), vec2(100, 100), vec2(0, 100)];

  /** Which waypoint the patroller is on, each time it changes. */
  const visits = (loop: boolean, seconds: number): number[] => {
    const sim = new MatchSimulation({
      seed: "patrol",
      participants: [spec("dummy", 1, vec2(0, 0), { kind: "patrol", waypoints: square, loop })],
    });
    const seen: number[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      sim.step(DT);
      const here = square.findIndex((point) => distance(point, at(sim, "dummy")) <= STEP);
      if (here !== -1 && seen.at(-1) !== here) {
        seen.push(here);
      }
    }
    return seen;
  };

  it("walks its waypoints in order, and stops at the last without loop", () => {
    expect(visits(false, 10)).toEqual([0, 1, 2]);
  });

  it("starts over from the first with loop", () => {
    expect(visits(true, 10).slice(0, 5)).toEqual([0, 1, 2, 0, 1]);
  });
});

describe("chase", () => {
  it("walks to the target and stops at standOffUnits", () => {
    const sim = new MatchSimulation({
      seed: "chase",
      participants: [
        spec("dummy", 1, vec2(0, 0), {
          kind: "chase",
          targeting: { kind: "nearest-enemy" },
          standOffUnits: 100,
        }),
        spec("p", 0, vec2(500, 0)),
      ],
    });
    run(sim, 5);
    const gap = distance(at(sim, "dummy"), at(sim, "p"));
    expect(gap).toBeGreaterThanOrEqual(100);
    expect(gap).toBeLessThanOrEqual(100 + STEP);
    expect(sim.get("dummy")?.targetId).toBe("p");
  });

  it("plans with the step it really takes: a crippled chaser stops within half a step", () => {
    const sim = new MatchSimulation({
      seed: "chase",
      participants: [
        spec("dummy", 1, vec2(0, 0), {
          kind: "chase",
          targeting: { kind: "nearest-enemy" },
          standOffUnits: 100,
        }),
        spec("p", 0, vec2(500, 0)),
      ],
    });
    sim.get("dummy")?.combatant.statuses.apply("crippled", 30, "p", NO_RANKS);
    run(sim, 8);
    const gap = distance(at(sim, "dummy"), at(sim, "p"));
    expect(gap).toBeGreaterThanOrEqual(100);
    expect(gap).toBeLessThanOrEqual(100 + STEP / 2);
  });
});

describe("keep-away", () => {
  it("backs off to distanceUnits, and holds there", () => {
    const sim = new MatchSimulation({
      seed: "keep-away",
      participants: [
        spec("dummy", 1, vec2(50, 0), {
          kind: "keep-away",
          targeting: { kind: "nearest-enemy" },
          distanceUnits: 300,
        }),
        spec("p", 0, vec2(0, 0)),
      ],
    });
    run(sim, 3);
    const held = at(sim, "dummy");
    expect(distance(held, at(sim, "p"))).toBeGreaterThan(300 - STEP);
    expect(distance(held, at(sim, "p"))).toBeLessThan(300);
    run(sim, 2);
    expect(at(sim, "dummy")).toEqual(held);
  });
});

describe("apply-status-cadence", () => {
  it("applies the status with itself as source, again every everySeconds", () => {
    const sim = new MatchSimulation({
      seed: "cadence",
      participants: [
        spec("dummy", 1, vec2(0, 0), {
          kind: "apply-status-cadence",
          statusId: "bleeding",
          durationSeconds: 2,
          everySeconds: 5,
          targeting: { kind: "fixed", participantId: "ally" },
        }),
        spec("ally", 1, vec2(100, 0)),
      ],
    });
    const log = run(sim, 11);
    const bled = log.filter((entry) => entry.cause === "degeneration");
    expect(new Set(bled.map((entry) => entry.sourceId))).toEqual(new Set(["dummy"]));
    // Applied at 0, 5 and 10 s for 2 s each: bleeding in three windows.
    const windows = new Set(bled.map((entry) => Math.floor(entry.atSeconds / 5)));
    expect(windows).toEqual(new Set([0, 1, 2]));
    expect(bled.every((entry) => entry.atSeconds % 5 <= 2.05)).toBe(true);
  });
});

describe("parallel", () => {
  it("chases and casts at once", () => {
    const sim = new MatchSimulation({
      seed: "parallel",
      participants: [
        spec("dummy", 1, vec2(0, 0), {
          kind: "parallel",
          behaviours: [
            { kind: "chase", targeting: { kind: "nearest-enemy" }, standOffUnits: 100 },
            castLoop(),
          ],
        }),
        spec("p", 0, vec2(800, 0)),
      ],
    });
    const log = run(sim, 8);
    expect(distance(at(sim, "dummy"), at(sim, "p"))).toBeLessThanOrEqual(100 + STEP);
    expect(log.some((entry) => entry.cause === "skill" && entry.sourceId === "dummy")).toBe(true);
  });
});

describe("auto-attack", () => {
  it("keeps at the target it is attacking though another foe is nearer (#1046)", () => {
    const sim = new MatchSimulation({
      seed: "auto-attack",
      participants: [
        spec("dummy", 0, vec2(0, 0)),
        spec("first", 1, vec2(300, 0)),
        spec("nearer", 1, vec2(-100, 0)),
      ],
    });
    sim.requestAttack("dummy", "first");
    const self = sim.get("dummy");
    if (self === undefined) {
      throw new Error("no dummy");
    }
    const intent = decide(
      { kind: "auto-attack", targeting: { kind: "nearest-enemy" }, reach: undefined },
      createCursor(),
      {
        self,
        participants: [...sim.participants()],
        dt: DT,
        stepUnits: STEP,
        check: () => ({ ok: false, reason: "skill-not-on-bar" }),
        isBot: () => false,
        calledTargetId: undefined,
        sees: () => true,
      },
    );
    expect(intent.attackTargetId).toBe("first");
  });
});

describe("follow-and-attack (#467)", () => {
  const FOLLOW: Behaviour = {
    kind: "follow-and-attack",
    drawnTo: undefined,
    engage: "owner-target-then-nearest",
    aggroUnits: 350,
    leashUnits: 420,
    heelUnits: 109,
  };

  /** A minion of `owner`'s at `here`, driven by nobody, so a test can ask it. */
  function minion(here: Vec2, owner = "owner"): ParticipantSpec {
    return {
      ...spec("minion", 0, here),
      creature: {
        ownerId: owner,
        kind: "minion",
        look: "bone-minion",
        name: "Bone Minion",
        expiresInSeconds: Number.POSITIVE_INFINITY,
        ageSeconds: 0,
        summonedAtTick: 0,
        skillId: "necromancer.animate-bone-minions",
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
    };
  }

  function ask(sim: MatchSimulation, cursor = createCursor(), behaviour = FOLLOW) {
    const self = sim.get("minion");
    if (self === undefined) {
      throw new Error("no minion");
    }
    return decide(behaviour, cursor, {
      self,
      participants: [...sim.participants()],
      dt: DT,
      stepUnits: STEP,
      check: () => ({ ok: false, reason: "skill-not-on-bar" }),
      isBot: () => false,
      calledTargetId: undefined,
      sees: () => true,
    });
  }

  function world(...participants: ParticipantSpec[]): MatchSimulation {
    return new MatchSimulation({ seed: "follow", participants });
  }

  it("stands still beside its owner with no foe about", () => {
    const sim = world(spec("owner", 0, vec2(0, 0)), minion(vec2(50, 0)));
    expect(ask(sim)).toMatchObject({
      moveDirection: ZERO,
      moveTo: undefined,
      attackTargetId: undefined,
    });
  });

  it("walks to an owner 200 away and stops a step short of 109", () => {
    const sim = world(spec("owner", 0, vec2(0, 0)), { ...minion(vec2(200, 0)), behaviour: FOLLOW });
    // By path, round anything in the way (#1153), not straight.
    expect(ask(sim)).toMatchObject({ moveDirection: ZERO, moveTo: vec2(0, 0) });
    run(sim, 2);
    const d = distance(at(sim, "minion"), at(sim, "owner"));
    expect(d).toBeLessThanOrEqual(109 + STEP);
    expect(d).toBeGreaterThan(109);
  });

  it("attacks the nearest foe within 350 of itself, and none at 351", () => {
    const near = world(
      spec("owner", 0, vec2(0, 0)),
      minion(vec2(0, 0)),
      spec("far", 1, vec2(0, 340)),
      spec("foe", 1, vec2(0, -300)),
    );
    expect(ask(near)).toMatchObject({ targetId: "foe", attackTargetId: "foe" });
    const out = world(
      spec("owner", 0, vec2(0, 0)),
      minion(vec2(0, 0)),
      spec("foe", 1, vec2(351, 0)),
    );
    expect(ask(out).attackTargetId).toBeUndefined();
  });

  it("keeps at the foe it is attacking though another comes nearer", () => {
    const sim = world(
      spec("owner", 0, vec2(0, 0)),
      minion(vec2(0, 0)),
      spec("first", 1, vec2(300, 0)),
      spec("nearer", 1, vec2(-100, 0)),
    );
    sim.requestAttack("minion", "first");
    expect(ask(sim)).toMatchObject({ targetId: "first", attackTargetId: "first" });
  });

  it("walks back past 420 from its owner, fighting nobody until within 109", () => {
    const sim = world(
      spec("owner", 0, vec2(0, 0)),
      minion(vec2(430, 0)),
      spec("foe", 1, vec2(450, 0)),
    );
    const cursor = createCursor();
    expect(ask(sim, cursor)).toMatchObject({
      moveDirection: ZERO,
      moveTo: vec2(0, 0),
      attackTargetId: undefined,
    });
    expect(cursor.returning).toBe(true);
  });

  it("still returning at 200, it walks on; at heel it fights again", () => {
    const sim = world(
      spec("owner", 0, vec2(0, 0)),
      minion(vec2(200, 0)),
      spec("foe", 1, vec2(300, 0)),
    );
    const cursor = { ...createCursor(), returning: true };
    expect(ask(sim, cursor)).toMatchObject({
      moveDirection: ZERO,
      moveTo: vec2(0, 0),
      attackTargetId: undefined,
    });
    const heel = world(
      spec("owner", 0, vec2(0, 0)),
      minion(vec2(100, 0)),
      spec("foe", 1, vec2(300, 0)),
    );
    const back = { ...createCursor(), returning: true };
    expect(ask(heel, back)).toMatchObject({ attackTargetId: "foe" });
    expect(back.returning).toBe(false);
  });

  it("keeps to its owner's body when the owner is dead", () => {
    const sim = world(spec("owner", 0, vec2(0, 0)), minion(vec2(0, 200)));
    const owner = sim.get("owner");
    if (owner === undefined) {
      throw new Error("no owner");
    }
    owner.combatant.dead = true;
    expect(ask(sim).moveTo).toEqual(vec2(0, 0));
  });

  describe("walking back round walls (#1153)", () => {
    const BOUNDS = { width: 960, height: 640 };

    /** A rectangle's four sides, as a map's rect wall becomes. */
    function rect(x: number, y: number, width: number, height: number): Segment[] {
      const a = vec2(x, y);
      const b = vec2(x + width, y);
      const c = vec2(x + width, y + height);
      const d = vec2(x, y + height);
      return [segment(a, b), segment(b, c), segment(c, d), segment(d, a)];
    }

    /** The owner at (200, 320), its minion 500 off, past the leash, at (700, 320). */
    function walled(walls: readonly Segment[]): MatchSimulation {
      return new MatchSimulation({
        seed: "follow-walls",
        walls,
        bounds: BOUNDS,
        participants: [
          spec("owner", 0, vec2(200, 320)),
          { ...minion(vec2(700, 320)), behaviour: FOLLOW },
        ],
      });
    }

    it("walks round a wall between it and its owner, to heel", () => {
      // Square across the straight line, which only pushes into it.
      const walls = rect(440, 120, 24, 400);
      const path = createPathFinder(
        buildNavGraph(walls, BOUNDS, RULES.collision.playerRadius),
      ).find(vec2(700, 320), vec2(200, 320));
      if (path === undefined) {
        throw new Error("no way round");
      }
      let length = 0;
      let from = vec2(700, 320);
      for (const point of path) {
        length += distance(from, point);
        from = point;
      }
      const sim = walled(walls);

      run(sim, length / RULES.movement.maxSpeedUnitsPerSecond + 1);

      expect(distance(at(sim, "minion"), at(sim, "owner"))).toBeLessThanOrEqual(109 + STEP);
    });

    it("stands still, without jitter, with no way to its owner", () => {
      // A closed room round the owner, of four walls.
      const sim = walled([
        ...rect(100, 200, 240, 20),
        ...rect(100, 420, 240, 20),
        ...rect(100, 200, 20, 240),
        ...rect(320, 200, 20, 240),
      ]);

      for (let i = 0; i < 2 / DT; i += 1) {
        sim.step(DT);
        expect(at(sim, "minion")).toEqual(vec2(700, 320));
      }
    });
  });

  describe("assisting its master, as a minion (#1118)", () => {
    it("attacks its master's foe 400 from the master and 380 from itself, not one 430 off", () => {
      const sim = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(20, 0)),
        spec("foe", 1, vec2(400, 0)),
      );
      sim.requestAttack("owner", "foe");
      expect(ask(sim)).toMatchObject({ targetId: "foe", attackTargetId: "foe" });
      const far = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(50, 0)),
        spec("foe", 1, vec2(430, 0)),
      );
      far.requestAttack("owner", "foe");
      expect(ask(far).attackTargetId).toBeUndefined();
    });

    it("with its master attacking nobody, attacks a foe 300 from itself", () => {
      const sim = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(0, 0)),
        spec("foe", 1, vec2(0, 300)),
      );
      expect(ask(sim)).toMatchObject({ targetId: "foe", attackTargetId: "foe" });
    });

    it("stays on its foe when its master switches, and takes the master's once it dies", () => {
      const sim = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(0, 0)),
        spec("x", 1, vec2(50, 0)),
        spec("y", 1, vec2(-50, 0)),
      );
      sim.requestAttack("minion", "x");
      sim.requestAttack("owner", "y");
      expect(ask(sim)).toMatchObject({ targetId: "x", attackTargetId: "x" });
      const x = sim.get("x");
      if (x === undefined) {
        throw new Error("no x");
      }
      x.combatant.dead = true;
      sim.step(DT);
      expect(ask(sim)).toMatchObject({ targetId: "y", attackTargetId: "y" });
    });

    it("does not assist a spell cast at a foe", () => {
      const sim = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(20, 0)),
        spec("foe", 1, vec2(400, 0)),
      );
      sim.setTarget("owner", "foe");
      expect(sim.requestSkill("owner", 0)?.check).toEqual({ ok: true });
      expect(sim.get("owner")?.combatant.attack).toBeUndefined();
      expect(ask(sim).attackTargetId).toBeUndefined();
    });
  });

  describe("engaging its owner's target, as a pet (#1046)", () => {
    const PET: Behaviour = {
      kind: "follow-and-attack",
      drawnTo: undefined,
      engage: "owner-target",
      aggroUnits: 700,
      leashUnits: 700,
      heelUnits: 109,
    };
    const askPet = (sim: MatchSimulation, cursor = createCursor()) => ask(sim, cursor, PET);

    it("follows to heel while its owner attacks nobody, a foe beside it or not", () => {
      const sim = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(200, 0)),
        spec("foe", 1, vec2(220, 0)),
      );
      expect(askPet(sim)).toMatchObject({
        moveDirection: ZERO,
        moveTo: vec2(0, 0),
        attackTargetId: undefined,
      });
    });

    it("goes for its owner's foe within 700 of itself, and not one at 701", () => {
      const sim = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(0, 0)),
        spec("foe", 1, vec2(700, 0)),
      );
      sim.requestAttack("owner", "foe");
      expect(askPet(sim)).toMatchObject({ targetId: "foe", attackTargetId: "foe" });
      const out = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(0, 0)),
        spec("foe", 1, vec2(701, 0)),
      );
      out.requestAttack("owner", "foe");
      expect(askPet(out).attackTargetId).toBeUndefined();
    });

    it("switches from its own foe to the one its owner switched to", () => {
      const sim = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(0, 0)),
        spec("x", 1, vec2(50, 0)),
        spec("y", 1, vec2(-50, 0)),
      );
      sim.requestAttack("minion", "x");
      sim.requestAttack("owner", "y");
      expect(askPet(sim)).toMatchObject({ targetId: "y", attackTargetId: "y" });
    });

    it("with its owner dead, keeps at its foe and picks no new one", () => {
      const sim = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(0, 0)),
        spec("x", 1, vec2(50, 0)),
        spec("y", 1, vec2(-50, 0)),
      );
      sim.requestAttack("minion", "x");
      sim.requestAttack("owner", "y");
      const owner = sim.get("owner");
      if (owner === undefined) {
        throw new Error("no owner");
      }
      owner.combatant.dead = true;
      expect(askPet(sim)).toMatchObject({ attackTargetId: "x" });
      const idle = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(0, 0)),
        spec("x", 1, vec2(50, 0)),
      );
      idle.requestAttack("owner", "x");
      const dead = idle.get("owner");
      if (dead === undefined) {
        throw new Error("no owner");
      }
      dead.combatant.dead = true;
      expect(askPet(idle).attackTargetId).toBeUndefined();
    });

    /** `sim`'s pet, told `mode` (#1110). */
    function order(sim: MatchSimulation, mode: CompanionMode): void {
      const creature = sim.get("minion")?.creature;
      if (creature === undefined) {
        throw new Error("no pet");
      }
      creature.mode = mode;
    }

    it("on Fight, goes for its owner's selection, not its owner's attack (#1110)", () => {
      const sim = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(0, 0)),
        spec("x", 1, vec2(50, 0)),
        spec("y", 1, vec2(-50, 0)),
      );
      order(sim, "fight");
      sim.setTarget("owner", "x");
      expect(askPet(sim)).toMatchObject({ targetId: "x", attackTargetId: "x" });
      sim.requestAttack("owner", "y");
      sim.setTarget("owner", "x");
      expect(askPet(sim)).toMatchObject({ targetId: "x", attackTargetId: "x" });
    });

    it("on Fight, keeps its own foe with an ally selected (#1110)", () => {
      const sim = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(0, 0)),
        spec("x", 1, vec2(50, 0)),
        spec("ally", 0, vec2(-50, 0)),
      );
      order(sim, "fight");
      sim.requestAttack("minion", "x");
      sim.setTarget("owner", "ally");
      expect(askPet(sim)).toMatchObject({ attackTargetId: "x" });
    });

    it("on Heel, attacks nobody, its owner's foe nor its own, and keeps to heel (#1110)", () => {
      const sim = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(200, 0)),
        spec("x", 1, vec2(220, 0)),
      );
      order(sim, "heel");
      sim.requestAttack("minion", "x");
      sim.requestAttack("owner", "x");
      expect(askPet(sim)).toMatchObject({ moveTo: vec2(0, 0), attackTargetId: undefined });
    });

    it("walks back past 700 from its owner until within 109, ignoring the owner's foe", () => {
      const sim = world(
        spec("owner", 0, vec2(0, 0)),
        minion(vec2(710, 0)),
        spec("foe", 1, vec2(720, 0)),
      );
      sim.requestAttack("owner", "foe");
      const cursor = createCursor();
      expect(askPet(sim, cursor)).toMatchObject({
        moveDirection: ZERO,
        moveTo: vec2(0, 0),
        attackTargetId: undefined,
      });
      expect(cursor.returning).toBe(true);
    });
  });

  it("stands still in a body that is no creature", () => {
    const sim = world(spec("minion", 0, vec2(0, 200)), spec("foe", 1, vec2(0, 250)));
    expect(ask(sim)).toEqual({
      moveDirection: ZERO,
      moveTo: undefined,
      targetId: undefined,
      useSkillId: undefined,
      attackTargetId: undefined,
      applyStatuses: [],
    });
  });
});
