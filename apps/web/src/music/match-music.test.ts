import type {
  CombatMessage,
  MatchConnection,
  MatchSnapshot,
  PlayerSnapshot,
} from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import type { MusicState } from "./director.js";
import { DIRECT_INTERVAL_MS, ENGAGE_RANGE, attachMatchMusic } from "./match-music.js";

const ME = "me";

function player(sessionId: string, extra: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    guildTag: undefined,
    guildCape: undefined,
    x: 0,
    y: 0,
    facing: 0,
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
    scoreTeam0: 0,
    scoreTeam1: 0,
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

function setup(screen: "training" | "match" = "match") {
  let clock = 1_000_000;
  let combat: (message: CombatMessage) => void = () => undefined;
  const connection = {
    selfSessionId: ME,
    map: { id: "arena-alpha", name: "Arena Alpha", width: 1, height: 1, walls: [] },
    onCombat: (handler: (message: CombatMessage) => void) => {
      combat = handler;
    },
  } as unknown as MatchConnection;
  const changes: MusicState[] = [];
  const music = attachMatchMusic(connection, {
    screen,
    menuDepth: screen === "training" ? 1 : null,
    mode: () => ({ kind: "auto" }),
    tracks: [
      { id: "first-light", moods: ["atmospheric"], layers: 2 },
      { id: "hall-of-champions", moods: ["epic"], layers: 4 },
      { id: "victors-hymn", moods: ["triumphant"], layers: 4 },
    ],
    onChange: (state) => changes.push(state),
    now: () => clock,
  });
  return {
    music,
    changes,
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

  it("keeps a Training Ground on the menus' song at their depth, its end too (#2020)", () => {
    const { changes, at } = setup("training");
    at(0);
    at(DIRECT_INTERVAL_MS, snapshot({ allyHealth: 10, finished: 0 }));
    expect(changes).toEqual([
      expect.objectContaining({ trackId: "first-light", intensity: 1, context: "menu" }),
    ]);
  });

  it("says nothing once disposed", () => {
    const { music, changes, at } = setup();
    at(0);
    music.dispose();
    at(DIRECT_INTERVAL_MS, snapshot({ allyHealth: 10 }));
    expect(changes).toHaveLength(1);
  });
});
