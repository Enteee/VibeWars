import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every source file under `dir`, tests left out. */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sources(full);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

/** The arguments of each `console.*(…)` call in `source`, parentheses balanced. */
function consoleArguments(source: string): string[] {
  const calls: string[] = [];
  for (const match of source.matchAll(/console\.\w+\(/g)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    while (end < source.length && depth > 0) {
      const char = source[end];
      depth += char === "(" ? 1 : char === ")" ? -1 : 0;
      end += 1;
    }
    calls.push(source.slice(start, end - 1));
  }
  return calls;
}

/** `text` with what string literals say dropped, and a template's `${…}` kept. */
function expressions(text: string): string {
  return text
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, (template) =>
      [...template.matchAll(/\$\{([^}]*)\}/g)].map(([, inner]) => inner).join(" "),
    );
}

/**
 * What names a lobby key, or what is derived from it (#1681), and what
 * carries one in an invite URL (#2100).
 */
const KEY_NAMES =
  /\b(code|lobbyCode|key|lobbyKey|lobbyRoom|roomId|password|proofKey|url|inviteUrl|href|hash|location|fragment|lobbyLink|invited|rest)\b/;

describe("a lobby key in the console (#1681, #2100, ADR-0048)", () => {
  const files = [
    ...["net", "ui"].flatMap((dir) => sources(path.join(SRC, dir))),
    path.join(SRC, "main.ts"),
  ];

  it("finds the console calls it checks", () => {
    expect(files.flatMap((file) => consoleArguments(fs.readFileSync(file, "utf8")))).not.toEqual(
      [],
    );
  });

  it.each(files.map((file) => [path.relative(SRC, file), file]))(
    "is never formatted into one in %s",
    (_name, file) => {
      for (const args of consoleArguments(fs.readFileSync(file, "utf8"))) {
        expect(expressions(args), args).not.toMatch(KEY_NAMES);
      }
    },
  );
});
