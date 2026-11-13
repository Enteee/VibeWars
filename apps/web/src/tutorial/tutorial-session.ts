import { NO_GUILD } from "@vibewars/game-session";

import { t } from "../i18n/index.js";
import { loadKeymap } from "../input/keymap-preference.js";
import { startMatchView, type MatchView } from "../match-view.js";
import type { GoalMark } from "../render/goal-mark.js";
import {
  NO_PROFESSIONS,
  createLocalConnection,
  type Professions,
} from "../training/local-connection.js";

import { mountSkipTutorial } from "./tutorial-offer.js";
import { walkStation, type StationHighlight } from "./stations.js";
import { createTutorialRunner, type TutorLine } from "./tutorial-runner.js";
import { SELF_ID, TUTOR_ID, tutorialWorld } from "./tutorial-world.js";

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
  /** The player key's, for the Options window over it (#3235). */
  readonly signet: number;
  /** Once, as it ends by itself, by Skip tutorial or by Leave; never after `stop`. */
  readonly onEnd: (end: TutorialEnd) => void;
}

export interface TutorialSession {
  /** Ends it with nothing said: the view and the simulation are gone once it resolves. */
  readonly stop: () => Promise<void>;
}

/**
 * The first-time tutorial (#3218): the player's own body in a local fight
 * like the menu's, on its map, next to the tutor, a teammate. Both stand
 * behind their side's spawn while the bots fight in the middle. Drawn by
 * the match view into `parent`, so it moves, looks and is followed as a
 * match is; the runner's lines stand over it, its mark is a goal on the
 * ground (#3221), and its party window lists only the pair.
 */
export async function startTutorialSession(
  parent: HTMLElement,
  options: TutorialSessionOptions,
): Promise<TutorialSession> {
  const { map, simulation, playerBuild, tutorBuild, mark, ground } = tutorialWorld(
    options.mapId,
    options.teamSize,
    `tutorial-${String(Math.random())}`,
  );
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
  });
  const goals = (): readonly GoalMark[] =>
    highlight?.kind === "ground"
      ? [{ id: "tutorial-mark", position: highlight.at, layer: ground }]
      : [];

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
    {
      kind: "play",
      connect: () => Promise.resolve(connection),
      tutorial: { party: [SELF_ID, TUTOR_ID], goals },
    },
    options.signet,
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
      // Where the mark is, for the e2e specs to click.
      if (highlight?.kind === "ground") {
        frame.dataset.mark = `${String(Math.round(highlight.at.x))},${String(Math.round(highlight.at.y))}`;
      } else {
        delete frame.dataset.mark;
      }
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
