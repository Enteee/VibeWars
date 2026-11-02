import {
  describeSkill,
  getSkill,
  overcastText,
  type Skill,
  type SkillDescription,
} from "@vibewars/game-core";
import type { SkillSlot } from "@vibewars/game-session";

import { echoTooltipLine } from "./echo-strip.js";
import { createSkillTooltip, type SkillTooltip } from "./skill-tooltip.js";

/**
 * The hover tooltip on a skill bar's slots in play (#485), shared by the
 * match HUD and the Training Ground. It describes the skill at the ranks
 * the host resolved, never the build the client claimed, so it cannot show
 * numbers for a build the host replaced with a starter build.
 */

/** How long a slot is hovered or focused before its tooltip shows. */
export const SLOT_TOOLTIP_DELAY_MS = 300;

export interface SlotTooltips {
  /**
   * Show the tooltip of what `holding` gives after a hover or focus on
   * `button`, slot `slot`. Read at show time, so the cost is the one the
   * host last sent for the slot, and an echo's copy says how long it has
   * left by the match clock `now` (#1154).
   */
  bind(
    button: HTMLElement,
    slot: number,
    holding: () => SkillSlot | null,
    ranks: () => ReadonlyMap<string, number>,
    now: () => number,
  ): void;
  /** `slot` is casting, or none is: hide that slot's tooltip, shown or waiting. */
  casting(slot: number | undefined): void;
  /**
   * `slots` were redrawn (#469): an echo's copy came or went. Hide the
   * tooltip if it is one of theirs, shown or waiting, as it describes the
   * skill that was there, or hangs off a button no longer on the page.
   */
  repainted(slots: readonly number[]): void;
  /**
   * A step went by: re-read the shown tooltip, so a cost the host changed
   * under it, as Primal Echoes does a signet's (#1920), shows at once.
   */
  refresh(): void;
  dispose(): void;
}

export function createSlotTooltips(): SlotTooltips {
  // Made on the first hover, so a bar nobody hovers adds nothing to the page.
  let tooltip: SkillTooltip | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The slot whose tooltip is up, or waiting out the delay.
  let current: number | undefined;
  // The tooltip that is up: what it reads, and what it last said.
  let shown:
    { button: HTMLElement; read: () => SkillDescription | undefined; said: string } | undefined;

  const hide = (): void => {
    clearTimeout(timer);
    timer = undefined;
    current = undefined;
    shown = undefined;
    tooltip?.hide();
  };

  return {
    bind(button, slot, holding, ranks, now) {
      const open = (): void => {
        hide();
        current = slot;
        timer = setTimeout(() => {
          timer = undefined;
          const read = (): SkillDescription | undefined => {
            const held = holding();
            const skill = held === null ? undefined : getSkill(held.id);
            return held === null || skill === undefined
              ? undefined
              : slotDescription(skill, held, ranks(), now());
          };
          const description = read();
          if (description !== undefined && button.isConnected) {
            tooltip ??= createSkillTooltip("above");
            tooltip.show(button, description);
            shown = { button, read, said: JSON.stringify(description) };
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
    repainted(slots) {
      if (current !== undefined && slots.includes(current)) {
        hide();
      }
    },
    refresh() {
      if (shown === undefined) {
        return;
      }
      const description = shown.read();
      if (description === undefined || !shown.button.isConnected) {
        hide();
        return;
      }
      // Drawn again only when it says something new, not every step.
      const said = JSON.stringify(description);
      if (said !== shown.said) {
        shown.said = said;
        tooltip?.show(shown.button, description);
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
 * in brackets as the editor writes a rank's discount. An echo's copy
 * ends with how long it has left at `now` (#1154).
 */
export function slotDescription(
  skill: Skill,
  slot: SkillSlot,
  ranks: ReadonlyMap<string, number>,
  now: number,
): SkillDescription {
  const described = describeSkill(skill, ranks);
  const echoed = echoTooltipLine(slot, now);
  const description =
    echoed === undefined
      ? described
      : {
          ...described,
          effects: [...described.effects, { text: echoed, parts: [echoed], magnitude: undefined }],
        };
  // A signet under Primal Echoes (#1886) costs Energy it does not list.
  const listed = skill.cost?.kind === "energy" ? skill.cost.amount : undefined;
  if (listed === undefined && slot.energyCost === 0) {
    return description;
  }
  const base = listed === undefined || slot.energyCost === listed ? "" : ` (${String(listed)})`;
  return { ...description, cost: `${String(slot.energyCost)} energy${base}${overcastText(skill)}` };
}
