import { describe, expect, it } from "vitest";

import { FIRE_DEADLINE_MS, RESTART_HOLDOFF_MS, descendants, reconcile } from "./reconcile.mjs";
import { applyStaff, roleOf } from "./staff.mjs";

const NOW = 1_800_000_000_000;

/**
 * @param {string[]} ids
 * @returns {import("./staff.mjs").Staff}
 */
function company(ids) {
  /** @type {import("./staff.mjs").Staff["employees"]} */
  const employees = {};
  for (const id of ids) {
    employees[id] = {
      role: roleOf(id) ?? "",
      hiredAt: NOW - 3_600_000,
      by: "operator",
      reason: "first boot",
      state: "working",
      readyAt: null,
    };
  }
  return { employees, recent: [] };
}

/**
 * @param {string[]} ids
 * @returns {import("./reconcile.mjs").Pane[]}
 */
const panes = (ids) => ids.map((employee, i) => ({ pane: `%${String(i)}`, employee }));

const idle = { between: [], rebooting: false, started: new Map() };

describe("reconcile (#383)", () => {
  it("does nothing when the panes are the staff", () => {
    const plan = reconcile(
      company(["qa-tester", "qa-tester@2"]),
      panes(["qa-tester", "qa-tester@2"]),
      {
        now: NOW,
        ...idle,
      },
    );
    expect(plan).toEqual({ start: [], kill: [], forget: [] });
  });

  it("starts an employee with no pane, hired or lost", () => {
    const plan = reconcile(company(["qa-tester", "qa-tester@2"]), panes(["qa-tester"]), {
      now: NOW,
      ...idle,
    });
    expect(plan.start).toEqual(["qa-tester@2"]);
  });

  it("does not start one again within the holdoff", () => {
    const staff = company(["qa-tester@2"]);
    const hold = (/** @type {number} */ ago) =>
      reconcile(staff, [], { now: NOW, ...idle, started: new Map([["qa-tester@2", NOW - ago]]) })
        .start;
    expect(hold(RESTART_HOLDOFF_MS - 1)).toEqual([]);
    expect(hold(RESTART_HOLDOFF_MS)).toEqual(["qa-tester@2"]);
  });

  describe("a fire", () => {
    const fired = applyStaff(
      company(["qa-tester", "qa-tester@2"]),
      { verb: "fire", employee: "qa-tester@2", reason: "r", by: "manager" },
      "qa-tester@2",
      NOW,
    );
    const both = panes(["qa-tester", "qa-tester@2"]);

    it("leaves the pane running while the employee wraps up", () => {
      const plan = reconcile(fired, both, { now: NOW + 1000, ...idle });
      expect(plan).toEqual({ start: [], kill: [], forget: [] });
    });

    it("kills it once the employee ran company ready", () => {
      const ready = {
        ...fired,
        employees: {
          ...fired.employees,
          "qa-tester@2": { ...fired.employees["qa-tester@2"], readyAt: NOW + 5 },
        },
      };
      const plan = reconcile(/** @type {import("./staff.mjs").Staff} */ (ready), both, {
        now: NOW + 1000,
        ...idle,
      });
      expect(plan.kill).toEqual([{ pane: "%1", employee: "qa-tester@2" }]);
      expect(plan.forget).toEqual(["qa-tester@2"]);
    });

    it("kills it when it is between turns", () => {
      const plan = reconcile(fired, both, { now: NOW + 1000, ...idle, between: ["qa-tester@2"] });
      expect(plan.kill.map((pane) => pane.employee)).toEqual(["qa-tester@2"]);
    });

    it("kills it at the deadline", () => {
      expect(reconcile(fired, both, { now: NOW + FIRE_DEADLINE_MS - 1, ...idle }).kill).toEqual([]);
      expect(reconcile(fired, both, { now: NOW + FIRE_DEADLINE_MS, ...idle }).kill).toHaveLength(1);
    });

    it("forgets a firing employee whose pane is already gone, and never restarts it", () => {
      const plan = reconcile(fired, panes(["qa-tester"]), { now: NOW + 1000, ...idle });
      expect(plan).toEqual({ start: [], kill: [], forget: ["qa-tester@2"] });
    });
  });

  it("kills a pane nobody is employed for, and leaves one still being set up", () => {
    const plan = reconcile(company(["qa-tester"]), panes(["qa-tester", "qa-tester@3", ""]), {
      now: NOW,
      ...idle,
    });
    expect(plan.kill).toEqual([{ pane: "%1", employee: "qa-tester@3" }]);
    expect(plan.forget).toEqual([]);
  });

  it("does nothing during a reboot", () => {
    const staff = company(["qa-tester", "qa-tester@2"]);
    const plan = reconcile(staff, panes(["qa-tester", "stray"]), {
      now: NOW,
      ...idle,
      rebooting: true,
    });
    expect(plan).toEqual({ start: [], kill: [], forget: [] });
  });
});

describe("descendants", () => {
  it("finds a process and everything below it", () => {
    const listing = "  1 0\n 10 1\n 11 10\n 12 11\n 20 1\n";
    expect(descendants(listing, 10)).toEqual([10, 11, 12]);
    expect(descendants(listing, 99)).toEqual([99]);
  });
});
