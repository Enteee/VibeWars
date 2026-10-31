/**
 * Whether the operator's checkout really holds a commit (#897).
 *
 * Every jail shares the checkout's `.git/objects` and can write there, and git
 * does not hash an object it reads for checkout. So a fast-forward can check
 * out a tree nobody merged while HEAD, `merge-base` and `git status` all agree
 * with the reviewed sha. The commit's objects in hubd's mirror, which no jail
 * can write, are the truth: this compares the working files to those.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { GIT_ENV, GIT_HARDENING } from "./git-hardening.mjs";

/**
 * @param {{ mirror: string, repoDir: string, sha: string }} where
 * @returns {string[]} paths whose content is not the mirror's or that the commit lacks, empty when the checkout is `sha`
 */
export function tamperedPaths({ mirror, repoDir, sha }) {
  return compare({ mirror, repoDir, sha }, true);
}

/**
 * The same check for a tree written from the mirror alone, the locked tree
 * (#1861): its git repository is its own and holds no commit, so there is
 * no second store to list the commit through.
 *
 * @param {{ mirror: string, dir: string, sha: string }} where
 * @returns {string[]} paths whose content is not the mirror's or that the commit lacks, empty when `dir` is `sha`
 */
export function treeMismatches({ mirror, dir, sha }) {
  return compare({ mirror, repoDir: dir, sha }, false);
}

/**
 * @param {{ mirror: string, repoDir: string, sha: string }} where
 * @param {boolean} bothStores whether `repoDir`'s own store must list the commit as the mirror does
 * @returns {string[]}
 */
function compare({ mirror, repoDir, sha }, bothStores) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "checkout-verify-"));
  try {
    const env = {
      ...process.env,
      ...GIT_ENV,
      GIT_DIR: mirror,
      GIT_WORK_TREE: repoDir,
      GIT_INDEX_FILE: path.join(dir, "index"),
    };
    /** @param {string[]} args */
    const git = (args) =>
      spawnSync("git", [...GIT_HARDENING, ...args], { env, cwd: repoDir, encoding: "utf8" });
    const read = git(["read-tree", sha]);
    if (read.status !== 0) {
      return [`(cannot read ${sha.slice(0, 7)} from the mirror)`];
    }
    git(["update-index", "-q", "--really-refresh"]);
    const diff = git(["diff-files", "--name-only"]);
    if (diff.status !== 0 && diff.stdout === "") {
      return ["(git diff-files failed)"];
    }
    // Files the commit lacks: ignored paths (node_modules, .bots) are not code run from git.
    // Only the commit's own root .gitignore, from the mirror: a planted nested
    // .gitignore with "*" would hide a planted package from --exclude-standard.
    const exclude = path.join(dir, "exclude");
    fs.writeFileSync(exclude, git(["show", `${sha}:.gitignore`]).stdout);
    const others = git(["ls-files", "--others", `--exclude-from=${exclude}`]);
    // What the merge wrote follows the trees in the shared store. Ignored paths
    // hide from the checks above, so list the commit through both stores.
    const lines = (/** @type {string} */ text) => text.split("\n").filter((line) => line !== "");
    if (!bothStores) {
      return [...new Set([...lines(diff.stdout), ...lines(others.stdout)])];
    }
    const theirs = new Set(lines(git(["ls-tree", "-r", sha]).stdout));
    const viaCheckout = spawnSync("git", [...GIT_HARDENING, "-C", repoDir, "ls-tree", "-r", sha], {
      env: { ...process.env, ...GIT_ENV },
      encoding: "utf8",
    });
    const ours = new Set(lines(viaCheckout.stdout));
    const forged = [...ours, ...theirs]
      .filter((line) => ours.has(line) !== theirs.has(line))
      .map((line) => line.split("\t").slice(1).join("\t"));
    return [...new Set([...lines(diff.stdout), ...lines(others.stdout), ...forged])];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Move the checkout's working files from `from` to `to`, reading both commits
 * from the mirror: `GIT_DIR` is the mirror and the index a scratch one, so
 * neither the checkout's object store nor its index or config can write a
 * file. The checkout's own index and branch are for the caller to move
 * afterwards (`git reset --mixed`, which writes no file); a forged object
 * then only makes its index look dirty.
 *
 * @param {{ mirror: string, repoDir: string, from: string, to: string }} where
 * @returns {boolean} false when git refused, for instance over a locally edited file
 */
export function updateFilesFromMirror({ mirror, repoDir, from, to }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "checkout-update-"));
  try {
    const env = {
      ...process.env,
      ...GIT_ENV,
      GIT_DIR: mirror,
      GIT_WORK_TREE: repoDir,
      GIT_INDEX_FILE: path.join(dir, "index"),
    };
    /** @param {string[]} args */
    const git = (args) =>
      spawnSync("git", [...GIT_HARDENING, ...args], { env, cwd: repoDir, encoding: "utf8" });
    if (git(["read-tree", from]).status !== 0) {
      return false;
    }
    // A scratch index has no stat data: hash the files so read-tree -m sees them
    // up to date. A locally edited file stays out of date and read-tree refuses.
    git(["update-index", "-q", "--really-refresh"]);
    return git(["read-tree", "-m", "-u", from, to]).status === 0;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Write `sha`'s files into the empty directory `dir`, reading them from the
 * mirror alone: `GIT_DIR` is the mirror and the index a scratch one, so no
 * object in the checkout's shared store can write a file.
 *
 * @param {{ mirror: string, dir: string, sha: string }} where
 * @returns {boolean} false when git refused
 */
export function writeTreeFromMirror({ mirror, dir, sha }) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "checkout-write-"));
  try {
    const env = {
      ...process.env,
      ...GIT_ENV,
      GIT_DIR: mirror,
      GIT_WORK_TREE: dir,
      GIT_INDEX_FILE: path.join(scratch, "index"),
    };
    /** @param {string[]} args */
    const git = (args) =>
      spawnSync("git", [...GIT_HARDENING, ...args], { env, cwd: dir, encoding: "utf8" });
    return git(["read-tree", sha]).status === 0 && git(["checkout-index", "-a"]).status === 0;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
