import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Plain JS, shared with `pnpm music:check`: one implementation of the rules.
// @ts-expect-error -- JSDoc-typed .mjs, outside the tsc project on purpose
import { allowedSounds, checkTrack, KNOWN_CONTROLS } from "../../scripts/music/analyse.mjs";
// @ts-expect-error -- as above
import { distinctPhrasesOf, formOf, MAX_EVENTS_PER_SECOND } from "../../scripts/music/analyse.mjs";
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
  phraseCycles: number;
}
const check = checkTrack as (
  t: CheckInput,
  o: { cycles: number; allowedSounds: Set<string> },
) => Promise<Checked>;
const sounds = allowedSounds as (m: Record<string, unknown>) => Set<string>;
const form = formOf as (cycles: readonly (readonly string[])[], max: number) => number;
const phrases = distinctPhrasesOf as (
  cycles: readonly (readonly string[])[],
  form: number,
  phraseCycles: number,
) => number;
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
  phraseCycles: 8,
  ...overrides,
});

/**
 * The fixtures for the older rules are short loops on purpose, so the form
 * rules of #427 fail them; those tests look at every other problem.
 */
const besidesForm = (problems: readonly string[]): string[] =>
  problems.filter((p) => !/repeats after|distinct phrase/.test(p));

describe("the track checker rejects broken tracks (fixtures)", () => {
  it("passes the reference track on every rule but the form's", async () => {
    const { problems } = await check(fixture("good"), { cycles: CYCLES, allowedSounds: allowed });
    expect(besidesForm(problems)).toEqual([]);
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
    expect(besidesForm(problems)).toEqual([]);
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

describe("the track checker rejects short and repetitive tracks (#427)", () => {
  const options = { cycles: CYCLES, allowedSounds: allowed };

  it("passes a 64-cycle track with four sections, at every level", async () => {
    expect((await check(fixture("long"), options)).problems).toEqual([]);
  });

  it("fails a track that comes round every 8 cycles, at every level", async () => {
    const { problems } = await check(fixture("short-loop"), options);
    for (const level of [0, 1, 2]) {
      expect(problems).toContain(
        `short-loop level ${String(level)}: repeats after 27 s (8 cycles), want ≥ 180 s`,
      );
      expect(problems).toContain(
        `short-loop level ${String(level)}: 1 distinct phrase(s) of 8 cycles, want ≥ 4`,
      );
    }
  });

  it("does not count a slow filter sweep as variation", async () => {
    const { problems } = await check(fixture("lfo-only"), options);
    expect(problems).toContain("lfo-only level 0: repeats after 13 s (4 cycles), want ≥ 180 s");
  });

  it("fails a track whose orbit mixes room sizes, unset among them", async () => {
    const { problems } = await check(fixture("room-mix"), options);
    expect(problems).toEqual(
      [0, 1, 2].map(
        (level) => `room-mix level ${String(level)}: orbit 2 mixes roomsize unset, 7, 6`,
      ),
    );
  });

  it("fails a track denser than the shipped ones", async () => {
    // 128 hits a cycle at 18 cycles a minute: 38.4 a second.
    const source = 'setcpm(72 / 4)\ns("white*128").gain(.1)';
    const t = fixture("good", { id: "dense", source, layers: 1 });
    const { problems } = await check(t, options);
    expect(problems).toContain(
      `dense level 0: 38.4 events per second, want ≤ ${String(MAX_EVENTS_PER_SECOND)}`,
    );
  });
});

describe("the form finder", () => {
  const MAX = 16;
  /** `2 × MAX` cycles, cycle `c` playing `play(c)`. */
  const cycles = (play: (c: number) => string): string[][] =>
    Array.from({ length: 2 * MAX }, (_, c) => [play(c)]);

  it("finds a one-cycle loop", () => {
    expect(
      form(
        cycles(() => "a"),
        MAX,
      ),
    ).toBe(1);
  });

  it("finds a seven-cycle loop", () => {
    expect(
      form(
        cycles((c) => String(c % 7)),
        MAX,
      ),
    ).toBe(7);
  });

  it("says long enough when nothing repeats within the max", () => {
    expect(
      form(
        cycles((c) => String(c)),
        MAX,
      ),
    ).toBe(MAX);
  });

  it("is not fooled by a section that holds for a while", () => {
    // Eight cycles of "a", eight of "b", round again: 16, not 1 or 2.
    expect(
      form(
        cycles((c) => (c % 16 < 8 ? "a" : "b")),
        MAX,
      ),
    ).toBe(16);
  });

  it("counts the different phrases in the form", () => {
    const sections = cycles((c) => String(Math.floor((c % 12) / 4)));
    expect(form(sections, MAX)).toBe(12);
    expect(phrases(sections, 12, 4)).toBe(3);
    expect(
      phrases(
        cycles(() => "a"),
        1,
        4,
      ),
    ).toBe(1);
  });

  it("gives a form's partial tail no phrase of its own", () => {
    // A 6-cycle form in 4-cycle phrases: one whole phrase, the tail left out.
    const tail = cycles((c) => (c % 6 < 4 ? "a" : "b"));
    expect(form(tail, MAX)).toBe(6);
    expect(phrases(tail, 6, 4)).toBe(1);
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
