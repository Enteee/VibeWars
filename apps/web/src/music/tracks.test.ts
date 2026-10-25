import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Plain JS, shared with `pnpm music:check`: one implementation of the rules.
// @ts-expect-error -- JSDoc-typed .mjs, outside the tsc project on purpose
import { allowedSounds, checkTrack, KNOWN_CONTROLS } from "../../scripts/music/analyse.mjs";
// @ts-expect-error -- JSDoc-typed .mjs, outside the tsc project on purpose
import { checkManifest } from "../../scripts/music/manifest.mjs";
import { MOODS } from "./mood.js";
import { TRACKS } from "./tracks/index.js";

interface Checked {
  problems: string[];
}
interface CheckInput {
  id: string;
  source: string;
  bpm: number;
  key: string;
  colour: string[];
  layers: number;
}
const check = checkTrack as (
  t: CheckInput,
  o: { cycles: number; allowedSounds: Set<string> },
) => Promise<Checked>;
const sounds = allowedSounds as (m: Record<string, unknown>) => Set<string>;
const hygiene = checkManifest as (
  m: readonly object[],
  files: readonly string[],
  moods: readonly string[],
) => string[];

const here = path.dirname(fileURLToPath(import.meta.url));
const tracksDir = path.join(here, "tracks");
const fixturesDir = path.join(here, "check-fixtures");
const sampleMap = JSON.parse(
  fs.readFileSync(path.join(here, "../../public/music/samples/strudel.json"), "utf8"),
) as Record<string, unknown>;
const allowed = sounds(sampleMap);
const CYCLES = 8;

const fixture = (name: string, overrides: Partial<CheckInput> = {}): CheckInput => ({
  id: name,
  source: fs.readFileSync(path.join(fixturesDir, `${name}.strudel.js`), "utf8"),
  bpm: 72,
  key: "D aeolian",
  colour: [],
  layers: 3,
  ...overrides,
});

describe("the track checker rejects broken tracks (fixtures)", () => {
  it("passes the reference track", async () => {
    expect(
      (await check(fixture("good"), { cycles: CYCLES, allowedSounds: allowed })).problems,
    ).toEqual([]);
  });

  it.each([
    ["csus2", 'unknown chord "Csus2"'],
    ["out-of-key", "notes outside D aeolian: F#"],
    ["typo-control", "lfp is not a function"],
    ["loud", "will clip"],
  ])("fails %s", async (name, message) => {
    const { problems } = await check(fixture(name), { cycles: CYCLES, allowedSounds: allowed });
    expect(problems.join("\n")).toContain(message);
    expect(problems.every((p) => p.startsWith(`${name} level `))).toBe(true);
  });

  it("fails a tempo that disagrees with the manifest", async () => {
    const { problems } = await check(fixture("good", { bpm: 80 }), {
      cycles: CYCLES,
      allowedSounds: allowed,
    });
    expect(problems.join("\n")).toContain("tempo is 72 bpm, the manifest says 80");
  });

  it("allows a note outside the key when the track declares it as colour", async () => {
    const { problems } = await check(fixture("out-of-key", { colour: ["F#"] }), {
      cycles: CYCLES,
      allowedSounds: allowed,
    });
    expect(problems).toEqual([]);
  });

  it("fails a sound that is not in the palette", async () => {
    const { problems } = await check(fixture("good"), {
      cycles: CYCLES,
      allowedSounds: new Set(["sine"]),
    });
    expect(problems.join("\n")).toContain('sound "sawtooth" is not in the palette');
  });

  it("fails a control that is not known", async () => {
    const source = 'setcpm(18)\nnote("d3").s("sine").gain(.2).djf(.5)';
    const t = fixture("good", { id: "unknown-control", source, layers: 1 });
    const { problems } = await check(t, { cycles: CYCLES, allowedSounds: allowed });
    expect(problems.join("\n")).toContain('control "djf" is not in KNOWN_CONTROLS');
    expect(KNOWN_CONTROLS.has("djf")).toBe(false);
  });

  it("fails a layer that adds nothing, and a voice that plays nothing at the top", async () => {
    const source =
      'setcpm(18)\nstack(note("d3").s("sine").gain(.2), layer(1, note("d3").s("sine").gain(.2)))';
    const flat = fixture("good", { id: "flat", source, layers: 2 });
    // Level 1 = level 0 + one more note per cycle, so it adds events; muting it makes it add none.
    const dead = { ...flat, source: source.replace('layer(1, note("d3")', 'layer(1, note("~")') };
    const { problems } = await check(dead, { cycles: CYCLES, allowedSounds: allowed });
    expect(problems.join("\n")).toContain("the layer adds nothing");
    expect(problems.join("\n")).toContain("stack member #2 plays no event at the highest level");
  });
});

describe("manifest hygiene", () => {
  const entry = {
    id: "a-track",
    layers: 2,
    phraseCycles: 4,
    moods: ["epic"],
    colour: [],
  };
  const ok = (m: object[], files = ["a-track.strudel.js"]) => hygiene(m, files, MOODS);

  it("accepts a good entry", () => {
    expect(ok([entry])).toEqual([]);
  });

  it.each([
    ["a duplicate id", [entry, entry], "appears twice"],
    ["a non-kebab id", [{ ...entry, id: "A_Track" }], "not kebab-case"],
    ["too many layers", [{ ...entry, layers: 5 }], "layers is 5"],
    ["a bad phrase length", [{ ...entry, phraseCycles: 6 }], "phraseCycles is 6"],
    ["no moods", [{ ...entry, moods: [] }], "moods is empty"],
    ["an unknown mood", [{ ...entry, moods: ["jolly"] }], '"jolly" is not a mood'],
    ["no colour", [{ ...entry, colour: undefined }], "colour is required"],
  ])("rejects %s", (_name, manifest, message) => {
    expect(ok(manifest).join("\n")).toContain(message);
  });

  it("rejects an entry without a source file, and a source file without an entry", () => {
    expect(ok([entry], []).join("\n")).toContain("a-track.strudel.js does not exist");
    expect(ok([], ["stray.strudel.js"]).join("\n")).toContain(
      "stray.strudel.js has no manifest entry",
    );
  });

  it("holds for the shipped manifest", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tracksDir, "manifest.json"), "utf8"),
    ) as object[];
    expect(hygiene(manifest, fs.readdirSync(tracksDir), MOODS)).toEqual([]);
    expect(TRACKS.map((t) => t.id)).toEqual(manifest.map((t) => (t as { id: string }).id));
  });
});

describe.each(TRACKS)("track $id", (track) => {
  it("passes every rule at every intensity level", async () => {
    const { problems } = await check(
      { ...track, colour: [...track.colour] },
      { cycles: CYCLES, allowedSounds: allowed },
    );
    expect(problems).toEqual([]);
  });
});
