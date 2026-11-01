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
import { MAP_TRACKS } from "./fixed-tracks.js";

/** The epic's example tracks (#366 §3.5), with plausible moods, primary first. */
const TRACKS: readonly TrackChoice[] = [
  { id: "first-light", moods: ["atmospheric", "adventurous"], layers: 2 },
  { id: "ashen-fields", moods: ["melancholy", "atmospheric"], layers: 4 },
  { id: "northern-pass", moods: ["adventurous"], layers: 4 },
  { id: "hall-of-champions", moods: ["epic", "triumphant"], layers: 4 },
  { id: "clash-of-banners", moods: ["action", "epic"], layers: 4 },
  { id: "ember-deep", moods: ["dark", "tense"], layers: 4 },
  { id: "jungle-veil", moods: ["mysterious", "atmospheric"], layers: 4 },
  { id: "glass-dunes", moods: ["mysterious", "tense"], layers: 4 },
  { id: "victors-hymn", moods: ["triumphant", "epic"], layers: 4 },
];

const AUTO: MusicMode = { kind: "auto" };

function input(over: Partial<MusicInput> = {}): MusicInput {
  return {
    screen: "match",
    menuDepth: null,
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
  it("plays first-light on every menu, as loud as it is deep (#1993)", () => {
    for (const menuDepth of [0, 1] as const) {
      const [state] = run([{ screen: "menu", menuDepth, mapId: null, matchSeed: null }]);
      expect(state).toMatchObject({ trackId: "first-light", intensity: menuDepth });
    }
  });

  it("gives every map its table's song for any seed, and an unknown map hall-of-champions", () => {
    for (const [mapId, expected] of MAP_TRACKS) {
      const picked = new Set(
        Array.from(
          { length: 20 },
          (_, i) => run([{ mapId, matchSeed: `${mapId}:${String(i)}` }])[0]?.trackId,
        ),
      );
      expect([...picked], mapId).toEqual([expected]);
    }
    expect(run([{ mapId: "arena-new" }])[0]?.trackId).toBe("hall-of-champions");
  });

  it("keeps first-light, in the menu's context, from a menu into the Training Ground and back (#2020)", () => {
    const menu: Partial<MusicInput> = {
      screen: "menu",
      menuDepth: 1,
      mapId: null,
      matchSeed: null,
    };
    const states = run([
      menu,
      { screen: "training", menuDepth: 1, mapId: "training-hall", matchSeed: null, ...FIGHTING },
      menu,
    ]);
    expect(states.map((state) => [state.trackId, state.context])).toEqual([
      ["first-light", "menu"],
      ["first-light", "menu"],
      ["first-light", "menu"],
    ]);
  });

  for (const { result, expected } of [
    { result: "victory", expected: ["victors-hymn"] },
    { result: "defeat", expected: ["ashen-fields"] },
  ] as const) {
    it(`plays ${expected.join(" or ")} for a ${result}, by its mood`, () => {
      const picked = new Set(
        Array.from(
          { length: 40 },
          (_, i) => run([{ screen: "result", result, matchSeed: `seed-${String(i)}` }])[0]?.trackId,
        ),
      );
      expect([...picked]).toEqual(expected);
    });
  }

  it("plays a result any epic track when none fits, and silence when there is none", () => {
    const defeat: Partial<MusicInput> = { screen: "result", result: "defeat" };
    const tracks: TrackChoice[] = [
      { id: "storm", moods: ["tense", "epic"], layers: 4 },
      { id: "lull", moods: ["atmospheric"], layers: 4 },
    ];
    expect(run([defeat], AUTO, tracks)[0]?.trackId).toBe("storm");
    expect(run([defeat], AUTO, tracks.slice(1))[0]?.trackId).toBeNull();
    expect(run([defeat], AUTO, [])[0]?.trackId).toBeNull();
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
    { why: "the main menu", at: { screen: "menu", menuDepth: 0, ...FIGHTING }, level: 0 },
    { why: "a menu one deep", at: { screen: "menu", menuDepth: 1 }, level: 1 },
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
    {
      why: "training one menu deep, fighting",
      at: { screen: "training", menuDepth: 1, ...FIGHTING },
      level: 2,
    },
    {
      why: "training one menu deep, nothing near",
      at: { screen: "training", menuDepth: 1 },
      level: 1,
    },
    {
      why: "training one menu deep, dead",
      at: { screen: "training", menuDepth: 1, self: { alive: false, healthFraction: 0 } },
      level: 1,
    },
  ];
  for (const { why, at, level } of rows) {
    it(`is ${String(level)} for ${why}`, () => {
      expect(targetIntensity(input(at), 4)).toBe(level);
    });
  }

  it("keeps training's fight within its song's layers (#2020)", () => {
    expect(targetIntensity(input({ screen: "training", menuDepth: 1, ...PEAK }), 2)).toBe(1);
  });
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

describe("directMusic: menus (#1993)", () => {
  const menu = (menuDepth: 0 | 1, nowMs: number): Partial<MusicInput> => ({
    screen: "menu",
    menuDepth,
    mapId: null,
    matchSeed: null,
    nowMs,
  });

  it("keeps the song from menu to menu, its intensity following the depth at once", () => {
    const states = run([menu(0, 0), menu(1, 1000), menu(0, 2000)]);
    expect(states.map((state) => state.intensity)).toEqual([0, 1, 0]);
    expect(new Set(states.map((state) => state.trackId))).toEqual(new Set(["first-light"]));
  });

  it("clamps the depth to the song's top layer, a pinned one's too", () => {
    expect(targetIntensity(input({ screen: "menu", menuDepth: 1 }), 1)).toBe(0);
    const pinned: MusicMode = { kind: "pinned", trackId: "ember-deep" };
    expect(run([menu(1, 0)], pinned)[0]).toMatchObject({ trackId: "ember-deep", intensity: 1 });
    const single: TrackChoice[] = [{ id: "first-light", moods: ["atmospheric"], layers: 1 }];
    expect(run([menu(1, 0)], AUTO, single)[0]?.intensity).toBe(0);
  });
});
