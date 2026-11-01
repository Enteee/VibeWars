import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ALL_INSIGNIAS,
  ALL_OFFHANDS,
  ALL_UNIVERSAL_RUNES,
  ALL_WEAPONS,
  IMPLEMENTED_SKILLS,
  PROFESSIONS,
  type ProfessionId,
  type SkillType,
} from "@vibewars/game-core";

import {
  SKILL_TYPE_NAME,
  attackingIcon,
  fullscreenIcon,
  insigniaIcon,
  musicIcon,
  offhandIcon,
  professionIcon,
  runeIcon,
  settingsIcon,
  skillBadgeHtml,
  skillIcon,
  skillIconHtml,
  skillTypeBadgeHtml,
  skillTypeIcon,
  soundIcon,
  weaponIcon,
} from "./icons.js";

import { SKILL_ICONS } from "../../../../scripts/assets/skill-icon-table.mjs";
import { STATUS_ICON_TABLES, STATUS_ICONS } from "../../../../scripts/assets/status-icon-table.mjs";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");

describe("icons", () => {
  it("has a file under public/ for every skill type", () => {
    for (const type of Object.keys(SKILL_TYPE_NAME) as SkillType[]) {
      expect(fs.existsSync(path.join(PUBLIC, skillTypeIcon(type))), type).toBe(true);
    }
  });

  it("has an insignia and a rune file under public/ for each, named for alt (#2058)", () => {
    for (const insignia of ALL_INSIGNIAS) {
      const icon = insigniaIcon(insignia.id);
      expect(icon?.name, insignia.id).toBe(insignia.name);
      expect(fs.existsSync(path.join(PUBLIC, icon?.src ?? "")), insignia.id).toBe(true);
    }
    for (const rune of ALL_UNIVERSAL_RUNES) {
      const icon = runeIcon({ kind: "universal", runeId: rune.id, tier: "major" });
      expect(icon?.tier, rune.id).toBe(rune.tiered ? "major" : undefined);
      expect(fs.existsSync(path.join(PUBLIC, icon?.src ?? "")), rune.id).toBe(true);
    }
    for (const profession of Object.keys(PROFESSIONS)) {
      const icon = runeIcon({
        kind: "attribute",
        attributeId: `${profession}.x`,
        tier: "superior",
      });
      expect(icon?.src, profession).toContain(`attribute-${profession}.svg`);
      expect(fs.existsSync(path.join(PUBLIC, icon?.src ?? "")), profession).toBe(true);
    }
    expect(insigniaIcon("nope")).toBeUndefined();
    expect(
      runeIcon({ kind: "attribute", attributeId: "bard.song", tier: "minor" }),
    ).toBeUndefined();
  });

  it("has a file under public/ for every profession", () => {
    for (const profession of Object.keys(PROFESSIONS) as ProfessionId[]) {
      expect(fs.existsSync(path.join(PUBLIC, professionIcon(profession))), profession).toBe(true);
    }
  });

  it("has a file under public/ for every weapon and off-hand, named for alt (#419)", () => {
    for (const weapon of ALL_WEAPONS) {
      const icon = weaponIcon(weapon.id);
      expect(icon?.name, weapon.id).toBe(weapon.name);
      expect(fs.existsSync(path.join(PUBLIC, icon?.src ?? "")), weapon.id).toBe(true);
    }
    for (const offhand of ALL_OFFHANDS) {
      const icon = offhandIcon(offhand.id);
      expect(icon?.name, offhand.id).toBe(offhand.name);
      expect(fs.existsSync(path.join(PUBLIC, icon?.src ?? "")), offhand.id).toBe(true);
    }
  });

  it("has no icon for a weapon or off-hand it does not know", () => {
    expect(weaponIcon("lightsaber")).toBeUndefined();
    expect(offhandIcon("buckler")).toBeUndefined();
  });

  it("has a file under public/ for both mute states", () => {
    for (const muted of [false, true]) {
      expect(fs.existsSync(path.join(PUBLIC, soundIcon(muted))), String(muted)).toBe(true);
    }
    expect(soundIcon(true)).not.toBe(soundIcon(false));
  });

  it("has a file under public/ for both music mute states (#372)", () => {
    for (const muted of [false, true]) {
      expect(fs.existsSync(path.join(PUBLIC, musicIcon(muted))), String(muted)).toBe(true);
    }
    expect(musicIcon(true)).not.toBe(musicIcon(false));
  });

  it("has a file under public/ for Options and both fullscreen states (#454)", () => {
    expect(fs.existsSync(path.join(PUBLIC, settingsIcon()))).toBe(true);
    for (const fullscreen of [false, true]) {
      expect(fs.existsSync(path.join(PUBLIC, fullscreenIcon(fullscreen))), String(fullscreen)).toBe(
        true,
      );
    }
    expect(fullscreenIcon(true)).not.toBe(fullscreenIcon(false));
  });

  it("has a file under public/ for the attacking state", () => {
    expect(fs.existsSync(path.join(PUBLIC, attackingIcon()))).toBe(true);
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

describe("skill icons (#719)", () => {
  const SKILL_DIR = path.join(PUBLIC, "icons", "skill");
  const ids = IMPLEMENTED_SKILLS.map((skill) => skill.id);

  it("has a file under public/ for every implemented skill", () => {
    for (const id of ids) {
      expect(fs.existsSync(path.join(PUBLIC, skillIcon(id))), id).toBe(true);
    }
  });

  it("has a row in the generator table for every implemented skill, and none for another", () => {
    expect(Object.keys(SKILL_ICONS).sort()).toEqual([...ids].sort());
  });

  it("has each status row in exactly one per-profession table", () => {
    const rows = Object.values(STATUS_ICON_TABLES).flatMap((table) => Object.keys(table));
    expect(rows.length).toBe(Object.keys(STATUS_ICONS).length);
  });

  it("has no file for a skill that is not implemented", () => {
    const files = fs.readdirSync(SKILL_DIR).map((file) => file.replace(/\.svg$/, ""));
    expect(files.filter((id) => id !== "unknown" && !ids.includes(id))).toEqual([]);
  });

  it("gives every skill its own picture: no two share a glyph and a modifier", () => {
    const seen = new Map<string, string>();
    for (const [id, row] of Object.entries(
      SKILL_ICONS as Record<string, { glyph: string; modifier?: string }>,
    )) {
      const key = `${row.glyph}/${row.modifier ?? "-"}`;
      expect(seen.get(key), `${id} repeats ${seen.get(key) ?? ""}`).toBeUndefined();
      seen.set(key, id);
    }
  });

  it("keeps every icon small", () => {
    for (const file of fs.readdirSync(SKILL_DIR)) {
      expect(fs.statSync(path.join(SKILL_DIR, file)).size, file).toBeLessThanOrEqual(2000);
    }
  });

  it("shows an unknown skill the bare plate", () => {
    expect(skillIcon("nobody.unknown")).toBe("/icons/skill/unknown.svg");
    expect(fs.existsSync(path.join(PUBLIC, skillIcon("nobody.unknown")))).toBe(true);
  });

  it("is decorative markup of the size asked", () => {
    expect(skillIconHtml("elementalist.fireball", 48)).toBe(
      '<img class="skill-icon" src="/icons/skill/elementalist.fireball.svg" alt="" width="48" height="48">',
    );
  });

  it("matches what the generator writes now", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "vw-icons-"));
    try {
      execFileSync("node", [path.resolve(PUBLIC, "../../../scripts/assets/icons.mjs")], {
        env: { ...process.env, VIBEWARS_ICONS_OUT: out },
        stdio: "ignore",
      });
      const fresh = fs.readdirSync(path.join(out, "skill")).sort();
      expect(fresh).toEqual(fs.readdirSync(SKILL_DIR).sort());
      for (const file of fresh) {
        expect(fs.readFileSync(path.join(SKILL_DIR, file), "utf8"), file).toBe(
          fs.readFileSync(path.join(out, "skill", file), "utf8"),
        );
      }
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});
