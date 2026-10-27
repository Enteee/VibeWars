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
