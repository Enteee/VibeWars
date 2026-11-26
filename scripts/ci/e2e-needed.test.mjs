import { describe, expect, it } from "vitest";

import { e2eNeeded } from "./e2e-needed.mjs";

describe("e2eNeeded", () => {
  it("skips an icon-only change", () => {
    expect(e2eNeeded(["apps/web/public/icons/skills/a.svg", "scripts/assets/icons.mjs"])).toBe(
      false,
    );
  });

  it("skips docs and top-level markdown", () => {
    expect(e2eNeeded(["docs/adr/0001-x.md", "README.md", "CLAUDE.md"])).toBe(false);
  });

  it("runs for player docs, which are bundled", () => {
    expect(e2eNeeded(["docs/player/guide.md"])).toBe(true);
    expect(e2eNeeded(["docs/player/img/a.png"])).toBe(true);
  });

  it("runs for a mixed change", () => {
    expect(e2eNeeded(["apps/web/public/icons/a.svg", "apps/web/src/main.ts"])).toBe(true);
  });

  it("runs for other public files, config and workflows", () => {
    expect(e2eNeeded(["apps/web/public/other.svg"])).toBe(true);
    expect(e2eNeeded(["package.json"])).toBe(true);
    expect(e2eNeeded([".github/workflows/ci.yml"])).toBe(true);
    expect(e2eNeeded(["packages/x/README.md"])).toBe(true);
  });

  it("runs when the file list is empty", () => {
    expect(e2eNeeded([])).toBe(true);
  });
});
