import { describeSkill, getSkill, type Skill, type SkillDescription } from "@vibewars/game-core";
import type { SkillSlot } from "@vibewars/game-session";

import { createSkillTooltip, type SkillTooltip } from "./skill-tooltip.js";

/**
 * The hover tooltip on a skill bar's slots in play (#485), shared by the
 * match HUD and the Training Ground. It describes the skill at the ranks
 * the host resolved, never the build the client claimed, so it cannot show
 * numbers for a build the host replaced with the house loadout.
 */

/** How long a slot is hovered or focused before its tooltip shows. */
export const SLOT_TOOLTIP_DELAY_MS = 300;

export interface SlotTooltips {
  /**
   * Show the tooltip of what `holding` gives after a hover or focus on
   * `button`, slot `slot`. Read at show time, so the cost is the one the
   * host last sent for the slot.
   */
  bind(
    button: HTMLElement,
    slot: number,
    holding: () => SkillSlot | null,
    ranks: () => ReadonlyMap<string, number>,
  ): void;
  /** `slot` is casting, or none is: hide that slot's tooltip, shown or waiting. */
  casting(slot: number | undefined): void;
  dispose(): void;
}

export function createSlotTooltips(): SlotTooltips {
  // Made on the first hover, so a bar nobody hovers adds nothing to the page.
  let tooltip: SkillTooltip | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The slot whose tooltip is up, or waiting out the delay.
  let current: number | undefined;

  const hide = (): void => {
    clearTimeout(timer);
    timer = undefined;
    current = undefined;
    tooltip?.hide();
  };

  return {
    bind(button, slot, holding, ranks) {
      const open = (): void => {
        hide();
        current = slot;
        timer = setTimeout(() => {
          timer = undefined;
          const held = holding();
          const skill = held === null ? undefined : getSkill(held.id);
          if (held !== null && skill !== undefined && button.isConnected) {
            tooltip ??= createSkillTooltip("above");
            tooltip.show(button, slotDescription(skill, held, ranks()));
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
      tooltip?.dispose();
      tooltip = undefined;
    },
  };
}

/**
 * `skill` at `ranks`, priced as the host priced `slot`: the bar shows no
 * cost (#719), so a glyph's discount (#637) is read here, with the base
 * in brackets as the editor writes a rank's discount.
 */
export function slotDescription(
  skill: Skill,
  slot: SkillSlot,
  ranks: ReadonlyMap<string, number>,
): SkillDescription {
  const description = describeSkill(skill, ranks);
  if (skill.cost?.kind !== "energy") {
    return description;
  }
  const base = slot.energyCost === skill.cost.amount ? "" : ` (${String(skill.cost.amount)})`;
  return { ...description, cost: `${String(slot.energyCost)} energy${base}` };
}
