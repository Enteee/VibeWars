/**
 * What a track asks of the audio thread (#508), without an audio device: a
 * DSP cost and a gain for everything sounding at one instant, and the one
 * reverb every track shares. Rules in `analyse.mjs` apply the budgets.
 */

/**
 * The reverb every track uses, orbit by orbit. The reverb is a convolution
 * whose impulse response is `roomsize` seconds long, rebuilt on the main
 * thread whenever its controls change; entering a map switches tracks, so a
 * track with a room of its own is a click and a stall. A room control absent
 * here must be absent on the track too; `roomsize` unset is superdough's 2.
 *
 * @type {Readonly<Record<number, Readonly<Record<string, number>>>>}
 */
export const MUSIC_ROOMS = { 1: { roomsize: 2 }, 2: { roomsize: 6 } };

/** The controls that make up a room, which superdough rebuilds the impulse response for. */
export const ROOM_CONTROLS = ["roomsize", "roomfade", "roomlp", "roomdim"];

/** superdough's `roomsize` when a voice sets none (`reverb.mjs`). */
const DEFAULT_ROOMSIZE = 2;

/**
 * What the audio thread pays for what sounds, in units of "one plain
 * oscillator voice". The weights start from the AudioNodes and worklets
 * superdough builds per voice (`superdough.mjs`, `synth.mjs`, `sampler.mjs`)
 * and are PROVISIONAL until #507 calibrates them against `underrunMs` in
 * Firefox.
 */
export const DSP_COST = {
  /** A sample, a plain oscillator or a noise: one source and one envelope gain. */
  voice: 1,
  /** `supersaw` is one AudioWorklet that renders `unison` detuned saws (default 5). */
  supersawUnison: 1,
  /** A biquad each: `lpf`/`cutoff`, `hpf`, `bpf`. */
  filter: 1,
  /** An envelope on a filter (`lpenv`, `lpattack`, ...): automation on its frequency. */
  filterEnvelope: 1,
  /** `vowel` is a bank of five band-pass formant filters. */
  vowel: 5,
  /** `delay` is a feedback delay line with its own gains. */
  delay: 2,
  /** `crush`, `coarse`, `shape`, `distort`: each one is an AudioWorklet. */
  worklet: 2,
  /** `fm` and `vib` add an oscillator and a gain to the voice. */
  modulator: 1,
  /** Per second of `roomsize`, for every orbit with a wet voice: the convolver's cost grows with its impulse response. */
  reverbPerSecond: 1,
};

/**
 * @param {Record<string, unknown>} value
 * @param {readonly string[]} keys
 * @returns {boolean} whether the event sets any of `keys`
 */
const sets = (value, keys) => keys.some((k) => value[k] !== undefined);

/**
 * Synth sustain level when a voice sets none (`synth.mjs`); samples hold at 1.
 */
const SYNTH_SUSTAIN = 0.6;

/** The gain node `synth.mjs` puts after every oscillator ("turn down"); supersaw peaks at 0.3 too. */
const SYNTH_LEVEL = 0.3;

/** Sounds `synth.mjs` builds, which have a sustain level of their own. */
const SYNTHS = new Set(["sine", "triangle", "square", "sawtooth", "supersaw"]);

/**
 * @param {Record<string, unknown>} value
 * @returns {boolean} whether the event makes a sound at all (tempo marks and
 *   other bare controls do not)
 */
export const soundsOf = (value) =>
  (value.s !== undefined || value.note !== undefined || value.n !== undefined) && value.gain !== 0;

/**
 * What one voice costs the audio thread, its reverb aside (see `DSP_COST`).
 *
 * @param {Record<string, unknown>} value
 * @returns {number}
 */
export function voiceCostOf(value) {
  let cost = DSP_COST.voice;
  if (value.s === "supersaw") {
    const unison = typeof value.unison === "number" ? value.unison : 5;
    cost += DSP_COST.supersawUnison * Math.min(100, Math.max(1, unison));
  }
  if (sets(value, ["lpf", "cutoff"])) cost += DSP_COST.filter;
  if (sets(value, ["hpf"])) cost += DSP_COST.filter;
  if (sets(value, ["bpf"])) cost += DSP_COST.filter;
  if (sets(value, ["lpenv", "lpattack", "lpdecay", "lpsustain", "lprelease"])) {
    cost += DSP_COST.filterEnvelope;
  }
  if (sets(value, ["hpenv", "hpattack", "hpdecay", "hpsustain", "hprelease"])) {
    cost += DSP_COST.filterEnvelope;
  }
  if (sets(value, ["vowel"])) cost += DSP_COST.vowel;
  if (typeof value.delay === "number" && value.delay > 0) cost += DSP_COST.delay;
  for (const k of ["crush", "coarse", "shape", "distort"]) {
    if (sets(value, [k])) cost += DSP_COST.worklet;
  }
  if (sets(value, ["fm"])) cost += DSP_COST.modulator;
  if (sets(value, ["vib"])) cost += DSP_COST.modulator;
  return cost;
}

/**
 * What the voice adds to the mix while it sounds: `gain × postgain × velocity`
 * (superdough's defaults where absent), at the level of its sustain, through
 * a synth's own turn-down.
 *
 * @param {Record<string, unknown>} value
 * @returns {number}
 */
export function voiceGainOf(value) {
  const num = (/** @type {unknown} */ v, /** @type {number} */ d) =>
    typeof v === "number" ? v : d;
  const sustain = num(
    value.sustain,
    SYNTHS.has(typeof value.s === "string" ? value.s : "triangle") ? SYNTH_SUSTAIN : 1,
  );
  const level = SYNTHS.has(typeof value.s === "string" ? value.s : "triangle") ? SYNTH_LEVEL : 1;
  return num(value.gain, 0.8) * num(value.postgain, 1) * num(value.velocity, 1) * sustain * level;
}

/**
 * The reverb a set of voices costs: each orbit with a wet voice costs
 * `reverbPerSecond` for every second of the largest `roomsize` asked of it.
 *
 * @param {readonly Record<string, unknown>[]} values
 * @returns {number}
 */
export function reverbCostOf(values) {
  /** @type {Map<number, number>} */
  const roomsByOrbit = new Map();
  for (const v of values) {
    if (!(typeof v.room === "number" && v.room > 0)) continue;
    const orbit = typeof v.orbit === "number" ? v.orbit : 1;
    const size = typeof v.roomsize === "number" ? v.roomsize : DEFAULT_ROOMSIZE;
    roomsByOrbit.set(orbit, Math.max(roomsByOrbit.get(orbit) ?? 0, size));
  }
  let seconds = 0;
  for (const size of roomsByOrbit.values()) seconds += size;
  return DSP_COST.reverbPerSecond * seconds;
}

/**
 * @typedef {object} Sounding
 * @property {number} start seconds from the start of the form
 * @property {number} length seconds, onset to the end of the release
 * @property {number} cost `voiceCostOf`
 * @property {number} gain `voiceGainOf`
 * @property {string} sound name for reports
 */

/**
 * How long a voice sounds, in seconds: its event, shortened by `clip` or
 * `legato`, plus its `release` (superdough's default 0.01).
 *
 * @param {Record<string, unknown>} value
 * @param {number} eventSeconds
 * @returns {number}
 */
export function soundingSeconds(value, eventSeconds) {
  const clip = typeof value.clip === "number" ? value.clip : value.legato;
  const held = typeof clip === "number" ? eventSeconds * clip : eventSeconds;
  const release = typeof value.release === "number" ? value.release : 0.01;
  return held + release;
}

/**
 * The peaks, over a form that repeats every `formSeconds`, of what sounds at
 * one instant: summed cost and summed gain. A voice still sounding when the
 * form ends sounds again at its start, as it does in the loop.
 *
 * @param {readonly Sounding[]} voices
 * @param {number} formSeconds
 * @returns {{ cost: number, gain: number, costAt: number }} `costAt`: when the cost peaks
 */
export function peaksOf(voices, formSeconds) {
  /** @type {{ at: number, cost: number, gain: number }[]} */
  const edges = [];
  let costNow = 0;
  let gainNow = 0;
  for (const v of voices) {
    if (v.length >= formSeconds) {
      costNow += v.cost;
      gainNow += v.gain;
      continue;
    }
    const start = v.start % formSeconds;
    const end = start + v.length;
    edges.push({ at: start, cost: v.cost, gain: v.gain });
    if (end <= formSeconds) {
      edges.push({ at: end, cost: -v.cost, gain: -v.gain });
    } else {
      edges.push({ at: formSeconds, cost: -v.cost, gain: -v.gain });
      edges.push({ at: 0, cost: v.cost, gain: v.gain });
      edges.push({ at: end - formSeconds, cost: -v.cost, gain: -v.gain });
    }
  }
  // At one instant the voices that end go before the voices that begin.
  edges.sort((a, b) => a.at - b.at || a.cost - b.cost);
  // Voices that sound the whole form are there before the first edge.
  let peakCost = costNow;
  let peakGain = gainNow;
  let costAt = 0;
  for (let i = 0; i < edges.length;) {
    const at = edges[i]?.at ?? 0;
    while (i < edges.length && edges[i]?.at === at) {
      costNow += edges[i]?.cost ?? 0;
      gainNow += edges[i]?.gain ?? 0;
      i++;
    }
    if (costNow > peakCost) {
      peakCost = costNow;
      costAt = at;
    }
    peakGain = Math.max(peakGain, gainNow);
  }
  return { cost: peakCost, gain: peakGain, costAt };
}

/**
 * Who is sounding at `at` seconds, as `supersaw ×3 (18)`, the costliest first,
 * so a failing track says what to cut.
 *
 * @param {readonly Sounding[]} voices
 * @param {number} formSeconds
 * @param {number} at
 * @returns {string}
 */
export function describeAt(voices, formSeconds, at) {
  /** @type {Map<string, { count: number, cost: number }>} */
  const bySound = new Map();
  for (const v of voices) {
    const into = (at - v.start) % formSeconds;
    const age = into < 0 ? into + formSeconds : into;
    if (age >= v.length && v.length < formSeconds) continue;
    const entry = bySound.get(v.sound) ?? { count: 0, cost: 0 };
    entry.count += 1;
    entry.cost += v.cost;
    bySound.set(v.sound, entry);
  }
  return [...bySound]
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([sound, e]) => `${sound} ×${String(e.count)} (${String(e.cost)})`)
    .join(", ");
}

/**
 * Every room control a wet voice sets to something other than
 * `MUSIC_ROOMS` says, as `orbit 2 roomsize 7 (catalogue: 6)`, in the order
 * they first appear.
 *
 * @param {readonly Record<string, unknown>[]} values
 * @returns {string[]}
 */
export function roomOffCatalogueOf(values) {
  /** @type {Set<string>} */
  const found = new Set();
  for (const v of values) {
    if (!(typeof v.room === "number" && v.room > 0)) continue;
    const orbit = typeof v.orbit === "number" ? v.orbit : 1;
    const wanted = MUSIC_ROOMS[orbit];
    if (!wanted) {
      found.add(`orbit ${String(orbit)} has no catalogue room`);
      continue;
    }
    for (const control of ROOM_CONTROLS) {
      const given = v[control] ?? (control === "roomsize" ? DEFAULT_ROOMSIZE : undefined);
      if (given === wanted[control]) continue;
      const shown = (/** @type {unknown} */ x) => (x === undefined ? "unset" : JSON.stringify(x));
      found.add(
        `orbit ${String(orbit)} ${control} ${shown(v[control])} (catalogue: ${shown(wanted[control])})`,
      );
    }
  }
  return [...found];
}
