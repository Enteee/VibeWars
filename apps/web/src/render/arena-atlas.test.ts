import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CREATURE_LOOKS,
  IMPLEMENTED_SKILLS,
  PROFESSIONS,
  type ProfessionId,
  type SkillType,
  type StatusId,
} from "@vibewars/game-core";

import { SKILL_TYPE_NAME } from "../ui/icons.js";
import { composeArenaAtlas, packAtlas } from "../../plugins/arena-atlas.js";
import {
  BODY_GLYPH_TEXTURE_SIZE,
  CAST_BADGE_TEXTURE_SIZE,
  GROUND_EFFECT_SKILLS,
  GROUND_ICON_TEXTURE_SIZE,
  PROFESSION_GLYPH_SIZE,
  PROJECTILE_HEIGHT,
  PROJECTILE_WIDTH,
  STATUS_ICON_SIZE,
  bodyProfessionFrame,
  creatureFrame,
  groundFrame,
  professionFrame,
  projectileFrame,
  skillTypeFrame,
  statusFrame,
  type AtlasFrame,
} from "./arena-atlas.js";
import { NAME_LABEL_HEIGHT } from "./arena-snapshot.js";
import { PROJECTILE_SPRITES } from "./projectiles.js";
import { STATUS_ICON } from "./status-icons.js";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");
const { map, sheet } = composeArenaAtlas(PUBLIC);

function expectFrame(name: string, w: number, h: number): void {
  expect(map.frames[name], name).toMatchObject({ w, h });
}

describe("the arena atlas (#1671)", () => {
  it("has a frame at its texture size for every icon the scene draws", () => {
    for (const id of Object.keys(STATUS_ICON) as StatusId[]) {
      expectFrame(statusFrame(id), STATUS_ICON_SIZE, STATUS_ICON_SIZE);
    }
    for (const profession of Object.keys(PROFESSIONS) as ProfessionId[]) {
      expectFrame(professionFrame(profession), PROFESSION_GLYPH_SIZE, PROFESSION_GLYPH_SIZE);
      expectFrame(
        bodyProfessionFrame(profession),
        BODY_GLYPH_TEXTURE_SIZE,
        BODY_GLYPH_TEXTURE_SIZE,
      );
    }
    for (const look of CREATURE_LOOKS) {
      expectFrame(creatureFrame(look), BODY_GLYPH_TEXTURE_SIZE, BODY_GLYPH_TEXTURE_SIZE);
    }
    for (const type of Object.keys(SKILL_TYPE_NAME) as SkillType[]) {
      expectFrame(skillTypeFrame(type), CAST_BADGE_TEXTURE_SIZE, CAST_BADGE_TEXTURE_SIZE);
    }
    for (const sprite of PROJECTILE_SPRITES) {
      expectFrame(projectileFrame(sprite), PROJECTILE_WIDTH, PROJECTILE_HEIGHT);
    }
    for (const skillId of GROUND_EFFECT_SKILLS) {
      expectFrame(groundFrame(skillId), GROUND_ICON_TEXTURE_SIZE, GROUND_ICON_TEXTURE_SIZE);
    }
  });

  it("knows every ward and trap as a ground skill", () => {
    expect(GROUND_EFFECT_SKILLS).toContain("elementalist.ward-against-melee");
    expect(GROUND_EFFECT_SKILLS).toContain("ranger.barbed-trap");
    expect(GROUND_EFFECT_SKILLS).not.toContain("elementalist.fireball");
    expect(GROUND_EFFECT_SKILLS.length).toBeLessThan(IMPLEMENTED_SKILLS.length);
  });

  it("packs frames that never overlap, inside the sheet", () => {
    const root = /^<svg [^>]*width="(\d+)" height="(\d+)"/.exec(sheet);
    const width = Number(root?.[1]);
    const height = Number(root?.[2]);
    const frames = Object.entries(map.frames);
    const overlaps = (a: AtlasFrame, b: AtlasFrame): boolean =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    frames.forEach(([name, frame], index) => {
      expect(frame.x + frame.w, name).toBeLessThanOrEqual(width);
      expect(frame.y + frame.h, name).toBeLessThanOrEqual(height);
      for (const [other, then] of frames.slice(index + 1)) {
        expect(overlaps(frame, then), `${name} and ${other}`).toBe(false);
      }
    });
  });

  it("nests each icon at its frame, in its own viewBox", () => {
    const packed = packAtlas([
      {
        frame: "a",
        svg: '<svg xmlns="x" viewBox="0 0 24 24"><path d="M1 1"/></svg>\n',
        w: 16,
        h: 16,
      },
      { frame: "b", svg: '<svg viewBox="0 0 32 12"><rect/></svg>', w: 32, h: 12 },
    ]);
    expect(packed.map.frames).toEqual({
      a: { x: 0, y: 0, w: 16, h: 16 },
      b: { x: 17, y: 0, w: 32, h: 12 },
    });
    expect(packed.sheet).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="16">' +
        '<svg x="0" y="0" width="16" height="16" viewBox="0 0 24 24"><path d="M1 1"/></svg>' +
        '<svg x="17" y="0" width="32" height="12" viewBox="0 0 32 12"><rect/></svg></svg>\n',
    );
  });

  it("refuses an icon without a viewBox", () => {
    expect(() => packAtlas([{ frame: "a", svg: "<svg><rect/></svg>", w: 16, h: 16 }])).toThrow(
      "a: not a single root <svg> with a viewBox",
    );
  });

  it("sizes the name glyph as the name label", () => {
    expect(PROFESSION_GLYPH_SIZE).toBe(NAME_LABEL_HEIGHT);
  });
});
