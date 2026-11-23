import { vec2, type Vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { en } from "../i18n/en.js";
import { KEYMAP_PRESETS } from "../input/keymap.js";

import {
  DODGES_NEEDED,
  EFFECTS_MONITOR,
  MARK_REACH,
  RAT_SKILLS,
  SKILLS_ON_RATS,
  badGroundStation,
  breakWallStation,
  callStation,
  climbStation,
  dodgeStation,
  gateStation,
  GATE_REACH,
  healStation,
  lookStation,
  partyRow,
  pingBranch,
  pingStation,
  ratsStation,
  skillSlot,
  stepInStation,
  tunnelStation,
  walkStation,
  type Station,
  type TutorialView,
} from "./stations.js";
import { touchLine } from "./touch-lines.js";
import { ASIDE_MS, HINT_REPEAT_MS, createTutorialRunner } from "./tutorial-runner.js";
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
  belowClicked: false,
  calledId: undefined,
  hitByTutor: new Set<string>(),
  calledTargeted: false,
  calledLost: false,
  lastPing: undefined,
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

  it("runs in the canyon, and shows the targeting keys", () => {
    expect(station.world).toBe("canyon");
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

describe("climbStation (#3323)", () => {
  const LEDGE = { kind: "rect", x: 3290, y: 1800, width: 620, height: 180 } as const;
  const STAIRS = { kind: "rect", x: 3890, y: 1800, width: 140, height: 180 } as const;
  const UPPER = 2;
  const LOWER = 1;
  const MIDDLE = vec2(3600, 1890);
  const ON_LEDGE = { self: MIDDLE, selfLayer: UPPER };
  const UNDER = { self: MIDDLE, selfLayer: LOWER };
  const BESIDE = { self: vec2(3600, 2100), selfLayer: LOWER };
  /** What a runner over the station alone says at each look, `ASIDE_MS` apart. */
  const says = (looks: readonly Partial<TutorialView>[]): (string | undefined)[] => {
    const runner = createTutorialRunner(
      [climbStation(LEDGE, STAIRS, UPPER, LOWER)],
      () => KEYMAP_PRESETS.classic,
    );
    return looks.map((over, at) => runner.tick(view(over), at * ASIDE_MS).say?.key);
  };

  it("is not done under the ledge before the ledge was reached", () => {
    const station = climbStation(LEDGE, STAIRS, UPPER, LOWER);
    expect(station.done(view(UNDER))).toBe(false);
    expect(station.done(view(BESIDE))).toBe(false);
  });

  it("is done on the lower layer under the ledge after it, and not beside it", () => {
    const station = climbStation(LEDGE, STAIRS, UPPER, LOWER);
    expect(station.done(view(ON_LEDGE))).toBe(false);
    expect(station.done(view(BESIDE))).toBe(false);
    expect(station.done(view(UNDER))).toBe(true);
  });

  it("does not count the stairs' top, where it overlaps the ledge, as up (#3343)", () => {
    const station = climbStation(LEDGE, STAIRS, UPPER, LOWER);
    if (typeof station.highlight !== "function") {
      throw new Error("a climb station's mark moves");
    }
    const onStairsTop = { self: vec2(3900, 1890), selfLayer: UPPER };
    expect(station.highlight(view(onStairsTop))).toEqual({
      kind: "ground",
      at: MIDDLE,
      layer: UPPER,
    });
    expect(station.done(view(UNDER))).toBe(false);
  });

  it("marks the ledge, then the ground under its middle once the player stood on it", () => {
    const station = climbStation(LEDGE, STAIRS, UPPER, LOWER);
    if (typeof station.highlight !== "function") {
      throw new Error("a climb station's mark moves");
    }
    const { highlight } = station;
    const onLedge = { kind: "ground", at: MIDDLE, layer: UPPER };
    const under = { kind: "ground", at: MIDDLE, layer: LOWER };
    expect(highlight(view(BESIDE))).toEqual(onLedge);
    expect(highlight(view(UNDER))).toEqual(onLedge);
    expect(highlight(view(ON_LEDGE))).toEqual(under);
    expect(highlight(view(BESIDE))).toEqual(under);
  });

  it("says how to go under once up, and no tip after an Alt walk down", () => {
    expect(says([BESIDE, ON_LEDGE, { ...UNDER, belowClicked: true }])).toEqual([
      "tutorial.climb.intro",
      "tutorial.climb.under",
      "tutorial.climb.praise",
    ]);
  });

  it("tips Alt once, when the player came down another way", () => {
    expect(
      says([BESIDE, ON_LEDGE, BESIDE, BESIDE, { ...BESIDE, belowClicked: true }, UNDER]),
    ).toEqual([
      "tutorial.climb.intro",
      "tutorial.climb.under",
      "tutorial.climb.tip",
      undefined,
      undefined,
      "tutorial.climb.praise",
    ]);
  });

  it("on touch is done back down beside the ledge, its mark gone once up (#3782)", () => {
    const station = climbStation(LEDGE, STAIRS, UPPER, LOWER, true);
    if (typeof station.highlight !== "function") {
      throw new Error("a climb station's mark moves");
    }
    expect(station.done(view(BESIDE))).toBe(false);
    expect(station.highlight(view(BESIDE))).toEqual({ kind: "ground", at: MIDDLE, layer: UPPER });
    expect(station.done(view(ON_LEDGE))).toBe(false);
    expect(station.highlight(view(ON_LEDGE))).toBeUndefined();
    expect(station.done(view(BESIDE))).toBe(true);
  });
});

describe("tunnelStation (#3326)", () => {
  const TUNNEL = { kind: "rect", x: 2080, y: 450, width: 720, height: 500 } as const;
  const UNDER = 0;
  const ABOVE = 1;
  const MARK = vec2(3240, 700);
  const tunnel = () => tunnelStation(TUNNEL, UNDER, ABOVE, MARK);
  const WEST_UNDER = { self: vec2(2200, 700), selfLayer: UNDER };
  const EAST_UNDER = { self: vec2(2700, 700), selfLayer: UNDER };
  const WEST_OVER = { self: vec2(2200, 700), selfLayer: ABOVE };
  const EAST_OVER = { self: vec2(2700, 700), selfLayer: ABOVE };
  const BEFORE = { self: vec2(1500, 700), selfLayer: ABOVE };
  const ON_MARK = { self: MARK, selfLayer: ABOVE };

  it("is done on the mark after both halves underground, then not before", () => {
    const station = tunnel();
    expect(station.done(view(ON_MARK))).toBe(false);
    expect(station.done(view(WEST_UNDER))).toBe(false);
    expect(station.done(view(EAST_UNDER))).toBe(false);
    expect(station.done(view(ON_MARK))).toBe(true);
  });

  it("is done from the east mouth first too", () => {
    const station = tunnel();
    for (const over of [EAST_UNDER, WEST_UNDER]) {
      station.done(view(over));
    }
    expect(station.done(view(ON_MARK))).toBe(true);
  });

  it("is not done over the top to the mark", () => {
    const station = tunnel();
    for (const over of [BEFORE, WEST_OVER, EAST_OVER]) {
      station.done(view(over));
    }
    expect(station.done(view(ON_MARK))).toBe(false);
  });

  it("keeps the west half once walked, but wants the east half underground", () => {
    const station = tunnel();
    for (const over of [WEST_UNDER, WEST_OVER, EAST_OVER]) {
      station.done(view(over));
    }
    expect(station.done(view(ON_MARK))).toBe(false);
    station.done(view(EAST_UNDER));
    expect(station.done(view(ON_MARK))).toBe(true);
  });

  it("marks the east mouth's top on the ground's layer", () => {
    expect(tunnel().highlight).toEqual({ kind: "ground", at: MARK, layer: ABOVE });
  });
});

describe("callStation (#3331)", () => {
  const RAT = "tutorial-call-rat-1";
  const OTHER = "tutorial-call-rat-2";

  it("is not done with a call the tutor has not struck, nor a strike on a rat not called", () => {
    const station = callStation();
    expect(station.done(view({ calledId: RAT }))).toBe(false);
    expect(station.done(view({ calledId: OTHER, hitByTutor: new Set([RAT]) }))).toBe(false);
    expect(station.done(view({ hitByTutor: new Set([RAT]) }))).toBe(false);
  });

  it("is done once the tutor has struck the rat called, and stays done", () => {
    const station = callStation();
    expect(station.done(view({ calledId: RAT, hitByTutor: new Set([RAT]) }))).toBe(true);
    expect(station.done(view())).toBe(true);
  });

  it("is not done by a call on the tutor", () => {
    expect(callStation().done(view({ calledId: "tutorial-tutor" }))).toBe(false);
  });

  it("lights the target bar, which its lines name (#3884)", () => {
    expect(callStation().highlight).toEqual({ kind: "hud", element: ".hud-target" });
  });

  it("says T finds the call once, the first time the player uses it", () => {
    const runner = createTutorialRunner([callStation()], () => KEYMAP_PRESETS.classic);
    const looks = [
      {},
      { calledId: RAT, calledTargeted: true },
      { calledId: RAT, calledTargeted: true },
    ];
    expect(looks.map((over, at) => runner.tick(view(over), at * ASIDE_MS))).toMatchObject([
      { say: { key: "tutorial.call.intro" } },
      { say: { key: "tutorial.call.t", keys: ["T"] } },
      { say: undefined },
    ]);
  });

  it("says call the other once, when the rat called died before the tutor struck it", () => {
    const runner = createTutorialRunner([callStation()], () => KEYMAP_PRESETS.classic);
    const looks = [
      {},
      { calledLost: true },
      { calledLost: true },
      { calledId: OTHER, calledLost: true, hitByTutor: new Set([OTHER]) },
    ];
    expect(looks.map((over, at) => runner.tick(view(over), at * ASIDE_MS).say?.key)).toEqual([
      "tutorial.call.intro",
      "tutorial.call.other",
      undefined,
      "tutorial.call.praise",
    ]);
  });
});

describe("pingStation (#3332, #3792)", () => {
  // As on the canyon: two arms round an island east of the fork, rejoining past it, a bay south.
  const JUNCTION = {
    fork: vec2(0, 0),
    layer: GROUND,
    north: vec2(550, -285),
    south: vec2(550, 285),
    rejoin: vec2(1250, 0),
    bay: vec2(620, 480),
  };
  const station = (): ReturnType<typeof pingStation> => pingStation(JUNCTION);
  const ON_NORTH = vec2(520, -260);
  const ON_SOUTH = vec2(560, 300);
  const ON_REJOIN = { self: JUNCTION.rejoin };

  it("calls the arm whose mark a ping is nearer, and neither from behind the fork or at the rejoin", () => {
    const { fork, north, south, rejoin } = JUNCTION;
    expect(pingBranch(ON_NORTH, fork, north, south)).toBe("north");
    expect(pingBranch(vec2(200, -60), fork, north, south)).toBe("north");
    expect(pingBranch(ON_SOUTH, fork, north, south)).toBe("south");
    expect(pingBranch(vec2(-300, 0), fork, north, south)).toBeUndefined();
    expect(pingBranch(rejoin, fork, north, south)).toBeUndefined();
  });

  it("lights the compass, with the fork marked beside it until an arm is called, then the rejoin", () => {
    const ping = station();
    expect(ping.highlight).toEqual({ kind: "hud", element: ".compass" });
    expect(ping.mark?.(view())).toEqual(JUNCTION.fork);
    ping.done(view({ lastPing: ON_SOUTH }));
    expect(ping.mark?.(view())).toEqual(JUNCTION.rejoin);
  });

  it("is done on the rejoin by either arm once one is called, and not before", () => {
    for (const arm of [ON_NORTH, ON_SOUTH]) {
      const ping = station();
      expect(ping.done(view(ON_REJOIN))).toBe(false);
      expect(ping.done(view({ lastPing: arm }))).toBe(false);
      expect(ping.done(view(ON_REJOIN))).toBe(true);
      expect(ping.done(view({ ...ON_REJOIN, selfLayer: GROUND + 1 }))).toBe(false);
    }
  });

  it("holds an arm's call through a later stray ping", () => {
    const ping = station();
    ping.done(view({ lastPing: ON_NORTH }));
    expect(ping.done(view({ ...ON_REJOIN, lastPing: vec2(-300, 0) }))).toBe(true);
  });

  it("says its line on the view once, as the tutor passes the bay", () => {
    const runner = createTutorialRunner([station()], () => KEYMAP_PRESETS.classic);
    const looks: Partial<TutorialView>[] = [
      {},
      { lastPing: ON_SOUTH, tutor: vec2(200, 100) },
      { lastPing: ON_SOUTH, tutor: JUNCTION.south },
      { lastPing: ON_SOUTH, tutor: JUNCTION.south },
    ];
    expect(looks.map((over, at) => runner.tick(view(over), at * ASIDE_MS).say?.key)).toEqual([
      "tutorial.ping.intro",
      "tutorial.ping.called",
      "tutorial.ping.view",
      undefined,
    ]);
  });

  it("says the call was heard once, then no hint on the walk to the rejoin", () => {
    const runner = createTutorialRunner([station()], () => KEYMAP_PRESETS.classic);
    const said: (string | undefined)[] = [runner.tick(view(), 0).say?.key];
    // Called at 1 s, then 30 s on the north arm, a look a second, nowhere near the rejoin.
    for (let at = 1; at <= 31; at += 1) {
      said.push(runner.tick(view({ lastPing: ON_NORTH, self: ON_NORTH }), at * 1000).say?.key);
    }
    expect(31_000).toBeGreaterThan(HINT_REPEAT_MS * 2);
    expect(said.filter((key) => key !== undefined)).toEqual([
      "tutorial.ping.intro",
      "tutorial.ping.called",
    ]);
  });

  it("counts a ping far from both arms for neither, and says the hint once for it", () => {
    const ping = station();
    const runner = createTutorialRunner([ping], () => KEYMAP_PRESETS.classic);
    const far = vec2(-300, 0);
    const looks: Partial<TutorialView>[] = [{}, { lastPing: far }, { lastPing: far }];
    expect(looks.map((over, at) => runner.tick(view(over), at * ASIDE_MS).say?.key)).toEqual([
      "tutorial.ping.intro",
      "tutorial.ping.hint",
      undefined,
    ]);
    expect(ping.done(view({ ...ON_REJOIN, lastPing: far }))).toBe(false);
  });

  it("says the hint once when the player walks on east unpinged, and waits", () => {
    const ping = station();
    const runner = createTutorialRunner([ping], () => KEYMAP_PRESETS.classic);
    const past = { self: vec2(JUNCTION.fork.x + 350, 0) };
    const looks: Partial<TutorialView>[] = [{}, past, past];
    expect(looks.map((over, at) => runner.tick(view(over), at * ASIDE_MS).say?.key)).toEqual([
      "tutorial.ping.intro",
      "tutorial.ping.hint",
      undefined,
    ]);
    expect(ping.done(view(ON_REJOIN))).toBe(false);
  });
});

describe("gateStation (#3334)", () => {
  const GATE = vec2(7600, 700);
  const LAYER = 1;

  it("is done in the gate, within GATE_REACH, and not beyond", () => {
    const station = gateStation(GATE, LAYER);
    const at = (self: Vec2, selfLayer = LAYER): boolean => station.done(view({ self, selfLayer }));
    expect(at(vec2(GATE.x - GATE_REACH, GATE.y))).toBe(true);
    expect(at(vec2(GATE.x, GATE.y + GATE_REACH + 1))).toBe(false);
    expect(at(vec2(GATE.x - 400, GATE.y))).toBe(false);
  });

  it("is not done under the gate or over it, on another layer", () => {
    const station = gateStation(GATE, LAYER);
    expect(station.done(view({ self: GATE, selfLayer: LAYER - 1 }))).toBe(false);
    expect(station.done(view({ self: GATE, selfLayer: LAYER + 1 }))).toBe(false);
  });

  it("points at the gate, in the canyon", () => {
    const station = gateStation(GATE, LAYER);
    expect(station.highlight).toEqual({ kind: "ground", at: GATE, layer: LAYER });
    expect(station.world).toBe("canyon");
  });
});

describe("a station whose how line names the target bar lights it (#3884)", () => {
  const box = { kind: "rect", x: 0, y: 0, width: 100, height: 100 } as const;
  const at = vec2(0, 0);
  const junction = { fork: at, layer: GROUND, north: at, south: at, rejoin: at, bay: at };
  const stations = [
    walkStation(at, GROUND),
    lookStation(at),
    stepInStation(at, GROUND),
    dodgeStation(at, GROUND),
    breakWallStation(at, 400),
    healStation("tutor", 7),
    badGroundStation(at, GROUND),
    ratsStation(at, { runner: "rat-1", big: "rat-2" }, houseBuild(PLAYER_PROFESSION).skillBar),
    climbStation(box, box, 2, 1),
    tunnelStation(box, 0, 1, at),
    callStation(),
    pingStation(junction),
    gateStation(at, GROUND),
  ];
  /** Its how line, on a desktop or by touch, names the target bar. */
  const namesTargetBar = (station: Station): boolean =>
    [station.lines.how, touchLine(station.lines.how, true)].some((key) => {
      const line = en[key];
      return typeof line === "string" && line.includes("target bar");
    });
  const naming = stations.filter(namesTargetBar);

  it("finds the call station's lines", () => {
    expect(naming.map((station) => station.id)).toContain("call");
  });

  it.each(naming)("$id", (station) => {
    const highlight =
      typeof station.highlight === "function" ? station.highlight(view()) : station.highlight;
    expect(highlight).toEqual({ kind: "hud", element: ".hud-target" });
  });
});
