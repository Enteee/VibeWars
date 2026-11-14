import { vec2, type Vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { KEYMAP_PRESETS } from "../input/keymap.js";

import {
  DODGES_NEEDED,
  EFFECTS_MONITOR,
  MARK_REACH,
  RAT_SKILLS,
  SKILLS_ON_RATS,
  badGroundStation,
  breakWallStation,
  dodgeStation,
  healStation,
  lookStation,
  partyRow,
  ratsStation,
  skillSlot,
  stepInStation,
  type TutorialView,
} from "./stations.js";
import { ASIDE_MS, createTutorialRunner } from "./tutorial-runner.js";
import { PLAYER_PROFESSION, houseBuild } from "./tutorial-world.js";

const PAD = vec2(500, -900);
const GROUND = 2;
const view = (over: Partial<TutorialView> = {}): TutorialView => ({
  self: vec2(0, 0),
  selfLayer: GROUND,
  tutor: vec2(40, 0),
  zoomedOut: false,
  lookDragged: false,
  inView: () => false,
  rockfallDodges: 0,
  hitBy: undefined,
  wallHealth: undefined,
  wallTargeted: false,
  tutorHit: false,
  tutorTargeted: false,
  healedTutor: false,
  energySpent: false,
  zoneStatus: undefined,
  healthDropped: false,
  ratsAlive: 0,
  skillsOnRats: new Set<string>(),
  selfTarget: undefined,
  ratFled: false,
  bigRatDown: false,
  extraRat: false,
  ...over,
});
const sees =
  (target: Vec2) =>
  (point: Vec2): boolean =>
    point.x === target.x && point.y === target.y;

describe("lookStation (#3222)", () => {
  it("is done only once a zoom-out, a right-drag and the teleporter on screen have all happened", () => {
    const all = { zoomedOut: true, lookDragged: true, inView: sees(PAD) };
    for (const missing of ["zoomedOut", "lookDragged", "inView"] as const) {
      const station = lookStation(PAD);
      const short = missing === "inView" ? { inView: () => false } : { [missing]: false };
      expect(station.done(view({ ...all, ...short }))).toBe(false);
    }
    expect(lookStation(PAD).done(view(all))).toBe(true);
  });

  it("remembers the teleporter was seen, though the view has glided back since", () => {
    const station = lookStation(PAD);
    expect(station.done(view({ zoomedOut: true, inView: sees(PAD) }))).toBe(false);
    expect(station.done(view({ zoomedOut: true, lookDragged: true }))).toBe(true);
  });

  it("points at no one place", () => {
    expect(lookStation(PAD).highlight).toBeUndefined();
  });
});

describe("stepInStation (#3222)", () => {
  it("is done on the pad, within MARK_REACH, and not beyond", () => {
    const station = stepInStation(PAD, GROUND);
    expect(station.done(view({ self: vec2(PAD.x + MARK_REACH, PAD.y) }))).toBe(true);
    expect(station.done(view({ self: vec2(PAD.x, PAD.y + MARK_REACH + 1) }))).toBe(false);
  });

  // QA (#3222): under canyon's plateau, at the pad's x and y, counted as on it.
  it("is not done under the pad or over it, on another layer", () => {
    const station = stepInStation(PAD, GROUND);
    expect(station.done(view({ self: PAD, selfLayer: GROUND - 1 }))).toBe(false);
    expect(station.done(view({ self: PAD, selfLayer: GROUND + 1 }))).toBe(false);
  });

  it("points at the pad", () => {
    expect(stepInStation(PAD, GROUND).highlight).toEqual({ kind: "ground", at: PAD });
  });
});

describe("dodgeStation (#3247)", () => {
  const MARK = vec2(2850, 1800);

  it("needs every dodge and the mark", () => {
    const station = dodgeStation(MARK, GROUND);
    expect(station.done(view({ self: MARK, rockfallDodges: DODGES_NEEDED - 1 }))).toBe(false);
    expect(station.done(view({ rockfallDodges: DODGES_NEEDED }))).toBe(false);
    expect(station.done(view({ self: MARK, rockfallDodges: DODGES_NEEDED }))).toBe(true);
  });

  it("is not done on the mark from another layer", () => {
    const station = dodgeStation(MARK, GROUND);
    expect(
      station.done(view({ self: MARK, selfLayer: GROUND - 1, rockfallDodges: DODGES_NEEDED })),
    ).toBe(false);
  });

  it("is not done by a hit, nor kept from being done by one", () => {
    const station = dodgeStation(MARK, GROUND);
    expect(station.done(view({ self: MARK, hitBy: "rockfall" }))).toBe(false);
    expect(
      station.done(view({ self: MARK, hitBy: "rockfall", rockfallDodges: DODGES_NEEDED })),
    ).toBe(true);
  });

  it("runs in the canyon, pointing at its mark, with a line for a hit", () => {
    const station = dodgeStation(MARK, GROUND);
    expect(station.world).toBe("canyon");
    expect(station.highlight).toEqual({ kind: "ground", at: MARK });
    expect(station.lines.hit).toBe("tutorial.dodge.hit");
  });
});

describe("breakWallStation (#3302)", () => {
  const face = vec2(3480, 1800);
  const station = breakWallStation(face, 400);

  it("is not done while the wall stands at any health, nor outside the canyon, and is done at 0", () => {
    for (const wallHealth of [400, 250, 1, undefined]) {
      expect(station.done(view({ wallHealth }))).toBe(false);
    }
    expect(station.done(view({ wallHealth: 0 }))).toBe(true);
  });

  it("is done at once for a wall already broken, before any target or blow", () => {
    expect(breakWallStation(face, 400).done(view({ wallHealth: 0, wallTargeted: false }))).toBe(
      true,
    );
  });

  it("marks the wall's face until it is targeted, and pulses the target frame", () => {
    expect(station.highlight).toEqual({ kind: "hud", element: ".hud-target" });
    expect(station.mark?.(view({ wallHealth: 400 }))).toEqual(face);
    expect(station.mark?.(view({ wallHealth: 400, wallTargeted: true }))).toBeUndefined();
  });

  it("reacts to the first blow: the wall below its full health", () => {
    expect(station.reaction?.when(view({ wallHealth: 400 }))).toBe(false);
    expect(station.reaction?.when(view({ wallHealth: 399 }))).toBe(true);
    expect(station.reaction?.when(view({ wallHealth: undefined }))).toBe(false);
  });
});

describe("healStation (#3303)", () => {
  const station = healStation("tutor", 7);

  it("is not done before the tutor is hit, nor after a hit with no heal", () => {
    expect(station.done(view())).toBe(false);
    expect(station.done(view({ tutorHit: true }))).toBe(false);
    expect(station.done(view({ tutorHit: true, tutorTargeted: true }))).toBe(false);
  });

  it("is done after a hit and then a heal", () => {
    expect(station.done(view({ tutorHit: true, healedTutor: true }))).toBe(true);
  });

  it("does not count a heal before the hit", () => {
    expect(station.done(view({ tutorHit: false, healedTutor: true }))).toBe(false);
  });

  it("pulses the tutor's party row until the tutor is targeted, then the heal's slot", () => {
    if (typeof station.highlight !== "function") {
      throw new Error("a heal station's highlight follows the target");
    }
    expect(station.highlight(view())).toEqual({ kind: "hud", element: partyRow("tutor") });
    expect(station.highlight(view({ tutorTargeted: true }))).toEqual({
      kind: "hud",
      element: skillSlot(7),
    });
    expect(skillSlot(7)).toBe(".hud-skill:nth-child(8)");
    expect(station.keys).toEqual(["skill-8"]);
  });

  it("says the tutor's hit once it lands, and names energy once it is spent", () => {
    const [ow, energy] = station.asides ?? [];
    expect(ow?.when(view())).toBe(false);
    expect(ow?.when(view({ tutorHit: true }))).toBe(true);
    expect(energy?.when(view())).toBe(false);
    expect(energy?.when(view({ energySpent: true }))).toBe(true);
    expect(station.lines.hit).toBe("tutorial.dodge.hit");
  });
});

describe("badGroundStation (#3310)", () => {
  const ACROSS = vec2(6900, 720);
  /** What a runner over the station alone says at each look, `ASIDE_MS` apart. */
  const says = (looks: readonly Partial<TutorialView>[]): (string | undefined)[] => {
    const runner = createTutorialRunner(
      [badGroundStation(ACROSS, GROUND)],
      () => KEYMAP_PRESETS.classic,
    );
    return looks.map((over, at) => runner.tick(view(over), at * ASIDE_MS).say?.key);
  };

  it("is done on the mark, on its layer, and only there", () => {
    const station = badGroundStation(ACROSS, GROUND);
    expect(station.done(view({ self: ACROSS }))).toBe(true);
    expect(station.done(view({ self: vec2(ACROSS.x + MARK_REACH, ACROSS.y) }))).toBe(true);
    expect(station.done(view({ self: vec2(ACROSS.x, ACROSS.y + MARK_REACH + 1) }))).toBe(false);
    expect(station.done(view({ self: ACROSS, selfLayer: GROUND - 1 }))).toBe(false);
    expect(station.done(view({ self: ACROSS, zoneStatus: "mired" }))).toBe(true);
  });

  it("names the mud once: a second spell of it gets no second line", () => {
    expect(
      says([{}, { zoneStatus: "mired" }, { zoneStatus: "mired" }, {}, { zoneStatus: "mired" }]),
    ).toEqual(["tutorial.ground.intro", "tutorial.ground.mired", undefined, undefined, undefined]);
  });

  it("names the lava for burning or crippled, and only the first status gets a line", () => {
    expect(says([{}, { zoneStatus: "crippled" }])).toEqual([
      "tutorial.ground.intro",
      "tutorial.ground.burning",
    ]);
    expect(says([{}, { zoneStatus: "burning" }, {}, { zoneStatus: "mired" }])).toEqual([
      "tutorial.ground.intro",
      "tutorial.ground.burning",
      undefined,
      undefined,
    ]);
  });

  it("names the health bar on the first drop only", () => {
    expect(
      says([{}, { healthDropped: true }, { healthDropped: true }, { healthDropped: true }]),
    ).toEqual(["tutorial.ground.intro", "tutorial.ground.health", undefined, undefined]);
  });

  it("pulses the effects monitor, the mark beside it, while the first status lasts, then never again", () => {
    const station = badGroundStation(ACROSS, GROUND);
    if (typeof station.highlight !== "function" || station.mark === undefined) {
      throw new Error("a bad ground station's highlight follows the player's statuses");
    }
    const { highlight, mark } = station;
    const at = (over: Partial<TutorialView>): unknown => [highlight(view(over)), mark(view(over))];
    const ground = [{ kind: "ground", at: ACROSS }, undefined];
    const monitor = [{ kind: "hud", element: EFFECTS_MONITOR }, ACROSS];
    expect(at({})).toEqual(ground);
    expect(at({ zoneStatus: "mired" })).toEqual(monitor);
    expect(at({ zoneStatus: "mired" })).toEqual(monitor);
    expect(at({})).toEqual(ground);
    expect(at({ zoneStatus: "burning" })).toEqual(ground);
  });
});

describe("ratsStation (#3316)", () => {
  const pocket = vec2(5200, 2100);
  const rats = { runner: "rat-1", big: "rat-2" };
  const bar = [
    "warrior.enraged-smash",
    RAT_SKILLS.bash,
    RAT_SKILLS.crush,
    RAT_SKILLS.runner,
    "warrior.auspicious-blow",
    "warrior.flail",
    "warrior.sprint",
    "monk.heal-other",
  ];
  const station = ratsStation(pocket, rats, bar);
  const one = new Set([RAT_SKILLS.runner]);
  const two = new Set([RAT_SKILLS.runner, RAT_SKILLS.bash]);

  it("names skills the player's build holds", () => {
    const { skillBar } = houseBuild(PLAYER_PROFESSION);
    expect(skillBar).toEqual(expect.arrayContaining(Object.values(RAT_SKILLS)));
  });

  it("is not done with no rat left and one skill landed, and done with two", () => {
    expect(SKILLS_ON_RATS).toBe(2);
    expect(station.done(view({ ratsAlive: 0, skillsOnRats: one }))).toBe(false);
    expect(station.done(view({ ratsAlive: 0, skillsOnRats: two }))).toBe(true);
  });

  it("is not done while a rat stands, the extra one counted, however many skills landed", () => {
    expect(station.done(view({ ratsAlive: 1, skillsOnRats: two }))).toBe(false);
    expect(station.done(view({ ratsAlive: 1, skillsOnRats: one, extraRat: true }))).toBe(false);
    expect(station.done(view({ ratsAlive: 0, skillsOnRats: two, extraRat: true }))).toBe(true);
  });

  it("runs on the canyon's second map, and shows the targeting keys", () => {
    expect(station.world).toBe("canyon-2");
    expect(station.keys).toEqual(["target-next", "target-closest"]);
  });

  it("marks the pocket, lights the runner's strike, then Hammer Bash and Crushing Blow on the big rat", () => {
    const at = (over: Partial<TutorialView>): unknown =>
      typeof station.highlight === "function" ? station.highlight(view(over)) : undefined;
    expect(at({})).toEqual({ kind: "ground", at: pocket });
    expect(at({ selfTarget: "rat-3" })).toEqual({ kind: "ground", at: pocket });
    expect(at({ selfTarget: "rat-1" })).toEqual({ kind: "hud", element: skillSlot(3) });
    expect(at({ selfTarget: "rat-2" })).toEqual({ kind: "hud", element: skillSlot(1) });
    expect(at({ selfTarget: "rat-2", bigRatDown: true })).toEqual({
      kind: "hud",
      element: skillSlot(2),
    });
  });

  it("names the skills from the catalog in its lines, never in the text", () => {
    expect(station.asides?.map(({ line, skills }) => [line, skills])).toEqual([
      ["tutorial.rats.runs", { skill: RAT_SKILLS.runner }],
      ["tutorial.rats.big", { bash: RAT_SKILLS.bash, crush: RAT_SKILLS.crush }],
      ["tutorial.rats.again", undefined],
    ]);
  });

  it("refuses a bar without the skills it names", () => {
    expect(() => ratsStation(pocket, rats, bar.slice(0, 2))).toThrow(/protectors-strike/);
  });
});
