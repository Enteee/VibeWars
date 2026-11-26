import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Every SVG under `public/` is well-formed XML (#654). Firefox parses an
 * SVG strictly, and Phaser's loader throws on one it rejects, so a single
 * malformed status icon left the whole arena undrawn there, while Chromium
 * tolerated it and every check stayed green.
 *
 * No strict XML parser is in the tree, so `xmlProblems` checks what such
 * a parser would refuse in files like these: tags that do not nest or
 * close, a repeated or unquoted attribute, a bare `&` or `<`, text outside
 * the one root element.
 */

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

const NAME = "[A-Za-z_:][\\w:.-]*";
const ENTITY = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/y;

/** Where `text` has a `&` that starts no entity, or a `<`; `undefined` if nowhere. */
function badCharacter(text: string): string | undefined {
  for (let at = text.indexOf("&"); at !== -1; at = text.indexOf("&", at + 1)) {
    ENTITY.lastIndex = at;
    if (!ENTITY.test(text)) {
      return `a bare "&" in ${JSON.stringify(text.slice(at, at + 12))}`;
    }
  }
  return text.includes("<") ? `a bare "<" in ${JSON.stringify(text)}` : undefined;
}

/** Why a strict XML parser would refuse `xml`; empty if it would not. */
function xmlProblems(xml: string): string[] {
  const problems: string[] = [];
  const open: string[] = [];
  let roots = 0;
  let at = 0;
  const declaration = /^<\?xml[^?]*\?>/.exec(xml);
  if (declaration !== null) {
    at = declaration[0].length;
  }
  const tag = new RegExp(
    `<(/?)(${NAME})((?:\\s+[^\\s=/>]+\\s*=\\s*(?:"[^"]*"|'[^']*'))*)\\s*(/?)>`,
    "y",
  );
  const attribute = new RegExp(`(${NAME})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "g");
  while (at < xml.length) {
    const next = xml.indexOf("<", at);
    const text = xml.slice(at, next === -1 ? xml.length : next);
    if (open.length === 0 && text.trim() !== "") {
      problems.push(`text outside the root: ${JSON.stringify(text.trim().slice(0, 20))}`);
    } else {
      const bad = badCharacter(text);
      if (bad !== undefined) {
        problems.push(bad);
      }
    }
    if (next === -1) {
      break;
    }
    at = next;
    if (xml.startsWith("<!--", at)) {
      const end = xml.indexOf("-->", at + 4);
      if (end === -1 || xml.slice(at + 4, end).includes("--")) {
        problems.push("a comment that does not close, or holds --");
        break;
      }
      at = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", at)) {
      const end = xml.indexOf("]]>", at);
      if (end === -1 || open.length === 0) {
        problems.push("a CDATA section outside an element, or unclosed");
        break;
      }
      at = end + 3;
      continue;
    }
    tag.lastIndex = at;
    const match = tag.exec(xml);
    if (match === null) {
      problems.push(`a malformed tag at ${JSON.stringify(xml.slice(at, at + 30))}`);
      break;
    }
    at = tag.lastIndex;
    const [, closing, name = "", attributes = "", selfClosing] = match;
    if (closing === "/") {
      if (attributes !== "" || selfClosing === "/") {
        problems.push(`a closing </${name}> with more in it`);
      }
      const expected = open.pop();
      if (expected !== name) {
        problems.push(`</${name}> closes <${expected ?? "nothing"}>`);
      }
      continue;
    }
    if (open.length === 0) {
      roots += 1;
    }
    const seen = new Set<string>();
    for (const [, attributeName = "", double, single] of attributes.matchAll(attribute)) {
      if (seen.has(attributeName)) {
        problems.push(`<${name}> repeats the attribute ${attributeName}`);
      }
      seen.add(attributeName);
      const bad = badCharacter(double ?? single ?? "");
      if (bad !== undefined) {
        problems.push(`<${name} ${attributeName}> holds ${bad}`);
      }
    }
    if (selfClosing !== "/") {
      open.push(name);
    }
  }
  if (open.length > 0) {
    problems.push(`unclosed: ${open.map((name) => `<${name}>`).join(", ")}`);
  }
  if (roots !== 1) {
    problems.push(`${String(roots)} root elements, not 1`);
  }
  return problems;
}

function svgsUnder(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return svgsUnder(full);
    }
    return entry.name.endsWith(".svg") ? [full] : [];
  });
}

describe("xmlProblems", () => {
  it("accepts well-formed SVG: comments, a declaration, entities, both quotes", () => {
    expect(
      xmlProblems(
        `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" a='1'>` +
          `<!-- a note -->\n  <title>A &amp; B</title><g><path d="M0 0"/></g></svg>\n`,
      ),
    ).toEqual([]);
  });

  it("refuses a repeated attribute, as Firefox does (guardian.svg, #654)", () => {
    expect(
      xmlProblems(
        `<svg><path stroke-linejoin="round" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      ),
    ).toEqual(["<path> repeats the attribute stroke-linejoin"]);
  });

  it("refuses tags that do not nest or close, and a second root", () => {
    expect(xmlProblems(`<svg><g></svg></g>`)).toEqual(["</svg> closes <g>", "</g> closes <svg>"]);
    expect(xmlProblems(`<svg><g></svg>`)).toContain("unclosed: <svg>");
    expect(xmlProblems(`<svg/><svg/>`)).toEqual(["2 root elements, not 1"]);
  });

  it("refuses an unquoted attribute, a bare & and text outside the root", () => {
    expect(xmlProblems(`<svg width=24></svg>`)).not.toEqual([]);
    expect(xmlProblems(`<svg><title>A & B</title></svg>`)).toEqual(['a bare "&" in "& B"']);
    expect(xmlProblems(`<svg/>stray`)).toEqual(['text outside the root: "stray"']);
  });
});

describe("public SVGs (#654)", () => {
  const files = svgsUnder(PUBLIC);

  it("finds the status, profession, projectile and other icons", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.map((file) => [path.relative(PUBLIC, file), file]))(
    "%s is well-formed XML",
    (_name, file) => {
      expect(xmlProblems(fs.readFileSync(file, "utf8"))).toEqual([]);
    },
  );
});
