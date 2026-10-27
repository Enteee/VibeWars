import { describe, expect, it } from "vitest";

import {
  CHANNELS,
  MAX_WIRE_COMBATS,
  MAX_WIRE_EVENTS,
  MAX_SNAPSHOT_PARTS,
  MAX_WIRE_PINGS,
  MAX_WIRE_PROJECTILES,
  MAX_WIRE_RADIUS,
  MAX_WIRE_PIPS,
  MAX_WIRE_RANK,
  MAX_WIRE_RANKS,
  MAX_WIRE_SLOTS,
  MAX_WIRE_STATUSES,
  MAX_WIRE_STATUS_INDEX,
  MAX_WIRE_STRING,
  MAX_WIRE_TEXT,
  MAX_WIRE_JSON_DEPTH,
  MAX_WIRE_JSON_VALUES,
  helloProtocolVersion,
  parseCastRefused,
  parsePeerBye,
  parsePeerCall,
  parseWireCalls,
  parsePeerHello,
  parsePeerRefuse,
  parsePeerRejoinChallenge,
  parsePeerRejoinProof,
  parsePeerWelcome,
  parseRecharge,
  parseWireCombatBatch,
  parseWireEnded,
  parseWireSkillBar,
  parseWireSnapshotPart,
  parsePeerLobbyJoin,
  parseWireLobbyCommand,
  parseWireLobbyNote,
  parseWireLobbyState,
  parseWireMatchStart,
} from "./p2p.js";
import type {
  PeerHello,
  PeerRefuse,
  PeerWelcome,
  WireCombat,
  WireCombatBatch,
  WireEnded,
  WirePlayer,
  WireStatus,
  WireSkillBar,
  WireSnapshotPart,
  PeerLobbyJoin,
  WireLobbyState,
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

const challenge = { playerId: "peer-2", nonce: TOKEN };

/** An HMAC-SHA-256 as hex, as a returning guest sends it. */
const proof = { playerId: "peer-2", proof: "a1".repeat(32) };

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

const status: WireStatus = { status: 3, endsAt: 12.5, durationSeconds: 8, casterId: "peer-2" };

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
  swingElapsed: 0.4,
  swingTotal: 1.75,
  knockdownRemaining: 2.5,
  healthPips: -3,
  energyPips: 4,
  statuses: [status],
};

const snapshot: WireSnapshotPart = {
  tick: 42,
  elapsedSeconds: 2.1,
  score: [1, 0],
  phase: "active",
  winningTeam: null,
  endReason: null,
  part: 0,
  parts: 1,
  players: [player, { ...player, id: "peer-2", team: 1, targetId: "peer-1", statuses: [] }],
  projectiles: [
    {
      id: 7,
      attackerId: "peer-2",
      skillId: null,
      from: { x: 10, y: 20 },
      to: { x: 300, y: 20 },
      launchedAt: 1.9,
      flightSeconds: 0.6,
    },
    {
      id: 8,
      attackerId: "peer-1",
      skillId: "elementalist.fireball",
      from: { x: 300, y: 20 },
      to: { x: 10, y: 20 },
      launchedAt: 2,
      flightSeconds: 0.7,
    },
  ],
};

const combat: WireCombat = {
  casterId: "peer-1",
  cause: "skill",
  skillId: "fireball",
  weaponId: "",
  attributeId: "",
  area: { x: 300, y: 200, radius: 80 },
  doubleStrike: false,
  events: [
    {
      kind: "damage",
      targetId: "peer-2",
      amount: 64,
      skillId: null,
      statusId: null,
      durationSeconds: null,
      crit: true,
      fromId: null,
      energy: null,
    },
    {
      kind: "interrupted",
      targetId: "peer-2",
      amount: null,
      skillId: "healing-breeze",
      statusId: null,
      durationSeconds: null,
      crit: null,
      fromId: null,
      energy: null,
    },
    {
      kind: "status-applied",
      targetId: "peer-2",
      amount: null,
      skillId: null,
      statusId: "burning",
      durationSeconds: 3,
      crit: null,
      fromId: null,
      energy: null,
    },
    {
      kind: "status-spread",
      targetId: "peer-3",
      amount: null,
      skillId: null,
      statusId: "disease",
      durationSeconds: null,
      crit: null,
      fromId: "peer-2",
      energy: null,
    },
  ],
};

const combatBatch: WireCombatBatch = [
  combat,
  { ...combat, cause: "weapon", skillId: "", weaponId: "daggers", area: null, doubleStrike: true },
  {
    ...combat,
    cause: "attribute",
    skillId: "",
    attributeId: "necromancer.soul-reaping",
    area: null,
    events: [
      {
        kind: "energy-gain",
        targetId: "peer-1",
        amount: 12,
        skillId: null,
        statusId: null,
        durationSeconds: null,
        crit: null,
        fromId: null,
        energy: null,
      },
    ],
  },
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
  ranks: { "monk.healing-prayers": 12, "monk.divine-favor": 0 },
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
const lobbyJoin: PeerLobbyJoin = {
  protocolVersion: PROTOCOL_VERSION,
  name: "Mhenlo",
  character: { name: "Mhenlo Healer", primary: "monk", secondary: "elementalist" },
};

const lobbyState: WireLobbyState = {
  code: "ACDEFG",
  phase: "in-match",
  mapId: "isle",
  hostId: "peer-1",
  matchId: "match-2",
  players: [
    {
      id: "peer-1/local",
      name: "Host",
      team: 0,
      ready: true,
      isHost: true,
      character: { name: "Cynn", primary: "elementalist", secondary: null },
    },
    { id: "peer-3", name: "Watcher", team: null, ready: false, isHost: false, character: null },
  ],
};

const ping = { id: 3, x: 200, y: 150.5, byId: "peer-1", remaining: 2.6 };
const calls = { target: { targetId: "peer-2", callerId: "peer-1" }, pings: [ping] };

const VALID: readonly [string, (value: unknown) => unknown, unknown][] = [
  ["hello", parsePeerHello, hello],
  ["rejoining hello", parsePeerHello, { ...hello, rejoin: { playerId: "peer-2" } }],
  ["rejoin-challenge", parsePeerRejoinChallenge, challenge],
  ["rejoin-proof", parsePeerRejoinProof, proof],
  ["welcome", parsePeerWelcome, welcome],
  ["refuse", parsePeerRefuse, refuse],
  ["snapshot", parseWireSnapshotPart, snapshot],
  ["last of three snapshot parts", parseWireSnapshotPart, { ...snapshot, part: 2, parts: 3 }],
  ["combat batch", parseWireCombatBatch, combatBatch],
  ["skill-bar", parseWireSkillBar, skillBar],
  ["ended", parseWireEnded, ended],
  ["refused", parseCastRefused, refused],
  ["refused attack", parseCastRefused, { kind: "attack", reason: "no-weapon" }],
  ["recharge", parseRecharge, recharge],
  ["bye", parsePeerBye, {}],
  ["call on a foe", parsePeerCall, { kind: "target", targetId: "peer-2" }],
  ["ping", parsePeerCall, { kind: "ping", x: 120.5, y: 40 }],
  ["calls", parseWireCalls, calls],
  ["calls with none", parseWireCalls, { target: null, pings: [] }],
  [
    "calls with every ping a team shows (#730)",
    parseWireCalls,
    { target: null, pings: Array.from({ length: 32 }, () => ping) },
  ],
  ["lobby-join", parsePeerLobbyJoin, lobbyJoin],
  ["lobby-join on the house loadout", parsePeerLobbyJoin, { ...lobbyJoin, character: null }],
  ["lobby-state", parseWireLobbyState, lobbyState],
  ["waiting lobby-state", parseWireLobbyState, { ...lobbyState, phase: "waiting", matchId: null }],
  ["choose-team", parseWireLobbyCommand, { kind: "choose-team", team: 1 }],
  ["spectate", parseWireLobbyCommand, { kind: "choose-team", team: null }],
  ["ready", parseWireLobbyCommand, { kind: "ready", ready: false }],
  ["select-map", parseWireLobbyCommand, { kind: "select-map", mapId: "isle" }],
  ["start", parseWireLobbyCommand, { kind: "start" }],
  ["start-rejected", parseWireLobbyNote, { kind: "start-rejected", reason: "nobody is ready" }],
  ["lobby refusal", parseWireLobbyNote, { kind: "refused", reason: "lobby-full" }],
  ["match-start", parseWireMatchStart, { mapId: "isle", matchId: "match-2" }],
];

const long = "x".repeat(MAX_WIRE_STRING + 1);

/** One malformed message per rule. */
const MALFORMED: readonly [string, (value: unknown) => unknown, unknown][] = [
  ["a call of an unknown kind (#443)", parsePeerCall, { kind: "focus", targetId: "peer-2" }],
  ["a call with no target (#443)", parsePeerCall, { kind: "target" }],
  ["a ping at NaN (#443)", parsePeerCall, { kind: "ping", x: Number.NaN, y: 0 }],
  ["a ping with a string for y (#443)", parsePeerCall, { kind: "ping", x: 0, y: "0" }],
  [
    "a call with a target id past the cap (#443)",
    parsePeerCall,
    { kind: "target", targetId: "x".repeat(MAX_WIRE_STRING + 1) },
  ],
  [
    "calls with one ping too many (#443)",
    parseWireCalls,
    { target: null, pings: Array.from({ length: MAX_WIRE_PINGS + 1 }, () => ping) },
  ],
  ["calls with no pings (#443)", parseWireCalls, { target: null }],
  [
    "calls with a target and no caller (#443)",
    parseWireCalls,
    { ...calls, target: { targetId: "peer-2" } },
  ],
  [
    "calls with a ping running backwards (#443)",
    parseWireCalls,
    { target: null, pings: [{ ...ping, remaining: -1 }] },
  ],

  ["not an object", parsePeerHello, "hello"],
  ["an array", parsePeerHello, [hello]],
  ["null", parseWireSnapshotPart, null],
  ["hello without a name", parsePeerHello, { ...hello, name: undefined }],
  ["hello with a numeric version", parsePeerHello, { ...hello, protocolVersion: 2 }],
  ["bye with a field", parsePeerBye, { reason: "x" }],
  ["bye that is not an object", parsePeerBye, null],
  ["hello without a rejoin", parsePeerHello, { ...hello, rejoin: undefined }],
  ["hello with an undefined in its build", parsePeerHello, { ...hello, build: { x: undefined } }],
  ["hello with a NaN in its build", parsePeerHello, { ...hello, build: [NaN] }],
  ["hello with a rejoin but no player", parsePeerHello, { ...hello, rejoin: { token: TOKEN } }],
  ["hello rejoining a long player id", parsePeerHello, { ...hello, rejoin: { playerId: long } }],
  ["challenge with a short nonce", parsePeerRejoinChallenge, { ...challenge, nonce: "0f" }],
  ["challenge with a long nonce", parsePeerRejoinChallenge, { ...challenge, nonce: `${TOKEN}0` }],
  [
    "challenge with an uppercase nonce",
    parsePeerRejoinChallenge,
    { ...challenge, nonce: TOKEN.toUpperCase() },
  ],
  ["challenge without a player", parsePeerRejoinChallenge, { nonce: TOKEN }],
  ["challenge with a long player id", parsePeerRejoinChallenge, { ...challenge, playerId: long }],
  ["proof with a short proof", parsePeerRejoinProof, { ...proof, proof: TOKEN }],
  ["proof with a long proof", parsePeerRejoinProof, { ...proof, proof: `${proof.proof}a` }],
  ["proof in upper case", parsePeerRejoinProof, { ...proof, proof: proof.proof.toUpperCase() }],
  ["proof without a proof", parsePeerRejoinProof, { playerId: "peer-2" }],
  ["proof without a player", parsePeerRejoinProof, { proof: proof.proof }],
  ["proof with a numeric proof", parsePeerRejoinProof, { ...proof, proof: 7 }],
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
  ["snapshot without parts (#662)", parseWireSnapshotPart, { ...snapshot, parts: undefined }],
  ["snapshot in zero parts", parseWireSnapshotPart, { ...snapshot, parts: 0 }],
  [
    "snapshot in too many parts",
    parseWireSnapshotPart,
    { ...snapshot, part: 0, parts: MAX_SNAPSHOT_PARTS + 1 },
  ],
  ["snapshot part past its parts", parseWireSnapshotPart, { ...snapshot, part: 1, parts: 1 }],
  ["snapshot with a negative part", parseWireSnapshotPart, { ...snapshot, part: -1 }],
  ["snapshot with a fractional part", parseWireSnapshotPart, { ...snapshot, part: 0.5, parts: 2 }],
  ["snapshot with a negative tick", parseWireSnapshotPart, { ...snapshot, tick: -1 }],
  ["snapshot with a fractional tick", parseWireSnapshotPart, { ...snapshot, tick: 1.5 }],
  ["snapshot with one score", parseWireSnapshotPart, { ...snapshot, score: [1] }],
  ["snapshot with three scores", parseWireSnapshotPart, { ...snapshot, score: [1, 0, 0] }],
  ["snapshot with an unknown phase", parseWireSnapshotPart, { ...snapshot, phase: "paused" }],
  ["snapshot with team 2 winning", parseWireSnapshotPart, { ...snapshot, winningTeam: 2 }],
  ["snapshot ended by host-left", parseWireSnapshotPart, { ...snapshot, endReason: "host-left" }],
  [
    "snapshot with too many players",
    parseWireSnapshotPart,
    { ...snapshot, players: Array.from({ length: MAX_LOBBY_PLAYERS + 1 }, () => player) },
  ],
  [
    "snapshot with a player on team 2",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, team: 2 }] },
  ],
  [
    "snapshot with an infinite health",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, health: Infinity }] },
  ],
  [
    "snapshot with an absent target",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, targetId: undefined }] },
  ],
  [
    "snapshot with a string for dead",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, dead: "no" }] },
  ],
  [
    "snapshot with too many statuses",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [
        { ...player, statuses: Array.from({ length: MAX_WIRE_STATUSES + 1 }, () => status) },
      ],
    },
  ],
  ...[-1, 1.5, "crippled", MAX_WIRE_STATUS_INDEX + 1].map(
    (index): [string, (value: unknown) => unknown, unknown] => [
      `snapshot with status index ${String(index)}`,
      parseWireSnapshotPart,
      { ...snapshot, players: [{ ...player, statuses: [{ ...status, status: index }] }] },
    ],
  ),
  ...(
    [
      ["endsAt", -0.1],
      ["endsAt", NaN],
      ["endsAt", Infinity],
      ["endsAt", undefined],
      ["durationSeconds", 0],
      ["durationSeconds", -1],
      ["durationSeconds", Infinity],
      ["durationSeconds", undefined],
      ["casterId", 7],
      ["casterId", null],
      ["casterId", long],
    ] as const
  ).map(([field, value]): [string, (value: unknown) => unknown, unknown] => [
    `snapshot with a status's ${field} ${String(value).slice(0, 12)} (#803)`,
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, statuses: [{ ...status, [field]: value }] }] },
  ]),
  [
    "snapshot with a bare status index (#803)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, statuses: [3] }] },
  ],
  [
    "snapshot with a player missing a field",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, castTotal: undefined }] },
  ],
  ...(["swingElapsed", "swingTotal"] as const).map(
    (field): [string, (value: unknown) => unknown, unknown] => [
      `snapshot with a player without ${field} (#560)`,
      parseWireSnapshotPart,
      { ...snapshot, players: [{ ...player, [field]: undefined }] },
    ],
  ),
  ...(["healthPips", "energyPips"] as const).flatMap(
    (field): [string, (value: unknown) => unknown, unknown][] =>
      [undefined, 1.5, MAX_WIRE_PIPS + 1, -MAX_WIRE_PIPS - 1, "3"].map((value) => [
        `snapshot with a player's ${field} ${String(value)} (#504)`,
        parseWireSnapshotPart,
        { ...snapshot, players: [{ ...player, [field]: value }] },
      ]),
  ),
  [
    "snapshot with a player missing knockdownRemaining (#545)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, knockdownRemaining: undefined }] },
  ],
  [
    "snapshot with a string for walking",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, walking: "yes" }] },
  ],
  ["snapshot without projectiles", parseWireSnapshotPart, { ...snapshot, projectiles: undefined }],
  [
    "snapshot with too many projectiles",
    parseWireSnapshotPart,
    {
      ...snapshot,
      projectiles: Array.from({ length: MAX_WIRE_PROJECTILES + 1 }, () => snapshot.projectiles[0]),
    },
  ],
  [
    "snapshot with a projectile that never lands",
    parseWireSnapshotPart,
    { ...snapshot, projectiles: [{ ...snapshot.projectiles[0], flightSeconds: 0 }] },
  ],
  [
    "snapshot with a projectile whose spell is not a string",
    parseWireSnapshotPart,
    { ...snapshot, projectiles: [{ ...snapshot.projectiles[0], skillId: 7 }] },
  ],
  [
    "snapshot with a projectile that does not say whether it carries a spell",
    parseWireSnapshotPart,
    { ...snapshot, projectiles: [{ ...snapshot.projectiles[0], skillId: undefined }] },
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
          crit: false,
          fromId: null,
          energy: null,
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
    "combat with a critical that is not a boolean",
    parseWireCombatBatch,
    [{ ...combat, events: [{ ...combat.events[0], crit: "yes" }] }],
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
  ["skill bar without ranks", parseWireSkillBar, { slots: skillBar.slots }],
  [
    "skill bar with a fractional rank",
    parseWireSkillBar,
    { ...skillBar, ranks: { "monk.healing-prayers": 11.5 } },
  ],
  [
    "skill bar with a rank past the most runes give",
    parseWireSkillBar,
    { ...skillBar, ranks: { "monk.healing-prayers": MAX_WIRE_RANK + 1 } },
  ],
  [
    "skill bar with a negative rank",
    parseWireSkillBar,
    { ...skillBar, ranks: { "monk.healing-prayers": -1 } },
  ],
  [
    "skill bar with an attribute id of another shape",
    parseWireSkillBar,
    { ...skillBar, ranks: { Healing: 3 } },
  ],
  [
    "skill bar ranking __proto__",
    parseWireSkillBar,
    { ...skillBar, ranks: JSON.parse('{"__proto__": 3}') as unknown },
  ],
  [
    "skill bar with too many ranks",
    parseWireSkillBar,
    {
      ...skillBar,
      ranks: Object.fromEntries(
        Array.from({ length: MAX_WIRE_RANKS + 1 }, (_, i) => [
          `monk.attribute-${"a".repeat(i + 1)}`,
          1,
        ]),
      ),
    },
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
  ["lobby-join without a name", parsePeerLobbyJoin, { protocolVersion: PROTOCOL_VERSION }],
  [
    "lobby-join without a character",
    parsePeerLobbyJoin,
    { protocolVersion: PROTOCOL_VERSION, name: "Mhenlo" },
  ],
  [
    "lobby-join with a character of no primary",
    parsePeerLobbyJoin,
    { ...lobbyJoin, character: { name: "Mhenlo Healer", secondary: null } },
  ],
  [
    "lobby-state with a player of no character",
    parseWireLobbyState,
    { ...lobbyState, players: [{ ...lobbyState.players[1], character: undefined }] },
  ],
  ["lobby-state of an unknown phase", parseWireLobbyState, { ...lobbyState, phase: "over" }],
  ["lobby-state without a host", parseWireLobbyState, { ...lobbyState, hostId: undefined }],
  ["lobby-state with a long code", parseWireLobbyState, { ...lobbyState, code: long }],
  [
    "lobby-state with a third team",
    parseWireLobbyState,
    { ...lobbyState, players: [{ ...lobbyState.players[0], team: 2 }] },
  ],
  [
    "lobby-state past MAX_LOBBY_PLAYERS",
    parseWireLobbyState,
    {
      ...lobbyState,
      players: Array.from({ length: MAX_LOBBY_PLAYERS + 1 }, () => lobbyState.players[1]),
    },
  ],
  ["choose-team without a team", parseWireLobbyCommand, { kind: "choose-team" }],
  ["choose-team of a string", parseWireLobbyCommand, { kind: "choose-team", team: "0" }],
  ["ready of a string", parseWireLobbyCommand, { kind: "ready", ready: "true" }],
  ["select-map with a long id", parseWireLobbyCommand, { kind: "select-map", mapId: long }],
  ["a command of an unknown kind", parseWireLobbyCommand, { kind: "kick", id: "peer-2" }],
  ["a note of an unknown kind", parseWireLobbyNote, { kind: "kicked", reason: "x" }],
  [
    "a note with a long reason",
    parseWireLobbyNote,
    { kind: "start-rejected", reason: "x".repeat(MAX_WIRE_TEXT + 1) },
  ],
  ["match-start without a match", parseWireMatchStart, { mapId: "isle" }],
  [
    "an attribute combat with no attribute",
    parseWireCombatBatch,
    [{ ...combatBatch[2], attributeId: "" }],
  ],
  ["a skill combat with an attribute", parseWireCombatBatch, [{ ...combat, attributeId: "x" }]],
  [
    "combat with no double-strike flag (#561)",
    parseWireCombatBatch,
    [{ ...combat, doubleStrike: undefined }],
  ],
  [
    "a skill combat that struck twice (#561)",
    parseWireCombatBatch,
    [{ ...combat, doubleStrike: true }],
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
    expect(parseWireSnapshotPart({ ...snapshot, players: [{ ...player, godMode: true }] })).toEqual(
      {
        ...snapshot,
        players: [player],
      },
    );
  });

  it("drop a token from a hello's rejoin: a rejoin is proven, never told (#593)", () => {
    const parsed = parsePeerHello({ ...hello, rejoin: { playerId: "peer-2", token: TOKEN } });
    expect(parsed?.rejoin).toEqual({ playerId: "peer-2" });
  });

  it("cut a hello's long name to MAX_WIRE_TEXT: shortening it is the host's job", () => {
    const named = parsePeerHello({ ...hello, name: "x".repeat(5000) });
    expect(named?.name).toBe("x".repeat(MAX_WIRE_TEXT));
  });

  it("cut a lobby-join's long character name to MAX_WIRE_TEXT, like its own (#580)", () => {
    const named = parsePeerLobbyJoin({
      ...lobbyJoin,
      character: { name: "x".repeat(5000), primary: "monk", secondary: null },
    });
    expect(named?.character?.name).toBe("x".repeat(MAX_WIRE_TEXT));
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
