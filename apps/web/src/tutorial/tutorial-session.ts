import type { MatchSimulation, ProfessionId, Vec2 } from "@vibewars/game-core";
import type { MapDescriptor } from "@vibewars/game-protocol";
import { NO_GUILD } from "@vibewars/game-session";

import { t } from "../i18n/index.js";
import { loadKeymap } from "../input/keymap-preference.js";
import { startMatchView, type MatchView } from "../match-view.js";
import type { GoalMark } from "../render/goal-mark.js";
import {
  NO_PROFESSIONS,
  createLocalConnection,
  type LocalMatchConnection,
  type Professions,
} from "../training/local-connection.js";

import { mountSkipTutorial } from "./tutorial-offer.js";
import { DEFAULT_STEP } from "../render/camera-rig.js";

import {
  CRACKED_WALL,
  DODGE_MARK,
  canyonWorld,
  clearingTutor,
  wallTutor,
  type ClearingTutor,
  type WallTutor,
} from "./canyon-world.js";
import { createHealWatch, type HealWatch } from "./heal-watch.js";
import { createDodgeCounter, type DodgeCounter } from "./dodge-count.js";
import {
  breakWallStation,
  dodgeStation,
  healStation,
  lookStation,
  stepInStation,
  walkStation,
  type StationHighlight,
  type TutorialWorldName,
} from "./stations.js";
import { createTutorialRunner, type TutorLine } from "./tutorial-runner.js";
import {
  SELF_ID,
  TUTORIAL_HEAL,
  TUTORIAL_HEAL_SLOT,
  TUTOR_ID,
  tutorialWorld,
} from "./tutorial-world.js";

/** A long frame is not caught up on, as in the splash fight. */
const MAX_STEP_SECONDS = 0.1;
/** How long "more soon" stands before the menu. */
const FAREWELL_MS = 2_500;
/** What a HUD element a station points at wears while it does (#3302). */
const PULSE_CLASS = "tutorial-pulse";
/** The fade back from white once the canyon stands (#3247), as `.tutorial-flash` animates it. */
const FLASH_MS = 800;

/** How a tutorial ended: through, skipped, or cut short with nothing to record. */
export type TutorialEnd = "done" | "skipped";

export interface TutorialSessionOptions {
  /** The background fight's: the tutorial is a body in it. */
  readonly mapId: string;
  readonly teamSize: number;
  /** Drawn by the caller for each run (Q69), so a test can pin it. */
  readonly tutorProfession: ProfessionId;
  /** The player key's, for the Options window over it (#3235). */
  readonly signet: number;
  /** Once, as it ends by itself, by Skip tutorial or by Leave; never after `stop`. */
  readonly onEnd: (end: TutorialEnd) => void;
}

export interface TutorialSession {
  /** Ends it with nothing said: the view and the simulation are gone once it resolves. */
  readonly stop: () => Promise<void>;
}

/** A world the pair stands in, and the connection its view is drawn through. */
interface Stage {
  readonly name: TutorialWorldName;
  readonly simulation: MatchSimulation;
  readonly connection: LocalMatchConnection;
  /** The layer the pair and the station's mark stand on. */
  readonly ground: number;
  /** What glows on its ground whatever the station: the battlefield's teleporter. */
  readonly fixed: readonly GoalMark[];
  /** The canyon's rockfall count (#3247); the battlefield has none. */
  readonly dodges: DodgeCounter | undefined;
  /** Station 6's watch on the canyon's combat (#3303); the battlefield has none. */
  readonly heals: HealWatch | undefined;
}

/**
 * The first-time tutorial (#3218): the player's own body in a local fight
 * like the menu's, on its map, next to the tutor, a teammate. Both stand
 * behind their side's spawn while the bots fight in the middle. Drawn by
 * the match view into `parent`, so it moves, looks and is followed as a
 * match is; the runner's lines stand over it, its mark is a goal on the
 * ground (#3221), and its party window lists only the pair. Through the
 * teleporter the battlefield gives way to the canyon (#3247), under a
 * white fade: one view at a time, rebuilt on the new world.
 */
export async function startTutorialSession(
  parent: HTMLElement,
  options: TutorialSessionOptions,
): Promise<TutorialSession> {
  const seed = `tutorial-${String(Math.random())}`;
  const { map, simulation, playerBuild, tutorBuild, mark, ground, teleporter, besidePad } =
    tutorialWorld(options.mapId, options.teamSize, seed, options.tutorProfession, {
      width: Math.max(1, parent.clientWidth),
      height: Math.max(1, parent.clientHeight),
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
  const connect = (world: MatchSimulation, descriptor: MapDescriptor): LocalMatchConnection =>
    createLocalConnection({
      simulation: world,
      selfId: SELF_ID,
      map: descriptor,
      nameOf: (id) =>
        id === SELF_ID ? t("training.you") : id === TUTOR_ID ? t("tutorial.tutor") : "",
      guildOf: () => NO_GUILD,
      professionsOf: (id) => professions.get(id) ?? NO_PROFESSIONS,
    });
  const portal: GoalMark = {
    id: "tutorial-teleporter",
    kind: "portal",
    position: teleporter,
    layer: ground,
  };
  let stage: Stage = {
    name: "battlefield",
    simulation,
    connection: connect(simulation, map.descriptor),
    ground,
    fixed: [portal],
    dodges: undefined,
    heals: undefined,
  };
  let highlight: StationHighlight | undefined;
  /** A ground mark beside a HUD highlight (#3302). */
  let besideHud: Vec2 | undefined;
  const markAt = (): Vec2 | undefined => (highlight?.kind === "ground" ? highlight.at : besideHud);
  const goals = (): readonly GoalMark[] => {
    const at = markAt();
    return at === undefined
      ? stage.fixed
      : [...stage.fixed, { id: "tutorial-mark", kind: "goal", position: at, layer: stage.ground }];
  };

  const frame = document.createElement("div");
  frame.className = "tutorial-frame";
  frame.dataset.world = stage.name;
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
  // What the camera has done this run (#3222): once true, they stay true.
  let zoomedOut = false;
  let lookDragged = false;
  let tutorSent = false;
  let swapping = false;
  let rockfallDodges = 0;
  let wallTargeted = false;
  let atWall: WallTutor | undefined;
  // Station 6's (#3303), read only while it runs: once true, they stay true.
  let tutorTargeted = false;
  let energySpent = false;
  let energyBefore: number | undefined;
  let inClearing: ClearingTutor | undefined;
  /** The station the last beat ran. */
  let running: string | undefined;
  /** The HUD element pulsing now, if any. */
  let pulsing: Element | undefined;
  const pulse = (element: Element | undefined): void => {
    if (element !== pulsing) {
      pulsing?.classList.remove(PULSE_CLASS);
      element?.classList.add(PULSE_CLASS);
      pulsing = element;
    }
  };
  const stop = async (): Promise<void> => {
    ended = true;
    cancelAnimationFrame(request);
    window.clearTimeout(farewell);
    pulse(undefined);
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
  const open = (): Promise<MatchView> => {
    const { connection } = stage;
    return startMatchView(
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
  };

  view = await open();
  mountSkipTutorial(frame, () => {
    end("skipped");
  });
  parent.append(frame);

  const runner = createTutorialRunner(
    [
      walkStation(mark, ground),
      lookStation(teleporter),
      stepInStation(teleporter, ground),
      dodgeStation(DODGE_MARK.position, DODGE_MARK.layer),
      breakWallStation(CRACKED_WALL.face, CRACKED_WALL.maxHealth),
      healStation(TUTOR_ID, TUTORIAL_HEAL_SLOT),
    ],
    loadKeymap,
  );
  const inView = (point: Vec2): boolean => {
    const look = view?.camera();
    if (look === undefined) {
      return false;
    }
    const { x, y, zoom } = look.view;
    return (
      Math.abs(point.x - x) <= look.viewport.width / 2 / zoom &&
      Math.abs(point.y - y) <= look.viewport.height / 2 / zoom
    );
  };
  let last: number | undefined;
  /**
   * Into the canyon (#3247): white over the battlefield, its view and world
   * dropped, the canyon built and drawn, then the white fades.
   */
  const swap = async (): Promise<void> => {
    swapping = true;
    const flash = document.createElement("div");
    flash.className = "tutorial-flash tutorial-flash-hold";
    frame.append(flash);
    await view?.dispose();
    view = undefined;
    const canyon = canyonWorld(`${seed}-canyon`, playerBuild, tutorBuild);
    const heals = createHealWatch(SELF_ID, TUTOR_ID, TUTORIAL_HEAL);
    const connection = connect(canyon.simulation, canyon.map);
    // Only station 6's strikes and heals: the tutor may meet a boulder before.
    connection.onCombat((message) => {
      if (running === "heal") {
        heals.observe(message);
      }
    });
    stage = {
      name: "canyon",
      simulation: canyon.simulation,
      connection,
      ground: canyon.ground,
      fixed: [],
      dodges: createDodgeCounter(canyon.zones),
      heals,
    };
    // The tutor goes on ahead, to wait by the mark.
    canyon.simulation.walkTo(TUTOR_ID, canyon.besideMark, canyon.ground);
    const opened = await open();
    // Stopped while it was being built: `stop` had no view to drop.
    if (ended) {
      await opened.dispose();
      return;
    }
    view = opened;
    frame.dataset.world = stage.name;
    // Over the new view, which was added after it.
    parent.append(frame);
    flash.className = "tutorial-flash tutorial-flash-out";
    window.setTimeout(() => {
      flash.remove();
    }, FLASH_MS);
    last = undefined;
    swapping = false;
  };
  const step = (now: number): void => {
    if (ended) {
      return;
    }
    if (swapping) {
      request = requestAnimationFrame(step);
      return;
    }
    const { simulation: world, connection, dodges, heals } = stage;
    connection.advance(last === undefined ? 0 : Math.min((now - last) / 1000, MAX_STEP_SECONDS));
    last = now;
    const self = world.get(SELF_ID);
    const tutor = world.get(TUTOR_ID);
    const look = view?.camera();
    zoomedOut ||= look !== undefined && look.step > DEFAULT_STEP;
    lookDragged ||= look?.panning === true;
    const tally =
      self === undefined
        ? undefined
        : dodges?.observe(world.elapsedSeconds, self.position, self.layer);
    rockfallDodges = tally?.dodges ?? rockfallDodges;
    const wallHealth =
      stage.name === "canyon"
        ? world.breakables.find(({ id }) => id === CRACKED_WALL.id)?.health
        : undefined;
    wallTargeted ||= wallHealth !== undefined && self?.targetId === CRACKED_WALL.targetId;
    const healing = running === "heal" && heals !== undefined;
    tutorTargeted ||= healing && self?.targetId === TUTOR_ID;
    const energy = self?.combatant.energy;
    energySpent ||=
      healing && energy !== undefined && energyBefore !== undefined && energy < energyBefore;
    energyBefore = energy;
    const { tutorHit, healedTutor } = heals?.tally() ?? { tutorHit: false, healedTutor: false };
    if (self !== undefined && tutor !== undefined && farewell === 0) {
      const beat = runner.tick(
        {
          self: self.position,
          selfLayer: self.layer,
          tutor: tutor.position,
          zoomedOut,
          lookDragged,
          inView,
          rockfallDodges,
          hitBy: tally?.hit === true ? "rockfall" : undefined,
          wallHealth,
          wallTargeted,
          tutorHit,
          tutorTargeted,
          healedTutor,
          energySpent,
        },
        now,
      );
      running = beat.station;
      highlight = beat.highlight;
      besideHud = beat.mark;
      pulse(
        highlight?.kind === "hud"
          ? (parent.querySelector(highlight.element) ?? undefined)
          : undefined,
      );
      // Station 5 is next: the tutor goes to wait by the wall, and joins in
      // once the player has struck it.
      if (atWall === undefined && beat.station === "break-wall" && stage.name === "canyon") {
        atWall = wallTutor(world);
      }
      atWall?.step();
      // Station 6 is next: the tutor walks into the clearing's rockfall, and
      // out of it once a rock has hit it.
      if (inClearing === undefined && beat.station === "heal" && stage.name === "canyon") {
        inClearing = clearingTutor(world);
      }
      inClearing?.step(tutorHit);
      // Station 3 has begun: the tutor goes to stand by the pad.
      if (!tutorSent && highlight?.kind === "ground" && highlight.at === teleporter) {
        tutorSent = true;
        world.walkTo(TUTOR_ID, besidePad, ground);
      }
      // How many rockfalls are dodged, for the e2e specs to wait on.
      if (dodges === undefined) {
        delete frame.dataset.dodges;
      } else {
        frame.dataset.dodges = String(rockfallDodges);
      }
      // Where the mark is, for the e2e specs to click.
      const at = markAt();
      if (at === undefined) {
        delete frame.dataset.mark;
      } else {
        frame.dataset.mark = `${String(Math.round(at.x))},${String(Math.round(at.y))}`;
      }
      // The wall's health (#3302), for the e2e specs to wait on.
      if (wallHealth === undefined) {
        delete frame.dataset.wall;
      } else {
        frame.dataset.wall = String(wallHealth);
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
      } else if (beat.world !== stage.name) {
        // Into the teleporter together, under its praise.
        void swap();
      }
    }
    request = requestAnimationFrame(step);
  };
  request = requestAnimationFrame(step);
  return { stop };
}
