import { describeSkill, getSkill } from "@vibewars/game-core";

import { createSkillTooltip } from "./skill-tooltip.js";

/**
 * The hover tooltip on a skill bar's slots in play (#485), shared by the
 * match HUD and the Training Ground. It describes the skill at the ranks
 * the host resolved, never the build the client claimed, so it cannot show
 * numbers for a build the host replaced with the house loadout.
 */

/** How long a slot is hovered or focused before its tooltip shows. */
export const SLOT_TOOLTIP_DELAY_MS = 300;

export interface SlotTooltips {
  /** Show `skillId`'s tooltip after a hover or focus on `button`, slot `slot`. */
  bind(
    button: HTMLElement,
    slot: number,
    skillId: string,
    ranks: () => ReadonlyMap<string, number>,
  ): void;
  /** `slot` is casting, or none is: hide that slot's tooltip, shown or waiting. */
  casting(slot: number | undefined): void;
  dispose(): void;
}

export function createSlotTooltips(): SlotTooltips {
  const tooltip = createSkillTooltip("above");
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The slot whose tooltip is up, or waiting out the delay.
  let current: number | undefined;

  const hide = (): void => {
    clearTimeout(timer);
    timer = undefined;
    current = undefined;
    tooltip.hide();
  };

  return {
    bind(button, slot, skillId, ranks) {
      const open = (): void => {
        hide();
        current = slot;
        timer = setTimeout(() => {
          timer = undefined;
          const skill = getSkill(skillId);
          if (skill !== undefined && button.isConnected) {
            tooltip.show(button, describeSkill(skill, ranks()));
          }
        }, SLOT_TOOLTIP_DELAY_MS);
      };
      button.addEventListener("mouseenter", open);
      button.addEventListener("focus", open);
      button.addEventListener("mouseleave", hide);
      button.addEventListener("blur", hide);
      // A click casts; the tooltip goes as the cast starts.
      button.addEventListener("click", hide);
    },
    casting(slot) {
      if (slot !== undefined && slot === current) {
        hide();
      }
    },
    dispose() {
      hide();
      tooltip.dispose();
    },
  };
}
