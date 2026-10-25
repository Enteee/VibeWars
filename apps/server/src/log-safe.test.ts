import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { quote } from "./log-safe.js";

const ROOMS = path.join(path.dirname(fileURLToPath(import.meta.url)), "rooms");

/** Any C0 or C1 control character, U+2028 or U+2029, left raw. */
function hasRawControl(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) {
      return true;
    }
  }
  return false;
}

describe("quote (#115)", () => {
  it("escapes what could end a log line or forge another", () => {
    for (const hostile of [
      "a\n[match] finished winner=1 reason=score",
      "a\r[match] finished",
      `a${String.fromCodePoint(0x1b)}[2K`,
      `a${String.fromCodePoint(0x2028)}b`,
      `a${String.fromCodePoint(0x85)}b`,
      'say "hi"',
    ]) {
      const quoted = quote(hostile);
      expect(hasRawControl(quoted), JSON.stringify(hostile)).toBe(false);
      expect(JSON.parse(quoted)).toBe(hostile);
    }
    expect(quote('say "hi"')).toBe('"say \\"hi\\""');
  });

  it("quotes anything as its string form", () => {
    expect(quote(undefined)).toBe('"undefined"');
    expect(quote(42)).toBe('"42"');
  });
});

/**
 * Every `${…}` inside a `console.*` call in `source`.
 *
 * @param {string} source
 */
function logInterpolations(source: string): string[] {
  const found: string[] = [];
  const call = /console\.(?:log|info|warn|error|debug)\(/g;
  for (let match = call.exec(source); match !== null; match = call.exec(source)) {
    let depth = 1;
    let end = match.index + match[0].length;
    const start = end;
    while (end < source.length && depth > 0) {
      depth += source[end] === "(" ? 1 : source[end] === ")" ? -1 : 0;
      end += 1;
    }
    const text = source.slice(start, end - 1);
    for (let i = text.indexOf("${"); i !== -1; i = text.indexOf("${", i + 2)) {
      let braces = 1;
      let close = i + 2;
      while (close < text.length && braces > 0) {
        braces += text[close] === "{" ? 1 : text[close] === "}" ? -1 : 0;
        close += 1;
      }
      found.push(text.slice(i + 2, close - 1).trim());
    }
  }
  return found;
}

/**
 * What a room's log line may interpolate unquoted: values the server
 * made, never a client. Anything else must be `quote(...)`.
 */
const SERVER_MADE = new Set([
  "this.state.code",
  "this.roomId",
  "client.sessionId",
  "sessionId",
  "room",
  "DEFAULT_MAP_ID",
  'reservations[0]?.roomId ?? "?"',
  // validatePlayerBuild's own field paths, such as `skillBar[2]`.
  "p.field",
  "String(this.state.players.size)",
  "String(team)",
  "String(dropped)",
  "String(RECONNECT_WINDOW_SECONDS)",
  'String(outcome.winningTeam ?? "draw")',
  "String(outcome.reason)",
]);

describe("the rooms' log lines (#115)", () => {
  it("interpolate only server-made values, or quote(...)", () => {
    const files = fs.readdirSync(ROOMS).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    const unsafe = files.flatMap((file) =>
      logInterpolations(fs.readFileSync(path.join(ROOMS, file), "utf8"))
        .filter((expression) => !expression.startsWith("quote(") && !SERVER_MADE.has(expression))
        .map((expression) => `${file}: \${${expression}}`),
    );
    expect(unsafe).toEqual([]);
  });

  it("would catch a raw client value", () => {
    expect(logInterpolations("console.warn(`[match] map ${mapId}`);")).toEqual(["mapId"]);
    expect(logInterpolations("console.info(`a ${quote(x)} b`, err);")).toEqual(["quote(x)"]);
  });
});
