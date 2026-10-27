import {
  ALL_INSIGNIAS,
  ALL_OFFHANDS,
  ALL_WEAPONS,
  IMPLEMENTED_SKILLS,
  PROFESSIONS,
  STATUS_DEFINITIONS,
  bareArmorSet,
  type ArmorSet,
  type PlayerBuild,
} from "@vibewars/game-core";
import {
  MAX_LOBBY_PLAYERS,
  MAX_WIRE_CHAT_TEXT,
  MAX_SNAPSHOT_PARTS,
  MAX_WIRE_COMBATS,
  MAX_WIRE_PIPS,
  MAX_WIRE_PROJECTILES,
  MAX_WIRE_STATUSES,
  MAX_WIRE_STATUS_INDEX,
  PROTOCOL_VERSION,
  type JsonValue,
  type PeerHello,
  type PeerRejoinChallenge,
  type PeerRejoinProof,
  type PeerWelcome,
  type PeerChat,
  type WireChatLine,
  type WireCombat,
  type WireCombatBatch,
  type WireLobbyState,
  type WirePlayer,
  type WireProjectile,
  type WireSkillBar,
  type WireSnapshot,
  type WireSnapshotPart,
} from "@vibewars/game-protocol";
import {
  MAX_MESSAGE_BYTES,
  messageBytes,
  packCombat,
  packSnapshot,
  sanitizeChatText,
  sanitizeName,
} from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { ARENA_MAPS, hostMap } from "./maps.js";

/**
 * Every message fits in one Trystero chunk (#403): the worst case of each
 * kind, built from real game data, is at most `MAX_MESSAGE_BYTES`. Here
 * rather than in game-session, which cannot see the maps.
 *
 * Numbers are the longest a float prints as, and ids and names the
 * longest the game makes or lets through, so nothing here is smaller
 * than what a real host could send.
 */

/** The longest of `values`. */
function longest(values: readonly string[]): string {
  return values.reduce((a, b) => (b.length > a.length ? b : a), "");
}

/** A float with every digit a double prints. */
const FLOAT = 1000 / 3;
/**
 * The longest a field the host rounds to `places` prints as (match-host.ts),
 * as `facing` is: such a field never carries every digit.
 */
function rounded(places: number): number {
  return Math.round(FLOAT * 10 ** places) / 10 ** places;
}
/** A peer id: Trystero's are 20 characters; the host's own player adds `/local`. */
const PEER_ID = "abcdefghijklmnopqrst/local";
/** A name as long in bytes as `sanitizeName` lets through: 16 three-code-point graphemes. */
const NAME = sanitizeName("👩‍🚀".repeat(40), "player");

const SKILL_IDS = IMPLEMENTED_SKILLS.map((skill) => skill.id);
const STATUS_IDS = Object.keys(STATUS_DEFINITIONS);
/** A snapshot's statuses (#632): as many as a player may carry, each the largest index. */
/**
 * Every status at its longest (#803): the top index, a clock past a day
 * of match, both to 0.1 s, cast by the longest peer id.
 */
const WIRE_STATUSES = Array.from({ length: MAX_WIRE_STATUSES }, () => ({
  status: MAX_WIRE_STATUS_INDEX,
  endsAt: 99_999.9,
  durationSeconds: rounded(1),
  casterId: PEER_ID,
}));
const WEAPON_ID = longest(ALL_WEAPONS.map((weapon) => weapon.id));
const OFFHAND_ID = longest(ALL_OFFHANDS.map((offhand) => offhand.id));
const SKILL_ID = longest(SKILL_IDS);
const ATTRIBUTE_ID = longest(
  Object.values(PROFESSIONS).flatMap((profession) => profession.attributes.map((a) => a.id)),
);
/** Only a spell that flies (#535) rides a projectile. */
const FLYING_SKILL_ID = longest(
  IMPLEMENTED_SKILLS.filter((skill) => skill.projectile !== undefined).map((skill) => skill.id),
);
const INSIGNIA_ID = longest(ALL_INSIGNIAS.map((insignia) => insignia.id));
const bare = bareArmorSet();

function player(index: number): WirePlayer {
  return {
    id: `${PEER_ID}${String(index)}`,
    name: NAME,
    team: index % 2 === 0 ? 0 : 1,
    x: FLOAT + index,
    y: FLOAT + index,
    facing: -3.14,
    targetId: `${PEER_ID}9`,
    attackTargetId: `${PEER_ID}9`,
    walking: true,
    health: 1000,
    maxHealth: 1000,
    energy: 100,
    maxEnergy: 100,
    overcast: 0,
    armor: 100,
    weaponId: WEAPON_ID,
    offhandId: OFFHAND_ID,
    primaryProfession: "necromancer",
    secondaryProfession: "elementalist",
    dead: false,
    castingSkillId: SKILL_ID,
    castRemaining: FLOAT,
    castTotal: FLOAT,
    swingElapsed: rounded(3),
    swingTotal: rounded(3),
    knockdownRemaining: rounded(2),
    // The longest a pip count is on the wire.
    healthPips: -MAX_WIRE_PIPS,
    energyPips: -MAX_WIRE_PIPS,
    statuses: WIRE_STATUSES,
  };
}

function projectile(index: number): WireProjectile {
  return {
    id: 100_000 + index,
    attackerId: `${PEER_ID}${String(index % 8)}`,
    skillId: FLYING_SKILL_ID,
    from: { x: FLOAT, y: FLOAT },
    to: { x: FLOAT, y: FLOAT },
    launchedAt: FLOAT,
    flightSeconds: FLOAT,
  };
}

/**
 * A hit on `target`: the damage, and a status riding on it. Only an
 * interrupt names a skill. `extra` is spread on each event, to stand in
 * for fields a later change adds.
 */
function hit(
  target: number,
  extra: Readonly<Record<string, JsonValue>> = {},
): WireCombat["events"] {
  const targetId = `${PEER_ID}${String(target)}`;
  const events: WireCombat["events"] = [
    {
      kind: "damage",
      targetId,
      amount: 1000,
      skillId: null,
      statusId: null,
      durationSeconds: null,
      crit: true,
      fromId: null,
      energy: null,
    },
    {
      kind: "status-applied",
      targetId,
      amount: null,
      skillId: null,
      statusId: longest(STATUS_IDS),
      durationSeconds: FLOAT,
      crit: null,
      fromId: null,
      energy: null,
    },
  ];
  return events.map((event) => ({ ...event, ...extra }));
}

/** The attributes of a Necromancer/Elementalist, the pair with the most. */
const NECRO_ELE_ATTRIBUTES = [
  "necromancer.blood-magic",
  "necromancer.curses",
  "necromancer.death-magic",
  "necromancer.soul-reaping",
  "elementalist.fire-magic",
  "elementalist.water-magic",
  "elementalist.air-magic",
  "elementalist.earth-magic",
];

describe("every message fits in one Trystero chunk (#403)", () => {
  /** The worst snapshot: `players` and `projectiles` at their worst. */
  function worstSnapshot(players: number, projectiles: number): WireSnapshot {
    return {
      tick: 1_000_000,
      elapsedSeconds: FLOAT,
      score: [15, 15],
      phase: "finished",
      winningTeam: 1,
      endReason: "score",
      players: Array.from({ length: players }, (_, i) => player(i)),
      projectiles: Array.from({ length: projectiles }, (_, i) => projectile(i)),
    };
  }

  // A snapshot is split by bytes into parts (#662), so the limit that
  // matters is one player and the header in one part: the next field a
  // player grows comes out of this headroom.
  it("a snapshot part: one player, longest name, 32 statuses at the largest index, casting, attacking, with 4 KiB to spare", () => {
    const part: WireSnapshotPart = {
      ...worstSnapshot(1, 0),
      part: MAX_SNAPSHOT_PARTS - 1,
      parts: MAX_SNAPSHOT_PARTS,
    };
    expect(messageBytes(part)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES - 4 * 1024);
  });

  it("a snapshot of 8 such players and 256 projectiles packs into MAX_SNAPSHOT_PARTS parts or fewer", () => {
    const parts = packSnapshot(worstSnapshot(8, MAX_WIRE_PROJECTILES), MAX_MESSAGE_BYTES);
    expect(parts.length).toBeLessThanOrEqual(MAX_SNAPSHOT_PARTS);
    for (const part of parts) {
      expect(messageBytes(part)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    }
  });

  /**
   * The worst tick: a Barrage-sized area on 6 foes, and a double-strike
   * cleave from the other 7. Each event gets `extra` spread on it.
   */
  function worstTick(extra: Readonly<Record<string, JsonValue>> = {}): WireCombatBatch {
    const area: WireCombat = {
      casterId: `${PEER_ID}0`,
      cause: "skill",
      skillId: SKILL_ID,
      weaponId: WEAPON_ID,
      attributeId: ATTRIBUTE_ID,
      area: { x: FLOAT, y: FLOAT, radius: 200 },
      doubleStrike: false,
      events: Array.from({ length: 6 }, (_, i) => hit(i + 1, extra)).flat(),
    };
    // Each swing twice, each striking three foes.
    const swings: WireCombat[] = Array.from({ length: 7 }, (_, i) => ({
      casterId: `${PEER_ID}${String(i + 1)}`,
      cause: "weapon",
      skillId: SKILL_ID,
      weaponId: WEAPON_ID,
      attributeId: ATTRIBUTE_ID,
      area: null,
      // `false` is a byte longer than `true`: the worst case on the wire.
      doubleStrike: false,
      events: [0, 1, 2].flatMap((foe) => [...hit(foe, extra), ...hit(foe, extra)]),
    }));
    return [area, ...swings];
  }

  /** Every message the host would send for `tick` (#601). */
  const sent = (tick: WireCombatBatch) => packCombat(tick, MAX_MESSAGE_BYTES, MAX_WIRE_COMBATS);

  it("combat: every message the host sends for the worst tick fits (#601)", () => {
    const messages = sent(worstTick());
    expect(messages.flat()).toEqual(worstTick());
    for (const message of messages) {
      expect(messageBytes(message)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    }
  });

  it("combat: still fits once every event grows fields, as #534's block flag will", () => {
    const grown = worstTick({ blocked: true, critical: true, padding: "x".repeat(40) });
    expect(messageBytes(grown)).toBeGreaterThan(MAX_MESSAGE_BYTES);
    const messages = sent(grown);
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.flat()).toEqual(grown);
    for (const message of messages) {
      expect(messageBytes(message)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    }
  });

  it("the join: a welcome on the largest arena, and a full skill bar", () => {
    const biggest = ARENA_MAPS.map((map) => hostMap(map.id)?.descriptor).reduce((a, b) =>
      messageBytes(b) > messageBytes(a) ? b : a,
    );
    expect(biggest).toBeDefined();
    const welcome: PeerWelcome = {
      protocolVersion: PROTOCOL_VERSION,
      playerId: `${PEER_ID}0`,
      rejoinToken: "x".repeat(64),
      tickIntervalMs: 50,
      elapsedSeconds: FLOAT,
      map: biggest ?? { id: "", name: "", width: 0, height: 0, walls: [] },
    };
    const longestSkills = [...IMPLEMENTED_SKILLS]
      .sort((a, b) => b.id.length + b.name.length - (a.id.length + a.name.length))
      .slice(0, 8);
    const bar: WireSkillBar = {
      slots: longestSkills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        energyCost: 25,
        adrenalineCost: 10,
        activationSeconds: FLOAT,
        rechargeSeconds: FLOAT,
      })),
      // Two digits each, as runes and headgear can make them.
      ranks: Object.fromEntries(NECRO_ELE_ATTRIBUTES.map((attributeId) => [attributeId, 20])),
    };
    expect(messageBytes(welcome)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    expect(messageBytes(bar)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
  });

  it("a hello with a full build", () => {
    const build: PlayerBuild = {
      name: NAME,
      primaryProfession: "necromancer",
      secondaryProfession: "elementalist",
      attributes: NECRO_ELE_ATTRIBUTES.map((attributeId) => ({ attributeId, rank: 12 })),
      skillBar: [...SKILL_IDS].sort((a, b) => b.length - a.length).slice(0, 8),
      equipment: {
        mainHand: { weaponId: "staff", requirementAttributeId: "necromancer.soul-reaping" },
        offHand: null,
        armor: Object.fromEntries(
          Object.keys(bare).map((slot) => [
            slot,
            {
              insigniaId: INSIGNIA_ID,
              rune: {
                kind: "attribute",
                attributeId: "necromancer.soul-reaping",
                tier: "superior",
              },
            },
          ]),
        ) as ArmorSet,
      },
    };
    const hello: PeerHello = {
      protocolVersion: PROTOCOL_VERSION,
      name: NAME,
      build: JSON.parse(JSON.stringify(build)) as JsonValue,
      rejoin: { playerId: `${PEER_ID}0` },
    };
    expect(messageBytes(hello)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
  });

  it("a rejoin's challenge and proof (#593)", () => {
    const challenge: PeerRejoinChallenge = { playerId: `${PEER_ID}0`, nonce: "f".repeat(32) };
    const proof: PeerRejoinProof = { playerId: `${PEER_ID}0`, proof: "f".repeat(64) };
    expect(messageBytes(challenge)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    expect(messageBytes(proof)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
  });

  it("a lobby state: every seat taken, longest names, each bringing a character (#580)", () => {
    const professions = Object.keys(PROFESSIONS);
    const state: WireLobbyState = {
      code: "ACDEFG",
      phase: "in-match",
      mapId: longest(ARENA_MAPS.map((map) => map.id)),
      hostId: PEER_ID,
      matchId: "match-1000000",
      players: Array.from({ length: MAX_LOBBY_PLAYERS }, (_, i) => ({
        id: `${PEER_ID}${String(i)}`,
        name: NAME,
        team: i % 3 === 0 ? null : i % 3 === 1 ? 0 : 1,
        ready: true,
        isHost: i === 0,
        character: { name: NAME, primary: longest(professions), secondary: longest(professions) },
      })),
    };
    expect(messageBytes(state)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
  });

  it("a chat line on its way to the host: the longest wire text, each unit a JSON-escaped control (#479)", () => {
    const chat: PeerChat = { channel: "team", text: "\u0001".repeat(MAX_WIRE_CHAT_TEXT) };
    expect(messageBytes(chat)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
  });

  it("a chat line from the host: longest name, and the longest text the host lets through (#479)", () => {
    const candidates = [
      '"',
      "\u{10ffff}",
      "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}",
      "a\u0301\u0301",
    ];
    const text = candidates
      .map((piece) => sanitizeChatText(piece.repeat(MAX_WIRE_CHAT_TEXT)))
      .reduce((a, b) => (messageBytes(b) > messageBytes(a) ? b : a));
    const line: WireChatLine = { channel: "team", fromId: PEER_ID, name: NAME, team: 1, text };
    expect(messageBytes(line)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
  });
});
