import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BLOCKED_TOKENS, blockedNames, blockedToken, nameTokens } from "./blocked-names.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

describe("blocked file names (#3173)", () => {
  it.each([...BLOCKED_TOKENS])("flags a file named after %s", (token) => {
    expect(blockedToken(`apps/web/src/ui/${token}.ts`)).toBe(token);
    expect(blockedToken(`apps/web/src/ui/game-${token}.test.ts`)).toBe(token);
  });

  it("splits on slashes, dashes, underscores, dots and camelCase", () => {
    expect(nameTokens("ui/buildBanner_v2.test.ts")).toEqual([
      "ui",
      "build",
      "banner",
      "v2",
      "test",
      "ts",
    ]);
    expect(blockedToken("src/matchStats.js")).toBe("stats");
  });

  it("flags a blocked directory: stats/index.js is requested as /stats/", () => {
    expect(blockedToken("stats/index.ts")).toBe("stats");
    expect(blockedToken("icons/ads/fireball.svg")).toBe("ads");
  });

  it("scans source modules and every public file, below their served directory", () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "blocked-names-"));
    const files = [
      "packages/core/src/stats/index.ts",
      "packages/core/src/match/fine.ts",
      "packages/core/src/notes.md",
      "apps/web/src/ui/fine.ts",
      "apps/web/public/icons/skill/banner.svg",
      "apps/web/public/music/samples/drum.wav",
    ];
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(tree, file)), { recursive: true });
      fs.writeFileSync(path.join(tree, file), "");
    }
    // `packages/core/src` is not part of any URL: `src` and `core` are never tokens.
    expect(blockedNames(tree)).toEqual([
      { file: "packages/core/src/stats/index.ts", token: "stats" },
      { file: "apps/web/public/icons/skill/banner.svg", token: "banner" },
    ]);
    fs.rmSync(tree, { recursive: true });
  });

  it("matches tokens exactly", () => {
    expect(blockedToken("packages/game-core/src/adrenaline.ts")).toBeUndefined();
    expect(blockedToken("packages/game-core/src/shared.ts")).toBeUndefined();
    expect(blockedToken("apps/web/src/music/tracks.ts")).toBeUndefined();
  });

  it("no source file has a name a blocker refuses", () => {
    expect(blockedNames(root)).toEqual([]);
  });
});
