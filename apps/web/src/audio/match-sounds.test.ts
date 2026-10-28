import { describe, expect, it } from "vitest";
import type {
  CombatMessage,
  MatchConnection,
  MatchSnapshot,
  PlayerSnapshot,
} from "@vibewars/game-session";

import { attachMatchSounds } from "./match-sounds.js";
import type { SoundId } from "./sound-ids.js";
import type { SoundPlayer } from "./sound-player.js";

const ME = "me";

function snapshot(castingSkillId: string | undefined): MatchSnapshot {
  const me: PlayerSnapshot = {
    sessionId: ME,
    name: ME,
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
    castingSkillId,
    castRemaining: castingSkillId === undefined ? 0 : 1,
    castTotal: castingSkillId === undefined ? 0 : 1,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    bot: false,
    statuses: [],
  };
  return {
    selfSessionId: ME,
    players: [me],
    scoreTeam0: 0,
    scoreTeam1: 0,
    elapsedSeconds: 0,
    phase: "active",
    winningTeam: undefined,
    endReason: undefined,
    projectiles: [],
    groundEffects: [],
    traps: [],
    summary: undefined,
  };
}

function setup() {
  const played: SoundId[] = [];
  const player: SoundPlayer = {
    play: (id) => played.push(id),
    setMuted: () => undefined,
    muted: false,
    setVolume: () => undefined,
    volume: 1,
  };
  let combat: (message: CombatMessage) => void = () => undefined;
  let refused: () => void = () => undefined;
  const connection = {
    selfSessionId: ME,
    onCombat: (handler: (message: CombatMessage) => void) => {
      combat = handler;
    },
    onCastRefused: (handler: () => void) => {
      refused = handler;
    },
  } as unknown as MatchConnection;
  const sounds = attachMatchSounds(connection, player);
  return { played, sounds, combat: (m: CombatMessage) => combat(m), refused: () => refused() };
}

describe("attachMatchSounds", () => {
  it("plays combat, refusals and cast starts, and nothing on the first snapshot", () => {
    const { played, sounds, combat, refused } = setup();
    sounds.snapshot(snapshot("heal"));
    sounds.snapshot(snapshot(undefined));
    sounds.snapshot(snapshot("fireball"));
    combat({
      casterSessionId: "foe",
      cause: "skill",
      skillId: "x",
      weaponId: "",
      attributeId: "",
      doubleStrike: false,
      events: [{ kind: "damage", targetId: ME, amount: 1, critical: false }],
    });
    refused();
    expect(played).toEqual(["cast-self", "hit-taken", "refused"]);
  });

  it("does not replay a cast that ran through a reconnect", () => {
    const { played, sounds } = setup();
    sounds.snapshot(snapshot(undefined));
    sounds.connectionChanged("reconnecting");
    sounds.snapshot(snapshot(undefined));
    sounds.connectionChanged("online");
    sounds.snapshot(snapshot("fireball"));
    sounds.snapshot(snapshot("fireball"));
    expect(played).toEqual([]);
  });

  it("is silent once disposed", () => {
    const { played, sounds, refused } = setup();
    sounds.dispose();
    refused();
    expect(played).toEqual([]);
  });
});
