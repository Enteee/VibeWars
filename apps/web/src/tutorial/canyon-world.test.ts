import { MINIMAL_GW_INSPIRED_PVP_V1, pointInPolygon, polygonCentre } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { CANYON_ARRIVAL } from "./canyon-map.js";
import {
  CLEARING,
  CRACKED_WALL,
  DODGE_MARK,
  canyonWorld,
  clearingTutor,
  wallTutor,
} from "./canyon-world.js";
import { DODGE_REACH } from "./dodge-count.js";
import { MARK_REACH } from "./stations.js";
import { PLAYER_PROFESSION, SELF_ID, TUTOR_ID, houseBuild } from "./tutorial-world.js";

const TICK = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;

describe("canyonWorld (#3247)", () => {
  const build = houseBuild(PLAYER_PROFESSION);

  it("holds the pair alone, the player on the arrival and the tutor beside", () => {
    const world = canyonWorld("canyon-test", build, build);
    const self = world.simulation.get(SELF_ID);
    const tutor = world.simulation.get(TUTOR_ID);
    expect([...world.simulation.participants()].map(({ id }) => id).sort()).toEqual(
      [SELF_ID, TUTOR_ID].sort(),
    );
    expect(self?.position).toEqual(CANYON_ARRIVAL.position);
    expect(self?.layer).toBe(CANYON_ARRIVAL.layer);
    expect(tutor?.layer).toBe(CANYON_ARRIVAL.layer);
    expect(world.map.id).toBe(CANYON_ARRIVAL.map.id);
    expect(world.zones.filter(({ kind }) => kind === "rockfall").length).toBeGreaterThanOrEqual(3);
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
