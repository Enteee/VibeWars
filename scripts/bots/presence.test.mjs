import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PRESENCE_STALE_MS, readRoster } from "./presence.mjs";

describe("readRoster (#363)", () => {
  const now = 1_792_931_449_969;
  const roles = ["manager", "developer", "lead-dev"];
  /** @type {string} */
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "presence-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /**
   * @param {string} name
   * @param {string} text
   */
  const write = (name, text) => {
    fs.writeFileSync(path.join(dir, name), text);
  };

  it("reads a fresh entry as fresh", () => {
    write("manager.json", JSON.stringify({ pid: 1, lastSeen: now - 1_000 }));
    expect(readRoster(dir, roles, now)).toEqual(
      new Map([["manager", { lastSeen: now - 1_000, fresh: true }]]),
    );
  });

  it("calls an entry exactly PRESENCE_STALE_MS old stale", () => {
    write("developer.json", JSON.stringify({ lastSeen: now - PRESENCE_STALE_MS }));
    expect(readRoster(dir, roles, now).get("developer")).toEqual({
      lastSeen: now - PRESENCE_STALE_MS,
      fresh: false,
    });
  });

  it("leaves out malformed JSON, a missing lastSeen and roles it was not asked about", () => {
    write("manager.json", "{not json");
    write("lead-dev.json", JSON.stringify({ pid: 2 }));
    write("stranger.json", JSON.stringify({ lastSeen: now }));
    expect(readRoster(dir, roles, now)).toEqual(new Map());
  });

  it("is empty when there is no roster directory yet", () => {
    expect(readRoster(path.join(dir, "missing"), roles, now)).toEqual(new Map());
  });
});
