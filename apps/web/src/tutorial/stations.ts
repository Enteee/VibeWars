import type { Vec2 } from "@vibewars/game-core";

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
}

/** The world a station runs in (#3247): the battlefield it starts on, or the canyon past the teleporter. */
export type TutorialWorldName = "battlefield" | "canyon";

/** What a station points at: a mark on the ground, or a HUD element by its selector. */
export type StationHighlight =
  | { readonly kind: "ground"; readonly at: Vec2 }
  | { readonly kind: "hud"; readonly element: string };

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
  /** What it points at, or nothing: a look around has no one place. */
  readonly highlight: StationHighlight | undefined;
  /** A mark on the ground beside a HUD highlight (#3302), while this returns one. */
  readonly mark?: (view: TutorialView) => Vec2 | undefined;
  /** A line said once, the first look at which `when` holds (#3302). */
  readonly reaction?: {
    readonly line: MessageKey;
    readonly when: (view: TutorialView) => boolean;
  };
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
