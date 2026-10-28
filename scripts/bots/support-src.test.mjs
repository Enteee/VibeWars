/**
 * The support jail's source (#148): main as files, no `.git`, one export.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { exportMain } from "./support-src.mjs";

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string}
 */
function git(cwd, args) {
  const run = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  });
  if (run.status !== 0) {
    throw new Error(run.stderr);
  }
  return run.stdout.trim();
}

/** A bare mirror with main, the way hubd keeps it, and a work tree to commit from. */
function mirror() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "support-src-"));
  dirs.push(root);
  const work = path.join(root, "work");
  const bare = path.join(root, "mirror");
  fs.mkdirSync(work);
  git(work, ["init", "-q", "-b", "main"]);
  /** @param {string} text */
  const commit = (text) => {
    fs.writeFileSync(path.join(work, "README.md"), text);
    git(work, ["add", "."]);
    git(work, ["commit", "-q", "-m", text]);
    git(root, ["clone", "-q", "--bare", "--no-local", work, bare + ".next"]);
    fs.rmSync(bare, { recursive: true, force: true });
    fs.renameSync(bare + ".next", bare);
    return git(work, ["rev-parse", "HEAD"]);
  };
  return { root, bare, commit, sources: path.join(root, "sources") };
}

describe("exportMain", () => {
  it("exports main as files, with no .git, into a directory named by its commit", () => {
    const m = mirror();
    const sha = m.commit("first");
    const { sha: exported, dir } = exportMain(m.bare, m.sources);
    expect(exported).toBe(sha);
    expect(dir).toBe(path.join(m.sources, sha));
    expect(fs.readFileSync(path.join(dir, "README.md"), "utf8")).toBe("first");
    expect(fs.readdirSync(dir)).toEqual(["README.md"]);
  });

  it("keeps an export it already has, and deletes the older ones when main moves", () => {
    const m = mirror();
    const first = m.commit("first");
    exportMain(m.bare, m.sources);
    expect(exportMain(m.bare, m.sources).sha).toBe(first);
    const second = m.commit("second");
    exportMain(m.bare, m.sources);
    expect(fs.readdirSync(m.sources)).toEqual([second]);
  });

  it("refuses a mirror with no main", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "support-src-"));
    dirs.push(root);
    git(root, ["init", "-q", "--bare", "mirror"]);
    expect(() => exportMain(path.join(root, "mirror"), path.join(root, "sources"))).toThrow(
      /no main/,
    );
  });
});
