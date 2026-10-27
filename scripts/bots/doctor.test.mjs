import { describe, expect, it } from "vitest";

import { renderTable } from "./doctor.mjs";

const SECRET = "sk-ant-oat01-SECRET";

describe("renderTable", () => {
  it("shows what is not set up and whose each credential is", () => {
    const out = renderTable([
      {
        name: "claude",
        identity: { state: "not set up", who: null, expiry: null, scopes: null },
        stored: "/c/claude",
        operators: null,
      },
      {
        name: "github api",
        identity: { state: "ok", who: "bot", expiry: null, scopes: "repo" },
        stored: "/c/gh",
        operators: true,
      },
      {
        name: "telegram",
        identity: { state: "ok", who: "@vw", expiry: null, scopes: null },
        stored: "/c/t",
        operators: null,
        applicable: false,
      },
    ]);
    const lines = out.split("\n");
    expect(lines[0]).toMatch(/^credential\s+identity\s+expiry\s+scopes\s+stored\s+operator's$/);
    expect(lines[1]).toMatch(/claude\s+not set up\s.*\s-$/);
    expect(lines[2]).toMatch(/github api\s+bot\s.*YES$/);
    expect(lines[3]).toMatch(/telegram\s+@vw\s.*no$/);
  });

  it("says can't tell when an identity is unknown", () => {
    const out = renderTable([
      {
        name: "claude",
        identity: { state: "ok", who: "x", expiry: null, scopes: null },
        stored: "/c",
        operators: null,
      },
    ]);
    expect(out).toContain("can't tell");
  });

  it("prints an error's short note and nothing else of it", () => {
    const out = renderTable([
      {
        name: "claude",
        identity: { state: "error", who: null, expiry: null, scopes: null, note: "unreadable" },
        stored: "/c",
        operators: null,
      },
    ]);
    expect(out).toContain("error: unreadable");
    expect(out).not.toContain(SECRET);
  });
});
