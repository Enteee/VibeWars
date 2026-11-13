import { vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { KEYMAP_PRESETS, type Keymap } from "../input/keymap.js";

import { walkStation, type Station, type TutorialView } from "./stations.js";
import { HINT_REPEAT_MS, PRAISE_MS, createTutorialRunner } from "./tutorial-runner.js";

const MARK = vec2(200, 100);
const AWAY: TutorialView = { self: vec2(0, 0), tutor: vec2(180, 100) };
const ON_MARK: TutorialView = { self: MARK, tutor: vec2(180, 100) };
const label = (code: string): string => code;

describe("the tutorial runner", () => {
  it("says the intro once, then the hint at 10 s and again at 20 s", () => {
    const runner = createTutorialRunner([walkStation(MARK)], () => KEYMAP_PRESETS.classic, label);
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
    const runner = createTutorialRunner([walkStation(MARK)], () => KEYMAP_PRESETS.classic, label);
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
    });
  });

  it("moves on to the next station's intro once the praise has stood", () => {
    const next: Station = { ...walkStation(vec2(400, 400)), id: "next" };
    const runner = createTutorialRunner(
      [walkStation(MARK), next],
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
    const runner = createTutorialRunner([walkStation(MARK)], () => keymap, label);
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
});
