import { describe, expect, it } from "vitest";

import { startEmployee } from "./start-employee.mjs";

describe("startEmployee (#722)", () => {
  // Rejected before tmux is ever run: the binary is not one.
  const where = { tmux: "/nonexistent/tmux", session: "s", root: "/nonexistent", cwd: "/" };

  it.each([
    "",
    "Developer",
    "developer@1",
    "developer@0",
    "developer@02",
    "a b",
    "$(id)",
    "x;y",
    "@2",
  ])("refuses %j, which is not an employee id", (id) => {
    expect(() => startEmployee(id, where)).toThrow("not an employee id");
  });
});
