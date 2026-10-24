import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SOUND_IDS } from "./sound-ids.js";

const SFX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public/sfx");

/** Budgets from #104. */
const MAX_FILE_BYTES = 10 * 1024;
const MAX_SET_BYTES = 48 * 1024;

describe("public/sfx", () => {
  it("holds exactly one MP3 per sound id", () => {
    expect(fs.readdirSync(SFX).sort()).toEqual(SOUND_IDS.map((id) => `${id}.mp3`).sort());
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
