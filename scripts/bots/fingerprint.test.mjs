import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { STALE, buildLine, diff, fingerprint, isBuildInput, manifest } from "./fingerprint.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "fingerprint.mjs");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A checkout holding one of each kind of file, inputs or not.
 *
 * @returns {{ root: string, write: (file: string, text: string) => void }}
 */
function checkout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fingerprint-test-"));
  dirs.push(root);
  /** @type {(file: string, text: string) => void} */
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  for (const file of [
    "scripts/bots/hubd.mjs",
    "scripts/bots/hubd.test.mjs",
    "scripts/bots/fixtures/old.mjs",
    "scripts/bots/schedule.json",
    "nix/claude-llc.nix",
    "devenv.nix",
    "devenv.yaml",
    "devenv.lock",
    "README.md",
    "apps/web/src/main.ts",
  ]) {
    write(file, `${file}\n`);
  }
  return { root, write };
}

describe("isBuildInput", () => {
  it("is the staged scripts, the nix modules and devenv's own files", () => {
    for (const file of [
      "scripts/bots/hubd.mjs",
      "nix/claude-llc.nix",
      "devenv.nix",
      "devenv.yaml",
      "devenv.lock",
    ]) {
      expect(isBuildInput(file)).toBe(true);
    }
    for (const file of [
      "scripts/bots/hubd.test.mjs",
      "scripts/bots/fixtures/old.mjs",
      "scripts/bots/schedule.json",
      "nix/notes.md",
      "README.md",
      "apps/web/src/main.ts",
    ]) {
      expect(isBuildInput(file)).toBe(false);
    }
  });
});

describe("manifest and fingerprint", () => {
  it("are the same for the same tree", () => {
    const { root } = checkout();
    expect(manifest(root)).toEqual(manifest(root));
    expect(Object.keys(manifest(root))).toEqual([
      "devenv.lock",
      "devenv.nix",
      "devenv.yaml",
      "nix/claude-llc.nix",
      "scripts/bots/hubd.mjs",
    ]);
    expect(fingerprint(manifest(root))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("change when a script, a nix module or devenv.lock changes", () => {
    for (const file of ["scripts/bots/hubd.mjs", "nix/claude-llc.nix", "devenv.lock"]) {
      const { root, write } = checkout();
      const before = fingerprint(manifest(root));
      write(file, "changed\n");
      expect(fingerprint(manifest(root))).not.toBe(before);
    }
  });

  it("do not change for a test, a fixture or anything else", () => {
    for (const file of [
      "scripts/bots/hubd.test.mjs",
      "scripts/bots/fixtures/old.mjs",
      "README.md",
      "apps/web/src/main.ts",
    ]) {
      const { root, write } = checkout();
      const before = fingerprint(manifest(root));
      write(file, "changed\n");
      expect(fingerprint(manifest(root))).toBe(before);
    }
  });
});

describe("diff", () => {
  it("names changed, added and removed paths, sorted", () => {
    expect(
      diff(
        { "scripts/bots/b.mjs": "1", "scripts/bots/gone.mjs": "x", "devenv.nix": "s" },
        { "scripts/bots/b.mjs": "2", "nix/new.nix": "y", "devenv.nix": "s" },
      ),
    ).toEqual(["nix/new.nix", "scripts/bots/b.mjs", "scripts/bots/gone.mjs"]);
  });
});

describe("buildLine", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";

  it("says current when the build is the checkout's", () => {
    const build = { "devenv.nix": "a" };
    expect(buildLine({ build, checkout: { ...build }, sha })).toEqual({
      line: `build: ${fingerprint(build).slice(0, 8)} (current)`,
      stale: false,
    });
  });

  it("says STALE, where, and the locked commit when it is not", () => {
    const result = buildLine({
      build: { "devenv.nix": "a" },
      checkout: { "devenv.nix": "b", "scripts/bots/unread.mjs": "c" },
      sha,
    });
    expect(result.stale).toBe(true);
    expect(result.line).toMatch(
      /^build: [0-9a-f]{8} STALE: differs in devenv\.nix, scripts\/bots\/unread\.mjs \(locked 01234567\)$/,
    );
  });
});

describe("fingerprint.mjs check", () => {
  /**
   * @param {string} build
   * @param {string} root
   */
  const check = (build, root) =>
    spawnSync(process.execPath, [SCRIPT, "check", build, root], { encoding: "utf8" });

  it("exits 0 for a build of the checkout, and 3 with the paths once it changes", () => {
    const { root, write } = checkout();
    const build = fs.mkdtempSync(path.join(os.tmpdir(), "fingerprint-build-"));
    dirs.push(build);
    const made = spawnSync(process.execPath, [SCRIPT, "manifest", root], { encoding: "utf8" });
    fs.writeFileSync(path.join(build, "build-manifest.json"), made.stdout);

    expect(check(build, root).status).toBe(0);

    write("scripts/bots/unread.mjs", "new\n");
    const stale = check(build, root);
    expect(stale.status).toBe(STALE);
    expect(stale.stderr).toBe("scripts/bots/unread.mjs\n");
  });
});
