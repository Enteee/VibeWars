/**
 * A P2P lobby in one process, for tests (#379): a `LobbyHost` over the
 * memory transport, its own player joined through `local`, and as many
 * remote members as a test joins. Matches are real `MatchHost`s on the
 * test arena unless a test hands in its own `startMatch`. No timers: a
 * test runs the lobby's match on with `step`.
 *
 * Not a test file itself (vitest runs `*.test.ts` only), and left out of
 * the build.
 */
import { ANNIHILATION_MATCH_RULES, type MatchRules } from "@vibewars/game-core";
import {
  parsePeerLobbyChallenge,
  type LobbyMode,
  type LobbyTeamSize,
  type WireCape,
} from "@vibewars/game-protocol";

import { keyGated } from "./key-gate.js";
import { joinLobby } from "./lobby-client.js";
import type { LobbyConnection, MatchStarting } from "./lobby-connection.js";
import {
  createLobbyHost,
  type LobbyHost,
  type LobbyMatchmakingOptions,
  type MatchPlan,
} from "./lobby-host.js";
import { connectMatch, type PeerMatchConnection } from "./match-client.js";
import { ARENA, TICK_SECONDS, hello, settle } from "./match-harness.test-support.js";
import { createMatchHost, type MatchHost } from "./match-host.js";
import { createMemoryNetwork, type MemoryNetwork } from "./memory-transport.js";
import type { PlayerKey } from "./player-key.js";
import { testPlayerKey, verifyTestProof } from "./player-key.test-support.js";
import type { Transport } from "./transport.js";

export const CODE = "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789-_aBcDE"; // pragma: allowlist secret

/**
 * What the test lobby's peers prove its key with (#1681): any bytes do,
 * so the 600 000-round derivation stays out of every lobby test.
 */
export const PROOF_KEY = new TextEncoder().encode("the test lobby's proof key");

/** The maps the test lobby offers; the first is its default. */
export const MAP_IDS = ["test-arena", "other-arena"] as const;

/** Each mode's maps (#1526): GvG plays only the other arena, the rest both. */
export const MODE_MAPS: Readonly<Record<LobbyMode, readonly string[]>> = {
  "random-arena": MAP_IDS,
  "team-arena": MAP_IDS,
  "heroes-ascent": MAP_IDS,
  gvg: ["other-arena"],
  "hosted-game": MAP_IDS,
};

/**
 * The team sizes each map suits (#2108): the other arena plays no 1v1,
 * so a Hosted Game's size can move it (#2104).
 */
export const MAP_TEAM_SIZES: Readonly<Record<string, readonly number[]>> = {
  "test-arena": [1, 2, 4, 8],
  "other-arena": [2, 4, 8],
};

/** One member: its lobby connection, the room it is in, and every match start it was handed. */
export interface Member {
  readonly connection: LobbyConnection;
  readonly transport: Transport;
  readonly starts: MatchStarting[];
}

export interface TestLobby {
  readonly network: MemoryNetwork;
  readonly lobby: LobbyHost;
  /** The host's own peer in the room, for a test to forge what the host says. */
  readonly room: Transport;
  /** The host's own player. */
  readonly host: Member;
  /** Each match the lobby started, with the plan it was started on. */
  readonly matches: { readonly plan: MatchPlan; readonly host: MatchHost }[];
  /** A remote member joining as `name`; resolves once it is in. */
  join(
    name?: string,
    guildTag?: string | null,
    guildCape?: WireCape | null,
    /** Its page's relay key (#2529): none by default. */
    relayPub?: string | null,
    /** Its player key (#2706): a fresh one by default. */
    playerKey?: PlayerKey,
  ): Promise<Member>;
  /** Run `seconds` of the lobby's match, a tick at a time, letting messages land between. */
  step(seconds: number): Promise<void>;
}

function member(connection: LobbyConnection, transport: Transport): Member {
  const starts: MatchStarting[] = [];
  connection.onMatchStarting((start) => starts.push(start));
  return { connection, transport, starts };
}

export async function openLobby(
  options: {
    /** One set of rules for every match, or the rules of the `n`th, from 0. */
    matchRules?: MatchRules | ((n: number) => MatchRules);
    /** A match of its own, or `undefined` for the default one. */
    startMatch?: (plan: MatchPlan) => MatchHost | undefined;
    /** Hosted from Team Play (#1458). */
    teamLobby?: boolean;
    /** The lobby's RNG: a fixed sequence by default. */
    random?: () => number;
    /** Opened for joins (#1682), as most tests want; a lobby starts closed. */
    open?: boolean;
    /** A party that may queue in a team mode (#1766); every member is told its room id. */
    matchmaking?: LobbyMatchmakingOptions;
    /** A Hosted Game's team size to begin with (#2104): 4v4 by default. */
    hostedTeamSize?: LobbyTeamSize;
  } = {},
): Promise<TestLobby> {
  const network = createMemoryNetwork();
  const matches: { plan: MatchPlan; host: MatchHost }[] = [];
  let draws = 0;
  const room = network.join("host");
  const lobby = createLobbyHost({
    transport: room,
    code: CODE,
    proofKey: PROOF_KEY,
    mapIds: MAP_IDS,
    modeMaps: MODE_MAPS,
    mapTeamSizes: MAP_TEAM_SIZES,
    hostedTeamSize: options.hostedTeamSize ?? 4,
    teamLobby: options.teamLobby ?? false,
    ...(options.matchmaking === undefined ? {} : { matchmaking: options.matchmaking }),
    random: options.random ?? (() => 0.5),
    verifyPlayerProof: verifyTestProof,
    startMatch(plan) {
      const host =
        options.startMatch?.(plan) ??
        createMatchHost({
          transport: plan.transport,
          map: ARENA,
          seed: plan.matchId,
          matchRules:
            typeof options.matchRules === "function"
              ? options.matchRules(matches.length)
              : (options.matchRules ?? ANNIHILATION_MATCH_RULES),
          random: () => ((draws += 1) * 0.6180339887) % 1,
          maxPlayers: 8,
          seats: plan.seats,
          matchId: plan.matchId,
          isSpectator: plan.isSpectator,
          mode: plan.mode,
          publishRecord: () => undefined,
          nowSeconds: () => 0,
        });
      matches.push({ plan, host });
      return host;
    },
  });
  const join = async (
    transport: Transport,
    proofKey: Uint8Array | null,
    name: string,
    guildTag: string | null,
    guildCape: WireCape | null,
    relayPub: string | null,
    playerKey: PlayerKey,
  ): Promise<Member> =>
    member(
      await joinLobby({
        transport,
        code: CODE,
        proofKey,
        name,
        guildTag,
        guildCape,
        timeoutMs: 1000,
        relayPub,
        playerKey,
        ...(options.matchmaking === undefined ? {} : { roomId: options.matchmaking.roomId }),
      }),
      transport,
    );
  const host = await join(lobby.local, null, "Host", null, null, null, testPlayerKey());
  lobby.setOpen(options.open ?? true);
  return {
    network,
    lobby,
    room,
    host,
    matches,
    join: (
      name = "Guest",
      guildTag = null,
      guildCape = null,
      relayPub = null,
      playerKey = testPlayerKey(),
    ) => join(network.join(), PROOF_KEY, name, guildTag, guildCape, relayPub, playerKey),
    async step(seconds) {
      const ticks = Math.round(seconds / TICK_SECONDS);
      for (let i = 0; i < ticks; i += 1) {
        lobby.advance(TICK_SECONDS);
        await settle();
      }
    },
  };
}

/** The player key a hand-spoken `lobby-join` carries (#2706): `provenPeer` proves it. */
export const WIRE_PLAYER_KEY = testPlayerKey();

/**
 * Answer every `lobby-challenge` `transport` gets with `key`'s proof
 * (#2706), as `joinLobby` does, and nothing else of it checked.
 */
export function answerChallenges(
  transport: Transport,
  key: PlayerKey = WIRE_PLAYER_KEY,
  roomId: string = CODE,
): void {
  transport.on("lobby-challenge", (data, from) => {
    const challenge = parsePeerLobbyChallenge(data);
    if (challenge !== undefined) {
      const fields = { hostPeerId: from, joinerPeerId: transport.selfId, roomId };
      const sig = key.signLobbyProof({ ...fields, nonce: challenge.nonce });
      transport.send("lobby-proof", { sig }, from);
    }
  });
}

/**
 * A peer in the room that holds the key (#1681) and has proven it to the
 * host, but has not joined the lobby: a test speaks the wire through it
 * by hand, and its joins prove `playerKey` (#2706), or, for `null`, are
 * left to the test to prove. Resolves once the host is proven to it.
 */
export async function provenPeer(
  lobby: TestLobby,
  peerId?: string,
  playerKey: PlayerKey | null = WIRE_PLAYER_KEY,
): Promise<Transport> {
  const transport = keyGated(lobby.network.join(peerId), PROOF_KEY, "guest");
  if (playerKey !== null) {
    answerChallenges(transport, playerKey);
  }
  await new Promise<void>((resolve) => {
    const off = transport.onPeerJoin((joined) => {
      if (joined === lobby.room.selfId) {
        off();
        resolve();
      }
    });
  });
  return transport;
}

/** The lobby as `who` sees it now. */
export function playersOf(who: Member): { name: string; team: 0 | 1 | null; ready: boolean }[] {
  return who.connection
    .getSnapshot()
    .players.map(({ name, team, ready }) => ({ name, team, ready }));
}

/** Put every member on `teams[i]`, ready those on a team, and let it land. */
export async function seat(
  members: readonly Member[],
  teams: readonly (0 | 1 | null)[],
): Promise<void> {
  members.forEach((who, i) => {
    who.connection.chooseTeam(teams[i] ?? null);
  });
  await settle();
  members.forEach((who, i) => {
    if (teams[i] !== null && teams[i] !== undefined) {
      who.connection.setReady(true);
    }
  });
  await settle();
}

/** Have the host start, and let every match start land. */
export async function start(lobby: TestLobby): Promise<void> {
  lobby.host.connection.startMatch();
  await settle();
}

/** Walk `who` into the latest match it was handed, as its own name says. */
export async function play(who: Member, name = "Whoever"): Promise<PeerMatchConnection> {
  const starting = who.starts.at(-1);
  if (starting === undefined) {
    throw new Error("this member was handed no match");
  }
  return connectMatch({
    transport: starting.transport,
    hostId: who.connection.getSnapshot().hostId,
    hello: hello({ name }),
    timeoutMs: 1000,
  });
}
