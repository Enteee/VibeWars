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
  exactChange,
  parseTracking,
  refuseReleaseRange,
  releaseCiVerdict,
  releaseFloor,
  releaseGapRefusal,
  trackingToClose,
  RELEASE_MIN_GAP_MS,
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

/** @param {string[]} args */
function run(args) {
  const ran = spawnSync("git", args, { cwd: dir, env: ENV, encoding: "utf8" });
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
const check = (head) =>
  refuseReleaseRange(repo, { head, old: frozen, main: "main", previous: null });

describe("a release branch", () => {
  it("starts at a commit on main, and nowhere else", async () => {
    expect(
      await refuseReleaseRange(repo, { head: frozen, old: null, main: "main", previous: null }),
    ).toBeNull();
    const stray = onRelease("x.txt", "x\n", "not on main");
    expect(
      await refuseReleaseRange(repo, { head: stray, old: null, main: "main", previous: null }),
    ).toContain("starts at a commit on main");
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

  it("refuses a pick whose hunk lands elsewhere in the file than main's", async () => {
    // Two identical stretches: deleting the guard from either gives one patch-id.
    const stretch = "a\nb\nguard\nc\nd\n";
    sh(["checkout", "-q", "release"]);
    const base = commit("g.txt", `${stretch}x\n${stretch}`, "two stretches");
    sh(["checkout", "-q", "main"]);
    sh(["cherry-pick", base]);
    const fix = commit("g.txt", `${stretch}x\na\nb\nc\nd\n`, "drop the second guard");
    const head = onRelease(
      "g.txt",
      `a\nb\nc\nd\nx\n${stretch}`,
      `drop the first guard\n\n(cherry picked from commit ${fix})`,
    );
    const refused = await refuseReleaseRange(repo, {
      head,
      old: base,
      main: "main",
      previous: null,
    });
    expect(refused).toContain("differs");
  });

  it("refuses a pick of a commit the branch has already", async () => {
    const fix = commit("a.yml", "a:\n  b: 2\n", "fix");
    const back = commit("a.yml", "a:\n  b: 1\n", "back");
    const first = pick(fix);
    pick(back);
    sh(["checkout", "-q", "release"]);
    sh(["cherry-pick", "-x", "--allow-empty", fix]);
    const again = sh(["rev-parse", "HEAD"]);
    sh(["checkout", "-q", "main"]);
    expect(await check(again)).toContain("has " + fix.slice(0, 8) + " already");
    // Picked in an earlier push, too.
    expect(
      await refuseReleaseRange(repo, { head: again, old: first, main: "main", previous: null }),
    ).toContain("already");
    // Main's commits the branch started from count as had.
    const picked = await refuseReleaseRange(repo, {
      head: onRelease("a.yml", "a:\n  b: 9\n", `x\n\n(cherry picked from commit ${frozen})`),
      old: frozen,
      main: "main",
      previous: null,
    });
    expect(picked).toContain("already");
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
    expect(
      await refuseReleaseRange(repo, { head, old: moved, main: "main", previous: null }),
    ).toContain("only fast-forward");
  });
});

describe("exactChange", () => {
  it("is the same for a pick and its source", async () => {
    const fix = commit("a.yml", "a:\n  b: 2\n", "fix");
    const picked = pick(fix);
    const change = await exactChange(repo, fix);
    expect(change).toContain("a.yml");
    expect(await exactChange(repo, picked)).toBe(change);
  });
});

describe("a new release branch's floor", () => {
  const listed = [
    "1111111111111111111111111111111111111111\trefs/heads/release/0.1.0",
    "2222222222222222222222222222222222222222\trefs/heads/release/0.2.0",
    "3333333333333333333333333333333333333333\trefs/tags/v0.2.0",
    "4444444444444444444444444444444444444444\trefs/tags/v0.2.0^{}",
    "5555555555555555555555555555555555555555\trefs/tags/v0.20.0-rc",
  ].join("\n");

  it("is the next version, after the newest release branch or tag, starting from that one", () => {
    expect(releaseFloor(3, listed)).toStrictEqual({
      previous: "3333333333333333333333333333333333333333",
    });
    expect(releaseFloor(1, "")).toStrictEqual({ previous: null });
  });

  it("refuses a skipped, reused or far-off version", () => {
    for (const minor of [1, 2, 4, 999]) {
      expect(releaseFloor(minor, listed), String(minor)).toStrictEqual({
        refused: "the next release is 0.3.0, after the newest release branch or tag",
      });
    }
  });

  it("starts no earlier than the last release did", async () => {
    const now = sh(["rev-parse", "main"]);
    // The last release started at `frozen`; its head is the release branch.
    const previous = sh(["rev-parse", "release"]);
    expect(
      await refuseReleaseRange(repo, { head: now, old: null, main: "main", previous }),
    ).toBeNull();
    expect(
      await refuseReleaseRange(repo, {
        head: sh(["rev-parse", "main~2"]),
        old: null,
        main: "main",
        previous,
      }),
    ).toContain("no earlier than the last release");
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

describe("releaseGapRefusal (#2891)", () => {
  const published = "2026-11-08T23:32:33Z";
  const last = { tag: "v0.6.0", publishedAt: published };
  const at = Date.parse(published);

  it("allows the first release", () => {
    expect(releaseGapRefusal(null, at)).toBeNull();
  });

  it("names the time the gate opens, in UTC", () => {
    expect(releaseGapRefusal(last, at + 3_600_000)).toBe(
      "the last release (v0.6.0) was published at 2026-11-08T23:32:33Z; the next may start at 2026-11-10T23:32:33Z",
    );
  });

  it("opens at exactly 48 h", () => {
    expect(releaseGapRefusal(last, at + RELEASE_MIN_GAP_MS - 1)).not.toBeNull();
    expect(releaseGapRefusal(last, at + RELEASE_MIN_GAP_MS)).toBeNull();
  });

  it("refuses a date it cannot read", () => {
    expect(releaseGapRefusal({ tag: "v0.6.0", publishedAt: "soon" }, at)).toContain(
      "could not read",
    );
  });
});

describe("trackingToClose (#3125)", () => {
  const out = (/** @type {string} */ tag, extra = {}) => ({
    tag,
    draft: false,
    prerelease: false,
    url: `https://github.com/o/r/releases/tag/${tag}`,
    ...extra,
  });
  const issue = (/** @type {number} */ number, version = "0.7.0") => ({ number, version });

  it("closes the tracking issue of a published release", () => {
    expect(trackingToClose([issue(5)], [out("v0.7.0")])).toEqual([
      { number: 5, version: "0.7.0", url: "https://github.com/o/r/releases/tag/v0.7.0" },
    ]);
  });

  it("leaves a draft and a prerelease alone", () => {
    expect(trackingToClose([issue(5)], [out("v0.7.0", { draft: true })])).toEqual([]);
    expect(trackingToClose([issue(5)], [out("v0.7.0", { prerelease: true })])).toEqual([]);
  });

  it("closes nothing without a release, or with one for another version", () => {
    expect(trackingToClose([issue(5)], [])).toEqual([]);
    expect(trackingToClose([issue(6, "0.8.0")], [out("v0.7.0")])).toEqual([]);
  });

  it("closes both issues of one version", () => {
    expect(trackingToClose([issue(5), issue(6)], [out("v0.7.0")]).map((c) => c.number)).toEqual([
      5, 6,
    ]);
  });
});
