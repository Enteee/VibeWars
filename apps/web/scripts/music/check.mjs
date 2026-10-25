/**
 * `pnpm music:check [id…] [--cycles N]` and
 * `pnpm music:check <file.strudel.js> --key "D aeolian" [--layers N] [--bpm N] [--colour C#,Db] [--phrase-cycles N] [--json]`
 *
 * Prints, for every track and every intensity level, what the track plays,
 * and exits 1 on any failure `tracks.test.ts` would fail on. With `--json` the
 * last line of stdout is one JSON object `{ ok, problems, reports }`; Strudel
 * prints a banner on import, so parse that line only.
 */

import "./register-shims.mjs";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { allowedSounds, checkTrack, MAX_FORM_CYCLES } from "./analyse.mjs";
import { checkManifest } from "./manifest.mjs";

/** @typedef {import("./manifest.mjs").ManifestEntry} ManifestEntry */

const webDir = fileURLToPath(new URL("../..", import.meta.url));
const tracksDir = path.join(webDir, "src/music/tracks");

const MOODS =
  fs
    .readFileSync(path.join(webDir, "src/music/mood.ts"), "utf8")
    .match(/"([a-z]+)"/g)
    ?.map((m) => m.slice(1, -1)) ?? [];

const argv = process.argv.slice(2);
/** @type {string[]} */
const positional = [];
/** @type {Record<string, string>} */
const flags = {};
let json = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i] ?? "";
  if (a === "--json") json = true;
  else if (a.startsWith("--")) flags[a.slice(2)] = argv[++i] ?? "";
  else positional.push(a);
}
/**
 * @param {string} file
 * @returns {unknown}
 */
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const cycles = Number(flags.cycles ?? 8);

const sampleMap = /** @type {Record<string, unknown>} */ (
  readJson(path.join(webDir, "public/music/samples/strudel.json"))
);
const allowed = allowedSounds(sampleMap);

/** @type {{ id: string, source: string, bpm: number, key: string, colour: string[], layers: number, phraseCycles: number }[]} */
const tracks = [];
/** @type {string[]} */
const problems = [];

const fileArgs = positional.filter((p) => p.endsWith(".js"));
if (fileArgs.length > 0) {
  if (!flags.key) {
    console.error('a file needs --key, e.g. --key "D aeolian"');
    process.exit(2);
  }
  for (const f of fileArgs) {
    const source = fs.readFileSync(f, "utf8");
    const cpm = /setcpm\(\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/.exec(source);
    // Without --bpm, read it back from the source's own setcpm(x / y).
    const bpm = flags.bpm
      ? Number(flags.bpm)
      : cpm
        ? (Number(cpm[1]) / Number(cpm[2] ?? 1)) * 4
        : 0;
    tracks.push({
      id: path.basename(f).replace(/\.strudel\.js$/, ""),
      source,
      bpm,
      key: flags.key,
      colour: (flags.colour ?? "").split(",").filter(Boolean),
      layers: Number(flags.layers ?? 4),
      phraseCycles: Number(flags["phrase-cycles"] ?? 8),
    });
  }
} else {
  const manifest = /** @type {ManifestEntry[]} */ (readJson(path.join(tracksDir, "manifest.json")));
  problems.push(...checkManifest(manifest, fs.readdirSync(tracksDir), MOODS));
  for (const t of manifest) {
    if (positional.length > 0 && !positional.includes(t.id)) continue;
    const file = path.join(tracksDir, `${t.id}.strudel.js`);
    if (!fs.existsSync(file)) continue;
    tracks.push({ ...t, source: fs.readFileSync(file, "utf8") });
  }
  for (const id of positional) {
    if (!manifest.some((t) => t.id === id)) problems.push(`${id}: no such track in the manifest`);
  }
}

const reports = [];
for (const track of tracks) {
  const { levels, problems: p } = await checkTrack(track, { cycles, allowedSounds: allowed });
  problems.push(...p);
  levels.forEach((a, level) => {
    if (!a) return;
    reports.push({ track: track.id, level, ...a });
    if (json) return;
    console.log(
      `\n== ${track.id} · level ${String(level)} · ${track.key} · ${String(a.events)} events over ${String(cycles)} cycles`,
    );
    console.log(
      `tempo: ${String(a.cpm)} cycles/min, ${String(a.cpm === null ? null : a.cpm * 4)} bpm`,
    );
    console.log(`controls: ${a.controls.join(" ")}`);
    console.log(`voices: ${a.voices.map((v) => `${v.name} ${String(v.count)}`).join(", ")}`);
    for (const [c, notes] of a.harmony.entries()) {
      console.log(`  cycle ${String(c)}: ${notes.join(" ")}`);
    }
    console.log(
      `key: ${a.outsideKey.length ? `outside ${a.outsideKey.join(" ")}` : "every note is in key"}`,
    );
    console.log(`worst-case summed gain: ${a.peakGain.toFixed(2)}`);
    console.log(
      `register: ${a.registers
        .map(
          (r) => `${r.sound} ${r.highest ?? "-"}${r.lpf === null ? "" : ` lpf≤${String(r.lpf)}`}`,
        )
        .join(", ")}`,
    );
    const form =
      a.formCycles === MAX_FORM_CYCLES
        ? `no repeat within ${String(MAX_FORM_CYCLES)} cycles`
        : `${String(a.formCycles)} cycles`;
    console.log(
      `form: ${form}, ${a.formSeconds === null ? "?" : a.formSeconds.toFixed(0)} s, ` +
        `${String(a.distinctPhrases)} distinct phrase(s) of ${String(track.phraseCycles)} cycles, ` +
        `${a.eventsPerSecond === null ? "?" : a.eventsPerSecond.toFixed(2)} events/s`,
    );
  });
}

if (!json) {
  console.log(
    problems.length === 0
      ? `\nok: ${String(tracks.length)} track(s)`
      : `\n${String(problems.length)} problem(s):`,
  );
  for (const p of problems) console.log(`  FAIL ${p}`);
} else {
  console.log(JSON.stringify({ ok: problems.length === 0, problems, reports }));
}
process.exit(problems.length === 0 ? 0 : 1);
