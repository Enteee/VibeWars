import { describe, expect, it } from "vitest";

import {
  CHANNELS,
  MAX_WIRE_EVENTS,
  MAX_WIRE_RADIUS,
  MAX_WIRE_SLOTS,
  MAX_WIRE_STATUSES,
  MAX_WIRE_STRING,
  MAX_WIRE_TEXT,
  parseCastRefused,
  parsePeerHello,
  parsePeerRefuse,
  parsePeerWelcome,
  parseRecharge,
  parseWireCombat,
  parseWireEnded,
  parseWireSkillBar,
  parseWireSnapshot,
} from "./p2p.js";
import type {
  PeerHello,
  PeerRefuse,
  PeerWelcome,
  WireCombat,
  WireEnded,
  WirePlayer,
  WireSkillBar,
  WireSnapshot,
} from "./p2p.js";
import { MAX_LOBBY_PLAYERS, PROTOCOL_MISMATCH_MESSAGE } from "./protocol.js";
import type { CastRefusedMessage, RechargeMessage } from "./protocol.js";
import { PROTOCOL_VERSION } from "./protocol-version.js";

const hello: PeerHello = {
  protocolVersion: PROTOCOL_VERSION,
  name: "Mhenlo",
  build: { profession: "monk", skills: ["healing-breeze"] },
};

const welcome: PeerWelcome = {
  protocolVersion: PROTOCOL_VERSION,
  playerId: "peer-2",
  tickIntervalMs: 50,
  map: {
    id: "isle",
    name: "Isle of the Nameless",
    width: 1600,
    height: 1200,
    walls: [
      { kind: "rect", x: 10, y: 20, width: 30, height: 40 },
      {
        kind: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 0, y: 5 },
        ],
      },
    ],
  },
};

const refuse: PeerRefuse = { reason: "protocol-mismatch", message: PROTOCOL_MISMATCH_MESSAGE };

const player: WirePlayer = {
  id: "peer-1",
  name: "Mhenlo",
  team: 0,
  x: 120.5,
  y: -3,
  targetId: null,
  health: 480,
  maxHealth: 480,
  energy: 25,
  maxEnergy: 30,
  adrenaline: 0,
  armor: 60,
  weaponId: "staff",
  dead: false,
  castingSkillId: "healing-breeze",
  castRemaining: 0.75,
  statuses: ["crippled"],
};

const snapshot: WireSnapshot = {
  tick: 42,
  elapsedSeconds: 2.1,
  score: [1, 0],
  phase: "active",
  winningTeam: null,
  endReason: null,
  players: [player, { ...player, id: "peer-2", team: 1, targetId: "peer-1", statuses: [] }],
};

const combat: WireCombat = {
  casterId: "peer-1",
  cause: "skill",
  skillId: "fireball",
  weaponId: "",
  area: { x: 300, y: 200, radius: 80 },
  events: [
    { kind: "damage", targetId: "peer-2", amount: 64 },
    { kind: "interrupted", targetId: null, amount: null },
  ],
};

const skillBar: WireSkillBar = {
  slots: [
    {
      id: "healing-breeze",
      name: "Healing Breeze",
      energyCost: 5,
      adrenalineCost: 0,
      activationSeconds: 1,
      rechargeSeconds: 5,
    },
    null,
  ],
};

const ended: WireEnded = { winningTeam: null, endReason: "host-left" };

const refused: CastRefusedMessage = {
  kind: "skill",
  slot: 3,
  skillId: "fireball",
  reason: "out-of-range",
};

const recharge: RechargeMessage = {
  slots: [{ slot: 0, remainingSeconds: 3.5, totalSeconds: 5 }],
};

/** Each parser, with the one fixture it must round-trip. */
const VALID: readonly [string, (value: unknown) => unknown, unknown][] = [
  ["hello", parsePeerHello, hello],
  ["welcome", parsePeerWelcome, welcome],
  ["refuse", parsePeerRefuse, refuse],
  ["snapshot", parseWireSnapshot, snapshot],
  ["combat", parseWireCombat, combat],
  ["skill-bar", parseWireSkillBar, skillBar],
  ["ended", parseWireEnded, ended],
  ["refused", parseCastRefused, refused],
  ["refused attack", parseCastRefused, { kind: "attack", reason: "no-weapon" }],
  ["recharge", parseRecharge, recharge],
];

const long = "x".repeat(MAX_WIRE_STRING + 1);

/** One malformed message per rule. */
const MALFORMED: readonly [string, (value: unknown) => unknown, unknown][] = [
  ["not an object", parsePeerHello, "hello"],
  ["an array", parsePeerHello, [hello]],
  ["null", parseWireSnapshot, null],
  ["hello without a name", parsePeerHello, { ...hello, name: undefined }],
  ["hello with a numeric version", parsePeerHello, { ...hello, protocolVersion: 2 }],
  ["hello with a long name", parsePeerHello, { ...hello, name: long }],
  ["welcome with a zero tick", parsePeerWelcome, { ...welcome, tickIntervalMs: 0 }],
  ["welcome with an infinite tick", parsePeerWelcome, { ...welcome, tickIntervalMs: Infinity }],
  ["welcome without a map", parsePeerWelcome, { ...welcome, map: null }],
  [
    "welcome with a NaN wall",
    parsePeerWelcome,
    {
      ...welcome,
      map: { ...welcome.map, walls: [{ kind: "rect", x: NaN, y: 0, width: 1, height: 1 }] },
    },
  ],
  [
    "welcome with an unknown wall",
    parsePeerWelcome,
    { ...welcome, map: { ...welcome.map, walls: [{ kind: "circle", x: 0, y: 0 }] } },
  ],
  ["refuse with an unknown reason", parsePeerRefuse, { ...refuse, reason: "banned" }],
  [
    "refuse with a long message",
    parsePeerRefuse,
    { ...refuse, message: "x".repeat(MAX_WIRE_TEXT + 1) },
  ],
  ["snapshot with a negative tick", parseWireSnapshot, { ...snapshot, tick: -1 }],
  ["snapshot with a fractional tick", parseWireSnapshot, { ...snapshot, tick: 1.5 }],
  ["snapshot with one score", parseWireSnapshot, { ...snapshot, score: [1] }],
  ["snapshot with three scores", parseWireSnapshot, { ...snapshot, score: [1, 0, 0] }],
  ["snapshot with an unknown phase", parseWireSnapshot, { ...snapshot, phase: "paused" }],
  ["snapshot with team 2 winning", parseWireSnapshot, { ...snapshot, winningTeam: 2 }],
  ["snapshot ended by host-left", parseWireSnapshot, { ...snapshot, endReason: "host-left" }],
  [
    "snapshot with too many players",
    parseWireSnapshot,
    { ...snapshot, players: Array.from({ length: MAX_LOBBY_PLAYERS + 1 }, () => player) },
  ],
  [
    "snapshot with a player on team 2",
    parseWireSnapshot,
    { ...snapshot, players: [{ ...player, team: 2 }] },
  ],
  [
    "snapshot with an infinite health",
    parseWireSnapshot,
    { ...snapshot, players: [{ ...player, health: Infinity }] },
  ],
  [
    "snapshot with an absent target",
    parseWireSnapshot,
    { ...snapshot, players: [{ ...player, targetId: undefined }] },
  ],
  [
    "snapshot with a string for dead",
    parseWireSnapshot,
    { ...snapshot, players: [{ ...player, dead: "no" }] },
  ],
  [
    "snapshot with too many statuses",
    parseWireSnapshot,
    {
      ...snapshot,
      players: [
        { ...player, statuses: Array.from({ length: MAX_WIRE_STATUSES + 1 }, () => "dazed") },
      ],
    },
  ],
  [
    "snapshot with a long status",
    parseWireSnapshot,
    { ...snapshot, players: [{ ...player, statuses: [long] }] },
  ],
  ["combat with an unknown cause", parseWireCombat, { ...combat, cause: "magic" }],
  ["combat with an absent area", parseWireCombat, { ...combat, area: undefined }],
  ["combat with a zero radius", parseWireCombat, { ...combat, area: { x: 0, y: 0, radius: 0 } }],
  [
    "combat with too wide a radius",
    parseWireCombat,
    { ...combat, area: { x: 0, y: 0, radius: MAX_WIRE_RADIUS + 1 } },
  ],
  [
    "combat with too many events",
    parseWireCombat,
    {
      ...combat,
      events: Array.from({ length: MAX_WIRE_EVENTS + 1 }, () => ({
        kind: "damage",
        targetId: null,
        amount: 1,
      })),
    },
  ],
  [
    "combat with a NaN amount",
    parseWireCombat,
    { ...combat, events: [{ kind: "damage", targetId: null, amount: NaN }] },
  ],
  [
    "skill bar with too many slots",
    parseWireSkillBar,
    { slots: Array.from({ length: MAX_WIRE_SLOTS + 1 }, () => null) },
  ],
  ["skill bar with an undefined slot", parseWireSkillBar, { slots: [undefined] }],
  [
    "skill bar with a string cost",
    parseWireSkillBar,
    { slots: [{ ...skillBar.slots[0], energyCost: "5" }] },
  ],
  ["ended by an unknown reason", parseWireEnded, { ...ended, endReason: "forfeit" }],
  ["ended without a winner", parseWireEnded, { endReason: "score" }],
  ["refused with a negative slot", parseCastRefused, { ...refused, slot: -1 }],
  ["refused of an unknown kind", parseCastRefused, { kind: "move", reason: "stuck" }],
  [
    "recharge with a NaN",
    parseRecharge,
    { slots: [{ slot: 0, remainingSeconds: NaN, totalSeconds: 5 }] },
  ],
];

describe("the P2P channels (#82)", () => {
  it("each fit a Trystero action name, 12 bytes of UTF-8", () => {
    for (const channel of CHANNELS) {
      // ASCII only, so a character is a byte.
      expect(channel, channel).toMatch(/^[a-z-]{1,12}$/);
    }
  });

  it("are distinct", () => {
    expect(new Set(CHANNELS).size).toBe(CHANNELS.length);
  });
});

describe("the P2P validators (#82)", () => {
  it.each(VALID)("accept a %s that survives a JSON round trip unchanged", (_, parse, fixture) => {
    const wire: unknown = JSON.parse(JSON.stringify(fixture));
    expect(wire).toEqual(fixture);
    expect(parse(wire)).toEqual(fixture);
  });

  it.each(MALFORMED)("reject %s", (_, parse, value) => {
    expect(parse(value)).toBeUndefined();
  });

  it("ignore unknown fields, and drop them", () => {
    expect(parseWireEnded({ ...ended, cheat: true })).toEqual(ended);
    expect(parseWireSnapshot({ ...snapshot, players: [{ ...player, godMode: true }] })).toEqual({
      ...snapshot,
      players: [player],
    });
  });

  it("parse a hello of another version: refusing it is the host's job", () => {
    expect(parsePeerHello({ ...hello, protocolVersion: "000000000000" })).toEqual({
      ...hello,
      protocolVersion: "000000000000",
    });
  });
});
