import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertRan, selectSpecs } from "./select-e2e-specs.mjs";

describe("selectSpecs", () => {
  /** @type {string} */
  let dir;

  /** @param {...string} args */
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  /** @type {(file: string, body: string) => void} */
  const write = (file, body) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), body);
  };
  const body = Array.from({ length: 30 }, (_, i) => `line ${String(i)}`).join("\n");

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "select-e2e-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    git("config", "commit.gpgsign", "false");
    write("e2e/modified.spec.ts", body);
    write("e2e/deleted.spec.ts", body);
    write("e2e/renamed-edited.spec.ts", body);
    write("e2e/renamed-pure.spec.ts", `${body}\nmore`);
    write("e2e/helper.ts", "a");
    write("playwright.config.ts", "a");
    git("add", ".");
    git("commit", "-qm", "base");
    git("checkout", "-qb", "pr");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const commit = () => {
    git("add", "-A");
    git("commit", "-qm", "pr");
    return selectSpecs("main", "HEAD", dir).sort();
  };

  it("selects an added and a modified spec, not a deleted one", () => {
    write("e2e/added.spec.ts", body);
    write("e2e/modified.spec.ts", `${body}\nchanged`);
    fs.rmSync(path.join(dir, "e2e/deleted.spec.ts"));
    expect(commit()).toEqual(["e2e/added.spec.ts", "e2e/modified.spec.ts"]);
  });

  it("selects the new path of a renamed and edited spec (#429)", () => {
    git("mv", "e2e/renamed-edited.spec.ts", "e2e/new-name.spec.ts");
    write("e2e/new-name.spec.ts", `${body}\nedited`);
    expect(commit()).toEqual(["e2e/new-name.spec.ts"]);
  });

  it("selects the new path of a pure rename", () => {
    git("mv", "e2e/renamed-pure.spec.ts", "e2e/pure-new.spec.ts");
    expect(commit()).toEqual(["e2e/pure-new.spec.ts"]);
  });

  it("does not widen the run on a helper or config change", () => {
    write("e2e/helper.ts", "b");
    write("playwright.config.ts", "b");
    expect(commit()).toEqual([]);
  });
});

describe("assertRan", () => {
  it("fails a report with no tests run", () => {
    const report = JSON.stringify({ stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 10 } });
    expect(() => assertRan(report)).toThrow(/ran no tests/);
  });

  it("passes a report that ran a test", () => {
    expect(assertRan(JSON.stringify({ stats: { expected: 10, unexpected: 0, flaky: 0 } }))).toBe(
      10,
    );
  });
});
