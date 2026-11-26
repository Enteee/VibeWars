import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Players read the name as VibeWars (#350). Only the text they see is
 * checked: identifiers such as storage keys stay lowercase.
 */
describe("the page's name", () => {
  it.each(["index.html", "public/icon.svg"])("is spelled VibeWars in %s", (file) => {
    const source = fs.readFileSync(path.join(WEB, file), "utf8");
    expect(source).toContain("<title>VibeWars</title>");
    expect(source).not.toMatch(/>\s*vibewars\s*</);
    expect(source).not.toMatch(/aria-label="vibewars"/);
  });
});
