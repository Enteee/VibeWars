import {
  defaultBuildEquipment,
  loadoutSpec,
  MINIMAL_GW_INSPIRED_PVP_V1,
  MatchSimulation,
  resolveJoinLoadout,
  resolveLoadout,
  type ProfessionId,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { paintStandingBody, type Painter } from "../render/body-painter.js";
import { toPlayerBuild } from "../storage/build-validation.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import {
  canvasPainter,
  characterAppearance,
  figureBody,
  paintFigure,
  type FigureContext,
} from "./character-figure.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;

function character(
  primaryProfession: ProfessionId,
  skill: string,
  equipment = defaultBuildEquipment(primaryProfession),
): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: "a",
    name: "a",
    primaryProfession,
    secondaryProfession: undefined,
    attributes: [],
    skillBar: [skill, null, null, null, null, null, null, null],
    equipment,
    updatedAt: 1,
  };
}

/** What a host seats `stored` holding: its claimed build resolved, then the weapon in hand. */
function hostHolds(stored: StoredCharacter): { weaponId: string; offhandId: string | undefined } {
  const { loadout } = resolveJoinLoadout(toPlayerBuild(stored), RULES.attributes, () => 0);
  const sim = new MatchSimulation({ seed: "figure", participants: [] });
  sim.add({
    id: "p",
    team: 0,
    skillBar: loadout.skillBar,
    ...loadoutSpec(
      resolveLoadout(
        {
          primaryProfession: loadout.primaryProfession,
          secondaryProfession: loadout.secondaryProfession,
          allocatedRanks: loadout.attributeRanks,
          equipment: loadout.equipment,
        },
        RULES.combat,
      ),
    ),
    spawn: { x: 0, y: 0 },
    facing: 0,
  });
  const equipment = sim.get("p")?.combatant.equipment;
  return { weaponId: equipment?.mainHand.weapon.id ?? "", offhandId: equipment?.offhandId };
}

const RANGER_LONGBOW = character("ranger", "ranger.savage-shot", {
  ...defaultBuildEquipment("ranger"),
  weaponSets: [
    { mainHand: { weaponId: "longbow", requirementAttributeId: null }, offHand: null },
    null,
    null,
    null,
  ],
});

describe("characterAppearance (#1250)", () => {
  it.each([
    ["a default Warrior", character("warrior", "warrior.backbreaker")],
    ["a Ranger with a longbow", RANGER_LONGBOW],
    // A Monk prayer on a Warrior with no secondary: refused, so a starter build plays.
    ["an illegal build", character("warrior", "monk.orison-of-healing")],
  ])("holds what a host seats %s holding", (_, stored) => {
    expect(characterAppearance(stored)).toEqual(hostHolds(stored));
  });

  it("a longbow has no off-hand", () => {
    expect(characterAppearance(RANGER_LONGBOW)).toEqual({
      weaponId: "longbow",
      offhandId: undefined,
    });
  });
});

/** Every call `paint` makes on a painter, in order. */
function recorded(paint: (painter: Painter) => void): unknown[][] {
  const calls: unknown[][] = [];
  const painter = new Proxy({} as Painter, {
    get:
      (_, name) =>
      (...args: unknown[]) => {
        calls.push([String(name), ...args]);
      },
  });
  paint(painter);
  return calls;
}

describe("the character figure (#1250)", () => {
  it("is painted by the arena's paintStandingBody, call for call", () => {
    const appearance = characterAppearance(RANGER_LONGBOW);
    expect(recorded((painter) => paintFigure(painter, appearance))).toEqual(
      recorded((painter) => paintStandingBody(painter, figureBody(appearance))),
    );
  });

  it("is your body, still, facing right", () => {
    expect(figureBody({ weaponId: "sword", offhandId: "shield" })).toMatchObject({
      team: "self",
      facing: 0,
      r: RULES.collision.playerRadius,
    });
  });

  it("paints a circle on a 2D context as a full arc, filled", () => {
    const calls: unknown[][] = [];
    const context = new Proxy({} as FigureContext, {
      get:
        (_, name) =>
        (...args: unknown[]) => {
          calls.push([String(name), ...args]);
        },
      set: (_, name, value) => {
        calls.push([`=${String(name)}`, value]);
        return true;
      },
    });
    const painter = canvasPainter(context);
    painter.fillStyle(0x59c2ff, 1);
    painter.fillCircle(1, 2, 3);
    painter.lineStyle(2, 0xd7dee8, 0.5);
    expect(calls).toEqual([
      ["=fillStyle", "#59c2ff"],
      ["beginPath"],
      ["arc", 1, 2, 3, 0, Math.PI * 2],
      ["fill"],
      ["=lineWidth", 2],
      ["=strokeStyle", "#d7dee880"],
    ]);
  });
});
