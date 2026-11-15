import type { Vec2 } from "@vibewars/game-core";
import { pointInShape, shapeVertices } from "@vibewars/game-maps/geometry";
import type { Shape } from "@vibewars/game-maps/schema";

import type { MessageKey } from "../i18n/index.js";
import type { KeyAction } from "../input/keymap.js";

/**
 * What a station's check reads (#3218): where the player and the tutor
 * stand, and what the camera has done (#3222). `zoomedOut` and
 * `lookDragged` latch for the run: once true, they stay true.
 */
export interface TutorialView {
  readonly self: Vec2;
  /** The layer the player's body is on: a mark is stood on from its own layer. */
  readonly selfLayer: number;
  readonly tutor: Vec2;
  /** The view has been wider than the default step. */
  readonly zoomedOut: boolean;
  /** The view has been dragged with the right button. */
  readonly lookDragged: boolean;
  /** Whether `point`, on the ground, is on screen now. */
  readonly inView: (point: Vec2) => boolean;
  /** The rockfalls dodged so far in the canyon (#3247): it only grows. */
  readonly rockfallDodges: number;
  /** What hit the player since the last look, if anything did. */
  readonly hitBy: "rockfall" | undefined;
  /** The health of the canyon's cracked wall (#3302), or none outside the canyon. */
  readonly wallHealth: number | undefined;
  /** The player has targeted that wall: once true, it stays true. */
  readonly wallTargeted: boolean;
  /** A zone's strike has hurt the tutor (#3303): once true, it stays true. */
  readonly tutorHit: boolean;
  /** The player has targeted the tutor: once true, it stays true. */
  readonly tutorTargeted: boolean;
  /** The player's heal has landed on the tutor after that hit: once true, it stays true. */
  readonly healedTutor: boolean;
  /** The player's energy has dropped, as a skill spends it: once true, it stays true. */
  readonly energySpent: boolean;
  /**
   * The status the bad ground gives the player now (#3310), the first of
   * `ZONE_STATUSES` if there are several, or none: a rock's does not count.
   */
  readonly zoneStatus: ZoneStatus | undefined;
  /** The player's health has dropped in station 7 (#3310): once true, it stays true. */
  readonly healthDropped: boolean;
  /** Station 8's rats still standing (#3316), the extra one among them; none outside it. */
  readonly ratsAlive: number;
  /** The skill ids from the player's bar that have landed on a rat: it only grows. */
  readonly skillsOnRats: ReadonlySet<string>;
  /** Whom the player has targeted now, if anyone. */
  readonly selfTarget: string | undefined;
  /** Station 8's runner has fled the player's first blow: once true, it stays true. */
  readonly ratFled: boolean;
  /** Station 8's big rat has been knocked down: once true, it stays true. */
  readonly bigRatDown: boolean;
  /** The rats died before two skills landed, so one more came: once true, it stays true. */
  readonly extraRat: boolean;
  /** The last walk the player sent was an Alt walk, to the ground under the click (#3323). */
  readonly belowClicked: boolean;
}

/** The statuses station 7's ground gives (#3310): the mire's, then the molten strip's. */
export const ZONE_STATUSES = ["mired", "burning", "crippled"] as const;
export type ZoneStatus = (typeof ZONE_STATUSES)[number];

/**
 * The world a station runs in (#3247): the battlefield it starts on, the
 * canyon past the teleporter, or the canyon's second map (#3316).
 */
export type TutorialWorldName = "battlefield" | "canyon" | "canyon-2";

/** What a station points at: a mark on the ground, or a HUD element by its selector. */
export type StationHighlight =
  | {
      readonly kind: "ground";
      readonly at: Vec2;
      /** The layer it glows on (#3323): the world's ground where it names none. */
      readonly layer?: number;
    }
  | { readonly kind: "hud"; readonly element: string };

/** A line a station says once, when the view first shows what it is about. */
export interface StationAside {
  readonly line: MessageKey;
  /** The skills the line names, by its placeholder: `{ bash: "warrior.hammer-bash" }` (#3316). */
  readonly skills?: Readonly<Record<string, string>>;
  readonly when: (view: TutorialView) => boolean;
  /** What the HUD points at while this aside stands, over the station's own. */
  readonly highlight?: StationHighlight;
}

/** One beat of the tutorial (`docs/tutorial/playbook.md`): data, not code. */
export interface Station {
  readonly id: string;
  /**
   * i18n keys: said first, again after a while of nothing, and once it is
   * done; `how` stands under the first two, with the keys in it.
   */
  readonly lines: {
    readonly intro: MessageKey;
    readonly hint: MessageKey;
    readonly praise: MessageKey;
    readonly how: MessageKey;
    /** Said when the player is hit, at most once every `HIT_REPEAT_MS`, where a station has one. */
    readonly hit?: MessageKey;
  };
  readonly world: TutorialWorldName;
  /** The actions whose keys the lines show, as the player has them bound. */
  readonly keys?: readonly KeyAction[];
  /**
   * What it points at, or nothing: a look around has no one place. One that
   * moves as the player goes (#3303) is read from each look.
   */
  readonly highlight:
    StationHighlight | ((view: TutorialView) => StationHighlight | undefined) | undefined;
  /** A mark on the ground beside a HUD highlight (#3302), while this returns one. */
  readonly mark?: (view: TutorialView) => Vec2 | undefined;
  /** A line said once, the first look at which `when` holds (#3302). */
  readonly reaction?: StationAside;
  /**
   * Lines each said once, the first look at which its `when` holds, that
   * are no reaction: the hint goes on being said after them (#3303).
   */
  readonly asides?: readonly StationAside[];
  readonly done: (view: TutorialView) => boolean;
}

/** How close to a ground mark the player's body counts as on it, in world units. */
export const MARK_REACH = 40;

/**
 * Whether the player stands on the mark at `at` on `layer`: near it, and
 * on its layer, never under it on a floor below or over it on a deck.
 */
function onMark(view: TutorialView, at: Vec2, layer: number): boolean {
  return (
    view.selfLayer === layer && Math.hypot(view.self.x - at.x, view.self.y - at.y) <= MARK_REACH
  );
}

/** Station 1 (playbook §1): walk to the glowing mark by the tutor, on `layer`. */
export function walkStation(mark: Vec2, layer: number): Station {
  return {
    id: "walk",
    world: "battlefield",
    lines: {
      intro: "tutorial.walk.intro",
      hint: "tutorial.walk.hint",
      praise: "tutorial.walk.praise",
      how: "tutorial.walk.how",
    },
    keys: ["move-up", "move-left", "move-down", "move-right"],
    highlight: { kind: "ground", at: mark },
    done: (view) => onMark(view, mark, layer),
  };
}

/**
 * Station 2 (playbook §2): zoom out, drag the view, and find the
 * teleporter north of the pair. The wheel and the right button have no
 * key in the keymap, so the lines name the mouse.
 */
export function lookStation(teleporter: Vec2): Station {
  let seen = false;
  return {
    id: "look",
    world: "battlefield",
    lines: {
      intro: "tutorial.look.intro",
      hint: "tutorial.look.hint",
      praise: "tutorial.look.praise",
      how: "tutorial.look.how",
    },
    highlight: undefined,
    done: (view) => {
      // Seen at some moment, not only while the drag is held.
      seen ||= view.inView(teleporter);
      return seen && view.zoomedOut && view.lookDragged;
    },
  };
}

/** Station 3 (playbook §3): step onto the teleporter's pad, on `layer`, where its goal glows. */
export function stepInStation(pad: Vec2, layer: number): Station {
  return {
    id: "step-in",
    world: "battlefield",
    lines: {
      intro: "tutorial.stepIn.intro",
      hint: "tutorial.stepIn.hint",
      praise: "tutorial.stepIn.praise",
      how: "tutorial.stepIn.how",
    },
    keys: ["move-up", "move-left", "move-down", "move-right"],
    highlight: { kind: "ground", at: pad },
    done: (view) => onMark(view, pad, layer),
  };
}

/** How many rockfalls station 4 has the player dodge. */
export const DODGES_NEEDED = 3;

/**
 * Station 4 (playbook §4), in the canyon: dodge `DODGES_NEEDED`
 * rockfalls, then reach the mark at the boulder run's east end, on
 * `layer`. A hit neither counts nor undoes a dodge.
 */
export function dodgeStation(mark: Vec2, layer: number): Station {
  return {
    id: "dodge",
    world: "canyon",
    lines: {
      intro: "tutorial.dodge.intro",
      hint: "tutorial.dodge.hint",
      praise: "tutorial.dodge.praise",
      how: "tutorial.dodge.how",
      hit: "tutorial.dodge.hit",
    },
    keys: ["move-up", "move-left", "move-down", "move-right"],
    highlight: { kind: "ground", at: mark },
    done: (view) => view.rockfallDodges >= DODGES_NEEDED && onMark(view, mark, layer),
  };
}

/**
 * Station 5 (playbook §5), in the canyon: target the cracked wall and
 * break it. The ground mark at its west face, `face`, stands until the
 * wall is targeted, the target frame pulses throughout; the tutor reacts
 * once to the first blow, the wall below its `maxHealth`. A wall broken
 * before the station begins is done at once.
 */
export function breakWallStation(face: Vec2, maxHealth: number): Station {
  return {
    id: "break-wall",
    world: "canyon",
    lines: {
      intro: "tutorial.wall.intro",
      hint: "tutorial.wall.hint",
      praise: "tutorial.wall.praise",
      how: "tutorial.wall.how",
    },
    // A wall is targeted by a click: `target-closest` picks bodies only.
    keys: ["attack"],
    highlight: { kind: "hud", element: ".hud-target" },
    mark: (view) => (view.wallTargeted ? undefined : face),
    reaction: {
      line: "tutorial.wall.firstHit",
      when: (view) => view.wallHealth !== undefined && view.wallHealth < maxHealth,
    },
    done: (view) => view.wallHealth === 0,
  };
}

/** The tutor's row in the party window (#3303): where an ally is targeted by name. */
export function partyRow(memberId: string): string {
  return `.party-row[data-member="${memberId}"]`;
}

/** The skill bar's slot `slot`, from 0 (#3303). */
export function skillSlot(slot: number): string {
  return `.hud-skill:nth-child(${String(slot + 1)})`;
}

/**
 * Station 6 (playbook §6), in the canyon's clearing: a rock hits the
 * tutor, which says so, and the player heals it. The tutor's row in the party window
 * pulses until the tutor is targeted, then the heal's slot, `healSlot`,
 * does. Done once the player's heal lands on the tutor after a strike
 * hurt it: a heal before the hit does not count. The first time the
 * player's energy drops, the tutor names the bar once.
 */
export function healStation(tutorId: string, healSlot: number): Station {
  return {
    id: "heal",
    world: "canyon",
    lines: {
      intro: "tutorial.heal.intro",
      hint: "tutorial.heal.hint",
      praise: "tutorial.heal.praise",
      how: "tutorial.heal.how",
      hit: "tutorial.dodge.hit",
    },
    keys: ["skill-8"],
    highlight: (view) => ({
      kind: "hud",
      element: view.tutorTargeted ? skillSlot(healSlot) : partyRow(tutorId),
    }),
    asides: [
      { line: "tutorial.heal.ow", when: (view) => view.tutorHit },
      { line: "tutorial.heal.energy", when: (view) => view.energySpent },
    ],
    done: (view) => view.tutorHit && view.healedTutor,
  };
}

/** The effects monitor (#3310), where a status shows as an icon and a draining bar. */
export const EFFECTS_MONITOR = ".effects-monitor";
/** The player's health bar on the HUD (#3310). */
export const HEALTH_BAR = ".hud-bar-health";

/**
 * Station 7 (playbook §7), in the canyon: walk to the mark past the bad
 * ground, on `layer`, through the mud or round it. The first status the
 * ground gives the player gets one line, the mire's or the molten strip's,
 * and the effects monitor pulses, the mark beside it, until that status
 * runs out; a later one gets neither. The first drop in health gets the
 * health bar's line, pointing at it. Done on the mark, however the player came.
 */
export function badGroundStation(mark: Vec2, layer: number): Station {
  /** The first status the ground gave, and whether it has run out since. */
  let first: ZoneStatus | undefined;
  let ranOut = false;
  const look = (view: TutorialView): { first: ZoneStatus | undefined; showing: boolean } => {
    first ??= view.zoneStatus;
    ranOut ||= first !== undefined && view.zoneStatus === undefined;
    return { first, showing: first !== undefined && !ranOut };
  };
  return {
    id: "bad-ground",
    world: "canyon",
    lines: {
      intro: "tutorial.ground.intro",
      hint: "tutorial.ground.hint",
      praise: "tutorial.ground.praise",
      how: "tutorial.ground.how",
    },
    keys: ["move-up", "move-left", "move-down", "move-right"],
    highlight: (view) =>
      look(view).showing ? { kind: "hud", element: EFFECTS_MONITOR } : { kind: "ground", at: mark },
    mark: (view) => (look(view).showing ? mark : undefined),
    asides: [
      { line: "tutorial.ground.mired", when: (view) => look(view).first === "mired" },
      {
        line: "tutorial.ground.burning",
        when: (view) => {
          const { first: status } = look(view);
          return status === "burning" || status === "crippled";
        },
      },
      {
        line: "tutorial.ground.health",
        when: (view) => view.healthDropped,
        highlight: { kind: "hud", element: HEALTH_BAR },
      },
    ],
    done: (view) => onMark(view, mark, layer),
  };
}

/** The skills station 8 names (#3316), as the player's build holds them. */
export const RAT_SKILLS = {
  runner: "warrior.protectors-strike",
  bash: "warrior.hammer-bash",
  crush: "warrior.crushing-blow",
} as const;

/** How many distinct skills must land on the rats before station 8 is done (#3316). */
export const SKILLS_ON_RATS = 2;

/** Station 8's rats with a lesson each (#3316): the one that runs, and the big one. */
export interface StationRats {
  readonly runner: string;
  readonly big: string;
}

/** The slot of `skill` on `skillBar`, from 0. */
function slotOf(skillBar: readonly (string | null)[], skill: string): number {
  const slot = skillBar.indexOf(skill);
  if (slot < 0) {
    throw new Error(`station 8: ${skill} is not on the player's bar`);
  }
  return slot;
}

/**
 * Station 8 (playbook §8), at the canyon's rat pocket, `pocket`: three
 * rats, killed with at least two different skills. The player's build
 * has no ranged, area or condition skill, so the lesson is combos: the
 * runner, targeted, lights Protector's Strike, and its line is said once
 * it flees; the big rat, targeted, lights Hammer Bash, then Crushing Blow
 * once it is down. Otherwise the pocket is marked. If the rats died with
 * too few skills, one more came, and its line is said once. Done with no
 * rat standing and `SKILLS_ON_RATS` skills landed.
 */
export function ratsStation(
  pocket: Vec2,
  rats: StationRats,
  skillBar: readonly (string | null)[],
): Station {
  const runner = slotOf(skillBar, RAT_SKILLS.runner);
  const bash = slotOf(skillBar, RAT_SKILLS.bash);
  const crush = slotOf(skillBar, RAT_SKILLS.crush);
  return {
    id: "rats",
    world: "canyon-2",
    lines: {
      intro: "tutorial.rats.intro",
      hint: "tutorial.rats.hint",
      praise: "tutorial.rats.praise",
      how: "tutorial.rats.how",
    },
    keys: ["target-next", "target-closest"],
    highlight: (view) => {
      if (view.selfTarget === rats.runner) {
        return { kind: "hud", element: skillSlot(runner) };
      }
      if (view.selfTarget === rats.big) {
        return { kind: "hud", element: skillSlot(view.bigRatDown ? crush : bash) };
      }
      return { kind: "ground", at: pocket };
    },
    asides: [
      {
        line: "tutorial.rats.runs",
        skills: { skill: RAT_SKILLS.runner },
        when: (view) => view.ratFled,
      },
      {
        line: "tutorial.rats.big",
        skills: { bash: RAT_SKILLS.bash, crush: RAT_SKILLS.crush },
        when: (view) => view.selfTarget === rats.big,
      },
      { line: "tutorial.rats.again", when: (view) => view.extraRat },
    ],
    done: (view) => view.ratsAlive === 0 && view.skillsOnRats.size >= SKILLS_ON_RATS,
  };
}

/** The middle of `shape`'s bounds. */
function shapeCentre(shape: Shape): Vec2 {
  const corners = shapeVertices(shape);
  const xs = corners.map(({ x }) => x);
  const ys = corners.map(({ y }) => y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

/**
 * Station 9 (playbook §9), on the canyon's second map: up onto `ledge`,
 * on `upper`, then down to the ground under it, on `lower`. The mark is
 * on the ledge until the player has stood on it, then under its middle;
 * the cursor's rings teach the rest. Any way down counts, but one that was
 * no Alt walk gets the tip, once. Done under the ledge, after it.
 */
export function climbStation(ledge: Shape, stairs: Shape, upper: number, lower: number): Station {
  const centre = shapeCentre(ledge);
  /** The player has stood on the ledge; then has come down, and whether by an Alt walk. */
  let up = false;
  let down: { readonly byAlt: boolean } | undefined;
  const look = (view: TutorialView): { up: boolean; down: typeof down } => {
    // Not on its stairs (#3343): their top overlaps the ledge, and a walk
    // ordered from there can still take the player back down them.
    up ||=
      view.selfLayer === upper &&
      pointInShape(view.self, ledge) &&
      !pointInShape(view.self, stairs);
    if (up && down === undefined && view.selfLayer === lower) {
      down = { byAlt: view.belowClicked };
    }
    return { up, down };
  };
  return {
    id: "climb",
    world: "canyon-2",
    lines: {
      intro: "tutorial.climb.intro",
      hint: "tutorial.climb.hint",
      praise: "tutorial.climb.praise",
      how: "tutorial.climb.how",
    },
    highlight: (view) => ({ kind: "ground", at: centre, layer: look(view).up ? lower : upper }),
    asides: [
      { line: "tutorial.climb.under", when: (view) => look(view).up },
      {
        line: "tutorial.climb.tip",
        when: (view) => {
          const { down: came } = look(view);
          return came !== undefined && !came.byAlt;
        },
      },
    ],
    done: (view) => look(view).up && view.selfLayer === lower && pointInShape(view.self, ledge),
  };
}

/**
 * Station 10 (playbook §10), on the canyon's second map: up two flights of
 * stairs to the mark on the high deck, at `mark` on `layer`. A click on the
 * deck walks the whole way, so there is nothing new to press. Standing on
 * `landing`, on its layer between, gets one line once: on that layer
 * elsewhere, as on station 9's ledge, it does not. Done on the mark.
 */
export function rampStation(
  mark: Vec2,
  layer: number,
  landing: Shape,
  landingLayer: number,
): Station {
  return {
    id: "ramp",
    world: "canyon-2",
    lines: {
      intro: "tutorial.ramp.intro",
      hint: "tutorial.ramp.hint",
      praise: "tutorial.ramp.praise",
      how: "tutorial.ramp.how",
    },
    highlight: { kind: "ground", at: mark, layer },
    asides: [
      {
        line: "tutorial.ramp.landing",
        when: (view) => view.selfLayer === landingLayer && pointInShape(view.self, landing),
      },
    ],
    done: (view) => onMark(view, mark, layer),
  };
}
