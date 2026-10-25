import { describe, expect, it } from "vitest";

import type {
  CombatMessage,
  MatchConnection,
  MatchSnapshot,
  PlayerSnapshot,
} from "../net/match-connection.js";
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
    health: 100,
    maxHealth: 100,
    energy: 20,
    maxEnergy: 20,
    adrenaline: 0,
    armor: 60,
    weaponId: undefined,
    team: 0,
    dead: false,
    castingSkillId,
    castRemaining: castingSkillId === undefined ? 0 : 1,
    castTotal: castingSkillId === undefined ? 0 : 1,
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
  };
}

function setup() {
  const played: SoundId[] = [];
  const player: SoundPlayer = {
    play: (id) => played.push(id),
    setMuted: () => undefined,
    muted: false,
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
      events: [{ kind: "damage", targetId: ME }],
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
