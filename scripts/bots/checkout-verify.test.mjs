import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { tamperedPaths } from "./checkout-verify.mjs";

const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "a",
  GIT_AUTHOR_EMAIL: "a@a",
  GIT_COMMITTER_NAME: "a",
  GIT_COMMITTER_EMAIL: "a@a",
};

/**
 * @param {string[]} args
 * @param {string} cwd
 * @param {string} [input]
 * @returns {string}
 */
function git(args, cwd, input) {
  const result = spawnSync("git", args, { cwd, env: ENV, encoding: "utf8", input });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A host-only mirror and a checkout fast-forwarded to its commit. */
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-test-"));
  dirs.push(dir);
  const mirror = path.join(dir, "mirror.git");
  const up = path.join(dir, "up");
  const repoDir = path.join(dir, "host");
  git(["init", "-q", "--bare", "-b", "main", mirror], dir);
  git(["init", "-q", "-b", "main", up], dir);
  fs.mkdirSync(path.join(up, "s"));
  fs.writeFileSync(path.join(up, "s", "f"), "good content\n");
  fs.writeFileSync(path.join(up, "s", "g"), "x\n");
  git(["add", "s"], up);
  git(["commit", "-q", "-m", "1"], up);
  git(["push", "-q", mirror, "main"], up);
  const sha = git(["rev-parse", "HEAD"], up);
  git(["clone", "-q", mirror, repoDir], dir);
  return { mirror, repoDir, sha, up };
}

describe("tamperedPaths", () => {
  it("finds nothing in an honest checkout", () => {
    const c = setup();
    expect(tamperedPaths({ mirror: c.mirror, repoDir: c.repoDir, sha: c.sha })).toEqual([]);
  });

  it("finds a tree object swapped in the checkout's own store", () => {
    const c = setup();
    // The merged commit changes s/f; the checkout is still on the first.
    fs.writeFileSync(path.join(c.up, "s", "f"), "merged content\n");
    git(["commit", "-qam", "2"], c.up);
    git(["push", "-q", c.mirror, "main"], c.up);
    const sha = git(["rev-parse", "HEAD"], c.up);
    // A jail fetches main, so the commit's objects sit loose in the shared store...
    git(["fetch", "-q", c.mirror, "main"], c.repoDir);
    const treeSha = git(["rev-parse", "FETCH_HEAD:s"], c.repoDir);
    const gSha = git(["rev-parse", "FETCH_HEAD:s/g"], c.repoDir);
    const evil = git(["hash-object", "-w", "--stdin"], c.repoDir, "evil content\n");
    const evilTree = git(["mktree"], c.repoDir, `100644 blob ${evil}\tf\n100644 blob ${gSha}\tg\n`);
    // ...and overwrites the tree object with one naming a blob of its own.
    const objects = path.join(c.repoDir, ".git", "objects");
    const loose = path.join(objects, treeSha.slice(0, 2), treeSha.slice(2));
    fs.chmodSync(loose, 0o644);
    fs.copyFileSync(path.join(objects, evilTree.slice(0, 2), evilTree.slice(2)), loose);
    git(["merge", "--ff-only", "-q", sha], c.repoDir);
    // what the restarter trusted: HEAD is the sha and status is clean
    expect(git(["rev-parse", "HEAD"], c.repoDir)).toBe(sha);
    expect(git(["status", "--porcelain"], c.repoDir)).toBe("");
    expect(fs.readFileSync(path.join(c.repoDir, "s", "f"), "utf8")).toBe("evil content\n");
    expect(tamperedPaths({ mirror: c.mirror, repoDir: c.repoDir, sha })).toEqual(["s/f"]);
  });

  it("finds an edited file", () => {
    const c = setup();
    fs.writeFileSync(path.join(c.repoDir, "s", "g"), "changed\n");
    expect(tamperedPaths({ mirror: c.mirror, repoDir: c.repoDir, sha: c.sha })).toEqual(["s/g"]);
  });

  it("refuses a sha the mirror does not have", () => {
    const c = setup();
    expect(tamperedPaths({ ...c, sha: "0".repeat(40) })).toHaveLength(1);
  });
});
