import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Plain JS, shared with `pnpm music:check`: one implementation of the rules.
// @ts-expect-error -- JSDoc-typed .mjs, outside the tsc project on purpose
import { allowedSounds, checkSfx } from "../../scripts/music/analyse.mjs";
import { SOUND_IDS } from "./sound-ids.js";

const check = checkSfx as (
  sfx: { id: string; source: string },
  options: { allowedSounds: Set<string> },
) => Promise<string[]>;
const sounds = allowedSounds as (m: Record<string, unknown>) => Set<string>;

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = path.join(here, "sfx");
const allowed = sounds(
  JSON.parse(
    fs.readFileSync(path.join(here, "../../public/music/samples/strudel.json"), "utf8"),
  ) as Record<string, unknown>,
);

describe("audio/sfx sources (#2524)", () => {
  it("holds exactly one Strudel source per sound id", () => {
    expect(fs.readdirSync(SOURCES).sort()).toEqual(
      SOUND_IDS.map((id) => `${id}.strudel.js`).sort(),
    );
  });

  describe.each(SOUND_IDS)("%s", (id) => {
    const source = fs.readFileSync(path.join(SOURCES, `${id}.strudel.js`), "utf8");

    it("declares its length and peak in its header", () => {
      expect(source).toMatch(new RegExp(`^// sfx ${id}: [\\d.]+ s, peak -[\\d.]+ dBFS$`, "m"));
    });

    it("passes the checker", async () => {
      expect(await check({ id, source }, { allowedSounds: allowed })).toEqual([]);
    });
  });
});
