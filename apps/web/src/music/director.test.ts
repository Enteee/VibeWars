import { describe, expect, it } from "vitest";

import {
  FALL_STEP_MS,
  PEAK_HOLD_MS,
  directMusic,
  targetIntensity,
  type MusicInput,
  type MusicMode,
  type MusicState,
  type TrackChoice,
} from "./director.js";

/** The epic's example tracks (#366 §3.5), with plausible moods, primary first. */
const TRACKS: readonly TrackChoice[] = [
  { id: "first-light", moods: ["atmospheric", "adventurous"] },
  { id: "ashen-fields", moods: ["melancholy", "atmospheric"] },
  { id: "northern-pass", moods: ["adventurous"] },
  { id: "hall-of-champions", moods: ["epic", "triumphant"] },
  { id: "clash-of-banners", moods: ["action", "epic"] },
  { id: "ember-deep", moods: ["dark", "tense"] },
  { id: "jungle-veil", moods: ["mysterious", "atmospheric"] },
  { id: "glass-dunes", moods: ["mysterious", "tense"] },
  { id: "victors-hymn", moods: ["triumphant", "epic"] },
];

const AUTO: MusicMode = { kind: "auto" };

function input(over: Partial<MusicInput> = {}): MusicInput {
  return {
    screen: "match",
    mapId: "arena-alpha",
    matchSeed: "arena-alpha:1",
    result: null,
    self: { alive: true, healthFraction: 1 },
    hitsDealtLast5s: 0,
    hitsTakenLast5s: 0,
    enemyInRange: false,
    lowestAllyHealthFraction: null,
    aliveAllies: 2,
    aliveEnemies: 2,
    teamSize: 2,
    nowMs: 0,
    ...over,
  };
}

const FIGHTING: Partial<MusicInput> = { hitsDealtLast5s: 1, hitsTakenLast5s: 1 };
const PEAK: Partial<MusicInput> = { self: { alive: true, healthFraction: 0.2 } };

/** Feeds `steps` in order and returns every state. */
function run(
  steps: readonly Partial<MusicInput>[],
  mode: MusicMode = AUTO,
  tracks: readonly TrackChoice[] = TRACKS,
): MusicState[] {
  const states: MusicState[] = [];
  let prev: MusicState | null = null;
  for (const step of steps) {
    prev = directMusic(input(step), prev, mode, tracks);
    states.push(prev);
  }
  return states;
}

/** The intensity at each of `times`, after a fight at 0 at `start` and calm from then on. */
function calmFrom(start: Partial<MusicInput>, times: readonly number[]): number[] {
  return run([{ ...start, nowMs: 0 }, ...times.map((nowMs) => ({ nowMs }))])
    .slice(1)
    .map((state) => state.intensity);
}

describe("directMusic: track choice", () => {
  const rows: {
    context: string;
    at: Partial<MusicInput>;
    expected: readonly string[];
  }[] = [
    {
      context: "menu",
      at: { screen: "menu", mapId: null },
      expected: ["first-light", "ashen-fields"],
    },
    { context: "lobby", at: { screen: "lobby", mapId: null }, expected: ["northern-pass"] },
    {
      context: "training-hall",
      at: { screen: "training", mapId: "training-hall" },
      expected: ["first-light", "northern-pass"],
    },
    {
      context: "training-pillars",
      at: { screen: "training", mapId: "training-pillars" },
      expected: ["first-light", "northern-pass"],
    },
    { context: "arena-alpha", at: { mapId: "arena-alpha" }, expected: ["hall-of-champions"] },
    {
      context: "arena-open",
      at: { mapId: "arena-open" },
      expected: ["clash-of-banners", "northern-pass"],
    },
    { context: "arena-pillars", at: { mapId: "arena-pillars" }, expected: ["ember-deep"] },
    {
      context: "arena-split",
      at: { mapId: "arena-split" },
      expected: ["jungle-veil", "glass-dunes"],
    },
    {
      context: "result, victory",
      at: { screen: "result", result: "victory" },
      expected: ["victors-hymn"],
    },
    {
      context: "result, defeat",
      at: { screen: "result", result: "defeat" },
      expected: ["ashen-fields"],
    },
    { context: "an unknown map", at: { mapId: "arena-new" }, expected: ["hall-of-champions"] },
  ];

  for (const { context, at, expected } of rows) {
    it(`plays ${expected.join(" or ")} for ${context}, every one of them for some seed`, () => {
      const picked = new Set(
        Array.from(
          { length: 40 },
          (_, i) => run([{ ...at, matchSeed: `seed-${String(i)}` }])[0]?.trackId,
        ),
      );
      expect([...picked].sort()).toEqual([...expected].sort());
    });
  }

  it("plays the same track for the same seed, and a rematch may differ", () => {
    const at = { mapId: "arena-split" };
    const seeds = Array.from({ length: 20 }, (_, i) => `arena-split:${String(i)}`);
    const first = seeds.map((matchSeed) => run([{ ...at, matchSeed }])[0]?.trackId);
    const again = seeds.map((matchSeed) => run([{ ...at, matchSeed }])[0]?.trackId);
    expect(again).toEqual(first);
    expect(new Set(first).size).toBeGreaterThan(1);
  });

  it("falls back to any epic track when none fits, and to silence when there is none", () => {
    const tracks: TrackChoice[] = [
      { id: "storm", moods: ["tense", "epic"] },
      { id: "lull", moods: ["atmospheric"] },
    ];
    expect(run([{ mapId: "arena-pillars" }], AUTO, tracks)[0]?.trackId).toBe("storm");
    expect(run([{ mapId: "arena-pillars" }], AUTO, tracks.slice(1))[0]?.trackId).toBeNull();
    expect(run([{}], AUTO, [])[0]?.trackId).toBeNull();
  });

  it("plays a pinned track anywhere, and an unknown pinned id as Auto", () => {
    const pinned: MusicMode = { kind: "pinned", trackId: "ember-deep" };
    expect(run([{ screen: "menu" }], pinned)[0]?.trackId).toBe("ember-deep");
    const unknown: MusicMode = { kind: "pinned", trackId: "no-such-track" };
    expect(run([{ mapId: "arena-alpha" }], unknown)[0]?.trackId).toBe("hall-of-champions");
  });

  it("shuffles to any track, the same one all through a context", () => {
    const shuffle: MusicMode = { kind: "shuffle" };
    const picked = new Set(
      Array.from(
        { length: 40 },
        (_, i) => run([{ matchSeed: `seed-${String(i)}` }], shuffle)[0]?.trackId,
      ),
    );
    expect(picked.size).toBeGreaterThan(TRACKS.length / 2);
    const states = run(
      [{}, { ...FIGHTING, nowMs: 1000 }, { ...PEAK, nowMs: 2000 }, { nowMs: 30_000 }],
      shuffle,
    );
    expect(new Set(states.map((state) => state.trackId)).size).toBe(1);
  });

  it("is silent when off, and still works out the intensity", () => {
    const [state] = run([FIGHTING], { kind: "off" });
    expect(state?.trackId).toBeNull();
    expect(state?.intensity).toBe(2);
  });

  it("changes the track with the context, never with the intensity", () => {
    const states = run([
      { nowMs: 0 },
      { enemyInRange: true, nowMs: 1000 },
      { ...FIGHTING, nowMs: 2000 },
      { ...PEAK, nowMs: 3000 },
      { self: { alive: false, healthFraction: 0 }, nowMs: 4000 },
      { nowMs: 60_000 },
    ]);
    expect(states.map((state) => state.intensity)).toEqual([0, 1, 2, 3, 3, 0]);
    expect(new Set(states.map((state) => state.trackId))).toEqual(new Set(["hall-of-champions"]));
    const after = directMusic(
      input({ screen: "result", result: "victory", nowMs: 61_000 }),
      states.at(-1) ?? null,
      AUTO,
      TRACKS,
    );
    expect(after.trackId).toBe("victors-hymn");
  });
});

describe("targetIntensity", () => {
  const rows: { why: string; at: Partial<MusicInput>; level: number }[] = [
    { why: "the menu", at: { screen: "menu", ...FIGHTING }, level: 0 },
    { why: "a result", at: { screen: "result", ...PEAK }, level: 0 },
    { why: "no self", at: { self: null, ...FIGHTING }, level: 0 },
    { why: "dead", at: { self: { alive: false, healthFraction: 0 }, ...FIGHTING }, level: 0 },
    { why: "you below 25 %", at: PEAK, level: 3 },
    { why: "an ally below 25 %", at: { lowestAllyHealthFraction: 0.2 }, level: 3 },
    { why: "the last two alive", at: { aliveAllies: 1, aliveEnemies: 1 }, level: 3 },
    {
      why: "a one-on-one duel",
      at: { teamSize: 1, aliveAllies: 1, aliveEnemies: 1, ...FIGHTING },
      level: 2,
    },
    { why: "hits both ways", at: FIGHTING, level: 2 },
    { why: "an enemy in range", at: { enemyInRange: true }, level: 1 },
    { why: "a hit dealt only", at: { hitsDealtLast5s: 3 }, level: 1 },
    { why: "a hit taken only", at: { hitsTakenLast5s: 1 }, level: 1 },
    { why: "nothing near", at: {}, level: 0 },
    { why: "training, nothing near", at: { screen: "training" }, level: 0 },
    { why: "training, fighting", at: { screen: "training", ...FIGHTING }, level: 2 },
  ];
  for (const { why, at, level } of rows) {
    it(`is ${String(level)} for ${why}`, () => {
      expect(targetIntensity(input(at))).toBe(level);
    });
  }
});

describe("directMusic: intensity over time", () => {
  it("rises at once", () => {
    expect(run([{ nowMs: 0 }, { ...PEAK, nowMs: 10 }]).map((s) => s.intensity)).toEqual([0, 3]);
  });

  it("falls from 2 to 0 over 16 s of calm, one level per 8 s", () => {
    expect(
      calmFrom(FIGHTING, [
        1,
        FALL_STEP_MS - 1,
        FALL_STEP_MS,
        2 * FALL_STEP_MS - 1,
        2 * FALL_STEP_MS,
      ]),
    ).toEqual([2, 2, 1, 1, 0]);
  });

  it("keeps time however often it is asked", () => {
    const times = Array.from({ length: 80 }, (_, i) => (i + 1) * 250);
    const levels = calmFrom(FIGHTING, times);
    expect(levels[times.indexOf(FALL_STEP_MS) - 1]).toBe(2);
    expect(levels[times.indexOf(FALL_STEP_MS)]).toBe(1);
    expect(levels[times.indexOf(2 * FALL_STEP_MS) - 1]).toBe(1);
    expect(levels[times.indexOf(2 * FALL_STEP_MS)]).toBe(0);
  });

  it("holds level 3 at least 6 s", () => {
    const levels = calmFrom(PEAK, [PEAK_HOLD_MS - 1, Math.max(PEAK_HOLD_MS, FALL_STEP_MS)]);
    expect(levels).toEqual([3, 2]);
  });

  it("counts calm from the last moment the fight called for the level", () => {
    const states = run([
      { ...FIGHTING, nowMs: 0 },
      { ...FIGHTING, nowMs: 5000 },
      { nowMs: 5000 + FALL_STEP_MS - 1 },
      { nowMs: 5000 + FALL_STEP_MS },
    ]);
    expect(states.map((s) => s.intensity)).toEqual([2, 2, 2, 1]);
  });

  it("falls by the same steps after a death as after calm", () => {
    const dead = { self: { alive: false, healthFraction: 0 } };
    const states = run([
      { ...FIGHTING, nowMs: 0 },
      { ...dead, nowMs: 1000 },
      { ...dead, nowMs: FALL_STEP_MS },
      { ...dead, nowMs: 2 * FALL_STEP_MS },
    ]);
    expect(states.map((s) => s.intensity)).toEqual([2, 2, 1, 0]);
  });

  it("drops to 0 at once on leaving the match", () => {
    const states = run([
      { ...PEAK, nowMs: 0 },
      { screen: "result", result: "defeat", nowMs: 100 },
    ]);
    expect(states.map((s) => s.intensity)).toEqual([3, 0]);
  });
});
