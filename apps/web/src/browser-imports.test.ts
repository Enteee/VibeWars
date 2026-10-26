import { ESLint, Linter } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * The client must not import the game-maps root (#646): its loader reads
 * `maps/` with node:fs, which vitest under Node resolves and vite dev
 * turns into a page that dies on load. Only the lint rule stands between
 * the two, so this checks the rule as it applies to apps/web.
 */

async function importRuleFor(file: string): Promise<Linter.RuleEntry> {
  const config = (await new ESLint().calculateConfigForFile(file)) as Linter.Config;
  const rule = config.rules?.["no-restricted-imports"];
  if (rule === undefined) {
    throw new Error(`no no-restricted-imports rule for ${file}`);
  }
  return rule;
}

function problems(rule: Linter.RuleEntry, source: string): string[] {
  return new Linter()
    .verify(source, {
      languageOptions: { sourceType: "module" },
      rules: { "no-restricted-imports": rule },
    })
    .map((message) => message.message);
}

describe("apps/web imports from @vibewars/game-maps (#646)", () => {
  it("refuses the root, whose loader needs node:fs", async () => {
    const rule = await importRuleFor("apps/web/src/match-view.ts");
    expect(problems(rule, `import { allWallSegments } from "@vibewars/game-maps";`)).toEqual([
      expect.stringContaining("node:fs"),
    ]);
  });

  it("allows the browser-safe subpaths", async () => {
    const rule = await importRuleFor("apps/web/src/match-view.ts");
    expect(
      problems(
        rule,
        [
          `import { allWallSegments } from "@vibewars/game-maps/geometry";`,
          `import { parseMap } from "@vibewars/game-maps/schema";`,
          `import arena from "@vibewars/game-maps/maps/arena.json";`,
        ].join("\n"),
      ),
    ).toEqual([]);
  });
});
