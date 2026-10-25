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
 * Register and brightness (#449): the operator found the flutes strident.
 * Wind sounds stay at or below `MAX_WIND_NOTE`, every pitched sound at or
 * below `MAX_NOTE` (`bells` to `MAX_BELLS_NOTE`: their shimmer is meant to
 * sit high), and every bright sound carries a low-pass at `MAX_BRIGHT_LPF`
 * Hz or lower, at every value a pattern gives it.
 */
export const WIND_SOUNDS = new Set(["recorder", "whistle", "flute", "ocarina", "panflute"]);
export const BRIGHT_SOUNDS = new Set(["sawtooth", "supersaw", "square", ...WIND_SOUNDS]);
export const MAX_WIND_NOTE = "E5";
export const MAX_NOTE = "C6";
export const MAX_BELLS_NOTE = "C7";
export const MAX_BRIGHT_LPF = 4000;

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
 * @property {RoomMix[]} roomMixes orbits whose events disagree on a room control
 * @property {Register[]} registers per sound, over the form (#449)
 */

/**
 * Where one sound sits: its highest pitched event and its filter.
 *
 * @typedef {object} Register
 * @property {string} sound
 * @property {string | null} highest name of the highest note, null if it plays none
 * @property {number} highestMidi
 * @property {number} highestCycle first cycle that plays `highest`
 * @property {number | null} lpf highest `lpf`/`cutoff` any event carries, null if none does
 * @property {number} lpfCycle first cycle that carries `lpf`
 * @property {number | null} unfilteredCycle first cycle with an event that has no filter
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
 * @param {string} offset onset time from the start of its cycle, an exact fraction
 * @param {Record<string, unknown>} value
 * @returns {string}
 */
const eventKey = (offset, value) =>
  JSON.stringify([offset, value.s, value.note ?? value.n, value.bank]);

/**
 * The reverb controls one orbit must agree on (#420): superdough rebuilds the
 * impulse response whenever they change, which is most of a phone's frame.
 */
export const ROOM_CONTROLS = ["roomsize", "roomfade", "roomlp", "roomdim"];

/** @typedef {{ orbit: number, control: string, values: string[] }} RoomMix */

/**
 * Every orbit and room control with more than one value among the wet
 * `events`, the values in the order they first sound. A dry event (no `room`
 * above 0) never touches the reverb, so it is left out; among the wet ones
 * unset is a value of its own (superdough's default). An event with no orbit
 * is on orbit 1.
 *
 * @param {readonly Record<string, unknown>[]} events
 * @returns {RoomMix[]}
 */
export function roomMixesOf(events) {
  /** @type {Map<string, { orbit: number, control: string, values: string[] }>} */
  const seen = new Map();
  for (const value of events) {
    if (!(typeof value.room === "number" && value.room > 0)) continue;
    const orbit = typeof value.orbit === "number" ? value.orbit : 1;
    for (const control of ROOM_CONTROLS) {
      const id = `${String(orbit)} ${control}`;
      const entry = seen.get(id) ?? { orbit, control, values: [] };
      seen.set(id, entry);
      const v = value[control] === undefined ? "unset" : JSON.stringify(value[control]);
      if (!entry.values.includes(v)) entry.values.push(v);
    }
  }
  return [...seen.values()].filter((m) => m.values.length > 1).sort((a, b) => a.orbit - b.orbit);
}

/**
 * @param {unknown} note
 * @returns {number | null}
 */
const midiOf = (note) => {
  const m = typeof note === "number" ? note : Note.midi(String(note));
  return typeof m === "number" ? m : null;
};

/**
 * The highest cutoff the listener hears: superdough's filter envelope opens
 * to `lpf · 2^|lpenv|` (anchor 0, the default; `fanchor` is not an allowed
 * control), capped at 20 kHz. Any envelope control alone sets `lpenv` to 1.
 *
 * @param {Record<string, unknown>} value
 * @returns {number | null} null when the event has no lowpass
 */
export function peakCutoffOf(value) {
  const base = value.lpf ?? value.cutoff;
  if (typeof base !== "number") return null;
  const enveloped = ["lpattack", "lpdecay", "lpsustain", "lprelease"].some((k) => k in value);
  const env = typeof value.lpenv === "number" ? value.lpenv : enveloped ? 1 : 0;
  return Math.min(20000, base * 2 ** Math.abs(env));
}

/**
 * @param {Map<string, { sound: string, highestMidi: number, highestCycle: number, lpf: number | null, lpfCycle: number, unfilteredCycle: number | null }>} seen
 * @param {number} cycle
 * @param {Record<string, unknown>} value
 */
function noteRegister(seen, cycle, value) {
  const sound = typeof value.s === "string" ? value.s : "default";
  const entry = seen.get(sound) ?? {
    sound,
    highestMidi: -1,
    highestCycle: 0,
    lpf: null,
    lpfCycle: 0,
    unfilteredCycle: null,
  };
  seen.set(sound, entry);
  const written = midiOf(value.note);
  // `speed` replays a sample faster, and so higher; a synth ignores it.
  const speed = typeof value.speed === "number" && value.speed !== 0 ? Math.abs(value.speed) : 1;
  const midi =
    written !== null && !BUILTIN_SOUNDS.has(sound) ? written + 12 * Math.log2(speed) : written;
  if (midi !== null && midi > entry.highestMidi) {
    entry.highestMidi = midi;
    entry.highestCycle = cycle;
  }
  const filter = peakCutoffOf(value);
  if (filter !== null) {
    if (entry.lpf === null || filter > entry.lpf) {
      entry.lpf = filter;
      entry.lpfCycle = cycle;
    }
  } else {
    entry.unfilteredCycle ??= cycle;
  }
}

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
 * a block compared with its times taken from its own start. Whole blocks
 * only, so a form that is not a multiple of the phrase gets no extra phrase
 * from its tail; a form shorter than one phrase is one phrase.
 *
 * @param {readonly (readonly string[])[]} cycles as for `formOf`
 * @param {number} form
 * @param {number} phraseCycles
 * @returns {number}
 */
export function distinctPhrasesOf(cycles, form, phraseCycles) {
  if (form < phraseCycles) return 1;
  const blocks = new Set();
  for (let start = 0; start + phraseCycles <= form; start += phraseCycles) {
    const block = [];
    for (let c = start; c < start + phraseCycles; c++) {
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
    /** @type {Record<string, unknown>[]} */
    const formValues = [];
    /** @type {Map<string, Parameters<typeof noteRegister>[0] extends Map<string, infer E> ? E : never>} */
    const seenRegister = new Map();
    for (const h of pattern.queryArc(0, 2 * MAX_FORM_CYCLES)) {
      if (!h.hasOnset()) continue;
      // Exact fractions: a float offset could round two equal cycles apart.
      const cycle = h.whole.begin.floor();
      const offset = h.whole.begin.sub(cycle).toFraction();
      keysByCycle[cycle.valueOf()]?.push(eventKey(offset, h.value));
      formValues.push(h.value);
      noteRegister(seenRegister, cycle.valueOf(), h.value);
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
      roomMixes: roomMixesOf(formValues),
      registers: [...seenRegister.values()]
        .map((r) => ({
          sound: r.sound,
          highest: r.highestMidi < 0 ? null : Note.fromMidi(r.highestMidi),
          highestMidi: r.highestMidi,
          highestCycle: r.highestCycle,
          lpf: r.lpf,
          lpfCycle: r.lpfCycle,
          unfilteredCycle: r.unfilteredCycle,
        }))
        .sort((a, b) => a.sound.localeCompare(b.sound)),
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
 * the top no more than `MAX_EVENTS_PER_SECOND`; and of #420: one room per
 * orbit; and of #449: no wind note above `MAX_WIND_NOTE`, no note above
 * `MAX_NOTE`, every bright sound filtered to `MAX_BRIGHT_LPF`. Each problem names the track, the level and the offending value.
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
    for (const m of a.roomMixes) {
      problems.push(`${at}: orbit ${String(m.orbit)} mixes ${m.control} ${m.values.join(", ")}`);
    }
    if (a.distinctPhrases < MIN_DISTINCT_PHRASES) {
      problems.push(
        `${at}: ${String(a.distinctPhrases)} distinct phrase(s) of ${String(track.phraseCycles)} cycles, want ≥ ${String(MIN_DISTINCT_PHRASES)}`,
      );
    }
    for (const r of a.registers) {
      const limit = WIND_SOUNDS.has(r.sound)
        ? MAX_WIND_NOTE
        : r.sound === "bells"
          ? MAX_BELLS_NOTE
          : MAX_NOTE;
      if (r.highest !== null && r.highestMidi > (Note.midi(limit) ?? 0)) {
        problems.push(
          `${at}: ${r.sound} reaches ${r.highest} (max ${limit}) at cycle ${String(r.highestCycle)}`,
        );
      }
      if (BRIGHT_SOUNDS.has(r.sound)) {
        if (r.unfilteredCycle !== null) {
          problems.push(
            `${at}: ${r.sound} has no lpf at cycle ${String(r.unfilteredCycle)} (max ${String(MAX_BRIGHT_LPF)} Hz)`,
          );
        } else if (r.lpf !== null && r.lpf > MAX_BRIGHT_LPF) {
          problems.push(
            `${at}: ${r.sound} lpf reaches ${String(r.lpf)} Hz (max ${String(MAX_BRIGHT_LPF)}) at cycle ${String(r.lpfCycle)}`,
          );
        }
      }
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
