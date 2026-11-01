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
import { fromPlayerBuild, toPlayerBuild } from "../storage/build-validation.js";
import type { StoredCharacter } from "../storage/schema.js";
import { newCharacter } from "./build-editor.js";
import { FIGURE_SIZE, characterAppearance, figureBody, paintFigure } from "./character-figure.js";
import { CAPE_BAND_CASING, type Painter, type StandingBody } from "../render/body-painter.js";

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
  it("gives the default Warrior the sword and shield a match gives it", () => {
    const warrior = stored(starter("warrior"));
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

describe("figureBody (#1250)", () => {
  it("is your own body at rest, facing right, with room for its marks", () => {
    expect(figureBody({ weaponId: "sword", offhandId: "shield" }, undefined)).toEqual({
      x: 24,
      y: 24,
      r: RULES.collision.playerRadius,
      facing: 0,
      team: "self",
      weaponId: "sword",
      offhandId: "shield",
      frame: REST_FRAME,
      cape: undefined,
    });
  });

  it("wears a cape folded, and fits its band and the weapon's tip inside its box (#1422, #1699)", () => {
    const cape = { main: 0xa078e0, trim: 0xf2f2f2, emblem: "diamond" } as const;
    const body = figureBody({ weaponId: "sword", offhandId: "shield" }, cape);
    const xs: number[] = [];
    const ys: number[] = [];
    const at = (x: number, y: number): void => {
      xs.push(x);
      ys.push(y);
    };
    paintFigure(
      {
        ...silent,
        moveTo: at,
        lineTo: at,
        arc: (x, y, radius) => {
          // The band's casing is stroked half its width out.
          at(x - radius - CAPE_BAND_CASING / 2, y - radius - CAPE_BAND_CASING / 2);
          at(x + radius + CAPE_BAND_CASING / 2, y + radius + CAPE_BAND_CASING / 2);
        },
        fillPoints: (points) => {
          for (const point of points) {
            at(point.x, point.y);
          }
        },
      },
      body,
      () => undefined,
    );
    expect(body.cape?.motion.unfold).toBe(0);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(FIGURE_SIZE.width - 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(FIGURE_SIZE.height - 1);
  });
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

/** How far past `body`'s centre anything `paint` draws through a painter reaches. */
function reach(body: StandingBody, paint: (painter: Painter) => void): number {
  let farthest = 0;
  const at = (x: number, y: number, radius = 0): void => {
    farthest = Math.max(farthest, Math.hypot(x - body.x, y - body.y) + radius);
  };
  paint({
    fillStyle: () => undefined,
    lineStyle: () => undefined,
    fillCircle: at,
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

describe("paintFigure (#1290)", () => {
  it("draws a fresh character's weapon past its body's edge", () => {
    const body = figureBody(characterAppearance(newCharacter("c1")), undefined);
    expect(reach(body, (painter) => paintFigure(painter, body, () => undefined))).toBeGreaterThan(
      body.r + 2,
    );
  });

  it("draws an invalid build's bare body no further than its edge", () => {
    const body = figureBody({ weaponId: undefined, offhandId: undefined }, undefined);
    expect(
      reach(body, (painter) => paintFigure(painter, body, () => undefined)),
    ).toBeLessThanOrEqual(body.r + 2);
  });
});
