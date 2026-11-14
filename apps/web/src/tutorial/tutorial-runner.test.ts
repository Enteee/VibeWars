import { vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { KEYMAP_PRESETS, type Keymap } from "../input/keymap.js";

import {
  DODGES_NEEDED,
  breakWallStation,
  dodgeStation,
  lookStation,
  stepInStation,
  walkStation,
  type Station,
  type TutorialView,
} from "./stations.js";
import {
  HINT_REPEAT_MS,
  HIT_REPEAT_MS,
  PRAISE_MS,
  createTutorialRunner,
} from "./tutorial-runner.js";

const MARK = vec2(200, 100);
const CAMERA = {
  selfLayer: 0,
  zoomedOut: false,
  lookDragged: false,
  inView: () => false,
  rockfallDodges: 0,
  hitBy: undefined,
  wallHealth: undefined,
  wallTargeted: false,
};
const AWAY: TutorialView = { self: vec2(0, 0), tutor: vec2(180, 100), ...CAMERA };
const ON_MARK: TutorialView = { self: MARK, tutor: vec2(180, 100), ...CAMERA };
const label = (code: string): string => code;

describe("the tutorial runner", () => {
  it("says the intro once, then the hint at 10 s and again at 20 s", () => {
    const runner = createTutorialRunner(
      [walkStation(MARK, 0)],
      () => KEYMAP_PRESETS.classic,
      label,
    );
    const said = [0, 1_000, 9_999, HINT_REPEAT_MS, 15_000, 2 * HINT_REPEAT_MS, 25_000].map(
      (now) => runner.tick(AWAY, now).say?.key,
    );
    expect(said).toEqual([
      "tutorial.walk.intro",
      undefined,
      undefined,
      "tutorial.walk.hint",
      undefined,
      "tutorial.walk.hint",
      undefined,
    ]);
  });

  it("points at the mark until it is done, then praises, and the last station finishes", () => {
    const runner = createTutorialRunner(
      [walkStation(MARK, 0)],
      () => KEYMAP_PRESETS.classic,
      label,
    );
    expect(runner.tick(AWAY, 0)).toMatchObject({
      highlight: { kind: "ground", at: MARK },
      finished: false,
    });
    const praised = runner.tick(ON_MARK, 3_000);
    expect(praised).toMatchObject({ highlight: undefined, finished: true });
    expect(praised.say).toMatchObject({ key: "tutorial.walk.praise", how: undefined });
    expect(runner.tick(ON_MARK, 4_000)).toEqual({
      say: undefined,
      highlight: undefined,
      finished: true,
      world: "battlefield",
    });
  });

  it("moves on to the next station's intro once the praise has stood", () => {
    const next: Station = { ...walkStation(vec2(400, 400), 0), id: "next" };
    const runner = createTutorialRunner(
      [walkStation(MARK, 0), next],
      () => KEYMAP_PRESETS.classic,
      label,
    );
    runner.tick(AWAY, 0);
    expect(runner.tick(ON_MARK, 1_000)).toMatchObject({
      say: { key: "tutorial.walk.praise" },
      finished: false,
    });
    expect(runner.tick(ON_MARK, 1_000 + PRAISE_MS - 1).say).toBeUndefined();
    expect(runner.tick(ON_MARK, 1_000 + PRAISE_MS)).toMatchObject({
      say: { key: "tutorial.walk.intro", how: "tutorial.walk.how" },
      highlight: { kind: "ground", at: vec2(400, 400) },
    });
  });

  it("shows the keys as bound in the keymap passed in, read again on every line", () => {
    let keymap: Keymap = KEYMAP_PRESETS.classic;
    const runner = createTutorialRunner([walkStation(MARK, 0)], () => keymap, label);
    // Every first key, then every second.
    expect(runner.tick(AWAY, 0).say?.keys).toEqual([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowLeft",
      "ArrowDown",
      "ArrowRight",
    ]);
    keymap = { ...KEYMAP_PRESETS.classic, "move-up": ["KeyI"], "move-left": ["KeyJ"] };
    expect(runner.tick(AWAY, HINT_REPEAT_MS).say?.keys).toEqual([
      "KeyI",
      "KeyJ",
      "KeyS",
      "KeyD",
      "ArrowDown",
      "ArrowRight",
    ]);
  });

  it("runs walk, look around and step in, swaps to the canyon once, dodges, breaks the wall and finishes (#3247, #3302)", () => {
    const pad = vec2(200, -900);
    const goal = vec2(2850, 1800);
    const face = vec2(3480, 1800);
    const runner = createTutorialRunner(
      [
        walkStation(MARK, 0),
        lookStation(pad),
        stepInStation(pad, 0),
        dodgeStation(goal, 0),
        breakWallStation(face, 400),
      ],
      () => KEYMAP_PRESETS.classic,
      label,
    );
    const looked = { ...ON_MARK, zoomedOut: true, lookDragged: true, inView: () => true };
    const dodged = { ...looked, self: goal, rockfallDodges: DODGES_NEEDED };
    const ticks: [TutorialView, number][] = [
      [AWAY, 0],
      [ON_MARK, 1_000],
      [ON_MARK, 1_000 + PRAISE_MS],
      [looked, 2_000 + PRAISE_MS],
      [looked, 2_000 + 2 * PRAISE_MS],
      [{ ...looked, self: pad }, 3_000 + 2 * PRAISE_MS],
      [{ ...looked, self: pad }, 3_000 + 3 * PRAISE_MS],
      [{ ...dodged, rockfallDodges: DODGES_NEEDED - 1 }, 4_000 + 3 * PRAISE_MS],
      [dodged, 5_000 + 3 * PRAISE_MS],
      [{ ...dodged, wallHealth: 400 }, 5_000 + 4 * PRAISE_MS],
      [{ ...dodged, wallHealth: 400, wallTargeted: true }, 6_000 + 4 * PRAISE_MS],
      [{ ...dodged, wallHealth: 380, wallTargeted: true }, 7_000 + 4 * PRAISE_MS],
      [{ ...dodged, wallHealth: 0, wallTargeted: true }, 8_000 + 4 * PRAISE_MS],
    ];
    const beats = ticks.map(([view, now]) => runner.tick(view, now));
    expect(beats.map((beat) => beat.say?.key)).toEqual([
      "tutorial.walk.intro",
      "tutorial.walk.praise",
      "tutorial.look.intro",
      "tutorial.look.praise",
      "tutorial.stepIn.intro",
      "tutorial.stepIn.praise",
      "tutorial.dodge.intro",
      undefined,
      "tutorial.dodge.praise",
      "tutorial.wall.intro",
      undefined,
      "tutorial.wall.firstHit",
      "tutorial.wall.praise",
    ]);
    // The frame pulses throughout; the mark by the wall stands until it is targeted.
    expect(beats[9]?.highlight).toEqual({ kind: "hud", element: ".hud-target" });
    expect(beats.slice(9, 12).map((beat) => [beat.highlight?.kind, beat.mark])).toEqual([
      ["hud", face],
      ["hud", undefined],
      ["hud", undefined],
    ]);
    // The wall station is next from the dodge's praise on.
    expect(beats.slice(7, 13).map((beat) => beat.station)).toEqual([
      "dodge",
      "break-wall",
      "break-wall",
      "break-wall",
      "break-wall",
      undefined,
    ]);
    expect(beats[4]?.highlight).toEqual({ kind: "ground", at: pad });
    expect(beats[6]?.highlight).toEqual({ kind: "ground", at: goal });
    // The world turns once, under the step in's praise, and stays turned.
    expect(beats.map((beat) => beat.world)).toEqual([
      "battlefield",
      "battlefield",
      "battlefield",
      "battlefield",
      "battlefield",
      "canyon",
      "canyon",
      "canyon",
      "canyon",
      "canyon",
      "canyon",
      "canyon",
      "canyon",
    ]);
    expect(beats.map((beat) => beat.finished)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("says a station's reaction once, then no more hints until it is done (#3302)", () => {
    const face = vec2(3480, 1800);
    const runner = createTutorialRunner(
      [breakWallStation(face, 700)],
      () => KEYMAP_PRESETS.classic,
      label,
    );
    const wall = (wallHealth: number): TutorialView => ({
      ...AWAY,
      wallHealth,
      wallTargeted: true,
    });
    const said = [
      runner.tick(wall(700), 0),
      runner.tick(wall(700), HINT_REPEAT_MS),
      runner.tick(wall(650), HINT_REPEAT_MS + 1_000),
      runner.tick(wall(600), HINT_REPEAT_MS + 2_000),
      runner.tick(wall(500), 3 * HINT_REPEAT_MS),
      runner.tick(wall(0), 3 * HINT_REPEAT_MS + 1_000),
    ].map((beat) => beat.say?.key);
    expect(said).toEqual([
      "tutorial.wall.intro",
      "tutorial.wall.hint",
      "tutorial.wall.firstHit",
      undefined,
      undefined,
      "tutorial.wall.praise",
    ]);
  });

  it("reacts to a hit once in HIT_REPEAT_MS, and only at a station with a hit line (#3247)", () => {
    const goal = vec2(2850, 1800);
    const runner = createTutorialRunner(
      [dodgeStation(goal, 0)],
      () => KEYMAP_PRESETS.classic,
      label,
    );
    const hit: TutorialView = { ...AWAY, hitBy: "rockfall" };
    const ticks: [TutorialView, number][] = [
      [AWAY, 0],
      [hit, 1_000],
      [hit, 1_000 + HIT_REPEAT_MS - 1],
      [hit, 1_000 + HIT_REPEAT_MS],
    ];
    expect(ticks.map(([view, now]) => runner.tick(view, now).say?.key)).toEqual([
      "tutorial.dodge.intro",
      "tutorial.dodge.hit",
      undefined,
      "tutorial.dodge.hit",
    ]);

    const walker = createTutorialRunner(
      [walkStation(MARK, 0)],
      () => KEYMAP_PRESETS.classic,
      label,
    );
    walker.tick(AWAY, 0);
    expect(walker.tick({ ...AWAY, hitBy: "rockfall" }, 1_000).say).toBeUndefined();
  });
});
