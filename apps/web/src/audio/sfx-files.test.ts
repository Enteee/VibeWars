import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SOUND_IDS } from "./sound-ids.js";

const SFX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public/sfx");

/** Budgets from #104; the set raised by 32 KB for the cast voices (#3298). */
const MAX_FILE_BYTES = 10 * 1024;
const MAX_SET_BYTES = 104 * 1024;

// Rendered by `pnpm sfx:render` (#2524); the `.hash` files beside them are its cache.
describe("public/sfx", () => {
  it("holds exactly one MP3 per sound id", () => {
    expect(
      fs
        .readdirSync(SFX)
        .filter((f) => f.endsWith(".mp3"))
        .sort(),
    ).toEqual(SOUND_IDS.map((id) => `${id}.mp3`).sort());
  });

  it("stays inside the size budget", () => {
    let total = 0;
    for (const id of SOUND_IDS) {
      const bytes = fs.statSync(path.join(SFX, `${id}.mp3`)).size;
      expect(bytes, id).toBeLessThanOrEqual(MAX_FILE_BYTES);
      total += bytes;
    }
    expect(total).toBeLessThanOrEqual(MAX_SET_BYTES);
  });
});
