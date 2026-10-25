/**
 * The pauses between an agent's turns (#146): how long, what ends one
 * early, and what the company hears when the loop gives up.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { PAUSE_MAX, PAUSE_MIN, SHORT_TURN, hasUnread, nextPause } from "./agent-loop.mjs";
import { SYSTEM, obj } from "./protocol.mjs";

const AGENT_LOOP = path.join(path.dirname(fileURLToPath(import.meta.url)), "agent-loop.mjs");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** @returns {string} */
function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-loop-test-"));
  dirs.push(dir);
  return dir;
}

describe("nextPause", () => {
  it("doubles while turns stay short, up to the cap", () => {
    const pauses = [];
    let previous = 0;
    for (let i = 0; i < 8; i += 1) {
      previous = nextPause({ previous, ran: 5, failed: false });
      pauses.push(previous);
    }
    expect(pauses).toEqual([10, 20, 40, 80, 160, 300, 300, 300]);
    expect(PAUSE_MIN).toBe(10);
    expect(PAUSE_MAX).toBe(300);
  });

  it("goes back to the minimum after a long turn", () => {
    expect(nextPause({ previous: 160, ran: SHORT_TURN, failed: false })).toBe(PAUSE_MIN);
    expect(nextPause({ previous: 160, ran: SHORT_TURN - 1, failed: false })).toBe(PAUSE_MAX);
  });

  it("keeps a failed run's pause short; failures have their own limit", () => {
    expect(nextPause({ previous: 300, ran: 2, failed: true })).toBe(PAUSE_MIN);
  });
});

describe("hasUnread", () => {
  /** One inbox line, as the sidecar writes it. */
  const line = `${JSON.stringify({ ts: 1, from: "manager", text: "next: #274" })}\n`;

  it("is false with no inbox, and with an inbox read to its end", () => {
    const dir = scratch();
    expect(hasUnread(dir)).toBe(false);
    fs.writeFileSync(path.join(dir, "inbox.jsonl"), line);
    fs.writeFileSync(path.join(dir, "cursor"), `${String(Buffer.byteLength(line))}\n`);
    expect(hasUnread(dir)).toBe(false);
  });

  it("is true for a line past the cursor, or with no cursor yet", () => {
    const dir = scratch();
    fs.writeFileSync(path.join(dir, "inbox.jsonl"), line);
    expect(hasUnread(dir)).toBe(true);
    fs.writeFileSync(path.join(dir, "cursor"), "0\n");
    expect(hasUnread(dir)).toBe(true);
  });
});

describe("agent-loop.mjs", () => {
  it("prints the next pause", () => {
    const result = spawnSync(process.execPath, [AGENT_LOOP, "pause", "20", "3", "0"], {
      encoding: "utf8",
    });
    expect(result.stdout.trim()).toBe("40");
  });

  it("tells the whole company when a loop gives up, through the system outbox", () => {
    const root = scratch();
    const result = spawnSync(process.execPath, [AGENT_LOOP, "gave-up", "developer-1"], {
      encoding: "utf8",
      env: { ...process.env, VIBEWARS_BOT_ROOT: root },
    });
    expect(result.status).toBe(0);
    const outbox = path.join(root, "bus", SYSTEM, "outbox");
    const files = fs.readdirSync(outbox);
    expect(files).toHaveLength(1);
    const message = obj(JSON.parse(fs.readFileSync(path.join(outbox, files[0] ?? ""), "utf8")));
    expect(message.to).toBe("all");
    expect(message.text).toMatch(
      /developer-1 failed five runs in a row.*claude-llc-agent developer-1/,
    );
  });

  it("refuses a role that is not a plain name", () => {
    const result = spawnSync(process.execPath, [AGENT_LOOP, "gave-up", "../x"], {
      encoding: "utf8",
      env: { ...process.env, VIBEWARS_BOT_ROOT: scratch() },
    });
    expect(result.status).toBe(2);
  });
});
