import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { operatorArgv } from "./operator-staff.mjs";

describe("operatorArgv", () => {
  it("passes the role, the reason and --over-cap to hubd", () => {
    expect(operatorArgv("hire", ["qa-tester"])).toEqual({
      argv: ["hire", "qa-tester", "by the operator"],
    });
    expect(operatorArgv("hire", ["--over-cap", "qa-tester", "load"])).toEqual({
      argv: ["hire", "qa-tester", "load", "--over-cap"],
    });
    expect(operatorArgv("fire", ["qa-tester@2", "idle"])).toEqual({
      argv: ["fire", "qa-tester@2", "idle"],
    });
  });

  it("refuses a missing name, extra words and a fire over the cap", () => {
    expect(operatorArgv("hire", [])).toHaveProperty("usage");
    expect(operatorArgv("hire", ["a", "b", "c"])).toHaveProperty("usage");
    expect(operatorArgv("fire", ["a", "--over-cap"])).toHaveProperty("usage");
  });
});

describe("the operator's spool and the jail", () => {
  it("mounts hub/ read-only and binds writable only the employee's own spool", () => {
    const nix = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../../nix/claude-bot.nix"),
      "utf8",
    );
    const binds = nix
      .split("\n")
      .filter((line) => /bind(-try)?\s+"\$VIBEWARS_BOT_ROOT\/hub/.test(line));
    expect(binds.map((line) => line.trim())).toEqual([
      '--ro-bind "$VIBEWARS_BOT_ROOT/hub" "$VIBEWARS_BOT_ROOT/hub" \\',
      '--bind "$VIBEWARS_BOT_ROOT/hub/$employee" "$VIBEWARS_BOT_ROOT/hub/$employee" \\',
    ]);
  });
});
