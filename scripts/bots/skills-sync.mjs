/**
 * The company's skills, as main has them, for every agent to load (#27).
 *
 * Skills live in the repository at `.claude/bots/skills/<name>/`, reviewed
 * like any other change. hubd exports main's copy into `.bots/skills-main/`
 * after each fetch, and every jail binds that directory read-only as its
 * user-level `~/.claude/skills`, so a merged skill reaches running agents
 * within one fetch, and nothing in any worktree changes.
 *
 * The bound directory itself is never replaced, only what is in it: a bind
 * mount holds on to the directory it was made from, so a new directory
 * renamed into its place would never be seen inside a running jail. Each
 * skill is swapped in whole instead (written beside it, then renamed), so an
 * agent reads either the old version of a skill or the new one, never half.
 *
 * Typed with JSDoc; see protocol.mjs.
 */
import fs from "node:fs";
import path from "node:path";

/** Where skills live in the repository. */
export const SKILLS_PREFIX = ".claude/bots/skills/";

/** A skill's directory name: what Claude Code shows as its name. */
const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * The skill files in a `git ls-tree -r -z main -- .claude/bots/skills/`
 * listing. Regular files only: a symlink in a skill could point anywhere on
 * the host once exported, and a submodule is not a file at all.
 *
 * @param {string} listing NUL-separated `<mode> <type> <oid>\t<path>` entries
 * @param {string} prefix
 * @returns {{ skill: string, file: string, oid: string }[]} `file` relative to the skill
 */
export function skillFiles(listing, prefix) {
  /** @type {{ skill: string, file: string, oid: string }[]} */
  const files = [];
  for (const entry of listing.split("\0")) {
    const tab = entry.indexOf("\t");
    if (tab === -1) {
      continue;
    }
    const [mode, type, oid] = entry.slice(0, tab).split(" ");
    const full = entry.slice(tab + 1);
    if ((mode !== "100644" && mode !== "100755") || type !== "blob" || oid === undefined) {
      continue;
    }
    if (!full.startsWith(prefix)) {
      continue;
    }
    const [skill, ...rest] = full.slice(prefix.length).split("/");
    if (skill === undefined || !SKILL_NAME.test(skill) || rest.length === 0) {
      continue;
    }
    if (rest.some((part) => part === "" || part === "." || part === "..")) {
      continue;
    }
    files.push({ skill, file: rest.join("/"), oid });
  }
  return files;
}

/**
 * Make `dir` hold exactly `skills`: each one swapped in whole, and any skill
 * main no longer has removed. Names starting with "." are this function's
 * own scratch space.
 *
 * @param {string} dir the bound directory, which is never itself replaced
 * @param {ReadonlyMap<string, ReadonlyMap<string, string>>} skills name to (file to contents)
 * @returns {void}
 */
export function installSkills(dir, skills) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, files] of skills) {
    const fresh = path.join(dir, `.new-${name}`);
    const stale = path.join(dir, `.old-${name}`);
    const live = path.join(dir, name);
    fs.rmSync(fresh, { recursive: true, force: true });
    fs.rmSync(stale, { recursive: true, force: true });
    for (const [file, contents] of files) {
      const target = path.join(fresh, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    }
    if (fs.existsSync(live)) {
      fs.renameSync(live, stale);
    }
    fs.renameSync(fresh, live);
    fs.rmSync(stale, { recursive: true, force: true });
  }
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.startsWith(".") && !skills.has(entry)) {
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
    }
  }
}
