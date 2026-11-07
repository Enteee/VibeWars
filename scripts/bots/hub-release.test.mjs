/**
 * A release branch takes main's commits and nothing else (#2707). Each test
 * is a way to get something unreviewed onto a release past that check.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_TRACKING_BODY,
  closedIssues,
  exactPatchId,
  parseTracking,
  refuseReleaseRange,
  releaseCiVerdict,
} from "./hub-release.mjs";

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

/** @type {string} */
let dir;

/**
 * @param {string[]} args
 * @param {string} [input]
 */
function run(args, input) {
  const ran = spawnSync("git", args, { cwd: dir, env: ENV, encoding: "utf8", input });
  return { code: ran.status ?? 1, stdout: ran.stdout, stderr: ran.stderr };
}

/** @param {string[]} args */
function sh(args) {
  const ran = run(args);
  if (ran.code !== 0) {
    throw new Error(`git ${args.join(" ")}: ${ran.stderr}`);
  }
  return ran.stdout.trim();
}

const repo = {
  /** @param {string[]} args */
  git: (args) => Promise.resolve(run(args)),
  /**
   * @param {string[]} args
   * @param {string} input
   */
  gitInput: (args, input) => Promise.resolve(run(args, input)),
};

/**
 * @param {string} file
 * @param {string | Buffer} content
 * @param {string} message
 * @returns {string} the new commit
 */
function commit(file, content, message) {
  fs.writeFileSync(path.join(dir, file), content);
  sh(["add", file]);
  sh(["commit", "-q", "-m", message]);
  return sh(["rev-parse", "HEAD"]);
}

/** @param {string} sha the commit main took, picked onto the release branch with -x */
function pick(sha) {
  sh(["checkout", "-q", "release"]);
  sh(["cherry-pick", "-x", sha]);
  const head = sh(["rev-parse", "HEAD"]);
  sh(["checkout", "-q", "main"]);
  return head;
}

/** The release's head after a commit with `message`, changing `file` to `content`. */
function onRelease(
  /** @type {string} */ file,
  /** @type {string | Buffer} */ content,
  /** @type {string} */ message,
) {
  sh(["checkout", "-q", "release"]);
  const head = commit(file, content, message);
  sh(["checkout", "-q", "main"]);
  return head;
}

/** @type {string} */
let frozen;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-release-"));
  sh(["init", "-q", "-b", "main"]);
  commit("a.yml", "a:\n  b: 1\n", "a");
  frozen = commit("c.txt", "one\n", "c");
  sh(["branch", "release"]);
  // Main moves on after the freeze, so a fix is picked onto an older base.
  commit("c.txt", "zero\none\n", "more");
});

/** @param {string} head */
const check = (head) => refuseReleaseRange(repo, { head, old: frozen, main: "main" });

describe("a release branch", () => {
  it("starts at a commit on main, and nowhere else", async () => {
    expect(await refuseReleaseRange(repo, { head: frozen, old: null, main: "main" })).toBeNull();
    const stray = onRelease("x.txt", "x\n", "not on main");
    expect(await refuseReleaseRange(repo, { head: stray, old: null, main: "main" })).toContain(
      "starts at a commit on main",
    );
  });

  it("takes a cherry-pick of main's commit onto an older base", async () => {
    const fix = commit("a.yml", "a:\n  b: 2\n", "fix");
    expect(await check(pick(fix))).toBeNull();
  });

  it("refuses a commit with no cherry-pick line", async () => {
    expect(await check(onRelease("a.yml", "a:\n  b: 2\n", "fix"))).toContain("cherry-pick -x");
  });

  it("refuses a cherry-pick line that names a commit not on main", async () => {
    sh(["checkout", "-q", "-b", "side", frozen]);
    const side = commit("a.yml", "a:\n  b: 3\n", "side");
    sh(["checkout", "-q", "main"]);
    expect(await check(pick(side))).toContain("not a commit on main");
  });

  it("refuses a short sha in the cherry-pick line", async () => {
    const fix = commit("a.yml", "a:\n  b: 2\n", "fix");
    const head = onRelease(
      "a.yml",
      "a:\n  b: 2\n",
      `fix\n\n(cherry picked from commit ${fix.slice(0, 12)})`,
    );
    expect(await check(head)).toContain("full sha");
  });

  it("refuses a pick that differs from main's commit only in whitespace", async () => {
    const fix = commit("a.yml", "a:\n  b: 2\n", "fix");
    const head = onRelease("a.yml", "a:\n    b: 2\n", `fix\n\n(cherry picked from commit ${fix})`);
    expect(await check(head)).toContain("differs");
  });

  it("refuses a pick that differs from main's commit only in a binary file", async () => {
    const fix = commit("logo.png", Buffer.from([0, 1, 2, 3, 255]), "logo");
    const head = onRelease(
      "logo.png",
      Buffer.from([0, 1, 2, 4, 255]),
      `logo\n\n(cherry picked from commit ${fix})`,
    );
    expect(await check(head)).toContain("differs");
  });

  it("refuses an empty commit", async () => {
    const fix = commit("a.yml", "a:\n  b: 2\n", "fix");
    sh(["checkout", "-q", "release"]);
    sh(["commit", "-q", "--allow-empty", "-m", `fix\n\n(cherry picked from commit ${fix})`]);
    const head = sh(["rev-parse", "HEAD"]);
    sh(["checkout", "-q", "main"]);
    expect(await check(head)).toContain("empty");
  });

  it("refuses a merge commit", async () => {
    const fix = commit("a.yml", "a:\n  b: 2\n", "fix");
    // A faithful pick on a side branch, merged in: only the merge is wrong.
    sh(["checkout", "-q", "-b", "side", "release"]);
    sh(["cherry-pick", "-x", fix]);
    sh(["checkout", "-q", "release"]);
    sh(["merge", "-q", "--no-ff", "-m", `m\n\n(cherry picked from commit ${fix})`, "side"]);
    const head = sh(["rev-parse", "HEAD"]);
    sh(["checkout", "-q", "main"]);
    expect(await check(head)).toContain("merge commit");
  });

  it("refuses what does not build on the branch's head now", async () => {
    const fix = commit("a.yml", "a:\n  b: 2\n", "fix");
    const head = pick(fix);
    const moved = onRelease("c.txt", "two\n", "moved");
    expect(await refuseReleaseRange(repo, { head, old: moved, main: "main" })).toContain(
      "only fast-forward",
    );
  });
});

describe("exactPatchId", () => {
  it("is the same for a pick and its source, and empty for no change", async () => {
    const fix = commit("a.yml", "a:\n  b: 2\n", "fix");
    const picked = pick(fix);
    const id = await exactPatchId(repo, fix);
    expect(id).toMatch(/^[0-9a-f]{40}$/);
    expect(await exactPatchId(repo, picked)).toBe(id);
  });
});

describe("the tracking issue", () => {
  const body = [
    "## Features",
    "- [x] #12 swords",
    "- [ ] #13 and #14",
    "Not a checklist: #99",
    "## Fixes to cherry-pick",
    "* [ ] #20",
    "## Notes",
    "- [ ] #77",
  ].join("\n");
  const issue = { number: 5, title: "Release 0.3.0", author: "Enteee", body };

  it("lists the checklists' issue numbers, and nothing else", () => {
    expect(parseTracking(issue, "Enteee")).toEqual({
      number: 5,
      version: "0.3.0",
      features: [12, 13, 14],
      fixes: [20],
    });
  });

  it("is ignored when another account wrote it", () => {
    expect(parseTracking({ ...issue, author: "stranger" }, "Enteee")).toBeNull();
  });

  it("is ignored unless titled Release 0.N.0, whole", () => {
    expect(parseTracking({ ...issue, title: "Release 0.3.0 notes" }, "Enteee")).toBeNull();
    expect(parseTracking({ ...issue, title: "Release 1.0.0" }, "Enteee")).toBeNull();
  });

  it("reads only the first 64 KiB of the body", () => {
    const long = `## Features\n${"x".repeat(MAX_TRACKING_BODY)}\n- [ ] #1\n`;
    expect(parseTracking({ ...issue, body: long }, "Enteee")?.features).toEqual([]);
  });
});

describe("closedIssues", () => {
  it("reads GitHub's closing keywords", () => {
    expect(closedIssues("Closes #5, fixes #6. See #7. Resolved: #8")).toEqual([5, 6, 8]);
  });
});

describe("releaseCiVerdict", () => {
  it("waits while a run is going, then names the failed ones", () => {
    expect(releaseCiVerdict([])).toBeNull();
    expect(releaseCiVerdict([{ status: "in_progress", name: "CI" }])).toBeNull();
    expect(
      releaseCiVerdict([
        { status: "completed", conclusion: "success", name: "CI" },
        { status: "completed", conclusion: "failure", name: "Deploy" },
      ]),
    ).toEqual({ pass: false, failed: ["Deploy"] });
  });
});
