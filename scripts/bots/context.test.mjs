/**
 * The context ceiling every command says (#1695): under, near and over it,
 * and no ceiling at all without a readable file.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  NEAR_MARGIN,
  contextFile,
  contextState,
  isTakingComment,
  overLine,
  startLine,
} from "./context.mjs";

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A context file holding `text`.
 *
 * @param {string} text
 * @returns {string}
 */
function file(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "context-test-"));
  dirs.push(dir);
  const at = path.join(dir, "context.json");
  fs.writeFileSync(at, text);
  return at;
}

const CEILING = 120_000;

/**
 * @param {number} tokens
 */
function at(tokens) {
  return contextState(file(JSON.stringify({ tokens, ceiling: CEILING })));
}

describe("contextState and its lines", () => {
  it("says nothing well under the ceiling", () => {
    const state = at(CEILING - NEAR_MARGIN - 1);

    expect(state).toEqual({ tokens: 99_999, ceiling: CEILING });
    expect(overLine(state)).toBeNull();
    expect(startLine(state)).toBeNull();
  });

  it("advises against starting a card near it, and is not yet over", () => {
    const state = at(104_000);

    expect(overLine(state)).toBeNull();
    expect(startLine(state)).toBe(
      "context 104k of 120k: too little room to start a card; end your turn and start it fresh.",
    );
    expect(startLine(at(CEILING - NEAR_MARGIN))).not.toBeNull();
  });

  it("says to end the turn at and over it, and still advises on a card", () => {
    const state = at(128_000);

    expect(overLine(state)).toBe(
      "context 128k of 120k: finish this step, commit and push, then end your turn.",
    );
    expect(startLine(state)).not.toBeNull();
    expect(overLine(at(CEILING))).not.toBeNull();
  });

  it("is no ceiling without a file, or with one that is not one", () => {
    expect(contextState(null)).toBeNull();
    expect(contextState(path.join(os.tmpdir(), "context-test-absent", "context.json"))).toBeNull();
    for (const text of ["{", "null", "7", JSON.stringify({ tokens: "128000", ceiling: CEILING })]) {
      const state = contextState(file(text));

      expect(state).toBeNull();
      expect(overLine(state)).toBeNull();
      expect(startLine(state)).toBeNull();
    }
  });
});

describe("contextFile", () => {
  it("is the employee's on the bus, and none outside a sandbox", () => {
    expect(contextFile({ VIBEWARS_BOT_BUS: "/bus", VIBEWARS_BOT_EMPLOYEE: "developer@3" })).toBe(
      path.join("/bus", "developer@3", "context.json"),
    );
    expect(contextFile({})).toBeNull();
  });
});

describe("isTakingComment", () => {
  it("is a `taking #N` comment on an issue, by any body flag", () => {
    expect(isTakingComment(["issue", "comment", "12", "--body", "taking #12 (developer@3)"])).toBe(
      true,
    );
    expect(isTakingComment(["issue", "comment", "12", "-b", "Taking #12"])).toBe(true);
    expect(isTakingComment(["issue", "comment", "12", "--body=taking #12"])).toBe(true);
  });

  it("is not any other comment or command", () => {
    expect(isTakingComment(["issue", "comment", "12", "--body", "done, see #13"])).toBe(false);
    expect(isTakingComment(["issue", "comment", "12", "--body", "not taking #12"])).toBe(false);
    expect(isTakingComment(["pr", "comment", "12", "--body", "taking #12"])).toBe(false);
    expect(isTakingComment(["issue", "view", "12"])).toBe(false);
  });
});
