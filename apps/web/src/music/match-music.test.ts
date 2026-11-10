import type {
  CombatMessage,
  MatchConnection,
  MatchSnapshot,
  PlayerSnapshot,
} from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { directMusic, type MusicMode, type MusicState, type TrackChoice } from "./director.js";
import {
  DIRECT_INTERVAL_MS,
  ENGAGE_RANGE,
  FRESH_STINGS,
  RESURRECTED_STING_MS,
  STING_LATE_MS,
  attachMatchMusic,
  stingsFor,
  type StingMemory,
  type HeardCombat,
} from "./match-music.js";
import type { LandOn } from "./host-protocol.js";
import type { StingId } from "./stings/ids.js";

const ME = "me";

function player(sessionId: string, extra: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    guildTag: undefined,
    heroRank: 0,
    guildCape: undefined,
    x: 0,
    y: 0,
    facing: 0,
    layer: 0,
    targetSessionId: undefined,
    attackTargetSessionId: undefined,
    walking: false,
    health: 100,
    maxHealth: 100,
    energy: 20,
    maxEnergy: 20,
    overcast: 0,
    morale: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 0,
    dead: false,
    corpseExploited: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    invulnerableSeconds: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    bot: false,
    signet: undefined,
    statuses: [],
    ...extra,
  };
}

/** Me and an ally on team 0 against two foes on team 1, the foes far away unless moved. */
function snapshot(
  over: { foeX?: number; allyHealth?: number; finished?: number } = {},
): MatchSnapshot {
  const foeX = over.foeX ?? ENGAGE_RANGE * 3;
  return {
    selfSessionId: ME,
    players: [
      player(ME),
      player("ally", { health: over.allyHealth ?? 100 }),
      player("foe", { team: 1, x: foeX }),
      player("foe-2", { team: 1, x: ENGAGE_RANGE * 3 }),
    ],
    score: [0, 0],
    elapsedSeconds: 0,
    phase: over.finished === undefined ? "active" : "finished",
    winningTeam: over.finished,
    endReason: over.finished === undefined ? undefined : "score",
    projectiles: [],
    groundEffects: [],
    traps: [],
    flags: [],
    stand: undefined,
    aggression: [],
    relics: [],
    altar: undefined,
    altarHolder: undefined,
    altarHeldSeconds: 0,
    capturePoints: [],
    gates: [],
    switches: [],
    summary: undefined,
  };
}

function hit(caster: string, target: string): CombatMessage {
  return {
    casterSessionId: caster,
    cause: "skill",
    skillId: "x",
    weaponId: "",
    attributeId: "",
    doubleStrike: false,
    events: [{ kind: "damage", targetId: target, amount: 9, critical: false }],
  };
}

const TRACKS: readonly TrackChoice[] = [
  { id: "hall-of-champions", moods: ["epic"], layers: 4 },
  { id: "victors-hymn", moods: ["triumphant"], layers: 4 },
  { id: "first-light", moods: ["atmospheric"], layers: 2 },
];

function setup(
  screen: "training" | "match" = "match",
  mode: MusicMode = { kind: "auto" },
  start = 1_000_000,
) {
  let clock = start;
  let combat: (message: CombatMessage) => void = () => undefined;
  const connection = {
    selfSessionId: ME,
    map: { id: "guild-hall-isle", name: "Guild Hall Isle", width: 1, height: 1, walls: [] },
    onCombat: (handler: (message: CombatMessage) => void) => {
      combat = handler;
    },
  } as unknown as MatchConnection;
  const changes: MusicState[] = [];
  const landings: LandOn[] = [];
  const stings: StingId[] = [];
  /** Changes and stings, in the order they came. */
  const heard: string[] = [];
  const music = attachMatchMusic(connection, {
    screen,
    menuDepth: screen === "training" ? 1 : null,
    mode: () => mode,
    tracks: TRACKS,
    onChange: (state, landOn) => {
      changes.push(state);
      landings.push(landOn);
      heard.push(state.trackId ?? "silence");
    },
    onSting: (id) => {
      stings.push(id);
      heard.push(`sting ${id}`);
    },
    now: () => clock,
  });
  return {
    music,
    changes,
    landings,
    stings,
    heard,
    combat: (m: CombatMessage) => combat(m),
    /** Moves the clock on, then feeds `next`. */
    at: (ms: number, next: MatchSnapshot = snapshot()) => {
      clock += ms;
      music.snapshot(next);
    },
  };
}

const levels = (changes: readonly MusicState[]): number[] => changes.map((s) => s.intensity);

describe("attachMatchMusic", () => {
  it("emits the first state, then only changes", () => {
    const { changes, at } = setup();
    for (let i = 0; i < 20; i++) {
      at(DIRECT_INTERVAL_MS);
    }
    expect(changes).toEqual([
      expect.objectContaining({ trackId: "hall-of-champions", intensity: 0 }),
    ]);
    at(DIRECT_INTERVAL_MS, snapshot({ foeX: ENGAGE_RANGE / 2 }));
    at(DIRECT_INTERVAL_MS, snapshot({ foeX: ENGAGE_RANGE / 2 }));
    expect(levels(changes)).toEqual([0, 1]);
  });

  it("asks the director at most 4 times a second", () => {
    const { changes, at } = setup();
    at(0);
    const near = snapshot({ foeX: ENGAGE_RANGE / 2 });
    at(16, near);
    at(DIRECT_INTERVAL_MS - 32, near);
    expect(levels(changes)).toEqual([0]);
    at(16, near);
    expect(levels(changes)).toEqual([0, 1]);
  });

  it("counts hits dealt and taken over the last 5 s", () => {
    const { changes, combat, at } = setup();
    at(0);
    combat(hit(ME, "foe"));
    at(DIRECT_INTERVAL_MS);
    combat(hit("foe", ME));
    combat(hit("foe", "ally"));
    at(DIRECT_INTERVAL_MS);
    expect(levels(changes)).toEqual([0, 1, 2]);
  });

  it("peaks when an ally is dying", () => {
    const { changes, at } = setup();
    at(0, snapshot({ allyHealth: 10 }));
    expect(levels(changes)).toEqual([3]);
  });

  it("peaks for the last two alive, though the side filled in after the first snapshot", () => {
    const { changes, at } = setup();
    const far = ENGAGE_RANGE * 3;
    const roster = (players: PlayerSnapshot[]): MatchSnapshot => ({
      ...snapshot(),
      players,
    });
    // Alone at first: the others are still joining.
    at(0, roster([player(ME), player("foe", { team: 1, x: far })]));
    at(
      DIRECT_INTERVAL_MS,
      roster([
        player(ME),
        player("ally"),
        player("foe", { team: 1, x: far }),
        player("foe-2", { team: 1, x: far }),
      ]),
    );
    at(
      DIRECT_INTERVAL_MS,
      roster([
        player(ME),
        player("ally", { dead: true }),
        player("foe", { team: 1, x: far }),
        player("foe-2", { team: 1, x: far, dead: true }),
      ]),
    );
    expect(levels(changes)).toEqual([0, 3]);
  });

  it("holds while the connection is down", () => {
    const { music, changes, at } = setup();
    at(0);
    music.connectionChanged("reconnecting");
    at(DIRECT_INTERVAL_MS, snapshot({ allyHealth: 10 }));
    expect(levels(changes)).toEqual([0]);
    music.connectionChanged("online");
    at(DIRECT_INTERVAL_MS, snapshot({ allyHealth: 10 }));
    expect(levels(changes)).toEqual([0, 3]);
  });

  it("moves to the result, at intensity 0", () => {
    const { changes, at } = setup();
    at(0, snapshot({ allyHealth: 10 }));
    at(DIRECT_INTERVAL_MS, snapshot({ allyHealth: 10, finished: 0 }));
    expect(changes.at(-1)).toEqual(
      expect.objectContaining({ trackId: "victors-hymn", intensity: 0, context: "result-victory" }),
    );
  });

  it("lands a match's first track on the next cycle, every later one on the phrase (#2530)", () => {
    const { landings, at } = setup();
    at(0, snapshot({ allyHealth: 10 }));
    at(DIRECT_INTERVAL_MS, snapshot({ allyHealth: 10, finished: 0 }));
    expect(landings).toEqual(["cycle", "phrase"]);
  });

  it("lands a Training Ground's first track on the phrase, as a menu's (#2530)", () => {
    const { landings, at } = setup("training");
    at(0);
    expect(landings).toEqual(["phrase"]);
  });

  it("stays on the menu song when a Training Ground fight ends (#2020)", () => {
    const { changes, at } = setup("training");
    at(0, snapshot({ allyHealth: 10 }));
    at(DIRECT_INTERVAL_MS, snapshot({ allyHealth: 10, finished: 0 }));
    expect(changes.at(-1)).toEqual(
      expect.objectContaining({ trackId: "first-light", intensity: 1, context: "menu" }),
    );
  });

  it("plays Shuffle's menu song in the Training Ground (#2020)", () => {
    const shuffle: MusicMode = { kind: "shuffle" };
    const menu = directMusic(
      {
        screen: "menu",
        menuDepth: 1,
        mapId: null,
        matchSeed: null,
        result: null,
        self: null,
        hitsDealtLast5s: 0,
        hitsTakenLast5s: 0,
        enemyInRange: false,
        lowestAllyHealthFraction: null,
        aliveAllies: null,
        aliveEnemies: null,
        teamSize: null,
        nowMs: 0,
      },
      null,
      shuffle,
      TRACKS,
    );
    // Whenever it opens: a match's seed would differ with the clock.
    for (let start = 0; start < 10; start += 1) {
      const { changes, at } = setup("training", shuffle, start);
      at(0);
      expect(changes.at(-1)?.trackId).toBe(menu.trackId);
    }
  });

  it("says nothing once disposed", () => {
    const { music, changes, at } = setup();
    at(0);
    music.dispose();
    at(DIRECT_INTERVAL_MS, snapshot({ allyHealth: 10 }));
    expect(changes).toHaveLength(1);
  });
});

/** A combat message carrying `events`, from nobody in particular. */
function combatOf(...events: CombatMessage["events"]): CombatMessage {
  return { ...hit("foe", ME), events };
}

const death = (targetId: string): CombatMessage["events"][number] => ({ kind: "death", targetId });
const resurrected = (targetId: string): CombatMessage["events"][number] => ({
  kind: "resurrected",
  targetId,
  healthFraction: 0.5,
  energyFraction: 0.5,
});

/** `events`, heard at `atMs`. */
const heardAt = (atMs: number, events: CombatMessage["events"]): HeardCombat[] => [
  { atMs, events },
];

/** A match already under way, nobody dead yet. */
const UNDER_WAY: StingMemory = { ...FRESH_STINGS, phase: "active" };

describe("stingsFor (#2523)", () => {
  const called = (
    prev: StingMemory,
    next: MatchSnapshot,
    events: CombatMessage["events"] = [],
    selfTeam: number | null = 0,
    nowMs = 0,
  ): StingId[] => stingsFor(prev, next, heardAt(nowMs, events), selfTeam, nowMs).stings;

  it("starts the match on its first active snapshot, and only then", () => {
    expect(called(FRESH_STINGS, snapshot())).toEqual(["match-start"]);
    expect(called(UNDER_WAY, snapshot())).toEqual([]);
    expect(called(FRESH_STINGS, snapshot({ finished: 0 }))).toEqual([]);
  });

  it("draws first blood on the first death of either team, once", () => {
    const first = stingsFor(UNDER_WAY, snapshot(), heardAt(0, [death("foe")]), 0, 0);
    expect(first.stings).toEqual(["first-blood"]);
    expect(called(first.memory, snapshot(), [death(ME)])).toEqual([]);
    expect(called(UNDER_WAY, snapshot(), [death(ME)])).toEqual(["first-blood"]);
  });

  it("draws no first blood from a creature", () => {
    const withMinion = {
      ...snapshot(),
      players: [
        ...snapshot().players,
        player("minion", {
          creature: {
            ownerId: ME,
            kind: "minion",
            look: "bone-minion",
            mode: null,
            armedAttack: null,
            leaderId: null,
          },
        }),
      ],
    };
    expect(called(UNDER_WAY, withMinion, [death("minion")])).toEqual([]);
  });

  it("raises your team's dead, at most once every 8 s, and never a foe's", () => {
    const raised = stingsFor(
      UNDER_WAY,
      snapshot(),
      heardAt(1_000, [resurrected("ally")]),
      0,
      1_000,
    );
    expect(raised.stings).toEqual(["resurrected"]);
    expect(
      called(raised.memory, snapshot(), [resurrected(ME)], 0, 1_000 + RESURRECTED_STING_MS - 1),
    ).toEqual([]);
    expect(
      called(raised.memory, snapshot(), [resurrected(ME)], 0, 1_000 + RESURRECTED_STING_MS),
    ).toEqual(["resurrected"]);
    expect(called(UNDER_WAY, snapshot(), [resurrected("foe")])).toEqual([]);
  });

  it("ends in victory or defeat, and a draw in neither", () => {
    expect(called(UNDER_WAY, snapshot({ finished: 0 }))).toEqual(["victory"]);
    expect(called(UNDER_WAY, snapshot({ finished: 1 }))).toEqual(["defeat"]);
    expect(called(UNDER_WAY, { ...snapshot(), phase: "finished", winningTeam: undefined })).toEqual(
      [],
    );
    expect(called({ ...UNDER_WAY, phase: "finished" }, snapshot({ finished: 0 }))).toEqual([]);
  });

  it("plays no sting for combat heard too long ago, though it spends first blood", () => {
    const late = STING_LATE_MS;
    const stale = stingsFor(UNDER_WAY, snapshot(), heardAt(0, [death("foe")]), 0, late);
    expect(stale.stings).toEqual([]);
    expect(stale.memory.bloodied).toBe(true);
    expect(
      stingsFor(UNDER_WAY, snapshot(), heardAt(0, [resurrected("ally")]), 0, late).stings,
    ).toEqual([]);
    expect(stingsFor(UNDER_WAY, snapshot(), heardAt(1, [death("foe")]), 0, late).stings).toEqual([
      "first-blood",
    ]);
  });

  it("plays a watcher no side's stings", () => {
    expect(called(UNDER_WAY, snapshot(), [resurrected("ally")], null)).toEqual([]);
    expect(called(UNDER_WAY, snapshot({ finished: 0 }), [], null)).toEqual([]);
    expect(called(UNDER_WAY, snapshot(), [death("foe")], null)).toEqual(["first-blood"]);
  });

  it("ranks them match-start, first-blood, resurrected, then the result: the last plays", () => {
    expect(called(UNDER_WAY, snapshot({ finished: 1 }), [death(ME), resurrected("ally")])).toEqual([
      "first-blood",
      "resurrected",
      "defeat",
    ]);
  });
});

describe("attachMatchMusic's stings (#2523)", () => {
  it("plays each on its frame, after the track it lands on, even between the director's turns", () => {
    const { heard, at } = setup();
    at(0);
    at(16, snapshot({ finished: 0 }));
    expect(heard).toEqual([
      "hall-of-champions",
      "sting match-start",
      "victors-hymn",
      "sting victory",
    ]);
  });

  it("plays only the last of a frame's stings", () => {
    const { stings, at, combat } = setup();
    at(0);
    combat(combatOf(death("foe")));
    at(16, snapshot({ finished: 0 }));
    expect(stings).toEqual(["match-start", "victory"]);
  });

  it("hears the combat since the last snapshot once", () => {
    const { stings, at, combat } = setup();
    at(0);
    combat(combatOf(resurrected("ally")));
    at(16);
    at(RESURRECTED_STING_MS);
    expect(stings).toEqual(["match-start", "resurrected"]);
  });

  it("plays no sting for combat heard while the tab was hidden, its frames stopped", () => {
    const { stings, at, combat } = setup();
    at(0);
    combat(combatOf(death("foe"), resurrected("ally")));
    at(STING_LATE_MS);
    // First blood is spent all the same.
    combat(combatOf(death(ME)));
    at(16);
    expect(stings).toEqual(["match-start"]);
  });

  it("plays none in the Training Ground", () => {
    const { stings, at, combat } = setup("training");
    at(0);
    combat(combatOf(death("foe")));
    at(DIRECT_INTERVAL_MS, snapshot({ finished: 0 }));
    expect(stings).toEqual([]);
  });
});
