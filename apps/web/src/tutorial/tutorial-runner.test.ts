import { vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { KEYMAP_PRESETS, type Keymap } from "../input/keymap.js";

import {
  DODGES_NEEDED,
  EFFECTS_MONITOR,
  HEALTH_BAR,
  RAT_SKILLS,
  badGroundStation,
  breakWallStation,
  callStation,
  pingStation,
  climbStation,
  tunnelStation,
  dodgeStation,
  gateStation,
  healStation,
  lookStation,
  partyRow,
  ratsStation,
  skillSlot,
  stepInStation,
  walkStation,
  type Station,
  type TutorialView,
} from "./stations.js";
import {
  ASIDE_MS,
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
};
const AWAY: TutorialView = { self: vec2(0, 0), tutor: vec2(180, 100), ...CAMERA };
const ON_MARK: TutorialView = { self: MARK, tutor: vec2(180, 100), ...CAMERA };
const label = (code: string): string => code;

describe("the tutorial runner", () => {
  it("says the intro once, then the hint at 10 s and again at 20 s", () => {
    const runner = createTutorialRunner(
      [walkStation(MARK, 0)],
      () => KEYMAP_PRESETS.classic,
      0,
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
      0,
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
      0,
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

  it("starts at station `first`, in that station's world (#3383)", () => {
    const later: Station = { ...walkStation(vec2(400, 400), 0), id: "later", world: "canyon" };
    const runner = createTutorialRunner(
      [walkStation(MARK, 0), later],
      () => KEYMAP_PRESETS.classic,
      1,
      label,
    );
    expect(runner.tick(AWAY, 0)).toMatchObject({
      station: "later",
      world: "canyon",
      say: { key: "tutorial.walk.intro" },
      highlight: { kind: "ground", at: vec2(400, 400) },
    });
  });

  it("shows the keys as bound in the keymap passed in, read again on every line", () => {
    let keymap: Keymap = KEYMAP_PRESETS.classic;
    const runner = createTutorialRunner([walkStation(MARK, 0)], () => keymap, 0, label);
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

  it("runs walk, look around and step in, swaps to the canyon once, dodges, breaks the wall, heals the tutor, crosses the bad ground, kills the rats, climbs the ledge, goes through the tunnel, calls a rat, pings an arm of the junction, goes through the mist gate and finishes (#3247, #3302, #3303, #3310, #3316, #3323, #3326, #3331, #3332, #3334, #3792)", () => {
    const pad = vec2(200, -900);
    const goal = vec2(2850, 1800);
    const face = vec2(3480, 1800);
    const across = vec2(6900, 720);
    const pocket = vec2(5200, 2100);
    const ledge = { kind: "rect", x: 3290, y: 1800, width: 620, height: 180 } as const;
    const stairs = { kind: "rect", x: 3890, y: 1800, width: 140, height: 180 } as const;
    const onLedge = vec2(3600, 1890);
    const tunnel = { kind: "rect", x: 2080, y: 450, width: 720, height: 500 } as const;
    const pastTunnel = vec2(3240, 700);
    const junction = {
      fork: vec2(4900, 700),
      layer: 1,
      north: vec2(5450, 375),
      south: vec2(5450, 1335),
      rejoin: vec2(6150, 700),
      bay: vec2(5660, 1545),
    };
    const gate = vec2(7600, 700);
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
    const runner = createTutorialRunner(
      [
        walkStation(MARK, 0),
        lookStation(pad),
        stepInStation(pad, 0),
        dodgeStation(goal, 0),
        breakWallStation(face, 400),
        healStation("tutor", 7),
        badGroundStation(across, 0),
        ratsStation(pocket, { runner: "rat-1", big: "rat-2" }, bar),
        climbStation(ledge, stairs, 2, 1),
        tunnelStation(tunnel, 0, 1, pastTunnel),
        callStation(),
        pingStation(junction),
        gateStation(gate, 1),
      ],
      () => KEYMAP_PRESETS.classic,
      0,
      label,
    );
    const looked = { ...ON_MARK, zoomedOut: true, lookDragged: true, inView: () => true };
    const dodged = { ...looked, self: goal, rockfallDodges: DODGES_NEEDED };
    const broken = { ...dodged, wallHealth: 0, wallTargeted: true };
    const healed = { tutorHit: true, tutorTargeted: true, energySpent: true, healedTutor: true };
    const rats: TutorialView = {
      ...broken,
      ...healed,
      self: pocket,
      ratsAlive: 3,
      skillsOnRats: new Set([RAT_SKILLS.runner]),
    };
    const two = new Set([RAT_SKILLS.runner, RAT_SKILLS.bash]);
    const climb: TutorialView = {
      ...rats,
      ratFled: true,
      ratsAlive: 0,
      extraRat: true,
      skillsOnRats: two,
      self: vec2(3600, 2100),
      selfLayer: 1,
    };
    const called: TutorialView = { ...climb, self: vec2(4200, 700), selfLayer: 1 };
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
      [{ ...broken }, 8_000 + 5 * PRAISE_MS],
      [{ ...broken, tutorHit: true }, 8_000 + 5 * PRAISE_MS + ASIDE_MS],
      [{ ...broken, tutorHit: true, tutorTargeted: true }, 9_000 + 5 * PRAISE_MS + ASIDE_MS],
      [
        { ...broken, tutorHit: true, tutorTargeted: true, energySpent: true },
        8_000 + 5 * PRAISE_MS + 2 * ASIDE_MS,
      ],
      [{ ...broken, ...healed }, 9_000 + 5 * PRAISE_MS + 3 * ASIDE_MS],
      [{ ...broken, ...healed }, 9_000 + 6 * PRAISE_MS + 3 * ASIDE_MS],
      [{ ...broken, ...healed, zoneStatus: "mired" }, 9_000 + 6 * PRAISE_MS + 4 * ASIDE_MS],
      [{ ...broken, ...healed, self: across }, 10_000 + 6 * PRAISE_MS + 5 * ASIDE_MS],
      [{ ...rats }, 10_000 + 7 * PRAISE_MS + 5 * ASIDE_MS],
      [{ ...rats, selfTarget: "rat-1" }, 11_000 + 7 * PRAISE_MS + 5 * ASIDE_MS],
      [{ ...rats, selfTarget: "rat-1", ratFled: true }, 10_000 + 7 * PRAISE_MS + 6 * ASIDE_MS],
      [{ ...rats, ratFled: true, selfTarget: "rat-2" }, 10_000 + 7 * PRAISE_MS + 7 * ASIDE_MS],
      [
        { ...rats, ratFled: true, selfTarget: "rat-2", bigRatDown: true },
        11_000 + 7 * PRAISE_MS + 7 * ASIDE_MS,
      ],
      [{ ...rats, ratFled: true, ratsAlive: 0 }, 12_000 + 7 * PRAISE_MS + 7 * ASIDE_MS],
      [
        { ...rats, ratFled: true, ratsAlive: 1, extraRat: true },
        10_000 + 7 * PRAISE_MS + 8 * ASIDE_MS,
      ],
      [
        { ...rats, ratFled: true, ratsAlive: 0, extraRat: true, skillsOnRats: two },
        11_000 + 7 * PRAISE_MS + 9 * ASIDE_MS,
      ],
      [climb, 11_000 + 8 * PRAISE_MS + 9 * ASIDE_MS],
      [{ ...climb, self: onLedge, selfLayer: 2 }, 11_000 + 8 * PRAISE_MS + 10 * ASIDE_MS],
      [{ ...climb, self: onLedge, belowClicked: true }, 11_000 + 8 * PRAISE_MS + 11 * ASIDE_MS],
      [{ ...climb, self: onLedge, belowClicked: true }, 11_000 + 9 * PRAISE_MS + 11 * ASIDE_MS],
      [{ ...climb, self: vec2(2200, 700), selfLayer: 0 }, 11_000 + 10 * PRAISE_MS + 12 * ASIDE_MS],
      [{ ...climb, self: vec2(2700, 700), selfLayer: 0 }, 11_000 + 10 * PRAISE_MS + 13 * ASIDE_MS],
      [{ ...climb, self: pastTunnel, selfLayer: 1 }, 11_000 + 10 * PRAISE_MS + 14 * ASIDE_MS],
      [{ ...called, calledId: "call-rat-1" }, 11_000 + 11 * PRAISE_MS + 16 * ASIDE_MS],
      [
        { ...called, calledId: "call-rat-1", hitByTutor: new Set(["call-rat-1"]) },
        11_000 + 11 * PRAISE_MS + 17 * ASIDE_MS,
      ],
      [{ ...called, tutor: junction.fork }, 11_000 + 12 * PRAISE_MS + 17 * ASIDE_MS],
      [
        { ...called, lastPing: junction.south, tutor: junction.south },
        11_000 + 12 * PRAISE_MS + 18 * ASIDE_MS,
      ],
      [
        { ...called, lastPing: junction.south, self: junction.rejoin, tutor: junction.rejoin },
        11_000 + 12 * PRAISE_MS + 19 * ASIDE_MS,
      ],
      [
        { ...called, lastPing: junction.south, self: junction.rejoin, tutor: junction.rejoin },
        11_000 + 13 * PRAISE_MS + 19 * ASIDE_MS,
      ],
      [{ ...called, self: gate, tutor: gate }, 12_000 + 13 * PRAISE_MS + 19 * ASIDE_MS],
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
      "tutorial.heal.intro",
      "tutorial.heal.ow",
      undefined,
      "tutorial.heal.energy",
      "tutorial.heal.praise",
      "tutorial.ground.intro",
      "tutorial.ground.mired",
      "tutorial.ground.praise",
      "tutorial.rats.intro",
      undefined,
      "tutorial.rats.runs",
      "tutorial.rats.big",
      undefined,
      undefined,
      "tutorial.rats.again",
      "tutorial.rats.praise",
      "tutorial.climb.intro",
      "tutorial.climb.under",
      "tutorial.climb.praise",
      "tutorial.tunnel.intro",
      undefined,
      undefined,
      "tutorial.tunnel.praise",
      "tutorial.call.intro",
      "tutorial.call.praise",
      "tutorial.ping.intro",
      "tutorial.ping.view",
      "tutorial.ping.praise",
      "tutorial.gate.intro",
      "tutorial.gate.praise",
    ]);
    // The compass is lit while a ping is wanted, the fork marked beside it, then the rejoin.
    expect([beats[38]?.highlight, beats[38]?.mark, beats[39]?.mark]).toEqual([
      { kind: "hud", element: ".compass" },
      junction.fork,
      junction.rejoin,
    ]);
    // The party window, where the tutor stands, is lit while the call is wanted.
    expect(beats[36]?.highlight).toEqual({ kind: "hud", element: ".party-window" });
    // The ledge is marked on its layer, then the ground under its middle.
    expect(beats.slice(29, 31).map((beat) => beat.highlight)).toEqual([
      { kind: "ground", at: onLedge, layer: 2 },
      { kind: "ground", at: onLedge, layer: 1 },
    ]);
    // The rats name their skills from the catalog; the runner lights its strike, the big rat
    // Hammer Bash until it is down, then Crushing Blow; otherwise the pocket is marked.
    expect(beats[23]?.say?.skills).toEqual({ skill: RAT_SKILLS.runner });
    expect(beats[24]?.say?.skills).toEqual({ bash: RAT_SKILLS.bash, crush: RAT_SKILLS.crush });
    expect(beats[21]?.say?.keys).toEqual(["Tab", "KeyC"]);
    expect(beats.slice(21, 27).map((beat) => beat.highlight)).toEqual([
      { kind: "ground", at: pocket },
      { kind: "hud", element: skillSlot(3) },
      { kind: "hud", element: skillSlot(3) },
      { kind: "hud", element: skillSlot(1) },
      { kind: "hud", element: skillSlot(2) },
      { kind: "ground", at: pocket },
    ]);
    // The mark past the bad ground, then the effects monitor while the mud's status lasts.
    expect(beats.slice(18, 20).map((beat) => [beat.highlight, beat.mark])).toEqual([
      [{ kind: "ground", at: across }, undefined],
      [{ kind: "hud", element: EFFECTS_MONITOR }, across],
    ]);
    // The tutor's party row pulses until it is targeted, then the heal's slot.
    expect(beats.slice(13, 17).map((beat) => beat.highlight)).toEqual([
      { kind: "hud", element: partyRow("tutor") },
      { kind: "hud", element: partyRow("tutor") },
      { kind: "hud", element: skillSlot(7) },
      { kind: "hud", element: skillSlot(7) },
    ]);
    expect(beats[13]?.say?.keys).toEqual(["Digit8"]);
    // The frame pulses throughout; the mark by the wall stands until it is targeted.
    expect(beats[9]?.highlight).toEqual({ kind: "hud", element: ".hud-target" });
    expect(beats.slice(9, 12).map((beat) => [beat.highlight?.kind, beat.mark])).toEqual([
      ["hud", face],
      ["hud", undefined],
      ["hud", undefined],
    ]);
    // The wall station is next from the dodge's praise on, the heal from the wall's.
    expect(beats.slice(7, 13).map((beat) => beat.station)).toEqual([
      "dodge",
      "break-wall",
      "break-wall",
      "break-wall",
      "break-wall",
      "heal",
    ]);
    expect(beats[4]?.highlight).toEqual({ kind: "ground", at: pad });
    expect(beats[6]?.highlight).toEqual({ kind: "ground", at: goal });
    // The world turns once, under the step in's praise, and stays turned.
    expect(beats.map((beat) => beat.world)).toEqual([
      ...Array<string>(5).fill("battlefield"),
      ...Array<string>(38).fill("canyon"),
    ]);
    expect(beats.map((beat) => beat.finished)).toEqual([...Array<boolean>(42).fill(false), true]);
  });

  it("says a station's reaction once, then no more hints until it is done (#3302)", () => {
    const face = vec2(3480, 1800);
    const runner = createTutorialRunner(
      [breakWallStation(face, 700)],
      () => KEYMAP_PRESETS.classic,
      0,
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

  it("says each aside once, and goes on hinting after it (#3303)", () => {
    const runner = createTutorialRunner(
      [healStation("tutor", 7)],
      () => KEYMAP_PRESETS.classic,
      0,
      label,
    );
    const hit: TutorialView = { ...AWAY, tutorHit: true };
    const said = [
      runner.tick(AWAY, 0),
      runner.tick(hit, ASIDE_MS),
      runner.tick(hit, ASIDE_MS + 1_000),
      runner.tick(hit, ASIDE_MS + HINT_REPEAT_MS),
      runner.tick({ ...hit, energySpent: true }, 2 * ASIDE_MS + HINT_REPEAT_MS),
      runner.tick({ ...hit, energySpent: true }, 3 * ASIDE_MS + HINT_REPEAT_MS),
    ].map((beat) => beat.say?.key);
    expect(said).toEqual([
      "tutorial.heal.intro",
      "tutorial.heal.ow",
      undefined,
      "tutorial.heal.hint",
      "tutorial.heal.energy",
      undefined,
    ]);
  });

  it("says two asides true on the same tick in turn, each standing ASIDE_MS (#3310)", () => {
    const runner = createTutorialRunner(
      [badGroundStation(MARK, 0)],
      () => KEYMAP_PRESETS.classic,
      0,
      label,
    );
    const lava: TutorialView = { ...AWAY, zoneStatus: "burning", healthDropped: true };
    const ticks: [TutorialView, number][] = [
      [AWAY, 0],
      [lava, ASIDE_MS - 1],
      [lava, ASIDE_MS],
      [lava, 2 * ASIDE_MS - 1],
      [lava, 2 * ASIDE_MS],
      [lava, 3 * ASIDE_MS],
    ];
    const beats = ticks.map(([view, now]) => runner.tick(view, now));
    expect(beats.map((beat) => beat.say?.key)).toEqual([
      "tutorial.ground.intro",
      undefined,
      "tutorial.ground.burning",
      undefined,
      "tutorial.ground.health",
      undefined,
    ]);
    // The health line points at the health bar while it stands, over the effects monitor.
    expect(beats.slice(2).map((beat) => beat.highlight)).toEqual([
      { kind: "hud", element: EFFECTS_MONITOR },
      { kind: "hud", element: EFFECTS_MONITOR },
      { kind: "hud", element: HEALTH_BAR },
      { kind: "hud", element: HEALTH_BAR },
    ]);
  });

  it("says an aside that is due before the praise, and lets it stand ASIDE_MS (#3310)", () => {
    const runner = createTutorialRunner(
      [healStation("tutor", 7)],
      () => KEYMAP_PRESETS.classic,
      0,
      label,
    );
    const hit: TutorialView = { ...AWAY, tutorHit: true };
    const healed: TutorialView = { ...hit, energySpent: true, healedTutor: true };
    const ticks: [TutorialView, number][] = [
      [AWAY, 0],
      [hit, ASIDE_MS],
      [healed, ASIDE_MS + 1_000],
      [healed, 2 * ASIDE_MS],
      [healed, 3 * ASIDE_MS - 1],
      [healed, 3 * ASIDE_MS],
    ];
    expect(ticks.map(([view, now]) => runner.tick(view, now).say?.key)).toEqual([
      "tutorial.heal.intro",
      "tutorial.heal.ow",
      undefined,
      "tutorial.heal.energy",
      undefined,
      "tutorial.heal.praise",
    ]);
  });

  it("reacts to a hit once in HIT_REPEAT_MS, and only at a station with a hit line (#3247)", () => {
    const goal = vec2(2850, 1800);
    const runner = createTutorialRunner(
      [dodgeStation(goal, 0)],
      () => KEYMAP_PRESETS.classic,
      0,
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
      0,
      label,
    );
    walker.tick(AWAY, 0);
    expect(walker.tick({ ...AWAY, hitBy: "rockfall" }, 1_000).say).toBeUndefined();
  });
});
