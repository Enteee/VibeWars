import { describe, expect, it } from "vitest";

import {
  CHANNELS,
  MAX_WIRE_COMBATS,
  MAX_WIRE_EVENTS,
  MAX_WIRE_PROJECTILES,
  MAX_WIRE_RADIUS,
  MAX_WIRE_SLOTS,
  MAX_WIRE_STATUSES,
  MAX_WIRE_STRING,
  MAX_WIRE_TEXT,
  MAX_WIRE_JSON_DEPTH,
  MAX_WIRE_JSON_VALUES,
  helloProtocolVersion,
  parseCastRefused,
  parsePeerBye,
  parsePeerHello,
  parsePeerRefuse,
  parsePeerWelcome,
  parseRecharge,
  parseWireCombatBatch,
  parseWireEnded,
  parseWireSkillBar,
  parseWireSnapshot,
} from "./p2p.js";
import type {
  PeerHello,
  PeerRefuse,
  PeerWelcome,
  WireCombat,
  WireCombatBatch,
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
  build: { profession: "monk", skills: ["healing-breeze", null] },
  rejoin: null,
};

/** 128 bits of hex, as the host makes them; repeated so it reads as no secret. */
const TOKEN = "0f".repeat(16);

const welcome: PeerWelcome = {
  protocolVersion: PROTOCOL_VERSION,
  playerId: "peer-2",
  rejoinToken: TOKEN,
  tickIntervalMs: 50,
  elapsedSeconds: 12.5,
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
  facing: -1.57,
  targetId: null,
  attackTargetId: "peer-2",
  walking: false,
  health: 480,
  maxHealth: 480,
  energy: 25,
  maxEnergy: 30,
  adrenaline: 0,
  armor: 60,
  weaponId: "staff",
  offhandId: null,
  primaryProfession: "monk",
  secondaryProfession: null,
  dead: false,
  castingSkillId: "healing-breeze",
  castRemaining: 0.75,
  castTotal: 1,
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
  projectiles: [
    {
      id: 7,
      attackerId: "peer-2",
      weaponId: "longbow",
      from: { x: 10, y: 20 },
      to: { x: 300, y: 20 },
      launchedAt: 1.9,
      flightSeconds: 0.6,
    },
  ],
};

const combat: WireCombat = {
  casterId: "peer-1",
  cause: "skill",
  skillId: "fireball",
  weaponId: "",
  area: { x: 300, y: 200, radius: 80 },
  events: [
    {
      kind: "damage",
      targetId: "peer-2",
      amount: 64,
      skillId: null,
      statusId: null,
      durationSeconds: null,
    },
    {
      kind: "interrupted",
      targetId: "peer-2",
      amount: null,
      skillId: "healing-breeze",
      statusId: null,
      durationSeconds: null,
    },
    {
      kind: "status-applied",
      targetId: "peer-2",
      amount: null,
      skillId: null,
      statusId: "burning",
      durationSeconds: 3,
    },
  ],
};

const combatBatch: WireCombatBatch = [
  combat,
  { ...combat, cause: "weapon", skillId: "", weaponId: "sword", area: null },
];

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
  ["rejoining hello", parsePeerHello, { ...hello, rejoin: { playerId: "peer-2", token: TOKEN } }],
  ["welcome", parsePeerWelcome, welcome],
  ["refuse", parsePeerRefuse, refuse],
  ["snapshot", parseWireSnapshot, snapshot],
  ["combat batch", parseWireCombatBatch, combatBatch],
  ["skill-bar", parseWireSkillBar, skillBar],
  ["ended", parseWireEnded, ended],
  ["refused", parseCastRefused, refused],
  ["refused attack", parseCastRefused, { kind: "attack", reason: "no-weapon" }],
  ["recharge", parseRecharge, recharge],
  ["bye", parsePeerBye, {}],
];

const long = "x".repeat(MAX_WIRE_STRING + 1);

/** One malformed message per rule. */
const MALFORMED: readonly [string, (value: unknown) => unknown, unknown][] = [
  ["not an object", parsePeerHello, "hello"],
  ["an array", parsePeerHello, [hello]],
  ["null", parseWireSnapshot, null],
  ["hello without a name", parsePeerHello, { ...hello, name: undefined }],
  ["hello with a numeric version", parsePeerHello, { ...hello, protocolVersion: 2 }],
  ["bye with a field", parsePeerBye, { reason: "x" }],
  ["bye that is not an object", parsePeerBye, null],
  ["hello without a rejoin", parsePeerHello, { ...hello, rejoin: undefined }],
  ["hello with an undefined in its build", parsePeerHello, { ...hello, build: { x: undefined } }],
  ["hello with a NaN in its build", parsePeerHello, { ...hello, build: [NaN] }],
  [
    "hello with a short rejoin token",
    parsePeerHello,
    { ...hello, rejoin: { playerId: "peer-2", token: "abc" } },
  ],
  [
    "hello with an uppercase rejoin token",
    parsePeerHello,
    { ...hello, rejoin: { playerId: "peer-2", token: TOKEN.toUpperCase() } },
  ],
  ["welcome without a rejoin token", parsePeerWelcome, { ...welcome, rejoinToken: undefined }],
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
  [
    "snapshot with a player missing a field",
    parseWireSnapshot,
    { ...snapshot, players: [{ ...player, castTotal: undefined }] },
  ],
  [
    "snapshot with a string for walking",
    parseWireSnapshot,
    { ...snapshot, players: [{ ...player, walking: "yes" }] },
  ],
  ["snapshot without projectiles", parseWireSnapshot, { ...snapshot, projectiles: undefined }],
  [
    "snapshot with too many projectiles",
    parseWireSnapshot,
    {
      ...snapshot,
      projectiles: Array.from({ length: MAX_WIRE_PROJECTILES + 1 }, () => snapshot.projectiles[0]),
    },
  ],
  [
    "snapshot with a projectile that never lands",
    parseWireSnapshot,
    { ...snapshot, projectiles: [{ ...snapshot.projectiles[0], flightSeconds: 0 }] },
  ],
  ["combat that is one entry, not a batch", parseWireCombatBatch, combat],
  [
    "combat batch with too many entries",
    parseWireCombatBatch,
    Array.from({ length: MAX_WIRE_COMBATS + 1 }, () => combat),
  ],
  ["combat with an unknown cause", parseWireCombatBatch, [{ ...combat, cause: "magic" }]],
  ["combat with an absent area", parseWireCombatBatch, [{ ...combat, area: undefined }]],
  [
    "combat with a zero radius",
    parseWireCombatBatch,
    [{ ...combat, area: { x: 0, y: 0, radius: 0 } }],
  ],
  [
    "combat with too wide a radius",
    parseWireCombatBatch,
    [{ ...combat, area: { x: 0, y: 0, radius: MAX_WIRE_RADIUS + 1 } }],
  ],
  [
    "combat with too many events",
    parseWireCombatBatch,
    [
      {
        ...combat,
        events: Array.from({ length: MAX_WIRE_EVENTS + 1 }, () => ({
          kind: "damage",
          targetId: null,
          amount: 1,
          skillId: null,
          statusId: null,
          durationSeconds: null,
        })),
      },
    ],
  ],
  [
    "combat with a NaN amount",
    parseWireCombatBatch,
    [{ ...combat, events: [{ ...combat.events[0], amount: NaN }] }],
  ],
  [
    "combat with an event missing its status",
    parseWireCombatBatch,
    [{ ...combat, events: [{ ...combat.events[0], statusId: undefined }] }],
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
  ["refused past the last slot", parseCastRefused, { ...refused, slot: MAX_WIRE_SLOTS }],
  [
    "recharge past the last slot",
    parseRecharge,
    { slots: [{ slot: MAX_WIRE_SLOTS, remainingSeconds: 1, totalSeconds: 5 }] },
  ],
  ["refused of an unknown kind", parseCastRefused, { kind: "move", reason: "stuck" }],
  [
    "recharge with a NaN",
    parseRecharge,
    { slots: [{ slot: 0, remainingSeconds: NaN, totalSeconds: 5 }] },
  ],
];

describe("the P2P channels (#82)", () => {
  it("each fit a Trystero action name, 32 bytes of UTF-8 (#16)", () => {
    for (const channel of CHANNELS) {
      // ASCII only, so a character is a byte.
      expect(channel, channel).toMatch(/^[a-z-]{1,32}$/);
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

  it("cut a hello's long name to MAX_WIRE_TEXT: shortening it is the host's job", () => {
    const named = parsePeerHello({ ...hello, name: "x".repeat(5000) });
    expect(named?.name).toBe("x".repeat(MAX_WIRE_TEXT));
  });

  it("read a hello's version even when the rest of it is malformed", () => {
    expect(helloProtocolVersion({ protocolVersion: "000000000000", name: 7 })).toBe("000000000000");
    expect(helloProtocolVersion({ name: "Tester" })).toBeUndefined();
    expect(helloProtocolVersion("hello")).toBeUndefined();
  });

  it("parse a hello of another version: refusing it is the host's job", () => {
    expect(parsePeerHello({ ...hello, protocolVersion: "000000000000" })).toEqual({
      ...hello,
      protocolVersion: "000000000000",
    });
  });

  describe("a hello's build, which is opaque JSON", () => {
    /** `value` inside `depth` arrays. */
    const nested = (depth: number, value: unknown = 1): unknown => {
      let out = value;
      for (let i = 0; i < depth; i += 1) {
        out = [out];
      }
      return out;
    };

    it("refuses one nested past MAX_WIRE_JSON_DEPTH, and never throws on a deep one", () => {
      expect(parsePeerHello({ ...hello, build: nested(MAX_WIRE_JSON_DEPTH) })).toBeDefined();
      expect(parsePeerHello({ ...hello, build: nested(MAX_WIRE_JSON_DEPTH + 1) })).toBeUndefined();
      // Deep enough to overflow the stack of a parser that recursed freely.
      const deep: unknown = JSON.parse(`${"[".repeat(200_000)}${"]".repeat(200_000)}`);
      expect(() => parsePeerHello({ ...hello, build: deep })).not.toThrow();
      expect(parsePeerHello({ ...hello, build: deep })).toBeUndefined();
    });

    it("refuses one holding more than MAX_WIRE_JSON_VALUES values", () => {
      const values = (count: number): number[] => Array.from({ length: count }, () => 0);
      // The array itself is one value.
      expect(parsePeerHello({ ...hello, build: values(MAX_WIRE_JSON_VALUES - 1) })).toBeDefined();
      expect(parsePeerHello({ ...hello, build: values(MAX_WIRE_JSON_VALUES) })).toBeUndefined();
    });

    it("keeps a __proto__ key as an own key, not as the copy's prototype", () => {
      const build: unknown = JSON.parse('{"__proto__":{"skills":[1]}}');
      const parsed = parsePeerHello({ ...hello, build })?.build;

      expect(Object.keys(parsed ?? {})).toEqual(["__proto__"]);
      expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
      expect(parsed).not.toHaveProperty("skills");
    });
  });
});
