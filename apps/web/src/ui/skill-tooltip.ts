import { getAttribute, type DescriptionPart, type SkillDescription } from "@vibewars/game-core";
import type { CorpusSkill } from "@vibewars/game-data/corpus";

import { skillIconHtml } from "./icons.js";
import { corpusCastText, corpusCostText, corpusRechargeText } from "./skill-library.js";

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
  /** A GW1 skill not in the game yet (#1220): GW1's own fields. */
  showCorpus(anchor: HTMLElement, skill: CorpusSkill): void;
  /** Redraws an open tooltip in place at new numbers (#1932); closed, does nothing. */
  update(description: SkillDescription): void;
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
 * `parts` into `node`: prose as text, a number an attribute scales as a
 * `.scaled-number` span (#1932), green and bold, as GW1 draws it.
 */
export function appendParts(node: HTMLElement, parts: readonly DescriptionPart[]): void {
  for (const part of parts) {
    if (typeof part === "string") {
      node.append(part);
    } else {
      const number = document.createElement("span");
      number.className = "scaled-number";
      number.textContent = part.scaled;
      node.appendChild(number);
    }
  }
}

/** The tooltip header's skill icon, px (#727). */
const TIP_ICON_PX = 48;

/**
 * A skill's description into `node`: its type, an attack skill's weapon,
 * its attribute, effect lines with their scaled numbers drawn apart, and
 * its cost, cast, recharge and target. The hover tooltip and a library card's inline details (#567)
 * both show it; the card already names the skill and shows its icon, so
 * it leaves the header (#727).
 */
export function renderSkillDescription(
  node: HTMLElement,
  description: SkillDescription,
  options: { readonly title: boolean } = { title: true },
): void {
  node.replaceChildren();
  // "Signet.", "Hex Spell.": what kind of skill, as GW1 words it (#524).
  const type = document.createElement("div");
  type.className = "tip-type";
  type.textContent = description.typeText;
  if (options.title) {
    // The icon, with the name and type beside it (#727).
    const header = document.createElement("div");
    header.className = "tip-header";
    header.insertAdjacentHTML("beforeend", skillIconHtml(description.id, TIP_ICON_PX));
    const heading = document.createElement("div");
    const title = document.createElement("div");
    title.className = "tip-title";
    title.textContent = description.name;
    heading.append(title, type);
    header.appendChild(heading);
    node.appendChild(header);
  } else {
    node.appendChild(type);
  }

  // "Axe attack": the weapon an attack skill needs (#417).
  if (description.weaponText !== undefined) {
    const weapon = document.createElement("div");
    weapon.className = "tip-weapon";
    weapon.textContent = description.weaponText;
    node.appendChild(weapon);
  }

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
    appendParts(line, effect.parts);
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
 * A GW1 skill not in the game yet (#1220) into `node`, as its library
 * card shows it on hover: its name, GW1's type, its attribute, GW1's text
 * as is, and its cost, cast and recharge. Nothing in it is ours to scale.
 */
export function renderCorpusDescription(node: HTMLElement, skill: CorpusSkill): void {
  node.replaceChildren();
  const header = document.createElement("div");
  header.className = "tip-header";
  header.insertAdjacentHTML("beforeend", skillIconHtml("", TIP_ICON_PX));
  const heading = document.createElement("div");
  const title = document.createElement("div");
  title.className = "tip-title";
  title.textContent = skill.name;
  const type = document.createElement("div");
  type.className = "tip-type";
  type.textContent = `${skill.elite ? "Elite " : ""}${skill.typeText}. Not in the game yet.`;
  heading.append(title, type);
  header.appendChild(heading);
  node.appendChild(header);

  const attribute = document.createElement("div");
  attribute.className = "tip-attribute";
  attribute.textContent =
    skill.attributeId === undefined
      ? "No Attribute"
      : (getAttribute(skill.attributeId)?.name ?? skill.attributeId);
  node.appendChild(attribute);

  const text = document.createElement("div");
  text.className = "tip-effects";
  const line = document.createElement("div");
  line.className = "tip-effect";
  line.textContent = skill.description;
  text.appendChild(line);
  node.appendChild(text);

  const stats = document.createElement("div");
  stats.className = "tip-stats";
  row(stats, "cost", corpusCostText(skill));
  row(stats, "cast", corpusCastText(skill));
  row(stats, "recharge", corpusRechargeText(skill));
  node.appendChild(stats);
}

/**
 * Where the tooltip goes. `beside` the anchor suits a list; `above` suits
 * a skill bar at the bottom of the screen, which it must never cover (#485);
 * `below` suits the target frame at the top (#1042).
 */
export type SkillTooltipPlacement = "beside" | "above" | "below";

/**
 * Place a tooltip `node` beside, above or below its anchor, nudged back inside
 * the viewport, and show it.
 *
 * Positioned in viewport coordinates against `position: fixed`, so a
 * box inside the scrolling library list gets a tooltip that tracks it
 * without inheriting the list's clipping.
 */
export function placeTip(
  node: HTMLElement,
  anchor: HTMLElement,
  placement: SkillTooltipPlacement,
): void {
  const box = anchor.getBoundingClientRect();
  node.style.display = "block";
  const tip = node.getBoundingClientRect();
  const margin = 8;

  let left: number;
  let top: number;
  if (placement === "above") {
    left = box.left + box.width / 2 - tip.width / 2;
    top = box.top - tip.height - margin;
  } else if (placement === "below") {
    left = box.left + box.width / 2 - tip.width / 2;
    top = box.bottom + margin;
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
}

export function createSkillTooltip(placement: SkillTooltipPlacement = "beside"): SkillTooltip {
  const node = document.createElement("div");
  node.className = "skill-tip";
  node.setAttribute("role", "tooltip");
  node.style.display = "none";
  document.body.appendChild(node);

  // What the open tooltip hangs from, while it shows a description.
  let shownAt: HTMLElement | undefined;
  const render = (description: SkillDescription): void => {
    node.classList.toggle("is-elite", description.elite);
    renderSkillDescription(node, description);
  };

  return {
    show(anchor, description) {
      render(description);
      placeTip(node, anchor, placement);
      shownAt = anchor;
    },
    showCorpus(anchor, skill) {
      shownAt = undefined;
      node.classList.toggle("is-elite", skill.elite);
      renderCorpusDescription(node, skill);
      placeTip(node, anchor, placement);
    },
    update(description) {
      if (shownAt === undefined || node.style.display === "none") {
        return;
      }
      render(description);
      placeTip(node, shownAt, placement);
    },
    hide() {
      node.style.display = "none";
      shownAt = undefined;
    },
    dispose() {
      node.remove();
    },
  };
}
