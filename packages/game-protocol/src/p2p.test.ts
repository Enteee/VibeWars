import { describe, expect, it } from "vitest";

import {
  CHANNELS,
  MAX_WIRE_CHAT_TEXT,
  MAX_WIRE_COMBATS,
  MAX_WIRE_EVENTS,
  MAX_SNAPSHOT_PARTS,
  MAX_WIRE_PINGS,
  MAX_WIRE_PROJECTILES,
  MAX_WIRE_GROUND_EFFECTS,
  MAX_WIRE_RADIUS,
  MAX_WIRE_MORALE,
  MAX_WIRE_PIPS,
  MIN_WIRE_MORALE,
  MAX_WIRE_RANKS,
  MAX_WIRE_SLOTS,
  MAX_WIRE_STATUSES,
  MAX_WIRE_ACTORS,
  MAX_WIRE_STATUS_INDEX,
  MAX_WIRE_STRING,
  MAX_WIRE_TEXT,
  MAX_WIRE_JSON_DEPTH,
  MAX_WIRE_JSON_VALUES,
  helloProtocolVersion,
  parseCastRefused,
  parsePeerBye,
  parsePeerCall,
  parsePeerChat,
  parseWireCalls,
  parseWireTraps,
  parseWireChatLine,
  parsePeerHello,
  parsePeerObserve,
  parsePeerObserving,
  parsePeerRefuse,
  parsePeerRejoinChallenge,
  parsePeerRejoinProof,
  parseWireKeyChallenge,
  parseWireKeyProof,
  parseWireKeyProven,
  parsePeerWelcome,
  parseAdrenaline,
  parseChainMarks,
  parseRecharge,
  parseWireCombatBatch,
  parseWireEnded,
  parseWireSkillBar,
  parseWireSnapshotPart,
  parseWireWeaponSets,
  parsePeerLobbyJoin,
  parseWireLobbyCommand,
  parseWireLobbyNote,
  parseWireTeamProposalBuilds,
  parsePeerLobbyHello,
  parsePeerLobbyLeave,
  parseWireLobbyWelcome,
  parsePeerStayTogether,
  parseWirePartyProposal,
  parsePeerPartyConsent,
  parseWirePartyFormed,
  parseWirePartySplit,
  parseWireLobbyMove,
  parseWireLobbyState,
  parseWireMatchStart,
} from "./p2p.js";
import type {
  PeerHello,
  PeerObserve,
  PeerObserving,
  PeerRefuse,
  PeerWelcome,
  WireCombat,
  WireCombatBatch,
  WireEnded,
  WirePlayer,
  WireStatus,
  WireSkillBar,
  WireWeaponSets,
  WireSnapshotPart,
  PeerLobbyJoin,
  WireLobbyState,
} from "./p2p.js";
import { MAX_LOBBY_PLAYERS, MAX_TEAM_LOBBY_SIDE, PROTOCOL_MISMATCH_MESSAGE } from "./protocol.js";
import type { CastRefusedMessage, RechargeMessage } from "./protocol.js";
import { PROTOCOL_VERSION } from "./protocol-version.js";

/** A guild cape (#1422), as the designer makes one. */
const CAPE = { main: "violet", trim: "white", emblem: "diamond" } as const;

const hello: PeerHello = {
  protocolVersion: PROTOCOL_VERSION,
  name: "Mhenlo",
  guildTag: "VIBE",
  guildCape: CAPE,
  build: { profession: "monk", skills: ["healing-breeze", null] },
  rejoin: null,
};

/** 128 bits of hex, as the host makes them; repeated so it reads as no secret. */
const TOKEN = "0f".repeat(16);

const challenge = { playerId: "peer-2", nonce: TOKEN };

/** An HMAC-SHA-256 as hex, as a returning guest sends it. */
const proof = { playerId: "peer-2", proof: "a1".repeat(32) };
const keyProof = { nonce: TOKEN, mac: "b2".repeat(32) };

const welcome: PeerWelcome = {
  protocolVersion: PROTOCOL_VERSION,
  playerId: "peer-2",
  rejoinToken: TOKEN,
  tickIntervalMs: 50,
  elapsedSeconds: 12.5,
  timeLimitSeconds: 180,
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

const observe: PeerObserve = { protocolVersion: PROTOCOL_VERSION, matchId: "match-2" };

const observing: PeerObserving = {
  protocolVersion: PROTOCOL_VERSION,
  tickIntervalMs: 50,
  timeLimitSeconds: 180,
  delaySeconds: 10,
  map: welcome.map,
};

const status: WireStatus = { status: 3, endsAt: 12.5, durationSeconds: 8, casterId: "peer-2" };

const player: WirePlayer = {
  id: "peer-1",
  name: "Mhenlo",
  guildTag: "VIBE",
  guildCape: CAPE,
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
  overcast: 5,
  morale: -15,
  armor: 60,
  weaponId: "staff",
  offhandId: null,
  primaryProfession: "monk",
  secondaryProfession: null,
  dead: false,
  corpseExploited: false,
  castingSkillId: "healing-breeze",
  castRemaining: 0.75,
  castTotal: 1,
  swingElapsed: 0.4,
  swingTotal: 1.75,
  knockdownRemaining: 2.5,
  invulnerableSeconds: 3.25,
  healthPips: -3,
  energyPips: 4,
  statuses: [status],
  creature: null,
  bot: false,
};

/** A Bone Minion of `peer-1`'s (#1052): no professions, its kind's name. */
const minion: WirePlayer = {
  ...player,
  id: "peer-1/c1",
  name: "Bone Minion",
  primaryProfession: null,
  creature: {
    ownerId: "peer-1",
    kind: "minion",
    look: "bone-minion",
    mode: null,
    armedAttack: null,
    leaderId: null,
  },
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
  groundEffects: [
    {
      id: 1,
      skillId: "elementalist.ward-against-melee",
      team: 0,
      x: 120,
      y: 80,
      radius: 109,
      endsAt: 19.1,
      durationSeconds: 17,
    },
  ],
  flags: [],
  stand: null,
  aggression: [],
  relics: [],
  altar: null,
  altarHolder: null,
  altarHeldSeconds: 0,
  capturePoints: [],
};

/** A Guild Battle's flags (#1225): one carried, one on the ground; and its aggression (#1226). */
const flagged: WireSnapshotPart = {
  ...snapshot,
  flags: [
    { team: 0, place: "carried", carrierId: "peer-1", x: null, y: null },
    { team: 1, place: "ground", carrierId: null, x: 1400, y: 980 },
  ],
  stand: { holder: 0, heldSeconds: 37.5 },
  aggression: [1240, 980],
};

/** A Relic Run's relics (#1374): one carried, one lying; and its altar. */
const relicked: WireSnapshotPart = {
  ...snapshot,
  relics: [
    { team: 0, place: "carried", carrierId: "peer-1", x: null, y: null },
    { team: 1, place: "ground", carrierId: null, x: 1300, y: 500 },
  ],
  altar: { x: 1100, y: 700 },
};

/** King of the Hill's altar (#1377), held by team 1 for 12.5 s. */
const hill: WireSnapshotPart = {
  ...snapshot,
  altar: { x: 1000, y: 700 },
  altarHolder: 1,
  altarHeldSeconds: 12.5,
};

/** Capture Points' shrines (#1378): one ours, one being drained by the foe, one neutral. */
const shrined: WireSnapshotPart = {
  ...snapshot,
  capturePoints: [
    { x: 480, y: 700, owner: 0, capturer: 0, progress: 1 },
    { x: 1100, y: 700, owner: 0, capturer: 0, progress: 0.4 },
    { x: 1720, y: 700, owner: null, capturer: null, progress: 0 },
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

/** A sword and shield in set 1, a bow in set 2, sets 3 and 4 empty. */
const weaponSets: WireWeaponSets = {
  sets: [
    { weaponId: "sword", offhandId: "shield" },
    { weaponId: "recurve-bow", offhandId: null },
    null,
    null,
  ],
  active: 0,
  pending: null,
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
      copyEndsAt: null,
    },
    null,
    {
      id: "fireball",
      name: "Fireball",
      energyCost: 10,
      adrenalineCost: 0,
      activationSeconds: 1,
      rechargeSeconds: 5,
      copyEndsAt: 32.4,
    },
  ],
  ranks: { "monk.healing-prayers": 12, "monk.divine-favor": 0 },
};

const summaryRow = {
  id: "player-1",
  name: "Ann",
  guildTag: "Ab1",
  team: 0,
  damage: 1200,
  healing: 340,
  taken: 900,
  kills: 2,
  deaths: 1,
  interrupts: 3,
} as const;

const ended: WireEnded = { winningTeam: null, endReason: "host-left", summary: [summaryRow] };

const refused: CastRefusedMessage = {
  kind: "skill",
  slot: 3,
  skillId: "fireball",
  reason: "out-of-range",
};

const recharge: RechargeMessage = {
  slots: [{ slot: 0, remainingSeconds: 3.5, totalSeconds: 5 }],
  spent: [2],
  queued: 1,
};

/** Each parser, with the one fixture it must round-trip. */
const lobbyJoin: PeerLobbyJoin = {
  protocolVersion: PROTOCOL_VERSION,
  name: "Mhenlo",
  guildTag: "vb",
  guildCape: null,
  admission: null,
};

/** A queued join's proof (#871): a ticket id and a signature, as hex. */
const admission = { seatKey: "ab".repeat(32), admissionSig: "cd".repeat(64) };

/** A party's consent to its proposal (#1078). */
const partyConsent = { memberKey: "ab".repeat(32), consent: "ef".repeat(64) };

/** A party-proposal of `members`, as given (#1078), for a 2v2 (#1766). */
function proposalOf(members: readonly string[]) {
  return { groupId: "12".repeat(32), members, mode: "random-arena-2v2" };
}

/** A party-formed of `members`, as given, each with a consent. */
function partyOf(members: readonly string[]) {
  return { groupId: "12".repeat(32), members, consents: members.map(() => "ef".repeat(64)) };
}

const lobbyState: WireLobbyState = {
  code: "ACDEFG",
  phase: "in-match",
  mode: "gvg",
  mapId: "isle",
  open: true,
  hostId: "peer-1",
  matchId: "match-2",
  players: [
    {
      id: "peer-1/local",
      name: "Host",
      guildTag: "VIBE",
      guildCape: CAPE,
      team: 0,
      ready: true,
      isHost: true,
      bot: false,
      away: false,
    },
    {
      id: "peer-3",
      name: "Watcher",
      guildTag: null,
      guildCape: null,
      team: null,
      ready: false,
      isHost: false,
      bot: false,
      away: false,
    },
    {
      id: "bot-1",
      name: "Monk Bot",
      guildTag: null,
      guildCape: null,
      team: 1,
      ready: true,
      isHost: false,
      bot: true,
      away: false,
    },
  ],
  countdownSeconds: null,
  queueNonce: null,
  teamLobby: null,
};

/** One side of a Team Lobby in its claim (#1458), as its own members see it. */
const teamSide = {
  size: 2,
  captainId: "peer-1/local",
  proposals: [
    {
      proposerId: "peer-1/local",
      members: [
        { primary: "monk", secondary: null },
        { primary: "warrior", secondary: "monk" },
      ],
      voterIds: ["peer-1/local", "peer-2"],
    },
  ],
  chosen: {
    proposerId: "peer-1/local",
    reason: "votes",
    members: [
      { name: "Mhenlo", primary: "monk", secondary: null },
      { name: "Devona", primary: "warrior", secondary: "monk" },
    ],
  },
  claims: ["peer-2", null],
} as const;

/** A Team Lobby's state, as a member of team 0 gets it. */
const teamLobbyState: WireLobbyState = {
  ...lobbyState,
  phase: "team-lobby",
  matchId: null,
  teamLobby: { stage: "claim", secondsLeft: 41, sides: [teamSide, null] },
};

const ping = { id: 3, x: 200, y: 150.5, byId: "peer-1", remaining: 2.6 };
const trap = {
  id: 2,
  skillId: "ranger.barbed-trap",
  team: 1,
  x: 40,
  y: -20,
  radius: 81,
  endsAt: 92.5,
  durationSeconds: 90,
};

const calls = { target: { targetId: "peer-2", callerId: "peer-1" }, pings: [ping] };

const chatLine = { channel: "all", fromId: "peer-2", name: "Ann", team: 0, text: "gg" };

/** A proposed member's build (#1811): ids only. */
const proposalBuild = {
  skills: ["warrior.backbreaker", null, null, null, null, null, null, "warrior.frenzy"],
  mainHand: "sword",
  offHand: null,
};

const VALID: readonly [string, (value: unknown) => unknown, unknown][] = [
  ["hello", parsePeerHello, hello],
  ["rejoining hello", parsePeerHello, { ...hello, rejoin: { playerId: "peer-2" } }],
  ["untagged hello (#1406)", parsePeerHello, { ...hello, guildTag: null }],
  // The host sanitises it: a bad tag on the wire is still a hello.
  ["hello with a bad tag (#1406)", parsePeerHello, { ...hello, guildTag: "[x] " }],
  ["uncaped hello (#1422)", parsePeerHello, { ...hello, guildCape: null }],
  ["caped lobby-join (#1422)", parsePeerLobbyJoin, { ...lobbyJoin, guildCape: CAPE }],
  ["rejoin-challenge", parsePeerRejoinChallenge, challenge],
  ["rejoin-proof", parsePeerRejoinProof, proof],
  ["key-challenge (#1681)", parseWireKeyChallenge, { nonce: TOKEN }],
  ["key-proof (#1681)", parseWireKeyProof, keyProof],
  ["key-proven (#1681)", parseWireKeyProven, { mac: keyProof.mac }],
  ["welcome", parsePeerWelcome, welcome],
  ["refuse", parsePeerRefuse, refuse],
  ["observe (#480)", parsePeerObserve, observe],
  ["observing (#480)", parsePeerObserving, observing],
  ["refuse a player watching (#480)", parsePeerRefuse, { ...refuse, reason: "not-a-spectator" }],
  ["refuse a past match (#480)", parsePeerRefuse, { ...refuse, reason: "wrong-match" }],
  ["snapshot", parseWireSnapshotPart, snapshot],
  ["snapshot with a creature", parseWireSnapshotPart, { ...snapshot, players: [player, minion] }],
  [
    "snapshot with a pet on Heel (#1110)",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [
        player,
        {
          ...minion,
          name: "Wolf",
          creature: {
            ownerId: "peer-1",
            kind: "pet",
            look: "beast",
            mode: "heel",
            armedAttack: null,
            leaderId: null,
          },
        },
      ],
    },
  ],
  [
    "snapshot with a pet whose next blow is armed (#1167)",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [
        player,
        {
          ...minion,
          name: "Wolf",
          creature: {
            ownerId: "peer-1",
            kind: "pet",
            look: "beast",
            mode: "fight",
            armedAttack: { skillId: "ranger.brutal-strike", endsAt: 12.1 },
            leaderId: null,
          },
        },
      ],
    },
  ],
  [
    "snapshot with an exploited corpse (#466)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, dead: true, corpseExploited: true }] },
  ],
  [
    "snapshot with every player and creature there may be",
    parseWireSnapshotPart,
    { ...snapshot, players: Array.from({ length: MAX_WIRE_ACTORS }, () => minion) },
  ],
  [
    "snapshot with a maintained enchantment (#837)",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [{ ...player, statuses: [{ ...status, endsAt: null, durationSeconds: null }] }],
    },
  ],
  [
    "snapshot with a spirit and a body wearing its aura (#1064)",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [
        {
          ...player,
          statuses: [{ ...status, endsAt: null, durationSeconds: null, casterId: "peer-1/c1" }],
        },
        {
          ...minion,
          name: "Winnowing",
          creature: {
            ownerId: "peer-1",
            kind: "spirit",
            look: "spirit",
            mode: null,
            armedAttack: null,
            leaderId: null,
          },
        },
      ],
    },
  ],
  [
    "snapshot with a map's priest, owned by nobody (#1186)",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [
        {
          ...minion,
          name: "Priest",
          creature: {
            ownerId: null,
            kind: "priest",
            look: "priest",
            mode: null,
            armedAttack: null,
            leaderId: null,
          },
        },
      ],
    },
  ],
  ["last of three snapshot parts", parseWireSnapshotPart, { ...snapshot, part: 2, parts: 3 }],
  ["snapshot with flags and a held stand (#1225)", parseWireSnapshotPart, flagged],
  [
    "snapshot with flags at spawn and on the stand, nobody holding it (#1225)",
    parseWireSnapshotPart,
    {
      ...flagged,
      flags: [
        { team: 0, place: "spawn", carrierId: null, x: null, y: null },
        { team: 1, place: "stand", carrierId: null, x: null, y: null },
      ],
      stand: { holder: null, heldSeconds: 0 },
      aggression: [],
    },
  ],
  ["snapshot with relics and an altar (#1374)", parseWireSnapshotPart, relicked],
  ["snapshot with a held altar (#1377)", parseWireSnapshotPart, hill],
  ["snapshot with capture points (#1378)", parseWireSnapshotPart, shrined],
  ["combat batch", parseWireCombatBatch, combatBatch],
  ["skill-bar", parseWireSkillBar, skillBar],
  [
    "skill bar at rank 16, a superior rune and headgear on 12 (#1140)",
    parseWireSkillBar,
    { ...skillBar, ranks: { "monk.healing-prayers": 16 } },
  ],
  ["weapon-sets (#489)", parseWireWeaponSets, weaponSets],
  ["weapon-sets with a swap queued", parseWireWeaponSets, { ...weaponSets, active: 1, pending: 0 }],
  ["ended", parseWireEnded, ended],
  [
    "ended by a wipe (#846)",
    parseWireEnded,
    { winningTeam: 1, endReason: "annihilation", summary: [] },
  ],
  [
    "ended at time by morale (#846)",
    parseWireEnded,
    { winningTeam: null, endReason: "morale", summary: [] },
  ],
  [
    "ended with a full summary (#1057)",
    parseWireEnded,
    {
      ...ended,
      summary: Array.from({ length: MAX_LOBBY_PLAYERS }, (_, i) => ({
        ...summaryRow,
        id: `player-${String(i)}`,
        team: i % 2 === 0 ? 0 : 1,
      })),
    },
  ],
  [
    "snapshot ended by a wipe (#846)",
    parseWireSnapshotPart,
    { ...snapshot, phase: "finished", winningTeam: 0, endReason: "annihilation" },
  ],
  [
    "snapshot ended by morale (#846)",
    parseWireSnapshotPart,
    { ...snapshot, phase: "finished", winningTeam: null, endReason: "morale" },
  ],
  ["refused", parseCastRefused, refused],
  ["refused attack", parseCastRefused, { kind: "attack", reason: "no-weapon" }],
  ["recharge", parseRecharge, recharge],
  ["adrenaline", parseAdrenaline, { slots: [0, 0, 225, 0, 37.5, 0, 0, 0], lossInSeconds: 12.5 }],
  ["adrenaline, every slot empty", parseAdrenaline, { slots: [0, 0], lossInSeconds: null }],
  ["adrenaline for an empty bar", parseAdrenaline, { slots: [], lossInSeconds: null }],
  [
    "chain",
    parseChainMarks,
    {
      marks: [
        { targetId: "peer-2", role: "lead", remainingSeconds: 15 },
        { targetId: "peer-3", role: "off-hand", remainingSeconds: 3.25 },
        { targetId: "peer-4", role: "dual", remainingSeconds: 0 },
      ],
    },
  ],
  ["chain with no marks", parseChainMarks, { marks: [] }],
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
  ["traps (#1105)", parseWireTraps, { traps: [{ ...trap }] }],
  ["no traps (#1105)", parseWireTraps, { traps: [] }],
  [
    "every trap the wire carries (#1105)",
    parseWireTraps,
    { traps: Array.from({ length: MAX_WIRE_GROUND_EFFECTS }, () => trap) },
  ],
  ["chat (#479)", parsePeerChat, { channel: "team", text: "spike the monk" }],
  [
    "chat as long as the wire takes (#479)",
    parsePeerChat,
    { channel: "all", text: "x".repeat(MAX_WIRE_CHAT_TEXT) },
  ],
  ["chat-line (#479)", parseWireChatLine, chatLine],
  ["chat-line from a spectator (#479)", parseWireChatLine, { ...chatLine, team: null }],
  ["chat-throttled (#479)", parseWireLobbyNote, { kind: "chat-throttled", reason: "" }],
  ["lobby-join", parsePeerLobbyJoin, lobbyJoin],
  ["queued lobby-join (#871)", parsePeerLobbyJoin, { ...lobbyJoin, admission }],
  ["untagged lobby-join (#1406)", parsePeerLobbyJoin, { ...lobbyJoin, guildTag: null }],
  ["lobby-hello (#871)", parsePeerLobbyHello, {}],
  ["lobby-leave (#1764)", parsePeerLobbyLeave, {}],
  ["lobby-welcome (#871)", parseWireLobbyWelcome, { hostSig: "ef".repeat(64) }],
  ["stay-together yes (#882)", parsePeerStayTogether, { memberKey: "ab".repeat(32) }],
  ["stay-together no (#882)", parsePeerStayTogether, { memberKey: null }],
  [
    "party-formed of two (#882, #1078)",
    parseWirePartyFormed,
    partyOf(["ab".repeat(32), "cd".repeat(32)]),
  ],
  [
    "party-formed of four (#882)",
    parseWirePartyFormed,
    partyOf(["1", "2", "3", "4"].map((digit) => digit.repeat(64))),
  ],
  [
    "party-proposal of two (#1078)",
    parseWirePartyProposal,
    proposalOf(["ab".repeat(32), "cd".repeat(32)]),
  ],
  [
    "party-proposal led by its host, the rest sorted (#1766)",
    parseWirePartyProposal,
    proposalOf(["ef".repeat(32), "ab".repeat(32), "cd".repeat(32)]),
  ],
  ["party-consent (#1078)", parsePeerPartyConsent, partyConsent],
  ["party-split (#882)", parseWirePartySplit, {}],
  ["lobby-move (#1553)", parseWireLobbyMove, { code: "ACDEFGHJKMNP" }],
  [
    "counting-down lobby-state (#871)",
    parseWireLobbyState,
    { ...lobbyState, phase: "starting", matchId: null, countdownSeconds: 3 },
  ],
  ["lobby-state", parseWireLobbyState, lobbyState],
  [
    "queued lobby-state (#1766)",
    parseWireLobbyState,
    { ...lobbyState, phase: "queued", matchId: null, queueNonce: "ab".repeat(32) },
  ],
  ["waiting lobby-state", parseWireLobbyState, { ...lobbyState, phase: "waiting", matchId: null }],
  ["choose-team", parseWireLobbyCommand, { kind: "choose-team", team: 1 }],
  ["spectate", parseWireLobbyCommand, { kind: "choose-team", team: null }],
  ["ready", parseWireLobbyCommand, { kind: "ready", ready: false }],
  ["select-map", parseWireLobbyCommand, { kind: "select-map", mapId: "isle" }],
  ["select-mode (#1526)", parseWireLobbyCommand, { kind: "select-mode", mode: "heroes-ascent" }],
  ["start", parseWireLobbyCommand, { kind: "start" }],
  ["find-match (#1766)", parseWireLobbyCommand, { kind: "find-match" }],
  ["leave-queue (#1766)", parseWireLobbyCommand, { kind: "leave-queue" }],
  ["house-team (#1766)", parseWireLobbyCommand, { kind: "house-team" }],
  ["Team Lobby lobby-state (#1458)", parseWireLobbyState, teamLobbyState],
  [
    "Hosted Game's Team Lobby lobby-state, a side of any size (#2029)",
    parseWireLobbyState,
    {
      ...teamLobbyState,
      teamLobby: { stage: "claim", secondsLeft: 41, sides: [{ ...teamSide, size: null }, null] },
    },
  ],
  [
    "Team Lobby lobby-state in its vote, with the house team chosen (#1458)",
    parseWireLobbyState,
    {
      ...teamLobbyState,
      teamLobby: {
        stage: "vote",
        secondsLeft: 0,
        sides: [
          { ...teamSide, proposals: [], chosen: null, claims: [] },
          {
            ...teamSide,
            captainId: null,
            chosen: { ...teamSide.chosen, proposerId: null, reason: "house" },
          },
        ],
      },
    },
  ],
  [
    "propose a slot (#1458)",
    parseWireLobbyCommand,
    { kind: "propose", slot: 1, size: 2, build: { name: "Devona" } },
  ],
  ["withdraw a proposal (#1458)", parseWireLobbyCommand, { kind: "propose", slot: null }],
  ["vote (#1458)", parseWireLobbyCommand, { kind: "vote", proposerId: "peer-2" }],
  ["withdraw a vote (#1458)", parseWireLobbyCommand, { kind: "vote", proposerId: null }],
  ["claim (#1458)", parseWireLobbyCommand, { kind: "claim", slot: 1 }],
  ["let a claim go (#1458)", parseWireLobbyCommand, { kind: "claim", slot: null }],
  [
    "a team plan's human seat (ADR-0042)",
    parseWireLobbyCommand,
    { kind: "team-plan", slot: 0, size: 4, memberKey: "ab".repeat(32), build: { name: "Devona" } },
  ],
  [
    "a team plan's bot seat (ADR-0042)",
    parseWireLobbyCommand,
    { kind: "team-plan", slot: 7, size: 8, memberKey: null, build: { name: "Mhenlo" } },
  ],
  [
    "a party of eight, an 8v8 side (ADR-0042)",
    parseWirePartyFormed,
    partyOf(["1", "2", "3", "4", "5", "6", "7", "8"].map((digit) => digit.repeat(64))),
  ],
  ["Team Lobby refusal (#1458)", parseWireLobbyNote, { kind: "refused", reason: "slot-taken" }],
  ["start-rejected", parseWireLobbyNote, { kind: "start-rejected", reason: "nobody is ready" }],
  ["lobby refusal", parseWireLobbyNote, { kind: "refused", reason: "lobby-full" }],
  ["fell-through (#871)", parseWireLobbyNote, { kind: "refused", reason: "fell-through" }],
  [
    "match-start",
    parseWireMatchStart,
    { mapId: "isle", matchId: "match-2", teamPlanRejected: false },
  ],
  [
    "a proposal's builds, a whole side (#1811)",
    parseWireTeamProposalBuilds,
    { proposerId: "peer-1", builds: Array.from({ length: 8 }, () => proposalBuild) },
  ],
];

const long = "x".repeat(MAX_WIRE_STRING + 1);

/** One malformed message per rule. */
const MALFORMED: readonly [string, (value: unknown) => unknown, unknown][] = [
  [
    "a proposal's builds past a side (#1811)",
    parseWireTeamProposalBuilds,
    { proposerId: "peer-1", builds: Array.from({ length: 9 }, () => proposalBuild) },
  ],
  [
    "a proposal's build of seven skills (#1811)",
    parseWireTeamProposalBuilds,
    { proposerId: "peer-1", builds: [{ ...proposalBuild, skills: proposalBuild.skills.slice(1) }] },
  ],
  [
    "a proposal's build with a number for a weapon (#1811)",
    parseWireTeamProposalBuilds,
    { proposerId: "peer-1", builds: [{ ...proposalBuild, mainHand: 1 }] },
  ],
  ["a proposal's builds with no proposer (#1811)", parseWireTeamProposalBuilds, { builds: [] }],
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
  ["traps without a list (#1105)", parseWireTraps, {}],
  [
    "one trap too many (#1105)",
    parseWireTraps,
    { traps: Array.from({ length: MAX_WIRE_GROUND_EFFECTS + 1 }, () => trap) },
  ],
  ["a trap of no radius (#1105)", parseWireTraps, { traps: [{ ...trap, radius: 0 }] }],
  ["a trap with no skill (#1105)", parseWireTraps, { traps: [{ ...trap, skillId: 3 }] }],
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

  ["chat on a guild channel (#479)", parsePeerChat, { channel: "guild", text: "hi" }],
  ["chat without text (#479)", parsePeerChat, { channel: "all" }],
  ["chat with numeric text (#479)", parsePeerChat, { channel: "all", text: 7 }],
  [
    "chat past the wire's bound (#479)",
    parsePeerChat,
    { channel: "all", text: "x".repeat(MAX_WIRE_CHAT_TEXT + 1) },
  ],
  ["chat-line on team 2 (#479)", parseWireChatLine, { ...chatLine, team: 2 }],
  ["chat-line without a sender (#479)", parseWireChatLine, { ...chatLine, fromId: undefined }],
  ["chat-line with a long name (#479)", parseWireChatLine, { ...chatLine, name: long }],
  [
    "chat-line past the wire's bound (#479)",
    parseWireChatLine,
    { ...chatLine, text: "x".repeat(MAX_WIRE_CHAT_TEXT + 1) },
  ],

  ["not an object", parsePeerHello, "hello"],
  ["an array", parsePeerHello, [hello]],
  ["null", parseWireSnapshotPart, null],
  ["hello without a name", parsePeerHello, { ...hello, name: undefined }],
  ["hello without a guild tag (#1406)", parsePeerHello, { ...hello, guildTag: undefined }],
  ["hello with a numeric guild tag (#1406)", parsePeerHello, { ...hello, guildTag: 7 }],
  [
    "lobby-join without a guild tag (#1406)",
    parsePeerLobbyJoin,
    { ...lobbyJoin, guildTag: undefined },
  ],
  [
    "snapshot of a player without a guild tag (#1406)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, guildTag: undefined }] },
  ],
  [
    "snapshot of a player without a guild cape (#1422)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, guildCape: undefined }] },
  ],
  [
    "snapshot of a player in a cape of no such colour (#1422)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, guildCape: { ...CAPE, main: "red" } }] },
  ],
  [
    "lobby-state of a member in a cape of no such emblem (#1422)",
    parseWireLobbyState,
    {
      ...lobbyState,
      players: lobbyState.players.map((member) => ({
        ...member,
        guildCape: { ...CAPE, emblem: "skull" },
      })),
    },
  ],
  [
    "summary row without a guild tag (#1406)",
    parseWireEnded,
    { ...ended, summary: [{ ...summaryRow, guildTag: undefined }] },
  ],
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
  ["key challenge with a short nonce", parseWireKeyChallenge, { nonce: "0f" }],
  ["key challenge with a long nonce", parseWireKeyChallenge, { nonce: `${TOKEN}0` }],
  ["key challenge without a nonce", parseWireKeyChallenge, {}],
  ["key proof with a short nonce", parseWireKeyProof, { ...keyProof, nonce: "0f" }],
  [
    "key proof with an uppercase nonce",
    parseWireKeyProof,
    { ...keyProof, nonce: TOKEN.toUpperCase() },
  ],
  ["key proof with a short mac", parseWireKeyProof, { ...keyProof, mac: TOKEN }],
  ["key proof with a long mac", parseWireKeyProof, { ...keyProof, mac: `${keyProof.mac}b` }],
  ["key proof without a mac", parseWireKeyProof, { nonce: TOKEN }],
  ["key proven with a short mac", parseWireKeyProven, { mac: TOKEN }],
  ["key proven with an uppercase mac", parseWireKeyProven, { mac: keyProof.mac.toUpperCase() }],
  ["key proven with a numeric mac", parseWireKeyProven, { mac: 7 }],
  ["welcome without a rejoin token", parsePeerWelcome, { ...welcome, rejoinToken: undefined }],
  ["welcome with a zero tick", parsePeerWelcome, { ...welcome, tickIntervalMs: 0 }],
  ["welcome with an infinite tick", parsePeerWelcome, { ...welcome, tickIntervalMs: Infinity }],
  ["welcome without a map", parsePeerWelcome, { ...welcome, map: null }],
  ["welcome without a time limit", parsePeerWelcome, { ...welcome, timeLimitSeconds: undefined }],
  ["welcome with a zero time limit", parsePeerWelcome, { ...welcome, timeLimitSeconds: 0 }],
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
  ["observe without a match", parsePeerObserve, { protocolVersion: PROTOCOL_VERSION }],
  ["observe with a long match id", parsePeerObserve, { ...observe, matchId: long }],
  ["observe with a numeric version", parsePeerObserve, { ...observe, protocolVersion: 2 }],
  ["observing without a map", parsePeerObserving, { ...observing, map: null }],
  ["observing with a zero tick", parsePeerObserving, { ...observing, tickIntervalMs: 0 }],
  ["observing with a negative delay", parsePeerObserving, { ...observing, delaySeconds: -1 }],
  ["observing without a delay", parsePeerObserving, { ...observing, delaySeconds: undefined }],
  ["observing with a zero time limit", parsePeerObserving, { ...observing, timeLimitSeconds: 0 }],
  [
    "refuse with a long message",
    parsePeerRefuse,
    { ...refuse, message: "x".repeat(MAX_WIRE_TEXT + 1) },
  ],
  ["snapshot without parts (#662)", parseWireSnapshotPart, { ...snapshot, parts: undefined }],
  ["snapshot without flags (#1225)", parseWireSnapshotPart, { ...snapshot, flags: undefined }],
  ["snapshot without a stand (#1225)", parseWireSnapshotPart, { ...snapshot, stand: undefined }],
  [
    "snapshot without aggression (#1226)",
    parseWireSnapshotPart,
    { ...snapshot, aggression: undefined },
  ],
  [
    "snapshot with three teams' aggression (#1226)",
    parseWireSnapshotPart,
    { ...flagged, aggression: [1, 2, 3] },
  ],
  [
    "snapshot with negative aggression (#1226)",
    parseWireSnapshotPart,
    { ...flagged, aggression: [-1, 0] },
  ],
  [
    "snapshot with three flags (#1225)",
    parseWireSnapshotPart,
    { ...flagged, flags: [...flagged.flags, ...flagged.flags.slice(1)] },
  ],
  [
    "snapshot with a carried flag and no carrier (#1225)",
    parseWireSnapshotPart,
    { ...flagged, flags: [{ team: 0, place: "carried", carrierId: null, x: null, y: null }] },
  ],
  [
    "snapshot with a flag on the ground nowhere (#1225)",
    parseWireSnapshotPart,
    { ...flagged, flags: [{ team: 1, place: "ground", carrierId: null, x: null, y: 2 }] },
  ],
  [
    "snapshot with a flag at its spawn and a carrier (#1225)",
    parseWireSnapshotPart,
    { ...flagged, flags: [{ team: 1, place: "spawn", carrierId: "peer-1", x: null, y: null }] },
  ],
  [
    "snapshot with a flag of team 2 (#1225)",
    parseWireSnapshotPart,
    { ...flagged, flags: [{ team: 2, place: "spawn", carrierId: null, x: null, y: null }] },
  ],
  [
    "snapshot with a stand held for negative time (#1225)",
    parseWireSnapshotPart,
    { ...flagged, stand: { holder: 0, heldSeconds: -1 } },
  ],
  ["snapshot without relics (#1374)", parseWireSnapshotPart, { ...snapshot, relics: undefined }],
  ["snapshot without an altar (#1374)", parseWireSnapshotPart, { ...snapshot, altar: undefined }],
  [
    "snapshot without capture points (#1378)",
    parseWireSnapshotPart,
    { ...snapshot, capturePoints: undefined },
  ],
  [
    "snapshot with a capture point past full (#1378)",
    parseWireSnapshotPart,
    { ...shrined, capturePoints: [{ x: 1, y: 1, owner: 0, capturer: 0, progress: 1.5 }] },
  ],
  [
    "snapshot with a capture point of a third team (#1378)",
    parseWireSnapshotPart,
    { ...shrined, capturePoints: [{ x: 1, y: 1, owner: 2, capturer: 2, progress: 1 }] },
  ],
  [
    "snapshot with six capture points (#1378)",
    parseWireSnapshotPart,
    {
      ...shrined,
      capturePoints: Array.from({ length: 6 }, () => ({
        x: 1,
        y: 1,
        owner: null,
        capturer: null,
        progress: 0,
      })),
    },
  ],
  [
    "snapshot with a relic on the stand (#1374)",
    parseWireSnapshotPart,
    { ...relicked, relics: [{ team: 0, place: "stand", carrierId: null, x: null, y: null }] },
  ],
  [
    "snapshot with a relic on the ground nowhere (#1374)",
    parseWireSnapshotPart,
    { ...relicked, relics: [{ team: 1, place: "ground", carrierId: null, x: 1, y: null }] },
  ],
  [
    "snapshot with an altar nowhere (#1374)",
    parseWireSnapshotPart,
    { ...relicked, altar: { x: 1100 } },
  ],
  [
    "snapshot without an altar holder (#1377)",
    parseWireSnapshotPart,
    { ...hill, altarHolder: undefined },
  ],
  [
    "snapshot with an altar held by team 2 (#1377)",
    parseWireSnapshotPart,
    { ...hill, altarHolder: 2 },
  ],
  [
    "snapshot with an altar held for negative seconds (#1377)",
    parseWireSnapshotPart,
    { ...hill, altarHeldSeconds: -1 },
  ],
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
    { ...snapshot, players: Array.from({ length: MAX_WIRE_ACTORS + 1 }, () => player) },
  ],
  [
    "snapshot with a creature of an unknown kind",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [{ ...minion, creature: { ownerId: "peer-1", kind: "golem", mode: null } }],
    },
  ],
  [
    "snapshot with a creature whose owner is neither a peer nor null (#1186)",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [{ ...minion, creature: { ...minion.creature, ownerId: 7 } }],
    },
  ],
  [
    "snapshot with a pet in an unknown mode (#1110)",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [{ ...minion, creature: { ownerId: "peer-1", kind: "pet", mode: "sit" } }],
    },
  ],
  [
    "snapshot with a creature that does not say its mode (#1110)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...minion, creature: { ownerId: "peer-1", kind: "pet" } }] },
  ],
  [
    "snapshot with a creature of an unknown look (#1162)",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [{ ...minion, creature: { ownerId: "peer-1", kind: "minion", look: "golem" } }],
    },
  ],
  [
    "snapshot with a creature that does not say how it looks (#1162)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...minion, creature: { ownerId: "peer-1", kind: "minion" } }] },
  ],
  [
    "snapshot with a creature that does not say whether its next blow is armed (#1167)",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [{ ...minion, creature: { ...minion.creature, armedAttack: undefined } }],
    },
  ],
  [
    "snapshot with an armed attack that never lapses (#1167)",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [
        {
          ...minion,
          creature: {
            ...minion.creature,
            armedAttack: { skillId: "ranger.brutal-strike", endsAt: Number.POSITIVE_INFINITY },
            leaderId: null,
          },
        },
      ],
    },
  ],
  [
    "snapshot with an armed attack of no skill (#1167)",
    parseWireSnapshotPart,
    {
      ...snapshot,
      players: [{ ...minion, creature: { ...minion.creature, armedAttack: { endsAt: 12.1 } } }],
    },
  ],
  [
    "snapshot with a creature with no owner",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...minion, creature: { kind: "minion", mode: null } }] },
  ],
  [
    "snapshot with a player that does not say whether it is a creature",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, creature: undefined }] },
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
    "snapshot with a living player whose corpse was exploited (#466)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, dead: false, corpseExploited: true }] },
  ],
  [
    "snapshot with a player that does not say whether its corpse was exploited (#466)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, corpseExploited: undefined }] },
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
      // Both times or neither (#837): one alone is malformed.
      ["endsAt", null],
      ["durationSeconds", null],
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
  [
    "snapshot with a player not saying whether it is a bot (#1193)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, bot: undefined }] },
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
  ...[undefined, 2.5, MAX_WIRE_MORALE + 1, MIN_WIRE_MORALE - 1, "-15"].map(
    (value): [string, (value: unknown) => unknown, unknown] => [
      `snapshot with a player's morale ${String(value)} (#843)`,
      parseWireSnapshotPart,
      { ...snapshot, players: [{ ...player, morale: value }] },
    ],
  ),
  [
    "snapshot with a player missing knockdownRemaining (#545)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, knockdownRemaining: undefined }] },
  ],
  [
    "snapshot with a player missing invulnerableSeconds (#1233)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, invulnerableSeconds: undefined }] },
  ],
  [
    "snapshot with a player missing overcast (#461)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, overcast: undefined }] },
  ],
  [
    "snapshot with a string for a player's overcast (#461)",
    parseWireSnapshotPart,
    { ...snapshot, players: [{ ...player, overcast: "5" }] },
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
  [
    "snapshot without ground effects",
    parseWireSnapshotPart,
    { ...snapshot, groundEffects: undefined },
  ],
  [
    "snapshot with too many ground effects",
    parseWireSnapshotPart,
    {
      ...snapshot,
      groundEffects: Array.from(
        { length: MAX_WIRE_GROUND_EFFECTS + 1 },
        () => snapshot.groundEffects[0],
      ),
    },
  ],
  [
    "snapshot with a ground effect of no radius",
    parseWireSnapshotPart,
    { ...snapshot, groundEffects: [{ ...snapshot.groundEffects[0], radius: 0 }] },
  ],
  [
    "snapshot with a ground effect wider than any area",
    parseWireSnapshotPart,
    { ...snapshot, groundEffects: [{ ...snapshot.groundEffects[0], radius: MAX_WIRE_RADIUS + 1 }] },
  ],
  [
    "snapshot with a ground effect on a third team",
    parseWireSnapshotPart,
    { ...snapshot, groundEffects: [{ ...snapshot.groundEffects[0], team: 2 }] },
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
    "weapon-sets with three sets",
    parseWireWeaponSets,
    { ...weaponSets, sets: weaponSets.sets.slice(0, 3) },
  ],
  [
    "weapon-sets with five sets",
    parseWireWeaponSets,
    { ...weaponSets, sets: [...weaponSets.sets, null] },
  ],
  [
    "weapon-sets with set 1 empty",
    parseWireWeaponSets,
    { ...weaponSets, sets: [null, ...weaponSets.sets.slice(1)] },
  ],
  ["weapon-sets active on an empty set", parseWireWeaponSets, { ...weaponSets, active: 2 }],
  ["weapon-sets queued on an empty set", parseWireWeaponSets, { ...weaponSets, pending: 3 }],
  ["weapon-sets active past set 4", parseWireWeaponSets, { ...weaponSets, active: 4 }],
  [
    "weapon-sets with a numeric weapon",
    parseWireWeaponSets,
    { ...weaponSets, sets: [{ weaponId: 1, offhandId: null }, null, null, null] },
  ],
  ["weapon-sets without a pending", parseWireWeaponSets, { sets: weaponSets.sets, active: 0 }],
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
  [
    "skill bar slot with a copy ending at no number (#1154)",
    parseWireSkillBar,
    { slots: [{ ...skillBar.slots[0], copyEndsAt: "32.4" }], ranks: skillBar.ranks },
  ],
  [
    "skill bar slot without copyEndsAt (#1154)",
    parseWireSkillBar,
    { slots: [{ ...skillBar.slots[0], copyEndsAt: undefined }], ranks: skillBar.ranks },
  ],
  ["skill bar without ranks", parseWireSkillBar, { slots: skillBar.slots }],
  [
    "skill bar with a fractional rank",
    parseWireSkillBar,
    { ...skillBar, ranks: { "monk.healing-prayers": 11.5 } },
  ],
  [
    "skill bar at rank 17, past the most runes and headgear give",
    parseWireSkillBar,
    { ...skillBar, ranks: { "monk.healing-prayers": 17 } },
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
  ["ended without a winner", parseWireEnded, { endReason: "score", summary: [] }],
  ["ended without a summary", parseWireEnded, { winningTeam: null, endReason: "time" }],
  [
    "ended with a summary past the cap",
    parseWireEnded,
    { ...ended, summary: Array.from({ length: MAX_LOBBY_PLAYERS + 1 }, () => summaryRow) },
  ],
  [
    "ended with a negative tally",
    parseWireEnded,
    { ...ended, summary: [{ ...summaryRow, damage: -1 }] },
  ],
  [
    "ended with a fractional tally",
    parseWireEnded,
    { ...ended, summary: [{ ...summaryRow, kills: 1.5 }] },
  ],
  [
    "ended with a row on team 2",
    parseWireEnded,
    { ...ended, summary: [{ ...summaryRow, team: 2 }] },
  ],
  [
    "ended with a row missing a column",
    parseWireEnded,
    { ...ended, summary: [{ ...summaryRow, interrupts: undefined }] },
  ],
  ["refused with a negative slot", parseCastRefused, { ...refused, slot: -1 }],
  ["refused past the last slot", parseCastRefused, { ...refused, slot: MAX_WIRE_SLOTS }],
  [
    "recharge past the last slot",
    parseRecharge,
    { ...recharge, slots: [{ slot: MAX_WIRE_SLOTS, remainingSeconds: 1, totalSeconds: 5 }] },
  ],
  ["recharge spent past the last slot", parseRecharge, { ...recharge, spent: [MAX_WIRE_SLOTS] }],
  ["recharge spent not a slot", parseRecharge, { ...recharge, spent: ["0"] }],
  ["recharge with no spent list", parseRecharge, { slots: recharge.slots, queued: null }],
  ["recharge with no queued slot", parseRecharge, { slots: recharge.slots, spent: [] }],
  ["recharge queued past the last slot", parseRecharge, { ...recharge, queued: MAX_WIRE_SLOTS }],
  ["refused of an unknown kind", parseCastRefused, { kind: "move", reason: "stuck" }],
  ["adrenaline below 0", parseAdrenaline, { slots: [0, -25], lossInSeconds: null }],
  ["adrenaline lost in less than no time", parseAdrenaline, { slots: [25], lossInSeconds: -1 }],
  ["adrenaline with no loss time", parseAdrenaline, { slots: [25] }],
  ["adrenaline not a number", parseAdrenaline, { slots: ["25"] }],
  ["adrenaline past the last slot", parseAdrenaline, { slots: Array.from({ length: 9 }, () => 0) }],
  ["adrenaline with no slots", parseAdrenaline, {}],
  [
    "chain of an unknown role",
    parseChainMarks,
    { marks: [{ targetId: "peer-2", role: "triple", remainingSeconds: 15 }] },
  ],
  [
    "chain lasting less than no time",
    parseChainMarks,
    { marks: [{ targetId: "peer-2", role: "lead", remainingSeconds: -1 }] },
  ],
  [
    "chain lasting NaN",
    parseChainMarks,
    { marks: [{ targetId: "peer-2", role: "lead", remainingSeconds: NaN }] },
  ],
  [
    "chain past MAX_LOBBY_PLAYERS",
    parseChainMarks,
    {
      marks: Array.from({ length: MAX_LOBBY_PLAYERS + 1 }, (_, i) => ({
        targetId: `peer-${String(i)}`,
        role: "lead",
        remainingSeconds: 15,
      })),
    },
  ],
  ["chain with no marks list", parseChainMarks, {}],
  [
    "recharge with a NaN",
    parseRecharge,
    { ...recharge, slots: [{ slot: 0, remainingSeconds: NaN, totalSeconds: 5 }] },
  ],
  ["lobby-join without a name", parsePeerLobbyJoin, { protocolVersion: PROTOCOL_VERSION }],
  [
    "lobby-join without an admission (#871)",
    parsePeerLobbyJoin,
    { ...lobbyJoin, admission: undefined },
  ],
  [
    "lobby-join with an upper-case ticket id (#871)",
    parsePeerLobbyJoin,
    { ...lobbyJoin, admission: { ...admission, seatKey: "AB".repeat(32) } },
  ],
  [
    "lobby-join with a short ticket id (#871)",
    parsePeerLobbyJoin,
    { ...lobbyJoin, admission: { ...admission, seatKey: "ab".repeat(31) } },
  ],
  [
    "lobby-join with a long admission signature (#871)",
    parsePeerLobbyJoin,
    { ...lobbyJoin, admission: { ...admission, admissionSig: "cd".repeat(65) } },
  ],
  [
    "lobby-join with an admission of no signature (#871)",
    parsePeerLobbyJoin,
    { ...lobbyJoin, admission: { seatKey: admission.seatKey } },
  ],
  ["lobby-hello with a field (#871)", parsePeerLobbyHello, { ticketId: "ab".repeat(32) }],
  ["lobby-leave with a field (#1764)", parsePeerLobbyLeave, { reason: "bye" }],
  ["lobby-welcome of no signature (#871)", parseWireLobbyWelcome, {}],
  ["stay-together of no key (#882)", parsePeerStayTogether, {}],
  ["stay-together of a short key (#882)", parsePeerStayTogether, { memberKey: "ab".repeat(31) }],
  [
    "stay-together of an upper-case key (#882)",
    parsePeerStayTogether,
    { memberKey: "AB".repeat(32) },
  ],
  ["party-proposal of one (#1078)", parseWirePartyProposal, proposalOf(["ab".repeat(32)])],
  [
    "party-proposal unsorted after its leader (#1078, #1766)",
    parseWirePartyProposal,
    proposalOf(["ab".repeat(32), "ef".repeat(32), "cd".repeat(32)]),
  ],
  [
    "party-proposal with no group (#1078)",
    parseWirePartyProposal,
    { members: ["ab".repeat(32), "cd".repeat(32)] },
  ],
  [
    "party-proposal with no mode (#1766)",
    parseWirePartyProposal,
    { groupId: "12".repeat(32), members: ["ab".repeat(32), "cd".repeat(32)] },
  ],
  [
    "party-proposal of an unknown mode (#1766)",
    parseWirePartyProposal,
    { ...proposalOf(["ab".repeat(32), "cd".repeat(32)]), mode: "solo-arena" },
  ],
  ["party-consent with no consent (#1078)", parsePeerPartyConsent, { memberKey: "ab".repeat(32) }],
  [
    "party-consent with a short consent (#1078)",
    parsePeerPartyConsent,
    { ...partyConsent, consent: "ef".repeat(63) },
  ],
  [
    "party-consent of a non-hex key (#1078)",
    parsePeerPartyConsent,
    { ...partyConsent, memberKey: "zz".repeat(32) },
  ],
  ["party-formed of one (#882)", parseWirePartyFormed, partyOf(["ab".repeat(32)])],
  [
    "party-formed unsorted after its leader (#882, #1766)",
    parseWirePartyFormed,
    partyOf(["ab".repeat(32), "ef".repeat(32), "cd".repeat(32)]),
  ],
  [
    "party-formed with its leader twice (#1766)",
    parseWirePartyFormed,
    partyOf(["cd".repeat(32), "ab".repeat(32), "cd".repeat(32)]),
  ],
  [
    "party-formed with a key twice (#882)",
    parseWirePartyFormed,
    partyOf(["ab".repeat(32), "ab".repeat(32)]),
  ],
  [
    "party-formed of a non-hex key (#882)",
    parseWirePartyFormed,
    partyOf(["ab".repeat(32), "zz".repeat(32)]),
  ],
  [
    "party-formed with a consent too few (#1078)",
    parseWirePartyFormed,
    { ...partyOf(["ab".repeat(32), "cd".repeat(32)]), consents: ["ef".repeat(64)] },
  ],
  [
    "party-formed with a non-hex consent (#1078)",
    parseWirePartyFormed,
    {
      ...partyOf(["ab".repeat(32), "cd".repeat(32)]),
      consents: ["ef".repeat(64), "zz".repeat(64)],
    },
  ],
  [
    "party-formed with no group (#1078)",
    parseWirePartyFormed,
    { members: ["ab".repeat(32), "cd".repeat(32)], consents: ["ef".repeat(64), "ef".repeat(64)] },
  ],
  ["party-split with a field (#882)", parseWirePartySplit, { members: [] }],
  ["lobby-move with a dashed key (#1553)", parseWireLobbyMove, { code: "ACDE-FGHJ-KMNP" }],
  ["lobby-move with a short key (#1553)", parseWireLobbyMove, { code: "ACDEFGHJKMN" }],
  ["lobby-move with a number (#1553)", parseWireLobbyMove, { code: 7 }],
  ["lobby-move with a field more (#1553)", parseWireLobbyMove, { code: "ACDEFGHJKMNP", to: "x" }],
  [
    "lobby-welcome of a non-hex signature (#871)",
    parseWireLobbyWelcome,
    { hostSig: "zz".repeat(64) },
  ],
  [
    "lobby-state without a countdown (#871)",
    parseWireLobbyState,
    { ...lobbyState, countdownSeconds: undefined },
  ],
  ["lobby-state without open (#1682)", parseWireLobbyState, { ...lobbyState, open: undefined }],
  ["lobby-state open as a string (#1682)", parseWireLobbyState, { ...lobbyState, open: "yes" }],
  [
    "lobby-state counting down a fraction (#871)",
    parseWireLobbyState,
    { ...lobbyState, countdownSeconds: 2.5 },
  ],
  [
    "lobby-state counting below zero (#871)",
    parseWireLobbyState,
    { ...lobbyState, countdownSeconds: -1 },
  ],
  ["lobby-state of an unknown phase", parseWireLobbyState, { ...lobbyState, phase: "over" }],
  [
    "lobby-state without a queue nonce (#1766)",
    parseWireLobbyState,
    { ...lobbyState, queueNonce: undefined },
  ],
  [
    "lobby-state of a short queue nonce (#1766)",
    parseWireLobbyState,
    { ...lobbyState, queueNonce: "ab" },
  ],
  [
    "lobby-state of an unknown mode (#1526)",
    parseWireLobbyState,
    { ...lobbyState, mode: "ranked" },
  ],
  ["lobby-state without a mode (#1526)", parseWireLobbyState, { ...lobbyState, mode: undefined }],
  ["lobby-state without a host", parseWireLobbyState, { ...lobbyState, hostId: undefined }],
  ["lobby-state with a long code", parseWireLobbyState, { ...lobbyState, code: long }],
  [
    "lobby-state with a third team",
    parseWireLobbyState,
    { ...lobbyState, players: [{ ...lobbyState.players[0], team: 2 }] },
  ],
  [
    "lobby-state with a bot of a string (#1193)",
    parseWireLobbyState,
    { ...lobbyState, players: [{ ...lobbyState.players[2], bot: "true" }] },
  ],
  [
    "lobby-state with a member of no away (#1764)",
    parseWireLobbyState,
    { ...lobbyState, players: [{ ...lobbyState.players[2], away: undefined }] },
  ],
  [
    "lobby-state past MAX_LOBBY_PLAYERS",
    parseWireLobbyState,
    {
      ...lobbyState,
      players: Array.from({ length: MAX_LOBBY_PLAYERS + 1 }, () => lobbyState.players[1]),
    },
  ],
  [
    "lobby-state without teamLobby (#1458)",
    parseWireLobbyState,
    { ...lobbyState, teamLobby: undefined },
  ],
  [
    "Team Lobby of an unknown stage (#1458)",
    parseWireLobbyState,
    { ...teamLobbyState, teamLobby: { stage: "pick", secondsLeft: 1, sides: [null, null] } },
  ],
  [
    "Team Lobby of one side (#1458)",
    parseWireLobbyState,
    { ...teamLobbyState, teamLobby: { stage: "vote", secondsLeft: 1, sides: [null] } },
  ],
  [
    "Team Lobby side past MAX_TEAM_LOBBY_SIDE (#1458)",
    parseWireLobbyState,
    {
      ...teamLobbyState,
      teamLobby: {
        stage: "vote",
        secondsLeft: 1,
        sides: [{ ...teamSide, size: MAX_TEAM_LOBBY_SIDE + 1 }, null],
      },
    },
  ],
  [
    "Team Lobby claims past the side's size (#1458)",
    parseWireLobbyState,
    {
      ...teamLobbyState,
      teamLobby: {
        stage: "claim",
        secondsLeft: 1,
        sides: [{ ...teamSide, claims: [null, null, null] }, null],
      },
    },
  ],
  [
    "Team Lobby proposals past MAX_TEAM_LOBBY_SIDE (#1458)",
    parseWireLobbyState,
    {
      ...teamLobbyState,
      teamLobby: {
        stage: "vote",
        secondsLeft: 1,
        sides: [
          {
            ...teamSide,
            proposals: Array.from({ length: MAX_TEAM_LOBBY_SIDE + 1 }, () => teamSide.proposals[0]),
          },
          null,
        ],
      },
    },
  ],
  [
    "Team Lobby choice of an unknown reason (#1458)",
    parseWireLobbyState,
    {
      ...teamLobbyState,
      teamLobby: {
        stage: "claim",
        secondsLeft: 1,
        sides: [{ ...teamSide, chosen: { ...teamSide.chosen, reason: "coin" } }, null],
      },
    },
  ],
  [
    "propose past MAX_TEAM_LOBBY_SIDE (#1458)",
    parseWireLobbyCommand,
    { kind: "propose", slot: 0, size: MAX_TEAM_LOBBY_SIDE + 1, build: {} },
  ],
  [
    "propose a slot past its size (#1458)",
    parseWireLobbyCommand,
    { kind: "propose", slot: 2, size: 2, build: {} },
  ],
  [
    "propose a fractional slot (#1458)",
    parseWireLobbyCommand,
    { kind: "propose", slot: 0.5, size: 2, build: {} },
  ],
  [
    "propose of a non-JSON build (#1458)",
    parseWireLobbyCommand,
    { kind: "propose", slot: 0, size: 1, build: Number.NaN },
  ],
  ["propose without a slot (#1458)", parseWireLobbyCommand, { kind: "propose" }],
  [
    "a team plan past MAX_TEAM_LOBBY_SIDE (ADR-0042)",
    parseWireLobbyCommand,
    { kind: "team-plan", slot: 0, size: MAX_TEAM_LOBBY_SIDE + 1, memberKey: null, build: {} },
  ],
  [
    "a team plan's slot past its size (ADR-0042)",
    parseWireLobbyCommand,
    { kind: "team-plan", slot: 4, size: 4, memberKey: null, build: {} },
  ],
  [
    "a team plan's member that is no key (ADR-0042)",
    parseWireLobbyCommand,
    { kind: "team-plan", slot: 0, size: 4, memberKey: "peer-2", build: {} },
  ],
  [
    "a team plan with no member (ADR-0042)",
    parseWireLobbyCommand,
    { kind: "team-plan", slot: 0, size: 4, build: {} },
  ],
  [
    "a team plan of a non-JSON build (ADR-0042)",
    parseWireLobbyCommand,
    { kind: "team-plan", slot: 0, size: 4, memberKey: null, build: Number.NaN },
  ],
  [
    "a party of nine (ADR-0042)",
    parseWirePartyFormed,
    partyOf(["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => digit.repeat(64))),
  ],
  ["propose without a build (#1458)", parseWireLobbyCommand, { kind: "propose", slot: 0, size: 1 }],
  ["vote of a number (#1458)", parseWireLobbyCommand, { kind: "vote", proposerId: 2 }],
  ["claim of a string (#1458)", parseWireLobbyCommand, { kind: "claim", slot: "1" }],
  ["claim of NaN (#1458)", parseWireLobbyCommand, { kind: "claim", slot: Number.NaN }],
  ["choose-team without a team", parseWireLobbyCommand, { kind: "choose-team" }],
  ["choose-team of a string", parseWireLobbyCommand, { kind: "choose-team", team: "0" }],
  ["ready of a string", parseWireLobbyCommand, { kind: "ready", ready: "true" }],
  ["select-map with a long id", parseWireLobbyCommand, { kind: "select-map", mapId: long }],
  [
    "select-mode of an unknown mode (#1526)",
    parseWireLobbyCommand,
    { kind: "select-mode", mode: "ranked" },
  ],
  [
    "set-character, which is gone (#2029)",
    parseWireLobbyCommand,
    { kind: "set-character", character: { name: "Mhenlo", primary: "monk", secondary: null } },
  ],
  [
    "add-bot, which is gone",
    parseWireLobbyCommand,
    { kind: "add-bot", team: 0, profession: "monk" },
  ],
  ["set-bots, which is gone (#2029)", parseWireLobbyCommand, { kind: "set-bots", team: 1, count: 3 }],
  ["a command of an unknown kind", parseWireLobbyCommand, { kind: "kick", id: "peer-2" }],
  ["a note of an unknown kind", parseWireLobbyNote, { kind: "kicked", reason: "x" }],
  [
    "a note with a long reason",
    parseWireLobbyNote,
    { kind: "start-rejected", reason: "x".repeat(MAX_WIRE_TEXT + 1) },
  ],
  ["match-start without a match", parseWireMatchStart, { mapId: "isle" }],
  [
    "match-start without teamPlanRejected",
    parseWireMatchStart,
    { mapId: "isle", matchId: "match-2" },
  ],
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

  it("cut a hello's and a lobby-join's guild tag to MAX_WIRE_TEXT (#1406)", () => {
    const long = "x".repeat(MAX_WIRE_TEXT + 5);
    expect(parsePeerHello({ ...hello, guildTag: long })?.guildTag).toHaveLength(MAX_WIRE_TEXT);
    expect(parsePeerLobbyJoin({ ...lobbyJoin, guildTag: long })?.guildTag).toHaveLength(
      MAX_WIRE_TEXT,
    );
  });

  it("read what a client sends that is no cape as none, never a refused join (#1422)", () => {
    for (const guildCape of [undefined, "violet", { ...CAPE, trim: "red" }, { ...CAPE, x: 1 }]) {
      expect(parsePeerHello({ ...hello, guildCape })?.guildCape).toBeNull();
      expect(parsePeerLobbyJoin({ ...lobbyJoin, guildCape })?.guildCape).toBeNull();
    }
  });

  it("cut a summary name to MAX_WIRE_TEXT (#1057)", () => {
    const long = { ...ended, summary: [{ ...summaryRow, name: "x".repeat(MAX_WIRE_TEXT + 5) }] };
    expect(parseWireEnded(long)?.summary[0]?.name).toHaveLength(MAX_WIRE_TEXT);
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
