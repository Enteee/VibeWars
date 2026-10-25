import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { dueNudges, parseSchedule, scheduleReader } from "./schedule.mjs";

const SHIPPED = path.join(path.dirname(fileURLToPath(import.meta.url)), "schedule.json");

const entry = {
  id: "groom-backlog",
  to: "manager",
  everyMinutes: 30,
  text: "Groom the Backlog.",
};

/** @param {Record<string, unknown>} change */
const withEntry = (change) => JSON.stringify({ nudges: [{ ...entry, ...change }] });

describe("parseSchedule (#537)", () => {
  it("accepts the schedule that ships", () => {
    const [groom] = parseSchedule(fs.readFileSync(SHIPPED, "utf8"));
    expect(groom).toMatchObject({ id: "groom-backlog", to: "manager", everyMinutes: 30 });
  });

  it("rejects each bad field, naming where", () => {
    expect(() => parseSchedule("[]")).toThrow("schedule is not an object");
    expect(() => parseSchedule('{"nudges":[],"x":1}')).toThrow("schedule.x");
    expect(() => parseSchedule(withEntry({ id: "Groom Backlog" }))).toThrow("nudges[0].id");
    expect(() => parseSchedule(withEntry({ to: "all" }))).toThrow("nudges[0].to");
    expect(() => parseSchedule(withEntry({ to: "manager@2" }))).toThrow("nudges[0].to");
    expect(() => parseSchedule(withEntry({ everyMinutes: 4 }))).toThrow("nudges[0].everyMinutes");
    expect(() => parseSchedule(withEntry({ everyMinutes: 7.5 }))).toThrow("everyMinutes");
    expect(() => parseSchedule(withEntry({ text: "" }))).toThrow("nudges[0].text");
    expect(() => parseSchedule(withEntry({ text: "x".repeat(501) }))).toThrow("nudges[0].text");
    expect(() => parseSchedule(withEntry({ extra: 1 }))).toThrow("nudges[0].extra");
  });

  it("rejects an id used twice", () => {
    expect(() => parseSchedule(JSON.stringify({ nudges: [entry, entry] }))).toThrow("used twice");
  });
});

describe("dueNudges (#537)", () => {
  const other = { ...entry, id: "other", everyMinutes: 10 };
  const minute = 60_000;

  it("counts from the last send, or from the start for one never sent", () => {
    const schedule = [entry, other];
    const due = (/** @type {number} */ now, /** @type {Map<string, number>} */ lastSent) =>
      dueNudges({ now, schedule, lastSent, since: 0 }).map((nudge) => nudge.id);

    expect(due(9 * minute, new Map())).toEqual([]);
    expect(due(10 * minute, new Map())).toEqual(["other"]);
    expect(due(31 * minute, new Map())).toEqual(["groom-backlog", "other"]);
    expect(due(31 * minute, new Map([["groom-backlog", 25 * minute]]))).toEqual(["other"]);
  });
});

describe("scheduleReader (#537)", () => {
  it("keeps the last good schedule on a bad file, complaining once, and none when missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-test-"));
    const file = path.join(dir, "schedule.json");
    /** @type {string[]} */
    const complaints = [];
    const read = scheduleReader(file, (problem) => complaints.push(problem));
    try {
      expect(read()).toEqual([]);
      expect(complaints).toEqual([]);

      fs.writeFileSync(file, withEntry({}));
      expect(read().map((nudge) => nudge.id)).toEqual(["groom-backlog"]);

      fs.writeFileSync(file, "{");
      expect(read().map((nudge) => nudge.id)).toEqual(["groom-backlog"]);
      read();
      expect(complaints).toHaveLength(1);

      fs.rmSync(file);
      expect(read()).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
