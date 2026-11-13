import {
  MINIMAL_GW_INSPIRED_PVP_V1 as RULESET,
  MatchSimulation,
  STARTER_BUILDS,
  loadoutOf,
  loadoutSpec,
  nearestStandable,
  resolveLoadout,
  vec2,
  type Behaviour,
  type ParticipantSpec,
  type PlayerBuild,
  type ProfessionId,
  type Vec2,
} from "@vibewars/game-core";
import { NO_GUILD, PING_SECONDS } from "@vibewars/game-session";

import { t } from "../i18n/index.js";
import { loadKeymap } from "../input/keymap-preference.js";
import { startMatchView, type MatchView } from "../match-view.js";
import { hostMap } from "../net/maps.js";
import {
  NO_PROFESSIONS,
  createLocalConnection,
  type Professions,
} from "../training/local-connection.js";
import { SPLASH_RULES, splashGraph, splashParticipants, splashSpawn } from "../ui/splash-fight.js";

import { mountSkipTutorial } from "./tutorial-offer.js";
import { walkStation, type StationHighlight } from "./stations.js";
import { createTutorialRunner, type TutorLine } from "./tutorial-runner.js";

/** The tutor's profession: a Monk until the operator answers Q69. */
export const TUTOR_PROFESSION: ProfessionId = "monk";
/** The player's, the tutor's companion: the house starter build of it. */
export const PLAYER_PROFESSION: ProfessionId = "warrior";

const SELF_ID = "tutorial-you";
const TUTOR_ID = "tutorial-tutor";
/** Where the tutor stops, from the player's spawn: inward, towards the fight. */
const TUTOR_POST = vec2(160, 0);
/** Where the mark glows, from the tutor's post. */
const MARK_OFFSET = vec2(0, 70);
/** A ping id no call board hands out, for the mark. */
const MARK_PING_ID = -1;
/** A long frame is not caught up on, as in the splash fight. */
const MAX_STEP_SECONDS = 0.1;
/** How long "more soon" stands before the menu. */
const FAREWELL_MS = 2_500;

/** How a tutorial ended: through, skipped, or cut short with nothing to record. */
export type TutorialEnd = "done" | "skipped";

export interface TutorialSessionOptions {
  /** The background fight's: the tutorial is a body in it. */
  readonly mapId: string;
  readonly teamSize: number;
  /** Once, as it ends by itself, by Skip tutorial or by Leave; never after `stop`. */
  readonly onEnd: (end: TutorialEnd) => void;
}

export interface TutorialSession {
  /** Ends it with nothing said: the view and the simulation are gone once it resolves. */
  readonly stop: () => Promise<void>;
}

function houseBuild(profession: ProfessionId): PlayerBuild {
  const build = STARTER_BUILDS.find((candidate) => candidate.primaryProfession === profession);
  if (build === undefined) {
    throw new Error(`no starter build for ${profession}`);
  }
  return build;
}

function body(
  id: string,
  build: PlayerBuild,
  spawn: Vec2,
  behaviour: Behaviour | undefined,
): ParticipantSpec {
  const loadout = loadoutOf(build);
  const resolved = resolveLoadout(
    {
      primaryProfession: loadout.primaryProfession,
      secondaryProfession: loadout.secondaryProfession,
      allocatedRanks: loadout.attributeRanks,
      equipment: loadout.equipment,
    },
    RULESET.combat,
  );
  return {
    id,
    team: 0,
    skillBar: loadout.skillBar,
    ...loadoutSpec(resolved),
    spawn,
    facing: 0,
    ...(behaviour === undefined ? {} : { behaviour }),
  };
}

/**
 * The first-time tutorial (#3218): the player's own body in a local fight
 * like the menu's, on its map, next to the tutor, a teammate. Both stand
 * behind their side's spawn while the bots fight in the middle. Drawn by
 * the match view into `parent`, so it moves, looks and is followed as a
 * match is; the runner's lines stand over it, its mark is a ping that
 * never fades.
 */
export async function startTutorialSession(
  parent: HTMLElement,
  options: TutorialSessionOptions,
): Promise<TutorialSession> {
  const map = hostMap(options.mapId);
  if (map === undefined) {
    throw new Error(`no map ${options.mapId} for the tutorial`);
  }
  const fight = { mapId: options.mapId, teamSize: options.teamSize, still: false };
  const graph = splashGraph(map);
  const spawn = splashSpawn(graph, map, fight, 0, options.teamSize);
  const post = nearestStandable(graph, vec2(spawn.x + TUTOR_POST.x, spawn.y + TUTOR_POST.y));
  const mark = nearestStandable(graph, vec2(post.x + MARK_OFFSET.x, post.y + MARK_OFFSET.y));
  const playerBuild = houseBuild(PLAYER_PROFESSION);
  const tutorBuild = houseBuild(TUTOR_PROFESSION);
  const simulation = new MatchSimulation({
    seed: `tutorial-${String(Math.random())}`,
    ruleset: RULESET,
    matchRules: SPLASH_RULES,
    walls: map.walls,
    bounds: map.bounds,
    participants: [
      ...splashParticipants(map, fight, graph),
      body(SELF_ID, playerBuild, spawn, undefined),
      // The tutor walks over from the row behind and stays by the mark.
      body(TUTOR_ID, tutorBuild, splashSpawn(graph, map, fight, 0, options.teamSize + 1), {
        kind: "patrol",
        waypoints: [post],
        loop: false,
      }),
    ],
  });
  const professions = new Map<string, Professions>([
    [
      SELF_ID,
      { primary: playerBuild.primaryProfession, secondary: playerBuild.secondaryProfession },
    ],
    [
      TUTOR_ID,
      { primary: tutorBuild.primaryProfession, secondary: tutorBuild.secondaryProfession },
    ],
  ]);
  let highlight: StationHighlight | undefined;
  const connection = createLocalConnection({
    simulation,
    selfId: SELF_ID,
    map: map.descriptor,
    nameOf: (id) =>
      id === SELF_ID ? t("training.you") : id === TUTOR_ID ? t("tutorial.tutor") : "",
    guildOf: () => NO_GUILD,
    professionsOf: (id) => professions.get(id) ?? NO_PROFESSIONS,
    // The mark is the tutor's ping, struck again as each one would fade.
    marks: () => {
      if (highlight?.kind !== "ground") {
        return [];
      }
      const remaining = PING_SECONDS - (simulation.elapsedSeconds % PING_SECONDS);
      const { x, y } = highlight.at;
      return [{ id: MARK_PING_ID, x, y, byId: TUTOR_ID, remaining }];
    },
  });

  const frame = document.createElement("div");
  frame.className = "tutorial-frame";
  const speech = document.createElement("p");
  speech.className = "tutorial-speech";
  speech.setAttribute("role", "status");
  const said = document.createElement("span");
  said.className = "tutorial-said";
  const how = document.createElement("span");
  how.className = "tutorial-how";
  speech.append(said, how);
  frame.append(speech);

  let ended = false;
  let view: MatchView | undefined;
  let request = 0;
  let farewell = 0;
  const stop = async (): Promise<void> => {
    ended = true;
    cancelAnimationFrame(request);
    window.clearTimeout(farewell);
    frame.remove();
    await view?.dispose();
    view = undefined;
  };
  const end = (how: TutorialEnd): void => {
    if (!ended) {
      void stop();
      options.onEnd(how);
    }
  };
  const say = (line: TutorLine): void => {
    said.textContent = t(line.key);
    how.textContent = line.how === undefined ? "" : t(line.how, { keys: line.keys.join(" ") });
  };

  view = await startMatchView(
    parent,
    {
      onLeave: () => {
        end("skipped");
      },
    },
    { kind: "play", connect: () => Promise.resolve(connection) },
  );
  mountSkipTutorial(frame, () => {
    end("skipped");
  });
  parent.append(frame);

  const runner = createTutorialRunner([walkStation(mark)], loadKeymap);
  let last: number | undefined;
  const step = (now: number): void => {
    if (ended) {
      return;
    }
    connection.advance(last === undefined ? 0 : Math.min((now - last) / 1000, MAX_STEP_SECONDS));
    last = now;
    const self = simulation.get(SELF_ID);
    const tutor = simulation.get(TUTOR_ID);
    if (self !== undefined && tutor !== undefined && farewell === 0) {
      const beat = runner.tick({ self: self.position, tutor: tutor.position }, now);
      highlight = beat.highlight;
      if (beat.say !== undefined) {
        say(beat.say);
      }
      if (beat.finished) {
        farewell = window.setTimeout(() => {
          said.textContent = t("tutorial.moreSoon");
          farewell = window.setTimeout(() => {
            end("done");
          }, FAREWELL_MS);
        }, FAREWELL_MS);
      }
    }
    request = requestAnimationFrame(step);
  };
  request = requestAnimationFrame(step);
  return { stop };
}
