import type { Vec2 } from "@vibewars/game-core";

import type { MessageKey } from "../i18n/index.js";
import type { KeyAction } from "../input/keymap.js";

/**
 * What a station's check reads (#3218): where the player and the tutor
 * stand. Later stations add what they need, such as a zoom or a look-drag.
 */
export interface TutorialView {
  readonly self: Vec2;
  readonly tutor: Vec2;
}

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
  };
  /** The actions whose keys the lines show, as the player has them bound. */
  readonly keys?: readonly KeyAction[];
  readonly highlight: StationHighlight;
  readonly done: (view: TutorialView) => boolean;
}

/** How close to a ground mark the player's body counts as on it, in world units. */
export const MARK_REACH = 40;

/** Station 1 (playbook §1): walk to the glowing mark by the tutor. */
export function walkStation(mark: Vec2): Station {
  return {
    id: "walk",
    lines: {
      intro: "tutorial.walk.intro",
      hint: "tutorial.walk.hint",
      praise: "tutorial.walk.praise",
      how: "tutorial.walk.how",
    },
    keys: ["move-up", "move-left", "move-down", "move-right"],
    highlight: { kind: "ground", at: mark },
    done: (view) => Math.hypot(view.self.x - mark.x, view.self.y - mark.y) <= MARK_REACH,
  };
}
