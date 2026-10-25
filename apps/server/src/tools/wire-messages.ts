import type { CombatEvent } from "@vibewars/game-core";
import type {
  CastRefusedMessage,
  ClientIntent,
  CombatMessage,
  LobbyChooseTeamMessage,
  LobbyMatchStartingMessage,
  LobbyReadyMessage,
  LobbySelectMapMessage,
  LobbyStartMatchMessage,
  LobbyStartRejectedMessage,
  MapDescriptor,
  MatchEndedMessage,
  RechargeMessage,
  ServerHello,
  SkillBarMessage,
} from "@vibewars/game-protocol";

/**
 * Every message name the rooms use, to its payload: the table
 * `wire-snapshot.ts` walks (#303). Types only; nothing imports this at
 * run time. A name the rooms `send`, `broadcast` or `onMessage` that is
 * missing here fails `wire-snapshot.test.ts`.
 */

/** What a client may send, by name. */
export interface ClientMessages {
  intent: ClientIntent;
  "choose-team": LobbyChooseTeamMessage;
  ready: LobbyReadyMessage;
  "select-map": LobbySelectMapMessage;
  "start-match": LobbyStartMatchMessage;
}

/** What the server sends, by name. */
export interface ServerMessages {
  hello: ServerHello;
  map: MapDescriptor;
  "skill-bar": SkillBarMessage;
  recharge: RechargeMessage;
  "cast-refused": CastRefusedMessage;
  combat: CombatMessage<CombatEvent>;
  "match-ended": MatchEndedMessage;
  "match-starting": LobbyMatchStartingMessage;
  "start-rejected": LobbyStartRejectedMessage;
}
