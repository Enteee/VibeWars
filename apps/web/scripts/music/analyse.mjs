/**
 * Evaluates a Strudel track without a browser and reports what it plays.
 * One implementation for `pnpm music:check` and `tracks.test.ts` (#369).
 *
 * Strudel is a pattern language (pure JS, runs anywhere) and superdough, its
 * sound engine (browser only). This drives the first half: evaluate the
 * source, query it over some cycles, read the events. That catches what is
 * wrong on paper: unknown chords, mini-notation that does not parse,
 * misspelled controls, notes outside the key, clipping gain sums.
 *
 * Importing `@strudel/core` in Node needs the `@kabelsalat/web` shim; the
 * caller arranges it (vitest alias, or `register-shims.mjs`).
 */

import { Note, Scale } from "tonal";

/**
 * Controls a shipped track may use. `begin` and `end` are event times, not
 * controls. A misspelled control that happens to be a real method name is
 * dropped by Strudel without a word, so anything outside this list is
 * reported instead.
 */
export const KNOWN_CONTROLS = new Set(
  (
    "s n note gain postgain velocity attack decay sustain release clip legato " +
    "lpf lpq hpf hpq bpf cutoff resonance vowel room roomsize orbit pan delay " +
    "delaytime delayfeedback speed bank fm fmh fmattack fmdecay fmsustain " +
    "coarse crush shape distort distortvol lpattack lpdecay lpenv unison detune " +
    "vib vibmod"
  ).split(" "),
);

/** Strudel's built-in synths, which cost no bytes: the rest of the allowlist is the sample map. */
export const BUILTIN_SOUNDS = new Set([
  "sine",
  "triangle",
  "square",
  "sawtooth",
  "supersaw",
  "white",
  "pink",
  "brown",
]);

/** The tolerance for the summed-gain estimate (#366 §3.4 asks for 1.2, fails above 1.5). */
export const MAX_PEAK_GAIN = 1.5;

/**
 * How long a track plays before it repeats exactly, at every level (#427):
 * the menu sits at level 0 for minutes.
 */
export const MIN_FORM_SECONDS = 180;

/** Different `phraseCycles` blocks a form must hold, at every level (#427). */
export const MIN_DISTINCT_PHRASES = 4;

/**
 * The longest form the analyser looks for; a track that does not repeat
 * within it is long enough. It queries twice this many cycles to find one.
 */
export const MAX_FORM_CYCLES = 128;

/**
 * Onsets per second at the top level, over the form (#427). Longer tracks
 * must not cost more CPU than the ones measured here (#420's budget), so
 * this is the densest shipped track on 2026-10-25, rounded up. Measured at
 * the top level by `pnpm music:check`:
 *
 *   last-stand 30.94, clash-of-banners 30.04, hall-of-champions 19.73,
 *   ember-deep 16.25, victors-hymn 14.06, northern-pass 11.65,
 *   first-light 7.60, jungle-veil 6.00, glass-dunes 5.55, ashen-fields 2.41
 */
export const MAX_EVENTS_PER_SECOND = 31;

/**
 * Controls that Strudel's voicing and scale helpers leave on an event as
 * bookkeeping. They are not sound parameters, so they are neither checked
 * against `KNOWN_CONTROLS` nor reported.
 */
const BOOKKEEPING = new Set([
  "begin",
  "end",
  "chord",
  "dictionary",
  "anchor",
  "offset",
  "mode",
  "scale",
]);

/** @typedef {import("@strudel/transpiler").Pattern} Pattern */
/** @typedef {import("@strudel/transpiler").Hap} Hap */
/** @typedef {{ evaluate: typeof import("@strudel/transpiler").evaluate, ref: typeof import("@strudel/core").ref }} Engine */

/** @typedef {{ name: string, count: number }} Voice */
/**
 * @typedef {object} Analysis
 * @property {number | null} cpm cycles per minute the source set
 * @property {number} events events with an onset in the queried cycles
 * @property {Voice[]} voices
 * @property {string[]} controls controls that survived evaluation
 * @property {string[]} outsideKey pitch classes outside `key`
 * @property {number} peakGain worst-case summed gain at one onset
 * @property {string[]} warnings everything Strudel and the console reported
 * @property {string[][]} harmony pitches sounding at the start of each cycle
 * @property {number[]} silentMembers 1-based positions, in evaluation order, of
 *   `stack(...)` members that play no event in the queried cycles
 * @property {number} formCycles cycles before the event keys repeat exactly,
 *   `MAX_FORM_CYCLES` if they do not within it
 * @property {number | null} formSeconds `formCycles` at the source's tempo,
 *   null when it sets none
 * @property {number} distinctPhrases different `phraseCycles` blocks in the form
 * @property {number | null} eventsPerSecond onsets per second over the form
 */

/** @type {Promise<Engine> | null} */
let engine = null;

/**
 * Core prints a banner on import; keep it off stdout so `--json` stays parseable.
 *
 * @returns {Promise<Engine>}
 */
function loadEngine() {
  engine ??= (async () => {
    const restore = captureConsole([]);
    try {
      const core = await import("@strudel/core");
      const mini = await import("@strudel/mini");
      const tonal = await import("@strudel/tonal");
      const { evaluate } = await import("@strudel/transpiler");
      await core.evalScope(core, mini, tonal);
      return { evaluate, ref: core.ref };
    } finally {
      restore();
    }
  })();
  return engine;
}

/**
 * Silences `console.log` and routes warnings and errors into `sink`.
 *
 * @param {string[]} sink
 * @returns {() => void} restore
 */
function captureConsole(sink) {
  const saved = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const take = (/** @type {unknown[]} */ ...args) => {
    sink.push(args.map(String).join(" "));
  };
  console.log = () => undefined;
  console.warn = take;
  console.error = take;
  return () => {
    Object.assign(console, saved);
  };
}

/**
 * @param {unknown} note a note name or a MIDI number
 * @returns {string}
 */
const noteName = (note) => (typeof note === "number" ? Note.fromMidi(note) : String(note));

/**
 * @param {unknown} note
 * @returns {string}
 */
const pitchClass = (note) => {
  const chroma = Note.chroma(noteName(note));
  // One spelling for both sides: MIDI numbers come back flat, scales sharp.
  return Number.isNaN(chroma) ? noteName(note) : Note.pitchClass(Note.fromMidiSharps(60 + chroma));
};

/**
 * What an onset is, for telling cycles apart: when in its cycle, which sound,
 * which pitch. Continuous controls (`gain`, `lpf`, `pan`, ...) are left out,
 * so a slow `sine` on a filter cannot pass for variation.
 *
 * @param {number} offset onset time from the start of its cycle
 * @param {Record<string, unknown>} value
 * @returns {string}
 */
const eventKey = (offset, value) =>
  JSON.stringify([offset.toFixed(6), value.s, value.note ?? value.n, value.bank]);

/**
 * The smallest `p` in `1 … max` that every cycle queried repeats after;
 * `max` if none does. Every cycle, not just the first `p`: a track that
 * holds one section for 16 cycles has not come round after 2 of them.
 *
 * @param {readonly (readonly string[])[]} cycles sorted event keys per cycle,
 *   `2 × max` of them
 * @param {number} max
 * @returns {number}
 */
export function formOf(cycles, max) {
  const same = (/** @type {number} */ a, /** @type {number} */ b) =>
    (cycles[a] ?? []).join("\n") === (cycles[b] ?? []).join("\n");
  for (let p = 1; p < max; p++) {
    let repeats = true;
    for (let c = 0; c + p < cycles.length && repeats; c++) repeats = same(c, c + p);
    if (repeats) return p;
  }
  return max;
}

/**
 * How many different blocks of `phraseCycles` the first `form` cycles hold,
 * a block compared with its times taken from its own start.
 *
 * @param {readonly (readonly string[])[]} cycles as for `formOf`
 * @param {number} form
 * @param {number} phraseCycles
 * @returns {number}
 */
export function distinctPhrasesOf(cycles, form, phraseCycles) {
  const blocks = new Set();
  for (let start = 0; start < form; start += phraseCycles) {
    const block = [];
    for (let c = start; c < Math.min(start + phraseCycles, form); c++) {
      block.push((cycles[c] ?? []).join("\n"));
    }
    blocks.add(block.join("\n--\n"));
  }
  return blocks.size;
}

/**
 * @param {string} source
 * @param {{ intensity: number, cycles: number, key: string, colour?: readonly string[], phraseCycles: number }} options
 * @returns {Promise<Analysis>}
 */
export async function analyseTrack(source, { intensity, cycles, key, colour = [], phraseCycles }) {
  const { evaluate, ref } = await loadEngine();
  /** @type {string[]} */
  const warnings = [];
  /** @type {Record<string, unknown>} */
  const g = /** @type {Record<string, unknown>} */ (globalThis);

  /** @type {{ cpm: number | null }} */
  const repl = { cpm: null };
  g.setcpm = (/** @type {number} */ x) => (repl.cpm = x);
  g.setcps = (/** @type {number} */ x) => (repl.cpm = x * 60);
  g.setbpm = (/** @type {number} */ x) => (repl.cpm = x / 4);
  g.samples = () => Promise.resolve();
  g.hush = () => undefined;
  // The music host provides the same two names (#366 §3.1).
  g.INTENSITY = intensity;
  g.layer = (/** @type {number} */ n, /** @type {Pattern} */ pat) =>
    pat.mask(ref(() => (intensity >= n ? 1 : 0)));

  // Every member of every `stack`, so a voice that plays nothing is found even
  // though it leaves no event to count (a bad chord, a dead `.arp()`).
  /** @type {Pattern[]} */
  const members = [];
  const stack = /** @type {(...p: Pattern[]) => Pattern} */ (g.stack);
  g.stack = (/** @type {Pattern[]} */ ...pats) => {
    members.push(
      ...pats.filter((p) => typeof (/** @type {Partial<Pattern>} */ (p).queryArc) === "function"),
    );
    return stack(...pats);
  };

  // Strudel's logger prints, and also dispatches a CustomEvent on `document`
  // when one exists: that event is the structured hook.
  const bus = new EventTarget();
  g.document = bus;
  bus.addEventListener("strudel.log", (e) => {
    warnings.push(/** @type {CustomEvent<{ message: string }>} */ (e).detail.message);
  });
  const restore = captureConsole(warnings);

  try {
    const { pattern } = await evaluate(source);
    const queried = (/** @type {Pattern} */ p) => p.queryArc(0, cycles).filter((h) => h.hasOnset());
    const events = queried(pattern)
      .map((h) => ({ begin: h.whole.begin.valueOf(), value: h.value }))
      .sort((a, b) => a.begin - b.begin);

    const controls = new Set(
      events.flatMap((e) => Object.keys(e.value)).filter((k) => !BOOKKEEPING.has(k)),
    );

    /** @type {Map<string, number>} */
    const voiceCounts = new Map();
    for (const e of events) {
      const name = typeof e.value.s === "string" ? e.value.s : "default";
      voiceCounts.set(name, (voiceCounts.get(name) ?? 0) + 1);
    }

    const pitched = events.filter((e) => e.value.note !== undefined);
    const allowed = new Set([...Scale.get(key).notes.map(pitchClass), ...colour.map(pitchClass)]);
    if (allowed.size === 0) throw new Error(`unknown scale "${key}"`);
    const outsideKey = [
      ...new Set(pitched.map((e) => pitchClass(e.value.note)).filter((pc) => !allowed.has(pc))),
    ];

    const harmony = [];
    for (let c = 0; c < cycles; c++) {
      const sounding = pitched.filter((e) => e.begin >= c && e.begin < c + 0.26);
      const notes = [...new Set(sounding.map((e) => noteName(e.value.note)))];
      harmony.push(notes.sort((a, b) => (Note.midi(a) ?? 0) - (Note.midi(b) ?? 0)));
    }

    // superdough multiplies gain by postgain per voice and sums voices with no
    // limiter. Everything landing at full amplitude in phase never quite
    // happens, so this is a pessimistic bound.
    /** @type {Map<number, number>} */
    const byOnset = new Map();
    for (const e of events) {
      const gain = typeof e.value.gain === "number" ? e.value.gain : 1;
      const post = typeof e.value.postgain === "number" ? e.value.postgain : 1;
      byOnset.set(e.begin, (byOnset.get(e.begin) ?? 0) + gain * post);
    }

    const silentMembers = members.flatMap((m, i) => (queried(m).length === 0 ? [i + 1] : []));

    // The form needs far more cycles than the rules above, so it has its own query.
    /** @type {string[][]} */
    const keysByCycle = Array.from({ length: 2 * MAX_FORM_CYCLES }, () => []);
    for (const h of pattern.queryArc(0, 2 * MAX_FORM_CYCLES)) {
      if (!h.hasOnset()) continue;
      const begin = h.whole.begin.valueOf();
      const cycle = Math.floor(begin);
      keysByCycle[cycle]?.push(eventKey(begin - cycle, h.value));
    }
    for (const keys of keysByCycle) keys.sort();
    const formCycles = formOf(keysByCycle, MAX_FORM_CYCLES);
    const formSeconds = repl.cpm === null ? null : (formCycles * 60) / repl.cpm;
    const formEvents = keysByCycle.slice(0, formCycles).reduce((n, keys) => n + keys.length, 0);

    return {
      cpm: repl.cpm,
      events: events.length,
      voices: [...voiceCounts].map(([name, count]) => ({ name, count })),
      controls: [...controls].sort(),
      outsideKey,
      peakGain: Math.max(0, ...byOnset.values()),
      warnings,
      harmony,
      silentMembers,
      formCycles,
      formSeconds,
      distinctPhrases: distinctPhrasesOf(keysByCycle, formCycles, phraseCycles),
      eventsPerSecond: formSeconds === null ? null : formEvents / formSeconds,
    };
  } finally {
    restore();
    g.stack = stack;
    delete g.document;
  }
}

/**
 * Sound names a track may use: the built-in synths plus the sample map's keys
 * (`_base` and other underscore keys are map metadata, not sounds).
 *
 * @param {Record<string, unknown>} sampleMap parsed `strudel.json`
 * @returns {Set<string>}
 */
export function allowedSounds(sampleMap) {
  return new Set([...BUILTIN_SOUNDS, ...Object.keys(sampleMap).filter((k) => !k.startsWith("_"))]);
}

/**
 * Runs a track at every intensity level `0 … layers−1` and applies the rules
 * of #369: no evaluation error or warning, tempo matches, every note in key,
 * every stack member sounds at the top level, each level adds events, only
 * allowed sounds and known controls, no clipping. And of #427: at every level
 * a form of at least `MIN_FORM_SECONDS` holding `MIN_DISTINCT_PHRASES`, and at
 * the top no more than `MAX_EVENTS_PER_SECOND`. Each problem names the track,
 * the level and the offending value.
 *
 * @param {{ id: string, source: string, bpm: number, key: string, colour: readonly string[], layers: number, phraseCycles: number }} track
 * @param {{ cycles: number, allowedSounds: ReadonlySet<string> }} options
 * @returns {Promise<{ levels: (Analysis | null)[], problems: string[] }>}
 */
export async function checkTrack(track, { cycles, allowedSounds: allowed }) {
  /** @type {string[]} */
  const problems = [];
  /** @type {(Analysis | null)[]} */
  const levels = [];
  for (let level = 0; level < track.layers; level++) {
    const at = `${track.id} level ${String(level)}`;
    /** @type {Analysis} */
    let a;
    try {
      a = await analyseTrack(track.source, {
        intensity: level,
        cycles,
        key: track.key,
        colour: track.colour,
        phraseCycles: track.phraseCycles,
      });
    } catch (e) {
      problems.push(`${at}: evaluation error: ${e instanceof Error ? e.message : String(e)}`);
      levels.push(null);
      continue;
    }
    levels.push(a);
    for (const w of a.warnings) problems.push(`${at}: Strudel warns: ${w}`);
    if (a.cpm === null || a.cpm * 4 !== track.bpm) {
      const got = a.cpm === null ? "not set" : `${String(a.cpm * 4)} bpm`;
      problems.push(`${at}: tempo is ${got}, the manifest says ${String(track.bpm)}`);
    }
    if (a.outsideKey.length > 0) {
      problems.push(`${at}: notes outside ${track.key}: ${a.outsideKey.join(" ")}`);
    }
    for (const v of a.voices) {
      if (!allowed.has(v.name)) problems.push(`${at}: sound "${v.name}" is not in the palette`);
    }
    for (const c of a.controls) {
      if (!KNOWN_CONTROLS.has(c)) problems.push(`${at}: control "${c}" is not in KNOWN_CONTROLS`);
    }
    if (a.peakGain > MAX_PEAK_GAIN) {
      problems.push(
        `${at}: summed gain ${a.peakGain.toFixed(2)} is over ${String(MAX_PEAK_GAIN)}, it will clip`,
      );
    }
    if (level === track.layers - 1) {
      for (const m of a.silentMembers) {
        problems.push(`${at}: stack member #${String(m)} plays no event at the highest level`);
      }
      if (a.eventsPerSecond !== null && a.eventsPerSecond > MAX_EVENTS_PER_SECOND) {
        problems.push(
          `${at}: ${a.eventsPerSecond.toFixed(1)} events per second, want ≤ ${String(MAX_EVENTS_PER_SECOND)}`,
        );
      }
    }
    // Without a tempo there are no seconds; the tempo rule has said so already.
    if (a.formSeconds !== null && a.formSeconds < MIN_FORM_SECONDS) {
      problems.push(
        `${at}: repeats after ${a.formSeconds.toFixed(0)} s (${String(a.formCycles)} cycles), want ≥ ${String(MIN_FORM_SECONDS)} s`,
      );
    }
    if (a.distinctPhrases < MIN_DISTINCT_PHRASES) {
      problems.push(
        `${at}: ${String(a.distinctPhrases)} distinct phrase(s) of ${String(track.phraseCycles)} cycles, want ≥ ${String(MIN_DISTINCT_PHRASES)}`,
      );
    }
    const before = levels[level - 1];
    if (before && a.events <= before.events) {
      problems.push(
        `${at}: ${String(a.events)} events, level ${String(level - 1)} has ${String(before.events)}: the layer adds nothing`,
      );
    }
  }
  return { levels, problems };
}
