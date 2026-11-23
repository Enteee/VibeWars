import {
  ZONE_RULES,
  vec2,
  zonesHolding,
  type MatchSimulation,
  type MatchZone,
  type ProfessionId,
  type StatusId,
  type Vec2,
} from "@vibewars/game-core";
import type { MapDescriptor } from "@vibewars/game-protocol";
import { NO_GUILD } from "@vibewars/game-session";

import { skillName } from "../i18n/game-names.js";
import { t } from "../i18n/index.js";
import { loadKeymap } from "../input/keymap-preference.js";
import { startMatchView, type MatchView } from "../match-view.js";
import type { GoalMark } from "../render/goal-mark.js";
import type { MistGateProp, ParasolProp, SleeperProp } from "../render/tutorial-props.js";
import {
  NO_PROFESSIONS,
  createLocalConnection,
  type LocalMatchConnection,
  type Professions,
} from "../training/local-connection.js";

import { mountSkipTutorial } from "./tutorial-offer.js";
import { DEFAULT_STEP } from "../render/camera-rig.js";

import {
  BAD_GROUND,
  CALL_RATS,
  CRACKED_WALL,
  DODGE_MARK,
  FORK,
  LEDGE,
  RAMP,
  RAT_POCKET,
  TUNNEL,
  allyHealSlot,
  badGroundTutor,
  callTutor,
  canyonWorld,
  clearingTutor,
  ledgeTutor,
  pingTutor,
  rampTutor,
  ratPocket,
  gateStart,
  tunnelStart,
  tunnelTutor,
  wallStart,
  wallTutor,
  type BadGroundTutor,
  type CallTutor,
  type ClearingTutor,
  type LedgeTutor,
  type PingTutor,
  type RampTutor,
  type RatPocket,
  type TunnelTutor,
  type WallTutor,
} from "./canyon-world.js";
import { CANYON_EXIT } from "./canyon-map.js";
import { createHealWatch, type HealWatch } from "./heal-watch.js";
import { createDodgeCounter, type DodgeCounter } from "./dodge-count.js";
import { createRatWatch, type RatWatch } from "./rat-watch.js";
import {
  ZONE_STATUSES,
  badGroundStation,
  breakWallStation,
  callStation,
  climbStation,
  dodgeStation,
  healStation,
  lookStation,
  gateStation,
  pingStation,
  rampStation,
  ratsStation,
  stepInStation,
  tunnelStation,
  walkStation,
  type Station,
  type StationHighlight,
  type TutorialWorldName,
  type ZoneStatus,
} from "./stations.js";
import { PRAISE_MS, createTutorialRunner, type TutorLine } from "./tutorial-runner.js";
import {
  SELF_ID,
  TUTORIAL_HEAL,
  TUTORIAL_HEAL_SLOT,
  TUTOR_ID,
  frontWorld,
  tutorialWorld,
} from "./tutorial-world.js";

/** A long frame is not caught up on, as in the splash fight. */
const MAX_STEP_SECONDS = 0.1;
/** Station 11's guard (#3326), asleep on the rock over the tunnel's middle. */
const SLEEPER: SleeperProp = {
  id: "tutorial-sleeper",
  kind: "sleeper",
  position: TUNNEL.sleeper,
  layer: TUNNEL.above,
  facing: 0,
};
/** Station 13's parasol and deck chair (#3332), in the pocket, the wrong way at the fork. */
const PARASOL: ParasolProp = {
  id: "tutorial-parasol",
  kind: "parasol",
  position: FORK.pocket,
  layer: FORK.layer,
};
/** Station 14's mist gate (#3334), the canyon's way out, at the east end of its second map. */
const MIST_GATE: MistGateProp = {
  id: "tutorial-mist-gate",
  kind: "mist-gate",
  position: CANYON_EXIT.position,
  layer: CANYON_EXIT.layer,
};
/** What a HUD element a station points at wears while it does (#3302). */
const PULSE_CLASS = "tutorial-pulse";
/** The fade back from white once the canyon stands (#3247), as `.tutorial-flash` animates it. */
const FLASH_MS = 800;

/** No skill landed on a rat: what station 8 reads before its rats are there. */
const NO_SKILLS: ReadonlySet<string> = new Set();
/** No rat struck by the tutor: what station 12 reads before its rats are there. */
const NO_HITS: ReadonlySet<string> = new Set();

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
  /** The index of the station it starts at: 0 but in an e2e build's seeded start (#3383). */
  readonly firstStation: number;
  /** Once, as it ends by itself, by Skip tutorial or by Leave; never after `stop`. */
  readonly onEnd: (end: TutorialEnd) => void;
}

export interface TutorialSession {
  /** Ends it with nothing said: the view and the simulation are gone once it resolves. */
  readonly stop: () => Promise<void>;
}

/** A world the pair stands in, and the connection its view is drawn through. */
interface Stage {
  /** A station's world, or the front (#3334), the match the tutorial ends in. */
  readonly name: TutorialWorldName | "front";
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
  /** Station 8's watch on the rats (#3316), on the canyon's second map only. */
  readonly rats: RatWatch | undefined;
  /** Station 12's watch on its two rats (#3331), on the canyon's second map only. */
  readonly callRats: RatWatch | undefined;
  /** Its zones, as the simulation applies them: the battlefield's play no part. */
  readonly zones: readonly MatchZone[];
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
    rats: undefined,
    callRats: undefined,
    zones: [],
  };
  let highlight: StationHighlight | undefined;
  /** A ground mark beside a HUD highlight (#3302). */
  let besideHud: Vec2 | undefined;
  const markAt = (): Vec2 | undefined => (highlight?.kind === "ground" ? highlight.at : besideHud);
  const markLayer = (): number =>
    (highlight?.kind === "ground" ? highlight.layer : undefined) ?? stage.ground;
  const goals = (): readonly GoalMark[] => {
    const at = markAt();
    return at === undefined
      ? stage.fixed
      : [
          ...stage.fixed,
          {
            id: "tutorial-mark",
            kind: "goal",
            position: at,
            layer: markLayer(),
          },
        ];
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
  // Station 7's (#3310), read only while it runs: the statuses its ground
  // has given, and whether health has dropped, latched.
  const groundGave = new Set<StatusId>();
  let healthDropped = false;
  let healthBefore: number | undefined;
  let onBadGround: BadGroundTutor | undefined;
  // Station 8's (#3316), on the canyon's second map.
  let atRats: RatPocket | undefined;
  // Station 9's (#3323): whether the last walk the player sent was an Alt walk.
  let belowClicked = false;
  let onLedge: LedgeTutor | undefined;
  let onRamp: RampTutor | undefined;
  let inTunnel: TunnelTutor | undefined;
  // Station 12's (#3331): whether the player has targeted the call with its key.
  let calledTargeted = false;
  let atCall: CallTutor | undefined;
  // Station 13's (#3332): the player's newest ping or compass line end since
  // it began, and the newest ping and line segment seen so far, by id.
  let lastPing: Vec2 | undefined;
  let pingSeen = -1;
  let strokeSeen = -1;
  let atFork: PingTutor | undefined;
  // Station 14's (#3334): the tutor has been sent on to the gate.
  let gateSent = false;
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
    const skills = Object.fromEntries(
      Object.entries(line.skills).map(([slot, id]) => [slot, skillName(id)]),
    );
    said.textContent = t(line.key, { ...skills, keys: line.keys.join(" ") });
    how.textContent = line.how === undefined ? "" : t(line.how, { keys: line.keys.join(" ") });
  };
  const open = (): Promise<MatchView> => {
    const { connection } = stage;
    if (stage.name === "front") {
      // A match like any other (#3334): its HUD, its end, and no tutor.
      // Out of it, by its end or by Leave, the canyon was done.
      return startMatchView(
        parent,
        {
          onLeave: () => {
            end("done");
          },
          onFinished: () => {
            view?.setEndLine({
              text: t("tutorial.front.end"),
              button: t("tutorial.front.menu"),
              onPress: () => {
                end("done");
              },
              stop: undefined,
            });
          },
        },
        { kind: "play", connect: () => Promise.resolve(connection), ranked: false },
        options.signet,
      );
    }
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
        ranked: false,
        tutorial: {
          party: [SELF_ID, TUTOR_ID],
          goals,
          // The guard asleep over the tunnel (#3326), only while station 11
          // runs; the parasol in the pocket (#3332), only while station 13 does;
          // the mist gate (#3334) wherever the canyon's second map is.
          props: () => [
            ...(stage.name === "canyon-2" ? [MIST_GATE] : []),
            ...(running === "tunnel" ? [SLEEPER] : running === "ping" ? [PARASOL] : []),
          ],
          onWalk: (below) => {
            belowClicked = below;
          },
          onCalledTargeted: () => {
            calledTargeted ||= running === "call";
          },
        },
      },
      options.signet,
    );
  };

  const stations: readonly Station[] = [
    walkStation(mark, ground),
    lookStation(teleporter),
    stepInStation(teleporter, ground),
    dodgeStation(DODGE_MARK.position, DODGE_MARK.layer),
    breakWallStation(CRACKED_WALL.face, CRACKED_WALL.maxHealth),
    healStation(TUTOR_ID, TUTORIAL_HEAL_SLOT),
    badGroundStation(BAD_GROUND.mark, BAD_GROUND.layer),
    ratsStation(
      RAT_POCKET.pocket,
      { runner: RAT_POCKET.rats[0].id, big: RAT_POCKET.rats[1].id },
      playerBuild.skillBar,
    ),
    climbStation(LEDGE.footprint, LEDGE.stairs, LEDGE.upper, LEDGE.lower),
    rampStation(RAMP.mark, RAMP.layer, RAMP.landingFootprint, RAMP.landing),
    tunnelStation(TUNNEL.footprint, TUNNEL.under, TUNNEL.above, TUNNEL.mark),
    callStation(),
    pingStation(FORK.fork, FORK.east, FORK.pocket, FORK.eastSide),
    gateStation(CANYON_EXIT.position, CANYON_EXIT.layer),
  ];
  // A seeded start past the last station starts at the last (#3383).
  const firstStation = Math.min(options.firstStation, stations.length - 1);
  const runner = createTutorialRunner(stations, loadKeymap, firstStation);
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
   * White over the world, its view and simulation dropped, the next one
   * `build` makes built and drawn, then the white fades.
   */
  const enter = async (build: () => Stage): Promise<void> => {
    swapping = true;
    const flash = document.createElement("div");
    flash.className = "tutorial-flash tutorial-flash-hold";
    frame.append(flash);
    await view?.dispose();
    view = undefined;
    stage = build();
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
  /** Into the canyon (#3247), or on to its second map (#3316). */
  const canyonStage = (to: "canyon" | "canyon-2"): Stage => {
    const part = to === "canyon" ? 0 : 1;
    // Only a seeded start enters a map at station 5, 11 or 14 (#3383).
    const canyon =
      running === "break-wall"
        ? canyonWorld(`${seed}-${to}`, playerBuild, tutorBuild, part, wallStart())
        : running === "tunnel"
          ? canyonWorld(`${seed}-${to}`, playerBuild, tutorBuild, part, tunnelStart())
          : running === "gate"
            ? canyonWorld(`${seed}-${to}`, playerBuild, tutorBuild, part, gateStart())
            : canyonWorld(`${seed}-${to}`, playerBuild, tutorBuild, part);
    const heals = part === 0 ? createHealWatch(SELF_ID, TUTOR_ID, TUTORIAL_HEAL) : undefined;
    const rats =
      part === 1
        ? createRatWatch(
            SELF_ID,
            TUTOR_ID,
            RAT_POCKET.rats.map(({ id }) => id),
            playerBuild.skillBar,
          )
        : undefined;
    const callRats =
      part === 1
        ? createRatWatch(
            SELF_ID,
            TUTOR_ID,
            CALL_RATS.rats.map(({ id }) => id),
            playerBuild.skillBar,
          )
        : undefined;
    const connection = connect(canyon.simulation, canyon.map);
    // Only station 6's strikes and heals: the tutor may meet a boulder before.
    // Station 8's blows on the rats, whenever they land.
    connection.onCombat((message) => {
      if (running === "heal") {
        heals?.observe(message);
      }
      rats?.observe(message);
      callRats?.observe(message);
    });
    // The tutor goes on ahead, to wait by the mark.
    canyon.simulation.walkTo(TUTOR_ID, canyon.besideMark, canyon.ground);
    return {
      name: to,
      simulation: canyon.simulation,
      connection,
      ground: canyon.ground,
      fixed: [],
      dodges: part === 0 ? createDodgeCounter(canyon.zones) : undefined,
      heals,
      rats,
      callRats,
      zones: canyon.zones,
    };
  };
  /**
   * Back to the front (#3334): a fresh match on the opening fight's map,
   * the pair at their own side's spawn, the tutor one of the bots. No
   * line stands over it, and nothing points.
   */
  const frontStage = (): Stage => {
    const front = frontWorld(
      `${seed}-front`,
      options.mapId,
      options.teamSize,
      playerBuild,
      tutorBuild,
    );
    for (const [id, bot] of front.professions) {
      professions.set(id, bot);
    }
    // The gate's praise stands over the front a moment, then the tutor is quiet.
    window.setTimeout(() => {
      said.textContent = "";
      how.textContent = "";
    }, PRAISE_MS);
    highlight = undefined;
    besideHud = undefined;
    pulse(undefined);
    return {
      name: "front",
      simulation: front.simulation,
      connection: connect(front.simulation, front.map.descriptor),
      ground: front.ground,
      fixed: [],
      dodges: undefined,
      heals: undefined,
      rats: undefined,
      callRats: undefined,
      zones: [],
    };
  };
  const step = (now: number): void => {
    if (ended) {
      return;
    }
    if (swapping) {
      request = requestAnimationFrame(step);
      return;
    }
    const { simulation: world, connection, dodges, heals, rats, callRats } = stage;
    connection.advance(last === undefined ? 0 : Math.min((now - last) / 1000, MAX_STEP_SECONDS));
    last = now;
    // The front is a match like any other: no station reads it.
    if (stage.name === "front") {
      request = requestAnimationFrame(step);
      return;
    }
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
    const crossing = running === "bad-ground" && self !== undefined;
    if (crossing) {
      for (const zone of zonesHolding(stage.zones, self.position, self.layer)) {
        const rule = ZONE_RULES[zone.kind];
        if (rule.trigger === "while-inside") {
          rule.statuses.forEach((status) => groundGave.add(status));
        }
      }
    }
    const holding = new Set(self?.combatant.statuses.active.map(({ id }) => id));
    const zoneStatus: ZoneStatus | undefined = crossing
      ? ZONE_STATUSES.find((status) => groundGave.has(status) && holding.has(status))
      : undefined;
    const health = self?.combatant.health;
    healthDropped ||=
      crossing && health !== undefined && healthBefore !== undefined && health < healthBefore;
    healthBefore = health;
    const ratTally = rats?.tally();
    const callTally = callRats?.tally();
    const calls = connection.getCalls();
    const calledId = calls.target?.targetId;
    // Only what the player sends while station 13 runs counts there.
    const ping = calls.pings.findLast(({ byId, id }) => byId === SELF_ID && id > pingSeen);
    const stroke = calls.strokes.findLast(({ byId, id }) => byId === SELF_ID && id > strokeSeen);
    const lineEnd = stroke?.points.at(-1);
    if (running === "ping") {
      lastPing =
        lineEnd !== undefined
          ? vec2(lineEnd[0], lineEnd[1])
          : ping !== undefined
            ? vec2(ping.x, ping.y)
            : lastPing;
    }
    pingSeen = ping?.id ?? pingSeen;
    strokeSeen = stroke?.id ?? strokeSeen;
    if (self !== undefined && tutor !== undefined) {
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
          zoneStatus,
          healthDropped,
          ratsAlive: atRats?.alive() ?? 0,
          skillsOnRats: ratTally?.skillsOnRats ?? NO_SKILLS,
          selfTarget: self.targetId,
          ratFled: atRats?.fled() ?? false,
          bigRatDown: ratTally?.knockedDown.has(RAT_POCKET.rats[1].id) ?? false,
          extraRat: atRats?.extra() ?? false,
          belowClicked,
          calledId,
          hitByTutor: callTally?.hitByTutor ?? NO_HITS,
          calledTargeted,
          calledLost: atCall?.lost() ?? false,
          lastPing,
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
      // Station 6 is next: the tutor walks into the clearing's rockfall, out
      // of it once the rocks have hurt it, and bleeds until it is healed.
      if (inClearing === undefined && beat.station === "heal" && stage.name === "canyon") {
        inClearing = clearingTutor(world);
      }
      if (beat.station === "heal") {
        inClearing?.step(tutorHit, healedTutor);
      }
      // Station 7 is next: the tutor walks round the bad ground to the mark.
      if (onBadGround === undefined && beat.station === "bad-ground" && stage.name === "canyon") {
        onBadGround = badGroundTutor(world);
      }
      onBadGround?.step();
      // Station 8 is next, on the second map: the tutor goes to the pocket,
      // and the rats are run.
      if (atRats === undefined && beat.station === "rats" && rats !== undefined) {
        atRats = ratPocket(world, rats, allyHealSlot(tutorBuild));
      }
      if (ratTally !== undefined) {
        atRats?.step(ratTally);
      }
      // Station 9 is next: the tutor keeps beside the player, by the stairs.
      if (onLedge === undefined && beat.station === "climb" && stage.name === "canyon-2") {
        onLedge = ledgeTutor(world);
      }
      // Only while it is on: the landing at station 10 is on the ledge's layer.
      if (beat.station === "climb") {
        onLedge?.step();
      }
      // Station 10 is next: the tutor climbs behind the player to the high deck.
      if (onRamp === undefined && beat.station === "ramp" && stage.name === "canyon-2") {
        onRamp = rampTutor(world);
      }
      onRamp?.step();
      // Station 11 is next: the tutor waits at the tunnel's west steps, then
      // goes through it behind the player.
      if (inTunnel === undefined && beat.station === "tunnel" && stage.name === "canyon-2") {
        inTunnel = tunnelTutor(world);
      }
      // Only while it is on: the tutor walks on to station 12 from wherever it is.
      if (beat.station === "tunnel") {
        inTunnel?.step();
      }
      // Station 12 is next: the tutor waits by the two rats, and attacks the one called.
      if (atCall === undefined && beat.station === "call" && callRats !== undefined) {
        atCall = callTutor(world, callRats);
      }
      // Station 13 is next: once the called rat is down, the tutor walks to
      // the fork and follows the player's pings; until then it fights on.
      const callDown = calledId === undefined || world.get(calledId)?.combatant.dead !== false;
      if (atFork === undefined && beat.station === "ping" && callDown) {
        atFork = pingTutor(world);
      }
      if (callTally !== undefined && atFork === undefined) {
        atCall?.step(calledId, callTally);
      }
      atFork?.step(beat.station === "ping" ? lastPing : undefined);
      // Station 3 has begun: the tutor goes to stand by the pad.
      if (!tutorSent && highlight?.kind === "ground" && highlight.at === teleporter) {
        tutorSent = true;
        world.walkTo(TUTOR_ID, besidePad, ground);
      }
      // Station 14 has begun (#3334): the tutor goes on into the mist gate.
      if (!gateSent && beat.station === "gate") {
        gateSent = true;
        world.walkTo(TUTOR_ID, CANYON_EXIT.position, CANYON_EXIT.layer);
      }
      // How many rockfalls are dodged, for the e2e specs to wait on.
      if (dodges === undefined) {
        delete frame.dataset.dodges;
      } else {
        frame.dataset.dodges = String(rockfallDodges);
      }
      // Where the mark is, and on which layer, for the e2e specs to click.
      const at = markAt();
      if (at === undefined) {
        delete frame.dataset.mark;
        delete frame.dataset.markLayer;
      } else {
        frame.dataset.mark = `${String(Math.round(at.x))},${String(Math.round(at.y))}`;
        frame.dataset.markLayer = String(markLayer());
      }
      // The wall's health (#3302), for the e2e specs to wait on.
      if (wallHealth === undefined) {
        delete frame.dataset.wall;
      } else {
        frame.dataset.wall = String(wallHealth);
      }
      // The rats standing (#3316), for the e2e specs to wait on.
      if (atRats === undefined) {
        delete frame.dataset.rats;
      } else {
        frame.dataset.rats = String(atRats.alive());
      }
      if (beat.say !== undefined) {
        say(beat.say);
      }
      if (beat.finished) {
        // Through the mist gate, under its praise, and out at the pair's own spawn.
        void enter(frontStage);
      } else if (beat.world !== stage.name && beat.world !== "battlefield") {
        // Into the teleporter together, or on to the next map, under its praise.
        const to = beat.world;
        void enter(() => canyonStage(to));
      }
    }
    request = requestAnimationFrame(step);
  };
  // Skipped at the front (#3334), the canyon was done.
  mountSkipTutorial(frame, () => {
    end(stage.name === "front" ? "done" : "skipped");
  });
  // An e2e build's seeded start past the battlefield (#3383) builds its
  // station's world at once, and never draws the battlefield.
  const first = stations[firstStation];
  if (first === undefined || first.world === "battlefield") {
    view = await open();
    parent.append(frame);
  } else {
    running = first.id;
    const to = first.world;
    await enter(() => canyonStage(to));
  }
  request = requestAnimationFrame(step);
  return { stop };
}
