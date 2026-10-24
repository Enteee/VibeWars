/**
 * Exporting main's skills for the jails to load (#27).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SKILLS_PREFIX, installSkills, skillFiles } from "./skills-sync.mjs";

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * @param {string} mode
 * @param {string} type
 * @param {string} file
 */
const entry = (mode, type, file) => `${mode} ${type} ${"a".repeat(40)}\t${file}`;

describe("skillFiles", () => {
  it("lists every regular file of every skill, relative to the skill", () => {
    const listing = [
      entry("100644", "blob", ".claude/bots/skills/fresh-branch/SKILL.md"),
      entry("100755", "blob", ".claude/bots/skills/fresh-branch/scripts/check.sh"),
      entry("100644", "blob", ".claude/bots/skills/review/SKILL.md"),
    ].join("\0");
    expect(skillFiles(listing, SKILLS_PREFIX).map(({ skill, file }) => `${skill}:${file}`)).toEqual(
      ["fresh-branch:SKILL.md", "fresh-branch:scripts/check.sh", "review:SKILL.md"],
    );
  });

  it("leaves out symlinks, submodules, loose files and odd names", () => {
    const listing = [
      entry("120000", "blob", ".claude/bots/skills/evil/SKILL.md"),
      entry("160000", "commit", ".claude/bots/skills/sub/SKILL.md"),
      entry("100644", "blob", ".claude/bots/skills/README.md"),
      entry("100644", "blob", ".claude/bots/skills/.hidden/SKILL.md"),
      entry("100644", "blob", ".claude/bots/skills/Upper/SKILL.md"),
      entry("100644", "blob", ".claude/bots/manager.md"),
    ].join("\0");
    expect(skillFiles(listing, SKILLS_PREFIX)).toEqual([]);
  });
});

describe("installSkills", () => {
  /** @returns {string} */
  function bound() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
    dirs.push(dir);
    return path.join(dir, "skills-main");
  }

  it("writes each skill, replaces a changed one, and drops one main no longer has", () => {
    const dir = bound();
    installSkills(
      dir,
      new Map([
        ["fresh-branch", new Map([["SKILL.md", "v1"]])],
        ["gone", new Map([["SKILL.md", "bye"]])],
      ]),
    );
    const inode = fs.statSync(dir).ino;

    installSkills(dir, new Map([["fresh-branch", new Map([["SKILL.md", "v2"]])]]));

    expect(fs.readFileSync(path.join(dir, "fresh-branch", "SKILL.md"), "utf8")).toBe("v2");
    expect(fs.existsSync(path.join(dir, "gone"))).toBe(false);
    expect(fs.readdirSync(dir)).toEqual(["fresh-branch"]);
    // The bound directory is the same one: a running jail sees the change.
    expect(fs.statSync(dir).ino).toBe(inode);
  });

  it("writes nested files", () => {
    const dir = bound();
    installSkills(dir, new Map([["s", new Map([["scripts/run.sh", "echo"]])]]));
    expect(fs.readFileSync(path.join(dir, "s", "scripts", "run.sh"), "utf8")).toBe("echo");
  });
});
