import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Rules over game-core's own sources. They live here because game-core's
 * tests have no Node to read files with, and game-data depends on it.
 */
const CORE_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../game-core/src");

describe("game-core sources", () => {
  it("read attributeRanks at match time only through rankOf (#762, ADR-0019)", () => {
    // rankOf itself, the resolver that builds the sheet, and the tooltips
    // of a build, which no status touches.
    const allowed = new Set(["skills/tick.ts", "equipment/resolve.ts", "skills/describe.ts"]);
    const readers = fs
      .readdirSync(CORE_SRC, { recursive: true, encoding: "utf8" })
      .map((file) => file.split(path.sep).join("/"))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .filter((file) => !allowed.has(file))
      .filter((file) =>
        fs.readFileSync(path.join(CORE_SRC, file), "utf8").includes("attributeRanks.get("),
      );
    expect(readers).toEqual([]);
  });
});
