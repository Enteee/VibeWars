import { packEmblem } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  NO_UPGRADES,
  MINIMAL_GW_INSPIRED_PVP_V1,
  MatchSimulation,
  STARTER_BUILDS,
  loadoutSpec,
  resolveJoinLoadout,
  resolveLoadout,
  type PlayerBuild,
} from "@vibewars/game-core";

import { REST_FRAME } from "../render/attack-clock.js";
import { capeLook, presetEmblem } from "../render/cape-shape.js";
import { fromPlayerBuild, toPlayerBuild } from "../storage/build-validation.js";
import type { StoredCharacter } from "../storage/schema.js";
import { newCharacter } from "./build-editor.js";
import {
  FIGURE_BOX,
  FIGURE_FRAME,
  boxDecor,
  characterAppearance,
  figureBody,
  matchDecor,
  paintFigure,
  type FigureContext,
} from "./character-figure.js";
import { teamColour } from "../render/arena-snapshot.js";
import { type Painter, type StandingBody } from "../render/body-painter.js";
import {
  bucketFacing,
  headingBucket,
  stackBadge,
  stackLayers,
  stackSlices,
  stackTones,
} from "../render/sprite-stack.js";
import { STACK_BAKE_RADIUS, STACK_BAKE_SCALE } from "../render/stack-atlas.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;

function starter(profession: PlayerBuild["primaryProfession"]): PlayerBuild {
  const build = STARTER_BUILDS.find((b) => b.primaryProfession === profession);
  if (build === undefined) {
    throw new Error(`no ${profession} starter`);
  }
  return build;
}

const stored = (build: PlayerBuild): StoredCharacter => fromPlayerBuild(build, "c1", 0);

/**
 * What a match sends for `character`, seated as `match-host.ts` seats a
 * player: its build as the wire carries it, through the join checks,
 * resolved, made a body in a simulation, and that body's weapon and
 * off-hand read as the host reads them for the snapshot.
 */
function hostHeld(character: StoredCharacter): {
  readonly weaponId: string;
  readonly offhandId: string | undefined;
} {
  const wire: unknown = JSON.parse(JSON.stringify(toPlayerBuild(character)));
  const { loadout } = resolveJoinLoadout(wire, RULES.attributes, () => 0);
  const resolved = resolveLoadout(
    {
      primaryProfession: loadout.primaryProfession,
      secondaryProfession: loadout.secondaryProfession,
      allocatedRanks: loadout.attributeRanks,
      equipment: loadout.equipment,
    },
    RULES.combat,
  );
  const sim = new MatchSimulation({ seed: 1 });
  const body = sim.add({
    id: "p1",
    team: 0,
    skillBar: loadout.skillBar,
    ...loadoutSpec(resolved),
    spawn: { x: 100, y: 100 },
    facing: 0,
  });
  return {
    weaponId: body.combatant.equipment.mainHand.weapon.id,
    offhandId: body.combatant.equipment.offhandId,
  };
}

describe("characterAppearance (#1250)", () => {
  it("gives a sword Warrior the sword and shield a match gives it", () => {
    const sworded = STARTER_BUILDS.find((build) => build.name === "June Star Burst (W/E)");
    if (sworded === undefined) {
      throw new Error("no June Star Burst (W/E)");
    }
    const warrior = stored(sworded);
    expect(characterAppearance(warrior)).toEqual({ weaponId: "sword", offhandId: "shield" });
    expect(characterAppearance(warrior)).toEqual(hostHeld(warrior));
  });

  it("gives a Ranger with a longbow its longbow and no off-hand", () => {
    const build = starter("ranger");
    const [set1, ...spare] = build.equipment.weaponSets;
    const longbow = stored({
      ...build,
      equipment: {
        ...build.equipment,
        weaponSets: [
          {
            ...set1,
            mainHand: { weaponId: "longbow", requirementAttributeId: null, upgrades: NO_UPGRADES },
          },
          ...spare,
        ],
      },
    });
    expect(characterAppearance(longbow)).toEqual({ weaponId: "longbow", offhandId: undefined });
    expect(characterAppearance(longbow)).toEqual(hostHeld(longbow));
  });

  it("gives a fresh character, empty bar and all, the sword it plays with (#1290)", () => {
    const fresh = newCharacter("c1");
    expect(characterAppearance(fresh).weaponId).toBe("sword");
    expect(characterAppearance(fresh)).toEqual(hostHeld(fresh));
  });

  it("gives an invalid build no weapon and no off-hand: its starter is random", () => {
    const illegal = stored({
      ...starter("ranger"),
      attributes: [{ attributeId: "ranger.marksmanship", rank: 99 }],
    });
    expect(characterAppearance(illegal)).toEqual({ weaponId: undefined, offhandId: undefined });
  });
});

describe("figureBody (#1250, #4032)", () => {
  it("is your own body at rest, turned three-quarter towards you", () => {
    const body = figureBody({ weaponId: "sword", offhandId: "shield" }, undefined);
    expect(body).toMatchObject({
      r: RULES.collision.playerRadius,
      facing: Math.PI / 4,
      team: "self",
      weaponId: "sword",
      offhandId: "shield",
      frame: REST_FRAME,
      cape: undefined,
    });
    expect(body.x).toBeCloseTo(FIGURE_FRAME / 2);
  });

  it("stands in the same place at the same size with a cape or without (#4082)", () => {
    const worn = figureBody({ weaponId: "sword", offhandId: "shield" }, cape);
    const bare = figureBody({ weaponId: "sword", offhandId: "shield" }, undefined);
    expect([worn.x, worn.y, worn.r]).toEqual([bare.x, bare.y, bare.r]);
    expect(drawn(worn).body).toEqual(drawn(bare).body);
  });

  it("puts the badge behind the head, never over the visor (#4082)", () => {
    const body = figureBody({ weaponId: "sword", offhandId: "shield" }, cape);
    const { badge } = boxDecor(body);
    const tones = { ...stackTones(0, undefined), visor: 0xff00ff };
    const visor = stackLayers(
      stackSlices("stand"),
      bucketFacing(headingBucket(body.facing)),
      body.r,
      tones,
      undefined,
    )
      .filter((layer) => layer.colour === 0xff00ff)
      .flatMap((layer) => layer.points);
    expect(visor.length).toBeGreaterThan(0);
    for (const point of visor) {
      expect(Math.hypot(body.x + point.x - badge.x, body.y + point.y - badge.y)).toBeGreaterThan(
        stackBadge(body.r).radius + 1,
      );
    }
  });

  it("holds the weapon and off-hand beside the feet, not under them (#4082)", () => {
    const body = figureBody({ weaponId: "sword", offhandId: "shield" }, undefined);
    const { marks } = drawn(body);
    expect(marks.left).toBeLessThan(body.x - body.r);
    expect(marks.right).toBeGreaterThan(body.x + body.r);
    expect(marks.bottom).toBeLessThan(body.y + body.r);
  });

  it("fills about nine tenths of its box at either size, nothing past its edges (#4082)", () => {
    for (const worn of [cape, undefined]) {
      for (const appearance of [
        { weaponId: "sword", offhandId: "shield" },
        { weaponId: "longbow", offhandId: undefined },
        { weaponId: "staff", offhandId: "focus" },
      ] as const) {
        const { all } = drawn(figureBody(appearance, worn));
        for (const box of [FIGURE_BOX.narrow, FIGURE_BOX.wide]) {
          const perUnit = box / FIGURE_FRAME;
          const side = Math.max(all.right - all.left, all.bottom - all.top) * perUnit;
          expect(side / box).toBeGreaterThanOrEqual(0.85);
          expect(side / box).toBeLessThanOrEqual(0.95);
          expect(Math.min(all.left, all.top) * perUnit).toBeGreaterThanOrEqual(0);
          expect(Math.max(all.right, all.bottom) * perUnit).toBeLessThanOrEqual(box);
        }
      }
    }
  });
});

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The bounds of everything `body` draws in its box, of its stacked body alone, and of its marks. */
function drawn(body: StandingBody): { all: Bounds; body: Bounds; marks: Bounds } {
  const empty = (): Bounds => ({
    left: Infinity,
    right: -Infinity,
    top: Infinity,
    bottom: -Infinity,
  });
  const bounds = { all: empty(), body: empty(), marks: empty() };
  const grow = (into: Bounds, x: number, y: number, radius: number): void => {
    into.left = Math.min(into.left, x - radius);
    into.right = Math.max(into.right, x + radius);
    into.top = Math.min(into.top, y - radius);
    into.bottom = Math.max(into.bottom, y + radius);
  };
  let marking = false;
  const at = (x: number, y: number, radius = 0): void => {
    grow(bounds.all, x, y, radius);
    grow(marking ? bounds.marks : bounds.body, x, y, radius);
  };
  const { context } = recording(at);
  const decor = boxDecor(body);
  const painter: Painter = {
    ...silent,
    fillCircle: (x, y, radius) => {
      grow(bounds.all, x, y, radius);
      // The badge, its rim and its fill, before the glyph; the marks follow it.
    },
    strokeCircle: at,
    moveTo: at,
    lineTo: at,
    arc: (x, y, radius, from, to) => {
      // A shield is an arc, not a circle: as far as its points go, and its casing.
      for (let step = 0; step <= 16; step += 1) {
        const angle = from + ((to - from) * step) / 16;
        at(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 2.5);
      }
    },
    fillPoints: (points) => {
      for (const point of points) {
        at(point.x, point.y);
      }
    },
  };
  paintFigure(painter, context, body, "stand", decor, () => {
    marking = true;
  });
  return bounds;
}

/** A guild cape in purple and white. */
const cape = capeLook({
  main: "a078e0",
  trim: "f2f2f2",
  emblemColours: ["f2f2f2"],
  emblem: packEmblem(presetEmblem("diamond")),
});

/** A painter that draws nothing. */
const silent: Painter = {
  fillStyle: () => undefined,
  lineStyle: () => undefined,
  fillCircle: () => undefined,
  strokeCircle: () => undefined,
  beginPath: () => undefined,
  moveTo: () => undefined,
  lineTo: () => undefined,
  arc: () => undefined,
  strokePath: () => undefined,
  fillPoints: () => undefined,
};

/**
 * A figure context that hands every point it draws to `at`, placed by its
 * translate and scale, and keeps the colour of every polygon it fills.
 */
function recording(at: (x: number, y: number, radius?: number) => void = () => undefined): {
  readonly context: FigureContext;
  readonly fills: string[];
} {
  const fills: string[] = [];
  let shift = { x: 0, y: 0, k: 1 };
  const saved: (typeof shift)[] = [];
  let polygon = false;
  const point = (x: number, y: number): void => {
    polygon = true;
    at(shift.x + x * shift.k, shift.y + y * shift.k);
  };
  const context: FigureContext = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "miter",
    beginPath: () => {
      polygon = false;
    },
    moveTo: point,
    lineTo: point,
    closePath: () => undefined,
    fill: () => {
      if (polygon && typeof context.fillStyle === "string") {
        fills.push(context.fillStyle);
      }
    },
    stroke: () => undefined,
    ellipse: (x, y, rx, ry) => {
      // The bake draws its ellipses unturned: their four extremes bound them.
      for (const [dx, dy] of [
        [rx, 0],
        [-rx, 0],
        [0, ry],
        [0, -ry],
      ] as const) {
        at(shift.x + (x + dx) * shift.k, shift.y + (y + dy) * shift.k);
      }
    },
    clearRect: () => undefined,
    save: () => {
      saved.push(shift);
    },
    restore: () => {
      shift = saved.pop() ?? { x: 0, y: 0, k: 1 };
    },
    translate: (x, y) => {
      shift = { ...shift, x: shift.x + x * shift.k, y: shift.y + y * shift.k };
    },
    scale: (k) => {
      shift = { ...shift, k: shift.k * k };
    },
  };
  return { context, fills };
}

/** The colours, bottom to top, of the arena's own slices of a standing figure turned to `facing`. */
function arenaFills(body: StandingBody): string[] {
  const worn = body.cape === undefined ? undefined : { look: body.cape.look, pattern: undefined };
  return stackLayers(
    stackSlices("stand"),
    bucketFacing(headingBucket(body.facing)),
    STACK_BAKE_RADIUS * STACK_BAKE_SCALE,
    stackTones(teamColour(body.team), worn),
    undefined,
  ).map((layer) => `#${layer.colour.toString(16).padStart(6, "0")}`);
}

/** How far past `body`'s centre anything `paint` draws through a painter reaches, its badge on top aside. */
function reach(body: StandingBody, paint: (painter: Painter) => void): number {
  let farthest = 0;
  const at = (x: number, y: number, radius = 0): void => {
    farthest = Math.max(farthest, Math.hypot(x - body.x, y - body.y) + radius);
  };
  paint({
    fillStyle: () => undefined,
    lineStyle: () => undefined,
    fillCircle: (x, y, radius) => {
      if (y !== body.y - stackBadge(body.r).rise) {
        at(x, y, radius);
      }
    },
    strokeCircle: at,
    beginPath: () => undefined,
    moveTo: (x, y) => {
      at(x, y);
    },
    lineTo: (x, y) => {
      at(x, y);
    },
    arc: at,
    strokePath: () => undefined,
    fillPoints: (points) => {
      for (const point of points) {
        at(point.x, point.y);
      }
    },
  });
  return farthest;
}

describe("paintFigure (#1290, #4032)", () => {
  it("draws the arena's own slices of the figure, then the glyph on its badge", () => {
    const body = figureBody(characterAppearance(newCharacter("c1")), undefined);
    const { context, fills } = recording();
    const badge = stackBadge(body.r);
    const decor = boxDecor(body);
    const circles: { y: number; radius: number }[] = [];
    let glyphAfter = -1;
    paintFigure(
      {
        ...silent,
        fillCircle: (_x, y, radius) => {
          circles.push({ y, radius });
        },
      },
      context,
      body,
      "stand",
      decor,
      () => {
        glyphAfter = circles.length;
      },
    );
    expect(fills).toEqual(arenaFills(body));
    expect(circles).toEqual([
      { y: decor.badge.y, radius: badge.radius + 1 },
      { y: decor.badge.y, radius: badge.radius },
    ]);
    expect(glyphAfter).toBe(2);
  });

  it("with a cape, fills its back slices from the robe's hem to the shoulders", () => {
    const body = figureBody(characterAppearance(newCharacter("c1")), cape);
    const { context, fills } = recording();
    paintFigure(silent, context, body, "stand", boxDecor(body), () => undefined);
    expect(fills).toEqual(arenaFills(body));
    const tones = stackSlices("stand").flatMap((slice) => slice.parts.map(() => slice.tone));
    const capes = tones.flatMap((tone, i) => (tone === "cape" ? [i] : []));
    const bare = arenaFills(figureBody(characterAppearance(newCharacter("c1")), undefined));
    expect(capes.every((i) => fills[i] !== bare[i])).toBe(true);
    expect(Math.min(...capes)).toBeGreaterThan(tones.lastIndexOf("trouser"));
    expect(Math.max(...capes)).toBeLessThan(tones.indexOf("skin"));
  });

  it("draws a fresh character's weapon past its body's edge", () => {
    const body = figureBody(characterAppearance(newCharacter("c1")), undefined);
    expect(
      reach(body, (painter) =>
        paintFigure(painter, recording().context, body, "stand", matchDecor(body), () => undefined),
      ),
    ).toBeGreaterThan(body.r + 2);
  });

  it("draws an invalid build's bare body no further than its edge", () => {
    const body = figureBody({ weaponId: undefined, offhandId: undefined }, undefined);
    expect(
      reach(body, (painter) =>
        paintFigure(painter, recording().context, body, "stand", matchDecor(body), () => undefined),
      ),
    ).toBeLessThanOrEqual(body.r + 2);
  });
});
