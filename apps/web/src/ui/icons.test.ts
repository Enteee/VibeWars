import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PROFESSIONS, type ProfessionId, type SkillType } from "@vibewars/game-core";

import {
  SKILL_TYPE_NAME,
  professionIcon,
  skillBadgeHtml,
  skillTypeBadgeHtml,
  skillTypeIcon,
  soundIcon,
} from "./icons.js";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");

describe("icons", () => {
  it("has a file under public/ for every skill type", () => {
    for (const type of Object.keys(SKILL_TYPE_NAME) as SkillType[]) {
      expect(fs.existsSync(path.join(PUBLIC, skillTypeIcon(type))), type).toBe(true);
    }
  });

  it("has a file under public/ for every profession", () => {
    for (const profession of Object.keys(PROFESSIONS) as ProfessionId[]) {
      expect(fs.existsSync(path.join(PUBLIC, professionIcon(profession))), profession).toBe(true);
    }
  });

  it("has a file under public/ for both mute states", () => {
    for (const muted of [false, true]) {
      expect(fs.existsSync(path.join(PUBLIC, soundIcon(muted))), String(muted)).toBe(true);
    }
    expect(soundIcon(true)).not.toBe(soundIcon(false));
  });

  it("names a badge for screen readers and on hover", () => {
    expect(skillTypeBadgeHtml("hex")).toBe(
      '<img class="skill-type-badge" src="/icons/skill-type/hex.svg" alt="Hex" title="Hex">',
    );
  });

  it("gives a known skill its type badge, and an unknown one none", () => {
    expect(skillBadgeHtml("elementalist.fireball")).toBe(skillTypeBadgeHtml("spell"));
    expect(skillBadgeHtml("nobody.unknown")).toBe("");
  });
});
