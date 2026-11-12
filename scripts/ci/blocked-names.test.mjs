import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BLOCKED_TOKENS, blockedNames, blockedToken, nameTokens } from "./blocked-names.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

describe("blocked file names (#3173)", () => {
  it.each([...BLOCKED_TOKENS])("flags a file named after %s", (token) => {
    expect(blockedToken(`apps/web/src/ui/${token}.ts`)).toBe(token);
    expect(blockedToken(`apps/web/src/ui/game-${token}.test.ts`)).toBe(token);
  });

  it("splits on dashes, underscores, dots and camelCase", () => {
    expect(nameTokens("src/buildBanner_v2.test.ts")).toEqual([
      "build",
      "banner",
      "v2",
      "test",
      "ts",
    ]);
    expect(blockedToken("src/matchStats.js")).toBe("stats");
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
