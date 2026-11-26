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

describe("audio/sfx ear rules (#3371)", () => {
  const offend = (id: string, voice: string) =>
    check(
      { id, source: `// sfx ${id}: 0.1 s, peak -14 dBFS\nsetcpm(60);\nstack(\n  ${voice},\n);\n` },
      { allowedSounds: allowed },
    );

  it("bars a tonal voice over 1200 Hz, at the peak of its pitch envelope", async () => {
    expect(await offend("x", `s("sine").freq(1300).attack(0.01).decay(0.1).sustain(0)`)).toEqual([
      expect.stringContaining("reaches 1300 Hz"),
    ]);
    expect(
      await offend("x", `s("sine").freq(700).penv(12).attack(0.01).decay(0.1).sustain(0)`),
    ).toEqual([expect.stringContaining("reaches 1400 Hz")]);
  });

  it("holds a cast motif under 1200 Hz at its highest runtime rate", async () => {
    const voice = `s("sine").freq(900).attack(0.01).decay(0.1).sustain(0)`;
    expect(await offend("cast-motif-x", voice)).toEqual([expect.stringContaining("over 849 Hz")]);
    expect(await offend("x", voice)).toEqual([]);
  });

  it("wants a square or sawtooth low-passed to 3000 Hz", async () => {
    for (const lpf of ["", ".lpf(4000)"]) {
      expect(
        await offend("x", `s("square").freq(400).attack(0.01).decay(0.1).sustain(0)${lpf}`),
      ).toEqual([expect.stringContaining("needs lpf of 3000")]);
    }
  });

  it("wants white noise low-passed to 6000 Hz", async () => {
    expect(await offend("x", `s("white").attack(0.01).decay(0.1).sustain(0).hpf(3000)`)).toEqual([
      expect.stringContaining("needs lpf of 6000"),
    ]);
  });
});
