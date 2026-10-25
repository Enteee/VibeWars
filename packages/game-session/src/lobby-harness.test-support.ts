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
import { DEFAULT_MATCH_RULES, type MatchRules } from "@vibewars/game-core";

import { joinLobby } from "./lobby-client.js";
import type { LobbyConnection, MatchStarting } from "./lobby-connection.js";
import { createLobbyHost, type LobbyHost, type MatchPlan } from "./lobby-host.js";
import { connectMatch, type PeerMatchConnection } from "./match-client.js";
import { ARENA, TICK_SECONDS, hello, settle } from "./match-harness.test-support.js";
import { createMatchHost, type MatchHost } from "./match-host.js";
import { createMemoryNetwork, type MemoryNetwork } from "./memory-transport.js";
import type { Transport } from "./transport.js";

export const CODE = "ACDEFG";

/** The maps the test lobby offers; the first is its default. */
export const MAP_IDS = ["test-arena", "other-arena"] as const;

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
  join(name?: string): Promise<Member>;
  /** Run `seconds` of the lobby's match, a tick at a time, letting messages land between. */
  step(seconds: number): Promise<void>;
}

function member(connection: LobbyConnection, transport: Transport): Member {
  const starts: MatchStarting[] = [];
  connection.onMatchStarting((start) => starts.push(start));
  return { connection, transport, starts };
}

export async function openLobby(
  options: { matchRules?: MatchRules; startMatch?: (plan: MatchPlan) => MatchHost } = {},
): Promise<TestLobby> {
  const network = createMemoryNetwork();
  const matches: { plan: MatchPlan; host: MatchHost }[] = [];
  let draws = 0;
  const room = network.join("host");
  const lobby = createLobbyHost({
    transport: room,
    code: CODE,
    mapIds: MAP_IDS,
    startMatch(plan) {
      const host =
        options.startMatch?.(plan) ??
        createMatchHost({
          transport: plan.transport,
          map: ARENA,
          seed: plan.matchId,
          matchRules: options.matchRules ?? DEFAULT_MATCH_RULES,
          random: () => ((draws += 1) * 0.6180339887) % 1,
          maxPlayers: 8,
          seats: plan.seats,
        });
      matches.push({ plan, host });
      return host;
    },
  });
  const join = async (transport: Transport, name: string): Promise<Member> =>
    member(await joinLobby({ transport, code: CODE, name, timeoutMs: 1000 }), transport);
  const host = await join(lobby.local, "Host");
  return {
    network,
    lobby,
    room,
    host,
    matches,
    join: (name = "Guest") => join(network.join(), name),
    async step(seconds) {
      const ticks = Math.round(seconds / TICK_SECONDS);
      for (let i = 0; i < ticks; i += 1) {
        lobby.advance(TICK_SECONDS);
        await settle();
      }
    },
  };
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
