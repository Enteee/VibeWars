import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Plain JS, shared with `pnpm music:check`: one implementation of the rules.
// @ts-expect-error -- JSDoc-typed .mjs, outside the tsc project on purpose
import { allowedSounds, checkSting } from "../../scripts/music/analyse.mjs";
// @ts-expect-error -- as above
import { checkStingManifest } from "../../scripts/music/manifest.mjs";
import { STINGS, STING_IDS, type StingId } from "./stings/index.js";
import { TRACKS } from "./tracks/index.js";

const check = checkSting as (
  sting: { id: string; source: string; cycles: number },
  options: { key: string; bpm: number; allowedSounds: Set<string> },
) => Promise<string[]>;
const sounds = allowedSounds as (m: Record<string, unknown>) => Set<string>;
const hygiene = checkStingManifest as (
  manifest: Readonly<Record<string, { cycles: unknown }>>,
  files: readonly string[],
) => string[];

const here = path.dirname(fileURLToPath(import.meta.url));
const stingsDir = path.join(here, "stings");
const allowed = sounds(
  JSON.parse(
    fs.readFileSync(path.join(here, "../../public/music/samples/strudel.json"), "utf8"),
  ) as Record<string, unknown>,
);

/** Every key and tempo a track plays at: a sting plays in the track's (#2523). */
const SETTINGS = [
  ...new Map(TRACKS.map((t) => [`${t.key} ${String(t.bpm)}`, { key: t.key, bpm: t.bpm }])).values(),
];

const cases: [StingId, string, number][] = STING_IDS.flatMap((id) =>
  SETTINGS.map(({ key, bpm }): [StingId, string, number] => [id, key, bpm]),
);

describe.each(cases)("sting %s in %s at %i bpm (#2523)", (id, key, bpm) => {
  it("passes the checker", async () => {
    expect(await check(STINGS[id], { key, bpm, allowedSounds: allowed })).toEqual([]);
  });
});

describe("the stings' manifest (#2523)", () => {
  it("has an entry for every sting file, and a file for every entry", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(stingsDir, "manifest.json"), "utf8"),
    ) as Record<string, { cycles: unknown }>;
    expect(hygiene(manifest, fs.readdirSync(stingsDir))).toEqual([]);
    expect(Object.keys(manifest).sort()).toEqual([...STING_IDS].sort());
  });

  it("refuses a file without an entry, an entry without a file, and cycles out of 1–4", () => {
    expect(
      hygiene({ "first-blood": { cycles: 5 }, gone: { cycles: 1 } }, [
        "first-blood.strudel.js",
        "stray.strudel.js",
      ]),
    ).toEqual([
      "sting first-blood: cycles is 5, want 1–4",
      "sting gone: gone.strudel.js does not exist",
      "sting stray: stray.strudel.js has no manifest entry",
    ]);
  });
});

describe("the sting checker (#2523)", () => {
  const options = { key: "D aeolian", bpm: 72, allowedSounds: allowed };
  const sting = (source: string) => ({ id: "probe", source, cycles: 1 });

  it("passes a phrase in scale degrees", async () => {
    expect(await check(sting('n("0 2 4").scale(KEY).s("harp")'), options)).toEqual([]);
  });

  it.each([
    ["a tempo of its own", 'setcpm(30)\nn("0 2 4").scale(KEY).s("harp")', "sets a tempo"],
    ["an unknown chord", 'chord("Csus2").voicing().s("harp")', 'unknown chord "Csus2"'],
    ["a note outside the key", 'note("d3 f#3").s("harp")', "notes outside D aeolian: F#"],
    ["a sound outside the palette", 'n("0").scale(KEY).s("kazoo")', 'sound "kazoo"'],
    ["an unknown control", 'n("0").scale(KEY).s("harp").phaser(4)', 'control "phaserrate"'],
    ["clipping", 'n("[0,2,4,7]").scale(KEY).s("harp").gain(1.5)', "will clip"],
  ])("refuses %s", async (_, source, problem) => {
    const problems = await check(sting(source), options);
    expect(problems.join("\n")).toContain(problem);
  });
});
