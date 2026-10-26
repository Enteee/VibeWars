import { formatScalingRange, type SkillDescription } from "@vibewars/game-core";

/**
 * The hover tooltip for a skill box.
 *
 * One floating element reused by every box, rather than a tooltip per
 * skill: there are dozens of boxes, only one can be hovered, and a
 * single node means the tooltip can never be clipped by a scrolling
 * parent's `overflow`.
 */

export interface SkillTooltip {
  show(anchor: HTMLElement, description: SkillDescription): void;
  hide(): void;
  dispose(): void;
}

function row(parent: HTMLElement, label: string, value: string): void {
  const line = document.createElement("div");
  line.className = "tip-stat";
  const name = document.createElement("span");
  name.className = "tip-stat-label";
  name.textContent = label;
  const amount = document.createElement("span");
  amount.textContent = value;
  line.append(name, amount);
  parent.appendChild(line);
}

/**
 * A skill's description into `node`: its type, attribute, effect lines
 * with the span the attribute buys, and its cost, cast, recharge and
 * target. The hover tooltip and a library card's inline details (#567)
 * both show it; the card already names the skill, so it leaves the title.
 */
export function renderSkillDescription(
  node: HTMLElement,
  description: SkillDescription,
  options: { readonly title: boolean } = { title: true },
): void {
  node.replaceChildren();
  if (options.title) {
    const title = document.createElement("div");
    title.className = "tip-title";
    title.textContent = description.name;
    node.appendChild(title);
  }

  // "Signet.", "Hex Spell.": what kind of skill, as GW1 words it (#524).
  const type = document.createElement("div");
  type.className = "tip-type";
  type.textContent = description.typeText;
  node.appendChild(type);

  // A "No Attribute" skill has no line here, as in GW1 (#445).
  if (description.attributeName !== undefined) {
    const attribute = document.createElement("div");
    attribute.className = "tip-attribute";
    attribute.textContent = description.attributeName;
    node.appendChild(attribute);
  }

  const effects = document.createElement("div");
  effects.className = "tip-effects";
  for (const effect of description.effects) {
    const line = document.createElement("div");
    line.className = "tip-effect";
    line.textContent = effect.text;

    // The span the attribute buys, next to the value it currently has.
    // Showing only the current number hides what another point would
    // do; showing only the span hides what you actually have.
    const span = effect.magnitude === undefined ? undefined : formatScalingRange(effect.magnitude);
    if (span !== undefined) {
      const scale = document.createElement("span");
      scale.className = "tip-scale";
      scale.textContent = ` (${span})`;
      line.appendChild(scale);
    }
    effects.appendChild(line);
  }
  node.appendChild(effects);

  const stats = document.createElement("div");
  stats.className = "tip-stats";
  row(stats, "cost", description.cost);
  row(stats, "cast", description.castTime);
  row(stats, "recharge", description.recharge);
  row(
    stats,
    "target",
    description.rangeText === undefined
      ? description.targetText
      : `${description.targetText}, ${description.rangeText}`,
  );
  node.appendChild(stats);
}

/**
 * Where the tooltip goes. `beside` the anchor suits a list; `above` suits
 * a skill bar at the bottom of the screen, which it must never cover (#485).
 */
export type SkillTooltipPlacement = "beside" | "above";

export function createSkillTooltip(placement: SkillTooltipPlacement = "beside"): SkillTooltip {
  const node = document.createElement("div");
  node.className = "skill-tip";
  node.setAttribute("role", "tooltip");
  node.style.display = "none";
  document.body.appendChild(node);

  const render = (description: SkillDescription): void => {
    node.classList.toggle("is-elite", description.elite);
    renderSkillDescription(node, description);
  };

  /**
   * Place the tooltip beside its anchor, nudged back inside the viewport.
   *
   * Positioned in viewport coordinates against `position: fixed`, so a
   * box inside the scrolling library list gets a tooltip that tracks it
   * without inheriting the list's clipping.
   */
  const place = (anchor: HTMLElement): void => {
    const box = anchor.getBoundingClientRect();
    node.style.display = "block";
    const tip = node.getBoundingClientRect();
    const margin = 8;

    let left: number;
    let top: number;
    if (placement === "above") {
      left = box.left + box.width / 2 - tip.width / 2;
      top = box.top - tip.height - margin;
    } else {
      left = box.left - tip.width - margin;
      if (left < margin) {
        // No room on the left; flip to the right of the anchor.
        left = box.right + margin;
      }
      top = box.top;
    }
    left = Math.min(left, window.innerWidth - tip.width - margin);
    left = Math.max(margin, left);
    top = Math.min(top, window.innerHeight - tip.height - margin);
    top = Math.max(margin, top);

    node.style.left = `${String(Math.round(left))}px`;
    node.style.top = `${String(Math.round(top))}px`;
  };

  return {
    show(anchor, description) {
      render(description);
      place(anchor);
    },
    hide() {
      node.style.display = "none";
    },
    dispose() {
      node.remove();
    },
  };
}
