import { PROFESSIONS, STATUS_DEFINITIONS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { ENGLISH_NAMES, type GameNames } from "./game-names.js";

/**
 * A translated player doc names conditions and professions as the game
 * draws them in its language (#3673): a German reader meets "Blutung" in
 * the game, so the help says "Blutung", not "Bleeding".
 */

const GAME_TABLES = import.meta.glob<GameNames>("./locales/*/game.ts", {
  import: "default",
  eager: true,
});

const DOCS = import.meta.glob<string>("../../../../docs/player/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** `line` without what is not prose: code spans, link targets and image paths. */
function prose(line: string): string {
  return line.replace(/`[^`]*`/g, " ").replace(/\]\([^)]*\)/g, "]");
}

/** The ids checked: conditions, not the hexes and enchantments named after their skill, and professions. */
const CHECKED = {
  statuses: Object.values(STATUS_DEFINITIONS)
    .filter((status) => status.category === "condition")
    .map((status) => status.id),
  professions: Object.values(PROFESSIONS).map((profession) => profession.id),
} as const;

/** Every English condition and profession name `table` draws differently, with its own name. */
function renamed(table: GameNames): [english: string, translated: string][] {
  return (["statuses", "professions"] as const).flatMap((kind) =>
    CHECKED[kind].flatMap((id): [english: string, translated: string][] => {
      const english = ENGLISH_NAMES[kind][id];
      const translated = table[kind][id];
      return english === undefined || translated === undefined || translated === english
        ? []
        : [[english, translated]];
    }),
  );
}

const LOCALES = Object.entries(GAME_TABLES).map(
  ([path, table]) => [path.split("/")[2] ?? path, table] as const,
);

describe("player docs use the game's names for conditions and professions (#3673)", () => {
  it("finds every locale's game names and docs", () => {
    expect(LOCALES.length).toBeGreaterThan(20);
    expect(Object.keys(DOCS).length).toBeGreaterThan(LOCALES.length);
  });

  it.each(LOCALES)("%s", (code, table) => {
    const terms = renamed(table).map(
      ([english, translated]) =>
        [
          new RegExp(`(?<![\\p{L}\\p{N}])${english}(?![\\p{L}\\p{N}])`, "u"),
          english,
          translated,
        ] as const,
    );
    const found = Object.entries(DOCS)
      .filter(([path]) => path.includes(`/docs/player/${code}/`))
      .flatMap(([path, text]) => {
        let fenced = false;
        return text.split("\n").flatMap((line, index) => {
          if (line.trimStart().startsWith("```")) {
            fenced = !fenced;
            return [];
          }
          if (fenced) {
            return [];
          }
          const words = prose(line);
          return terms
            .filter(([pattern]) => pattern.test(words))
            .map(
              ([, english, translated]) =>
                `${path.replace(/^.*docs\//, "docs/")}:${String(index + 1)}: "${english}" should be "${translated}"`,
            );
        });
      });
    expect(found).toEqual([]);
  });
});
