/**
 * The sidecar's heartbeat, as `tg` and the dashboard judge it (#583).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  SIDECAR_FILE,
  SIDECAR_STALE_MS,
  parseSidecar,
  readSidecar,
  sidecarDown,
  writeSidecar,
} from "./sidecar.mjs";

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function bus() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sidecar-test-"));
  dirs.push(dir);
  return dir;
}

describe("sidecarDown", () => {
  it("is down with no heartbeat, up with a fresh one, down with one 31 s old", () => {
    const now = 1_000_000;
    expect(sidecarDown(now, null)).toBe(true);
    expect(sidecarDown(now, { lastSeen: now - 1_000 })).toBe(false);
    expect(sidecarDown(now, { lastSeen: now - SIDECAR_STALE_MS })).toBe(false);
    expect(sidecarDown(now, { lastSeen: now - 31_000 })).toBe(true);
  });
});

describe("the heartbeat file", () => {
  it("reads back what was written", () => {
    const dir = bus();
    writeSidecar(dir, 1234);
    expect(readSidecar(dir)).toEqual({ lastSeen: 1234 });
  });

  it("is none when missing, malformed, or a link", () => {
    const dir = bus();
    expect(readSidecar(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, SIDECAR_FILE), "not json");
    expect(readSidecar(dir)).toBeNull();
    expect(parseSidecar(JSON.stringify({ lastSeen: "soon" }))).toBeNull();
    fs.rmSync(path.join(dir, SIDECAR_FILE));
    const elsewhere = path.join(bus(), "fresh.json");
    fs.writeFileSync(elsewhere, JSON.stringify({ lastSeen: Date.now() }));
    fs.symlinkSync(elsewhere, path.join(dir, SIDECAR_FILE));
    expect(readSidecar(dir)).toBeNull();
  });
});
