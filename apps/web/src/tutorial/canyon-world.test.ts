import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  pointInPolygon,
  polygonCentre,
  vec2,
  type MatchSimulation,
  type Vec2,
} from "@vibewars/game-core";
import { pointInShape, shapeVertices } from "@vibewars/game-maps/geometry";
import { describe, expect, it } from "vitest";

import { CANYON_ARRIVAL, TUTORIAL_CANYON } from "./canyon-map.js";
import {
  BAD_GROUND,
  CALL_RATS,
  CLEARING,
  CRACKED_WALL,
  DODGE_MARK,
  JUNCTION,
  LEDGE,
  RAT_AGGRO,
  RAT_POCKET,
  badGroundTutor,
  callTutor,
  canyonWorld,
  clearingTutor,
  ledgeTutor,
  pingTutor,
  pocketStart,
  ratPocket,
  tunnelStart,
  gateStart,
  wallStart,
  wallTutor,
} from "./canyon-world.js";
import { DODGE_REACH } from "./dodge-count.js";
import { createRatWatch, type RatTally, type RatWatch } from "./rat-watch.js";
import { MARK_REACH } from "./stations.js";
import { PLAYER_PROFESSION, SELF_ID, TUTOR_ID, houseBuild } from "./tutorial-world.js";

const TICK = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;

/** One step, its log fed to `watch` as the connection would deliver it. */
const stepWatched = (simulation: MatchSimulation, watch: RatWatch): void => {
  for (const entry of simulation.step(TICK).log) {
    watch.observe({
      casterSessionId: entry.sourceId ?? "",
      cause: entry.cause,
      skillId: entry.skillId ?? "",
      weaponId: entry.weaponId ?? "",
      attributeId: entry.attributeId ?? "",
      doubleStrike: entry.doubleStrike,
      events: entry.events,
    });
  }
};

describe("canyonWorld (#3247)", () => {
  const build = houseBuild(PLAYER_PROFESSION);

  it("holds the pair and the rats of stations 8 and 12, the player on the arrival and the tutor beside", () => {
    const world = canyonWorld("canyon-test", build, build);
    const self = world.simulation.get(SELF_ID);
    const tutor = world.simulation.get(TUTOR_ID);
    expect([...world.simulation.participants()].map(({ id }) => id).sort()).toEqual(
      [
        SELF_ID,
        TUTOR_ID,
        ...RAT_POCKET.rats.map(({ id }) => id),
        ...CALL_RATS.rats.map(({ id }) => id),
      ].sort(),
    );
    expect(self?.position).toEqual(CANYON_ARRIVAL.position);
    expect(self?.layer).toBe(CANYON_ARRIVAL.layer);
    expect(tutor?.layer).toBe(CANYON_ARRIVAL.layer);
    expect(world.map.id).toBe(TUTORIAL_CANYON.id);
    expect(world.zones.filter(({ kind }) => kind === "rockfall").length).toBeGreaterThanOrEqual(3);
  });

  it("starts the pair by station 9's ledge, with station 8's rats slain, for a seeded station 11 (#3383)", () => {
    const world = canyonWorld("canyon-test", build, build, tunnelStart());
    const { simulation } = world;
    for (let elapsed = 0; elapsed < 1; elapsed += TICK) {
      simulation.step(TICK);
    }
    const ids = [...simulation.participants()].map(({ id }) => id);
    expect(ids).toEqual(expect.arrayContaining(CALL_RATS.rats.map(({ id }) => id)));
    for (const { id } of RAT_POCKET.rats) {
      expect(ids).not.toContain(id);
    }
    for (const id of [SELF_ID, TUTOR_ID]) {
      expect(simulation.get(id)?.layer).toBe(LEDGE.lower);
    }
    expect(simulation.get(SELF_ID)?.position).toEqual(LEDGE.foot);
  });

  it("starts the pair on station 4's mark, the wall still whole, for a seeded station 5 (#3383)", () => {
    const { simulation } = canyonWorld("canyon-test", build, build, wallStart());
    expect(simulation.get(SELF_ID)?.position).toEqual(DODGE_MARK.position);
    for (const id of [SELF_ID, TUTOR_ID]) {
      expect(simulation.get(id)?.layer).toBe(DODGE_MARK.layer);
    }
    const wall = simulation.breakables.find(({ id }) => id === CRACKED_WALL.id);
    expect(wall?.health).toBe(CRACKED_WALL.maxHealth);
  });

  it("puts station 4's mark where the player walks to, on the trail past the boulder run", () => {
    const world = canyonWorld("canyon-test", build, build);
    const { simulation } = world;
    const landings = world.zones.filter(({ id }) => id.startsWith("boulder-run-"));
    expect(landings).toHaveLength(3);
    const east = Math.max(...landings.flatMap(({ polygon }) => polygon.map(({ x }) => x)));
    expect(DODGE_MARK.position.x).toBeGreaterThan(east);
    simulation.walkTo(SELF_ID, DODGE_MARK.position, DODGE_MARK.layer);
    for (let elapsed = 0; elapsed < 30; elapsed += TICK) {
      simulation.step(TICK);
    }
    const self = simulation.get(SELF_ID);
    expect(self?.layer).toBe(DODGE_MARK.layer);
    expect(
      Math.hypot(
        (self?.position.x ?? 0) - DODGE_MARK.position.x,
        (self?.position.y ?? 0) - DODGE_MARK.position.y,
      ),
    ).toBeLessThanOrEqual(MARK_REACH);
  });

  it("keeps the mark within the last landing's DODGE_REACH, so a dodge there counts", () => {
    const world = canyonWorld("canyon-test", build, build);
    const last = world.zones.find(({ id }) => id === "boulder-run-3");
    if (last === undefined) {
      throw new Error("no boulder-run-3");
    }
    const centre = polygonCentre(last.polygon);
    const fromCentre = Math.hypot(
      DODGE_MARK.position.x - centre.x,
      DODGE_MARK.position.y - centre.y,
    );
    // Anywhere the player counts as on the mark is in reach, and outside the ring.
    expect(fromCentre + MARK_REACH).toBeLessThan(DODGE_REACH);
    expect(last.polygon.some(({ x }) => x >= DODGE_MARK.position.x - MARK_REACH)).toBe(false);
  });
});

describe("wallTutor (#3302)", () => {
  const build = houseBuild(PLAYER_PROFESSION);
  const wallHealth = (world: ReturnType<typeof canyonWorld>): number | undefined =>
    world.simulation.breakables.find(({ id }) => id === CRACKED_WALL.id)?.health;

  it("waits by the wall until the player's first blow lands, then strikes it too", () => {
    const world = canyonWorld("canyon-test", build, build);
    const { simulation } = world;
    simulation.walkTo(SELF_ID, CRACKED_WALL.face, CRACKED_WALL.layer);
    const tutor = wallTutor(simulation);
    for (let elapsed = 0; elapsed < 40; elapsed += TICK) {
      simulation.step(TICK);
      tutor.step();
    }
    expect(wallHealth(world)).toBe(CRACKED_WALL.maxHealth);
    expect(simulation.get(TUTOR_ID)?.combatant.attack).toBeUndefined();

    expect(simulation.setTarget(SELF_ID, CRACKED_WALL.targetId)).toBe(true);
    expect(simulation.requestAttack(SELF_ID, CRACKED_WALL.targetId)?.ok).toBe(true);
    let struckAt: number | undefined;
    let elapsed = 0;
    for (; elapsed < 60 && (wallHealth(world) ?? 0) > 0; elapsed += TICK) {
      simulation.step(TICK);
      tutor.step();
      if (struckAt === undefined && (wallHealth(world) ?? 0) < CRACKED_WALL.maxHealth) {
        struckAt = elapsed;
        expect(simulation.get(TUTOR_ID)?.combatant.attack?.targetId).toBe(CRACKED_WALL.targetId);
      }
    }
    expect(wallHealth(world)).toBe(0);
  });
});

describe("clearingTutor (#3303)", () => {
  const build = houseBuild(PLAYER_PROFESSION);

  it("stays in the rockfall until half its health is gone, then bleeds east of it until healed", () => {
    const world = canyonWorld("canyon-test", build, build);
    const { simulation } = world;
    const rockfall = world.zones.find(({ id }) => id === CLEARING.zoneId);
    if (rockfall === undefined) {
      throw new Error(`no ${CLEARING.zoneId}`);
    }
    expect(pointInPolygon(CLEARING.centre, rockfall.polygon)).toBe(true);
    expect(pointInPolygon(CLEARING.east, rockfall.polygon)).toBe(false);
    // The wall down first, as station 5 leaves it.
    simulation.walkTo(SELF_ID, CRACKED_WALL.face, CRACKED_WALL.layer);
    simulation.walkTo(TUTOR_ID, CRACKED_WALL.besideFace, CRACKED_WALL.layer);
    let elapsed = 0;
    const wallHealth = (): number =>
      simulation.breakables.find(({ id }) => id === CRACKED_WALL.id)?.health ?? 0;
    for (; elapsed < 120 && wallHealth() > 0; elapsed += TICK) {
      simulation.step(TICK);
      simulation.requestAttack(SELF_ID, CRACKED_WALL.targetId);
      simulation.requestAttack(TUTOR_ID, CRACKED_WALL.targetId);
    }
    expect(wallHealth()).toBe(0);

    const tutor = clearingTutor(simulation);
    const body = () => {
      const found = simulation.get(TUTOR_ID);
      if (found === undefined) {
        throw new Error("no tutor");
      }
      return found;
    };
    const fraction = (): number => body().combatant.health / body().combatant.maxHealth;
    const bleeding = (): boolean =>
      body().combatant.statuses.active.some(({ id }) => id === "bleeding");
    const fromCentre = (): number =>
      Math.hypot(body().position.x - CLEARING.centre.x, body().position.y - CLEARING.centre.y);
    for (let walked = 0; walked < 40 && fromCentre() > MARK_REACH; walked += TICK) {
      simulation.step(TICK);
      tutor.step(false, false);
    }
    expect(fromCentre()).toBeLessThanOrEqual(MARK_REACH);
    expect(pointInPolygon(body().position, rockfall.polygon)).toBe(true);

    const before = body().combatant.health;
    let waited = 0;
    for (; waited < 3.5 && body().combatant.health >= before; waited += TICK) {
      simulation.step(TICK);
      tutor.step(false, false);
    }
    expect(body().combatant.health).toBeLessThan(before);
    expect(bleeding()).toBe(false);

    // Struck and bleeding, it stays in the ring until half its health is gone.
    let hurt = 0;
    for (; hurt < 20 && fraction() > 0.5; hurt += TICK) {
      simulation.step(TICK);
      tutor.step(true, false);
      expect(bleeding() || fraction() <= 0.4).toBe(true);
    }
    expect(fraction()).toBeLessThanOrEqual(0.5);
    // Then out, and low, for as long as nobody heals it.
    for (let after = 0; after < 40; after += TICK) {
      simulation.step(TICK);
      tutor.step(true, false);
      if (after > 4) {
        expect(pointInPolygon(body().position, rockfall.polygon)).toBe(false);
        expect(fraction()).toBeGreaterThan(0.3);
        expect(fraction()).toBeLessThanOrEqual(0.5);
      }
    }
    expect(
      Math.hypot(body().position.x - CLEARING.east.x, body().position.y - CLEARING.east.y),
    ).toBeLessThanOrEqual(MARK_REACH);
    // Healed, it bleeds no more, and natural regeneration takes it back up.
    const healed = body().combatant.health;
    for (let after = 0; after < 15; after += TICK) {
      simulation.step(TICK);
      tutor.step(true, true);
    }
    expect(bleeding()).toBe(false);
    expect(body().combatant.health).toBeGreaterThan(healed);
  });
});

describe("badGroundTutor (#3310)", () => {
  const build = houseBuild(PLAYER_PROFESSION);
  /** The canyon with its cracked wall down, as station 5 leaves it, the pair at its face. */
  const pastTheWall = (): ReturnType<typeof canyonWorld> => {
    const world = canyonWorld("canyon-test", build, build);
    const { simulation } = world;
    simulation.walkTo(SELF_ID, CRACKED_WALL.face, CRACKED_WALL.layer);
    simulation.walkTo(TUTOR_ID, CRACKED_WALL.besideFace, CRACKED_WALL.layer);
    const wallHealth = (): number =>
      simulation.breakables.find(({ id }) => id === CRACKED_WALL.id)?.health ?? 0;
    for (let elapsed = 0; elapsed < 120 && wallHealth() > 0; elapsed += TICK) {
      simulation.step(TICK);
      simulation.requestAttack(SELF_ID, CRACKED_WALL.targetId);
      simulation.requestAttack(TUTOR_ID, CRACKED_WALL.targetId);
    }
    expect(wallHealth()).toBe(0);
    return world;
  };
  const badGround = (world: ReturnType<typeof canyonWorld>) =>
    world.zones.filter(({ kind }) => kind === "mire" || kind === "molten");

  it("puts the mark past the mire, in no zone, the straight way to it through the mud", () => {
    const world = canyonWorld("canyon-test", build, build);
    const zones = badGround(world);
    expect(zones.map(({ kind }) => kind).sort()).toEqual(["mire", "molten"]);
    const mire = zones.find(({ kind }) => kind === "mire");
    if (mire === undefined) {
      throw new Error("no mire");
    }
    for (const zone of world.zones) {
      expect(pointInPolygon(BAD_GROUND.mark, zone.polygon)).toBe(false);
      expect(pointInPolygon(BAD_GROUND.start, zone.polygon)).toBe(false);
    }
    const { start, mark } = BAD_GROUND;
    const through = Array.from({ length: 21 }, (_, k) => ({
      x: start.x + ((mark.x - start.x) * k) / 20,
      y: start.y + ((mark.y - start.y) * k) / 20,
    })).some((point) => pointInPolygon(point, mire.polygon));
    expect(through).toBe(true);
  });

  it("walks the tutor round the bad ground, never into it, to wait beside the mark", () => {
    const world = pastTheWall();
    const { simulation } = world;
    const zones = badGround(world);
    const tutor = badGroundTutor(simulation);
    const body = () => {
      const found = simulation.get(TUTOR_ID);
      if (found === undefined) {
        throw new Error("no tutor");
      }
      return found;
    };
    const waiting = BAD_GROUND.tutorRoute[BAD_GROUND.tutorRoute.length - 1] ?? BAD_GROUND.mark;
    const away = (): number =>
      Math.hypot(body().position.x - waiting.x, body().position.y - waiting.y);
    for (let elapsed = 0; elapsed < 60; elapsed += TICK) {
      simulation.step(TICK);
      tutor.step();
      expect(zones.filter((zone) => pointInPolygon(body().position, zone.polygon))).toEqual([]);
    }
    expect(away()).toBeLessThanOrEqual(MARK_REACH);
  });

  it("lets the player walk the molten strip's length and live", () => {
    const world = pastTheWall();
    const { simulation } = world;
    const molten = world.zones.find(({ kind }) => kind === "molten");
    if (molten === undefined) {
      throw new Error("no molten strip");
    }
    const ys = molten.polygon.map(({ y }) => y);
    const x = polygonCentre(molten.polygon).x;
    const self = () => {
      const found = simulation.get(SELF_ID);
      if (found === undefined) {
        throw new Error("no player");
      }
      return found;
    };
    // Up to its south end, then along all of it, crippled, at full health.
    simulation.walkTo(SELF_ID, { x, y: Math.max(...ys) + 60 }, molten.layer);
    for (let elapsed = 0; elapsed < 60 && self().position.y < Math.max(...ys); elapsed += TICK) {
      simulation.step(TICK);
    }
    self().combatant.health = self().combatant.maxHealth;
    simulation.walkTo(SELF_ID, { x, y: Math.min(...ys) - 60 }, molten.layer);
    let lowest = self().combatant.health;
    for (let elapsed = 0; elapsed < 30; elapsed += TICK) {
      simulation.step(TICK);
      lowest = Math.min(lowest, self().combatant.health);
    }
    expect(lowest).toBeLessThan(self().combatant.maxHealth);
    expect(lowest).toBeGreaterThan(0);
  });
});

describe("ratPocket (#3316)", () => {
  const build = houseBuild(PLAYER_PROFESSION);
  const ids = RAT_POCKET.rats.map(({ id }) => id);
  it("places three rats at the pocket, on team 1, the big one at 240", () => {
    const { simulation } = canyonWorld("rats-test", build, build);
    for (const id of ids) {
      const rat = simulation.get(id);
      expect(rat?.combatant.team).toBe(1);
      expect(rat?.layer).toBe(RAT_POCKET.layer);
      expect(rat?.creature?.look).toBe("rat");
      const { x, y } = rat?.position ?? vec2(0, 0);
      expect(Math.hypot(x - RAT_POCKET.pocket.x, y - RAT_POCKET.pocket.y)).toBeLessThan(400);
      expect(simulation.standable(vec2(x, y), RAT_POCKET.layer)).toBe(true);
    }
    expect(simulation.get(ids[1] ?? "")?.combatant.maxHealth).toBe(240);
    expect(simulation.get(ids[0] ?? "")?.combatant.maxHealth).toBe(120);
    expect(simulation.get(ids[0] ?? "")?.combatant.team).not.toBe(
      simulation.get(SELF_ID)?.combatant.team,
    );
  });

  it("has the tutor wait out of every rat's aggro, where it can stand", () => {
    const world = canyonWorld("rats-test", build, build, pocketStart());
    const spot = RAT_POCKET.tutorSpot;
    expect(world.simulation.standable(spot, RAT_POCKET.layer)).toBe(true);
    for (const post of [...RAT_POCKET.rats.map((rat) => rat.post), RAT_POCKET.extra]) {
      expect(Math.hypot(spot.x - post.x, spot.y - post.y)).toBeGreaterThanOrEqual(RAT_AGGRO + 50);
    }
    // Gone on ahead, it stands there unbitten however long the player takes.
    world.simulation.walkTo(TUTOR_ID, spot, RAT_POCKET.layer);
    for (let t = 0; t < 60; t += TICK) {
      world.simulation.step(TICK);
    }
    const tutor = world.simulation.get(TUTOR_ID);
    expect(
      Math.hypot((tutor?.position.x ?? 0) - spot.x, (tutor?.position.y ?? 0) - spot.y),
    ).toBeLessThan(4);
    expect(tutor?.combatant.health).toBe(tutor?.combatant.maxHealth);
  });

  it("runs the runner off when the player hits it, the tutor joining only once it is hit", () => {
    const { simulation } = canyonWorld("rats-test", build, build, pocketStart());
    const [runnerId = ""] = ids;
    const watch = createRatWatch(SELF_ID, TUTOR_ID, ids, build.skillBar);
    const pocket = ratPocket(simulation, watch, undefined);
    const runner = (): Vec2 => simulation.get(runnerId)?.position ?? vec2(0, 0);
    const post = runner();
    // The player walks in to its first blow.
    simulation.requestAttack(SELF_ID, runnerId);
    const hit = (): boolean => watch.tally().hitByPlayer.has(runnerId);
    for (let walked = 0; walked < 30 && !hit(); walked += TICK) {
      stepWatched(simulation, watch);
      if (!hit()) {
        pocket.step(watch.tally());
        // The tutor waits for the player's first blow.
        expect(simulation.get(TUTOR_ID)?.combatant.attack).toBeUndefined();
      }
    }
    expect(watch.tally().hitByPlayer.has(runnerId)).toBe(true);
    pocket.step(watch.tally());
    expect(pocket.fled()).toBe(true);
    expect(simulation.get(SELF_ID)?.combatant.attack?.targetId).toBe(runnerId);
    expect(simulation.get(TUTOR_ID)?.combatant.attack?.targetId).toBe(runnerId);
    for (let ran = 0; ran < 2; ran += TICK) {
      stepWatched(simulation, watch);
      pocket.step(watch.tally());
    }
    // West, away from where it stood, though the player is beside it.
    expect(runner().x).toBeLessThan(post.x - 150);
    expect(pocket.alive()).toBe(3);
    expect(watch.tally().skillsOnRats.size).toBe(0);
  });

  it("brings one more rat once all are dead with too few skills, and no more after two", () => {
    const { simulation } = canyonWorld("rats-test", build, build, pocketStart());
    const watch = createRatWatch(SELF_ID, TUTOR_ID, ids, build.skillBar);
    const pocket = ratPocket(simulation, watch, undefined);
    const none: RatTally = {
      hitByPlayer: new Set(),
      hitByTutor: new Set(),
      skillsOnRats: new Set(),
      knockedDown: new Set(),
    };
    for (const id of ids) {
      simulation.remove(id);
    }
    expect(pocket.alive()).toBe(0);
    pocket.step(none);
    expect(pocket.extra()).toBe(true);
    expect(pocket.alive()).toBe(1);
    const extra = simulation.get("tutorial-rat-4");
    expect(extra?.position).toEqual(RAT_POCKET.extra);
    expect(extra?.combatant.team).toBe(1);
    simulation.remove("tutorial-rat-4");
    pocket.step({ ...none, skillsOnRats: new Set(["warrior.hammer-bash", "warrior.sprint"]) });
    expect(pocket.alive()).toBe(0);
    expect(simulation.get("tutorial-rat-5")).toBeUndefined();
  });
});

describe("callTutor (#3331)", () => {
  const build = houseBuild(PLAYER_PROFESSION);
  const [{ id: first }, { id: second }] = CALL_RATS.rats;
  const none: RatTally = {
    hitByPlayer: new Set(),
    hitByTutor: new Set(),
    skillsOnRats: new Set(),
    knockedDown: new Set(),
  };

  it("places two rats on team 1 that bite no one who has not struck them", () => {
    const { simulation } = canyonWorld("call-test", build, build, tunnelStart());
    for (const { id, post } of CALL_RATS.rats) {
      expect(simulation.get(id)?.combatant.team).toBe(1);
      expect(simulation.get(id)?.position).toEqual(post);
    }
    const [a, b] = CALL_RATS.rats;
    expect(Math.hypot(a.post.x - b.post.x, a.post.y - b.post.y)).toBe(200);
  });

  it("has the tutor strike the rat called, the latest call, and never the other", () => {
    const { simulation } = canyonWorld("call-test", build, build, tunnelStart());
    const watch = createRatWatch(SELF_ID, TUTOR_ID, [first, second], build.skillBar);
    const tutor = callTutor(simulation, watch);
    const attacking = (): string | undefined =>
      simulation.get(TUTOR_ID)?.combatant.attack?.targetId;
    tutor.step(undefined, watch.tally());
    expect(attacking()).toBeUndefined();
    tutor.step(TUTOR_ID, watch.tally());
    expect(attacking()).toBeUndefined();
    tutor.step(first, watch.tally());
    expect(attacking()).toBe(first);
    tutor.step(second, watch.tally());
    expect(attacking()).toBe(second);
    // The tutor walks from station 9's ledge, round through the tunnel.
    for (let walked = 0; walked < 90 && !watch.tally().hitByTutor.has(second); walked += TICK) {
      stepWatched(simulation, watch);
      tutor.step(second, watch.tally());
    }
    expect(watch.tally().hitByTutor).toEqual(new Set([second]));
    expect(tutor.lost()).toBe(false);
  });

  it("says a called rat was lost once it died unstruck by the tutor, and brings one more once both are", () => {
    const { simulation } = canyonWorld("call-test", build, build, tunnelStart());
    const watch = createRatWatch(SELF_ID, TUTOR_ID, [first, second], build.skillBar);
    const tutor = callTutor(simulation, watch);
    tutor.step(first, none);
    simulation.remove(first);
    tutor.step(undefined, none);
    expect(tutor.lost()).toBe(true);
    expect(simulation.get("tutorial-call-rat-3")).toBeUndefined();
    simulation.remove(second);
    tutor.step(undefined, none);
    expect(simulation.get("tutorial-call-rat-3")?.position).toEqual(CALL_RATS.extra);
  });
});

describe("ledgeTutor (#3323)", () => {
  const build = houseBuild(PLAYER_PROFESSION);

  it("takes the player up the stairs onto the ledge and down under it, the tutor along by the stairs", () => {
    const { simulation } = canyonWorld("ledge-test", build, build, tunnelStart());
    // Only the pair: no rat bites on the way.
    for (const { id } of RAT_POCKET.rats) {
      simulation.remove(id);
    }
    const { footprint, upper, lower, foot, top } = LEDGE;
    const corners = shapeVertices(footprint);
    const middle = vec2(
      (Math.min(...corners.map(({ x }) => x)) + Math.max(...corners.map(({ x }) => x))) / 2,
      (Math.min(...corners.map(({ y }) => y)) + Math.max(...corners.map(({ y }) => y))) / 2,
    );
    const body = (id: string) => {
      const found = simulation.get(id);
      if (found === undefined) {
        throw new Error(`no ${id}`);
      }
      return found;
    };
    const tutor = ledgeTutor(simulation);
    let tutorLayer = body(TUTOR_ID).layer;
    const run = (seconds: number): void => {
      for (let elapsed = 0; elapsed < seconds; elapsed += TICK) {
        simulation.step(TICK);
        tutor.step();
        const { layer, position } = body(TUTOR_ID);
        if (layer !== tutorLayer) {
          // Only ever on the stairs: never off the ledge's edge.
          expect(position.x).toBeGreaterThanOrEqual(Math.min(foot.x, top.x));
          expect(position.x).toBeLessThanOrEqual(Math.max(foot.x, top.x));
          tutorLayer = layer;
        }
      }
    };
    simulation.walkTo(SELF_ID, middle, upper);
    run(40);
    expect(body(SELF_ID).layer).toBe(upper);
    expect(pointInShape(body(SELF_ID).position, footprint)).toBe(true);
    expect(body(TUTOR_ID).layer).toBe(upper);
    // An Alt walk: the same point, the ground under it.
    simulation.walkTo(SELF_ID, middle, lower);
    run(40);
    expect(body(SELF_ID).layer).toBe(lower);
    expect(pointInShape(body(SELF_ID).position, footprint)).toBe(true);
    expect(body(TUTOR_ID).layer).toBe(lower);
  });
});

describe("pingTutor (#3332, #3792)", () => {
  const build = houseBuild(PLAYER_PROFESSION);
  const { fork, north, south, rejoin } = JUNCTION;
  const at = (simulation: MatchSimulation, point: Vec2): boolean => {
    const tutor = simulation.get(TUTOR_ID);
    return (
      tutor !== undefined &&
      Math.hypot(tutor.position.x - point.x, tutor.position.y - point.y) < MARK_REACH
    );
  };
  const run = (until: () => boolean, step: () => void, seconds = 120): void => {
    for (let walked = 0; walked < seconds && !until(); walked += TICK) {
      step();
    }
  };

  it.each([
    ["north", north, south],
    ["south", south, north],
  ] as const)(
    "walks the %s arm once it is pinged, round the island to beside the rejoin, and is not turned",
    (_, arm, other) => {
      const { simulation } = canyonWorld("ping-test", build, build, gateStart());
      for (const { id } of [...RAT_POCKET.rats, ...CALL_RATS.rats]) {
        simulation.remove(id);
      }
      // From the fork, as station 12 leaves it.
      simulation.walkTo(TUTOR_ID, fork, JUNCTION.layer);
      run(
        () => at(simulation, fork),
        () => simulation.step(TICK),
      );
      const tutor = pingTutor(simulation);
      let ping: Vec2 | undefined;
      /** The furthest the tutor has been from the other arm's side of the fork. */
      let byArm = false;
      let byOther = false;
      const step = (): void => {
        simulation.step(TICK);
        tutor.step(ping);
        byArm ||= at(simulation, arm);
        byOther ||= at(simulation, other);
      };
      // Unpinged, it waits.
      run(() => !at(simulation, fork), step, 3);
      expect(at(simulation, fork)).toBe(true);
      ping = arm;
      run(() => byArm, step, 30);
      // A ping on the other arm now does not turn it.
      ping = other;
      const beside = vec2(rejoin.x, rejoin.y - 90);
      run(() => at(simulation, beside), step, 30);
      expect(byArm).toBe(true);
      expect(byOther).toBe(false);
      expect(at(simulation, beside)).toBe(true);
    },
  );
});
