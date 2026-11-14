import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { IMPLEMENTED_SKILLS, vec2 } from "@vibewars/game-core";

import { FLAT_STRUCTURE, type MapStructure } from "./arena-snapshot.js";
import { elevationOf } from "./render-order.js";
import {
  MatchClock,
  SHOT_FADE_SECONDS,
  shotFadeAlpha,
  projectileHeading,
  projectileLayer,
  projectilePosition,
  projectileCore,
  projectileTrail,
  SHOT_TRAIL_REACH,
  SPRITE_HEAD,
  SPRITE_TAIL,
  PROJECTILE_SPRITES,
  projectileSprite,
  SKILL_SPRITE,
  type RenderableProjectile,
} from "./projectiles.js";

describe("projectileSprite", () => {
  it("gives every bow an arrow, the spear a spear, wand and staff a bolt", () => {
    expect(projectileSprite("flatbow", undefined)).toBe("arrow");
    expect(projectileSprite("shortbow", undefined)).toBe("arrow");
    expect(projectileSprite("longbow", undefined)).toBe("arrow");
    expect(projectileSprite("recurve-bow", undefined)).toBe("arrow");
    expect(projectileSprite("hornbow", undefined)).toBe("arrow");
    expect(projectileSprite("spear", undefined)).toBe("spear");
    expect(projectileSprite("wand", undefined)).toBe("bolt");
    expect(projectileSprite("staff", undefined)).toBe("bolt");
  });

  it("gives a melee or unknown weapon a bolt rather than throwing", () => {
    expect(projectileSprite("unarmed", undefined)).toBe("bolt");
    expect(projectileSprite("sword", undefined)).toBe("bolt");
    expect(projectileSprite("axe", undefined)).toBe("bolt");
    expect(projectileSprite("hammer", undefined)).toBe("bolt");
    expect(projectileSprite("daggers", undefined)).toBe("bolt");
    expect(projectileSprite("scythe", undefined)).toBe("bolt");
    expect(projectileSprite("trebuchet", undefined)).toBe("bolt");
  });

  it("gives a flying spell its own sprite, whatever its caster holds (#535, #1176)", () => {
    expect(projectileSprite("longbow", "elementalist.fireball")).toBe("fireball");
    expect(projectileSprite("spear", "elementalist.stoning")).toBe("stone");
    expect(projectileSprite(undefined, "elementalist.ebon-hawk")).toBe("ebon-hawk");
    expect(projectileSprite("wand", "necromancer.deathly-swarm")).toBe("deathly-swarm");
  });

  it("gives a skill with no row a bolt", () => {
    expect(projectileSprite("staff", "nobody.nothing")).toBe("bolt");
  });

  it("has a row for every skill that flies, so a new flying spell needs art", () => {
    const flying = IMPLEMENTED_SKILLS.filter((skill) => skill.projectile !== undefined);
    expect(flying.length).toBeGreaterThan(0);
    for (const skill of flying) {
      expect(SKILL_SPRITE[skill.id], skill.id).toBeDefined();
    }
  });

  it("has a file for every sprite", () => {
    const dir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../public/icons/projectile",
    );
    for (const sprite of PROJECTILE_SPRITES) {
      expect(fs.existsSync(path.join(dir, `${sprite}.svg`)), sprite).toBe(true);
    }
  });
});

describe("projectilePosition", () => {
  const shot: RenderableProjectile = {
    id: 1,
    sprite: "arrow",
    from: vec2(0, 0),
    to: vec2(100, 50),
    launchedAt: 10,
    flightSeconds: 2,
    fromLayer: 0,
    toLayer: 0,
    colour: 0,
    spell: false,
  };

  it("flies from its release to its aim point over its flight", () => {
    expect(projectilePosition(shot, 10, FLAT_STRUCTURE, [])).toEqual({ x: 0, y: 0 });
    expect(projectilePosition(shot, 11, FLAT_STRUCTURE, [])).toEqual({ x: 50, y: 25 });
    expect(projectilePosition(shot, 12, FLAT_STRUCTURE, [])).toEqual({ x: 100, y: 50 });
  });

  it("is not drawn once it has landed, and waits at its release before", () => {
    expect(projectilePosition(shot, 12.01, FLAT_STRUCTURE, [])).toBeUndefined();
    expect(projectilePosition(shot, 9, FLAT_STRUCTURE, [])).toEqual({ x: 0, y: 0 });
  });

  it("points the way it flies", () => {
    expect(projectileHeading(shot, FLAT_STRUCTURE, [])).toBeCloseTo(Math.atan2(50, 100), 9);
  });
});

describe("shotFadeAlpha (#238)", () => {
  it("fades an ended shot from full to nothing over 120 ms, then lets it go", () => {
    expect(SHOT_FADE_SECONDS).toBe(0.12);
    expect(shotFadeAlpha(0, 0)).toBe(1);
    expect(shotFadeAlpha(0, 0.06)).toBeCloseTo(0.5, 9);
    expect(shotFadeAlpha(0, 0.12)).toBe(0);
    expect(shotFadeAlpha(0, 0.121)).toBeUndefined();
  });
});

describe("MatchClock", () => {
  it("runs on from the server's clock at real time, a little way", () => {
    const clock = new MatchClock();
    clock.observe(5, 100);
    expect(clock.read(100.1)).toBeCloseTo(5.1, 9);
    // Never far past what the server last said.
    expect(clock.read(105)).toBeCloseTo(5.25, 9);
  });

  it("starts again from each new server time, not from each frame", () => {
    const clock = new MatchClock();
    clock.observe(5, 100);
    clock.observe(5, 100.04);
    expect(clock.read(100.05)).toBeCloseTo(5.05, 9);
    clock.observe(5.05, 100.06);
    expect(clock.read(100.06)).toBeCloseTo(5.05, 9);
  });
});

describe("a shot between layers (#2972)", () => {
  const decked: MapStructure = {
    layerCount: 2,
    biome: "hall",
    bounds: { kind: "rect" },
    ground: 0,
    pits: [],
    tunnels: [],
    dropOffs: [],
    downDecks: [],
    decks: [
      {
        layer: 1,
        footprint: { kind: "rect", x: 80, y: -50, width: 100, height: 100 },
        look: "platform",
        switched: null,
      },
    ],
    transitions: [],
    water: [],
    zones: [],
  };
  const shot = {
    id: 1,
    sprite: "bolt",
    from: vec2(0, 0),
    to: vec2(100, 0),
    fromLayer: 0,
    toLayer: 1,
    launchedAt: 10,
    flightSeconds: 2,
    colour: 0xffffff,
    spell: true,
  } as const;

  it("starts at the shooter's height and rises evenly to the target's", () => {
    const lift = elevationOf(1, 0);
    expect(projectilePosition(shot, 10, decked, [])).toEqual({ x: 0, y: 0 });
    expect(projectilePosition(shot, 11, decked, [])).toEqual({ x: 50, y: -lift / 2 });
    expect(projectilePosition(shot, 12, decked, [])).toEqual({ x: 100, y: -lift });
  });

  it("casts its shadow on the shooter's layer, then on the landing deck (#3292)", () => {
    expect(projectileLayer(shot, 10)).toBe(0);
    expect(projectileLayer(shot, 10.9)).toBe(0);
    expect(projectileLayer(shot, 11)).toBe(1);
    // Where it lands, it is drawn at the deck's height: its shadow lies under it there.
    expect(projectileLayer(shot, 12)).toBe(1);
    expect(projectilePosition(shot, 12, decked, [])?.y).toBe(-elevationOf(1, 0));
  });
});

describe("projectileTrail (#3292)", () => {
  it.each([0, Math.PI / 3, Math.PI, -2])("trails behind a sprite flying at %s rad", (heading) => {
    for (const sprite of PROJECTILE_SPRITES) {
      const head = SPRITE_HEAD[sprite].radius;
      const trail = projectileTrail(sprite, heading, 1);
      expect(trail.length).toBeGreaterThanOrEqual(3);
      expect(trail.length).toBeLessThanOrEqual(4);
      const ahead = { x: Math.cos(heading), y: Math.sin(heading) };
      let last = SPRITE_TAIL;
      for (const dot of trail) {
        const along = dot.offset.x * ahead.x + dot.offset.y * ahead.y;
        const across = dot.offset.x * ahead.y - dot.offset.y * ahead.x;
        expect(across).toBeCloseTo(0, 9);
        // Behind the sprite's tail, never over the sprite, never bigger than its head.
        expect(-along - dot.radius).toBeGreaterThanOrEqual(SPRITE_TAIL);
        expect(-along).toBeGreaterThan(last);
        expect(dot.radius).toBeLessThanOrEqual(head);
        last = -along;
      }
      expect(last).toBeLessThanOrEqual(SPRITE_TAIL + SHOT_TRAIL_REACH * head + 1e-9);
    }
  });

  it("scales with the sprite as drawn", () => {
    const one = projectileTrail("stone", 0, 1);
    const two = projectileTrail("stone", 0, 2);
    two.forEach((dot, i) => {
      expect(dot.radius).toBeCloseTo(2 * (one[i]?.radius ?? 0), 9);
      expect(dot.offset.x).toBeCloseTo(2 * (one[i]?.offset.x ?? 0), 9);
    });
  });

  it("fades warm from gold at the sprite to ember at the tail, whatever the sprite", () => {
    const trail = projectileTrail("stone", 0, 1);
    expect(trail[0]?.colour).toBe(0xffd23d);
    expect(trail.at(-1)?.colour).toBe(0xff8a3d);
    const alphas = trail.map((dot) => dot.alpha);
    expect([...alphas].sort((a, b) => b - a)).toEqual(alphas);
  });
});

describe("projectileCore (#3292)", () => {
  it.each([0, Math.PI / 2, -2])("sits on the sprite's head, inside it, at %s rad", (heading) => {
    for (const sprite of PROJECTILE_SPRITES) {
      const head = SPRITE_HEAD[sprite];
      const core = projectileCore(sprite, heading, 1.5);
      expect(core.offset.x).toBeCloseTo(Math.cos(heading) * head.along * 1.5, 9);
      expect(core.offset.y).toBeCloseTo(Math.sin(heading) * head.along * 1.5, 9);
      expect(core.radius).toBeGreaterThan(0);
      expect(core.radius).toBeLessThan(head.radius * 1.5);
    }
  });

  it("puts every head inside its 32 px frame", () => {
    for (const sprite of PROJECTILE_SPRITES) {
      const head = SPRITE_HEAD[sprite];
      expect(head.along + head.radius).toBeLessThanOrEqual(16);
      expect(head.radius).toBeLessThanOrEqual(6);
    }
  });
});
