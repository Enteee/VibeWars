import { describe, expect, it } from "vitest";
import { IMPLEMENTED_SKILLS } from "@vibewars/game-core";
import type {
  CombatMessage,
  MatchConnection,
  MatchSnapshot,
  PlayerSnapshot,
} from "@vibewars/game-session";

import type { CastVoice } from "./combat-sounds.js";
import { attachMatchSounds } from "./match-sounds.js";
import type { SoundId } from "./sound-ids.js";
import type { SoundPlayer } from "./sound-player.js";

const ME = "me";

function snapshot(castingSkillId: string | undefined, switches: boolean[] = []): MatchSnapshot {
  const me: PlayerSnapshot = {
    sessionId: ME,
    name: ME,
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
    respawnIn: undefined,
    castingSkillId,
    castRemaining: castingSkillId === undefined ? 0 : 1,
    castTotal: castingSkillId === undefined ? 0 : 1,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    invulnerableSeconds: 0,
    teleportReadyAt: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    bot: false,
    signet: undefined,
    statuses: [],
  };
  return {
    selfSessionId: ME,
    players: [me],
    score: [0, 0],
    elapsedSeconds: 0,
    phase: "active",
    winningTeam: undefined,
    endReason: undefined,
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
    switches,
    teleports: [],
    breakables: [],
    decks: [],
    lifts: [],
    summary: undefined,
  };
}

/** A spell that takes time to cast, so a snapshot shows it. */
const SPELL =
  IMPLEMENTED_SKILLS.find(
    ({ type, activationSeconds }) => type === "spell" && activationSeconds > 0,
  )?.id ?? "";

/** `snapshot` with more bodies beside you: `[id, team, dead]`, and you dead or not (#3366). */
function field(
  bodies: readonly (readonly [string, number, boolean])[],
  meDead = false,
): MatchSnapshot {
  const base = snapshot(undefined);
  const [me] = base.players;
  if (me === undefined) {
    throw new Error("snapshot holds you");
  }
  return {
    ...base,
    players: [
      { ...me, dead: meDead },
      ...bodies.map(([sessionId, team, dead]) => ({
        ...me,
        sessionId,
        name: sessionId,
        team,
        dead,
      })),
    ],
  };
}

function setup() {
  const played: SoundId[] = [];
  const gains: number[] = [];
  const cast: CastVoice[] = [];
  let nowMs = 0;
  const player: SoundPlayer = {
    play: (id, gain = 1) => {
      played.push(id);
      gains.push(gain);
    },
    playCast: (voice) => cast.push(voice),
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
  const sounds = attachMatchSounds(
    connection,
    player,
    {
      gates: [],
      switches: [{ x: 100, y: 0 }],
      breakables: [],
    },
    () => nowMs,
  );
  return {
    played,
    gains,
    advance: (ms: number) => {
      nowMs += ms;
    },
    cast,
    sounds,
    combat: (m: CombatMessage) => combat(m),
    refused: () => refused(),
  };
}

describe("attachMatchSounds", () => {
  it("plays combat, refusals and cast starts, and nothing on the first snapshot", () => {
    const { played, cast, sounds, combat, refused } = setup();
    sounds.snapshot(snapshot(SPELL));
    sounds.snapshot(snapshot(undefined));
    sounds.snapshot(snapshot(SPELL));
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
    expect(played).toEqual(["hit-taken", "refused"]);
    expect(cast).toHaveLength(1);
  });

  it("plays a lever thrown near you", () => {
    const { played, sounds } = setup();
    sounds.snapshot(snapshot(undefined, [true]));
    sounds.snapshot(snapshot(undefined, [false]));
    expect(played).toEqual(["lever"]);
  });

  it("does not replay a cast that ran through a reconnect", () => {
    const { played, cast, sounds } = setup();
    sounds.snapshot(snapshot(undefined));
    sounds.connectionChanged("reconnecting");
    sounds.snapshot(snapshot(undefined));
    sounds.connectionChanged("online");
    sounds.snapshot(snapshot(SPELL));
    sounds.snapshot(snapshot(SPELL));
    expect(played).toEqual([]);
    expect(cast).toEqual([]);
  });

  it("is silent once disposed", () => {
    const { played, sounds, refused } = setup();
    sounds.dispose();
    refused();
    expect(played).toEqual([]);
  });

  it("chimes once for your respawn with a wave, quieter for a teammate's alone, not for a foe's, and not on the first snapshot (#3366)", () => {
    const { played, gains, sounds, advance } = setup();
    sounds.snapshot(
      field(
        [
          ["ally", 0, true],
          ["foe", 1, true],
        ],
        true,
      ),
    );
    expect(played).toEqual([]);
    sounds.snapshot(
      field(
        [
          ["ally", 0, false],
          ["foe", 1, false],
        ],
        false,
      ),
    );
    expect(played).toEqual(["respawn-you"]);
    expect(gains[0]).toBe(1);
    advance(100);
    sounds.snapshot(field([["ally", 0, true]], false));
    sounds.snapshot(field([["ally", 0, false]], false));
    expect(played).toEqual(["respawn-you", "respawn-you"]);
    expect(gains[1]).toBeCloseTo(10 ** (-8 / 20));
  });

  it("plays at most 3 deaths in 0.5 s, then more after (#3366)", () => {
    const { played, sounds, combat, advance } = setup();
    const foes = ["a", "b", "c", "d", "e"] as const;
    sounds.snapshot(field(foes.map((id) => [id, 1, false] as const)));
    const kill = (targetId: string): void => {
      combat({
        casterSessionId: "x",
        cause: "skill",
        skillId: "x",
        weaponId: "",
        attributeId: "",
        doubleStrike: false,
        events: [{ kind: "death", targetId }],
      });
    };
    for (const id of foes.slice(0, 4)) {
      kill(id);
      advance(100);
    }
    expect(played).toEqual(["death-foe", "death-foe", "death-foe"]);
    advance(200);
    kill("e");
    expect(played).toHaveLength(4);
  });
});
