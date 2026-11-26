import { describe, expect, it } from "vitest";

import {
  ALERTS_PAGE,
  alertRows,
  alertsFailure,
  alertsPath,
  parseAlerts,
  renderAlerts,
} from "./hub-alerts.mjs";

const MAIN = { pr: null, state: "open", json: false };

/**
 * One alert as GitHub's REST API returns it.
 *
 * @param {number} number
 * @param {Record<string, unknown>} rule
 * @param {string} [text]
 */
function raw(number, rule, text = "Something is wrong") {
  return {
    number,
    state: "open",
    html_url: `https://github.com/Enteee/VibeWars/security/code-scanning/${String(number)}`,
    rule,
    most_recent_instance: {
      location: { path: "apps/web/src/ui/hud.ts", start_line: number * 10 },
      message: { text },
    },
  };
}

describe("parseAlerts", () => {
  it("defaults to open alerts on main, as text", () => {
    expect(parseAlerts([])).toEqual(MAIN);
  });

  it("reads --pr, --state and --json", () => {
    expect(parseAlerts(["--pr", "183", "--state", "fixed", "--json"])).toEqual({
      pr: 183,
      state: "fixed",
      json: true,
    });
  });

  it("refuses a bad number, a bad state, an unknown flag and a stray word", () => {
    for (const argv of [["--pr", "abc"], ["--pr"], ["--state", "bogus"], ["--all"], ["main"]]) {
      expect(parseAlerts(argv), argv.join(" ")).toHaveProperty("error");
    }
  });
});

describe("alertsPath", () => {
  it("reads main's ref, or a pull request's merge ref", () => {
    expect(alertsPath(MAIN, "Enteee/VibeWars")).toBe(
      "repos/Enteee/VibeWars/code-scanning/alerts?state=open&ref=refs%2Fheads%2Fmain&per_page=100",
    );
    expect(alertsPath({ ...MAIN, pr: 183, state: "dismissed" }, "Enteee/VibeWars")).toBe(
      "repos/Enteee/VibeWars/code-scanning/alerts?state=dismissed&ref=refs%2Fpull%2F183%2Fmerge&per_page=100",
    );
  });
});

describe("alertRows and renderAlerts", () => {
  it("puts the most severe first, then by number, falling back to the rule's severity", () => {
    const rows = alertRows([
      raw(9, { id: "js/b", severity: "warning", security_severity_level: "medium" }),
      raw(3, { id: "js/c", severity: "note" }),
      raw(12, { id: "js/a", severity: "error", security_severity_level: "high" }),
      raw(4, { id: "js/d", severity: "error", security_severity_level: "high" }),
    ]);
    const lines = renderAlerts(rows, MAIN).trimEnd().split("\n");
    expect(lines.map((line) => line.split(/\s+/)[0])).toEqual(["#4", "#12", "#9", "#3", "4"]);
    expect(lines[2]).toContain("medium");
    expect(lines[3]).toContain("note");
    expect(lines[4]).toBe("4 open alerts on refs/heads/main");
  });

  it("keeps the first line of a message, cut to 120 characters", () => {
    const [row] = alertRows([
      raw(1, { id: "js/x", severity: "error" }, `${"a".repeat(200)}\nmore`),
    ]);
    const graphemes = Array.from(new Intl.Segmenter().segment(row?.message ?? ""));
    expect(graphemes).toHaveLength(120);
    expect(row?.message.endsWith("…")).toBe(true);
  });

  it("strips what could fake terminal or mirror output", () => {
    const rlo = String.fromCodePoint(0x202e);
    const esc = String.fromCodePoint(0x1b);
    const [row] = alertRows([
      raw(1, { id: `js/x${rlo}`, severity: "error" }, `bad ${esc}[2Ktext${rlo} here`),
    ]);
    expect(row?.rule).toBe("js/x");
    expect(row?.message).toBe("bad [2Ktext here");
  });

  it("reads an alert with no location as path '' and line 0", () => {
    expect(alertRows([{ number: 5, rule: { id: "js/y", severity: "error" } }])).toEqual([
      {
        number: 5,
        state: "",
        severity: "error",
        rule: "js/y",
        path: "",
        line: 0,
        message: "",
        url: "",
      },
    ]);
  });

  it("says when there are none, and when only the first page is shown", () => {
    expect(renderAlerts([], MAIN)).toBe("no open code-scanning alerts on refs/heads/main\n");
    const many = alertRows(
      Array.from({ length: ALERTS_PAGE }, (_, i) => raw(i + 1, { id: "js/z", severity: "note" })),
    );
    expect(renderAlerts(many, MAIN).trimEnd().split("\n").at(-1)).toBe(
      "100 open alerts on refs/heads/main (first 100 shown)",
    );
  });

  it("prints the rows as JSON with --json", () => {
    const rows = alertRows([raw(2, { id: "js/x", severity: "error" })]);
    expect(JSON.parse(renderAlerts(rows, { ...MAIN, json: true }))).toEqual(rows);
  });
});

describe("alertsFailure", () => {
  it("never reads as no alerts", () => {
    expect(alertsFailure(1, "no analysis found (HTTP 404)", MAIN)).toBe(
      "CodeQL has not analysed refs/heads/main yet\n",
    );
    expect(alertsFailure(1, "Resource not accessible (HTTP 403)\nmore", MAIN)).toBe(
      "Resource not accessible (HTTP 403)\nthe company token cannot read code scanning; ask the operator\n",
    );
    expect(alertsFailure(1, "HTTP 500: Server Error", MAIN)).toBe("HTTP 500: Server Error\n");
  });
});
