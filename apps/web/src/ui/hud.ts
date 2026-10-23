import type { PlayerSnapshot, SkillSlot } from "../net/match-client.js";

/**
 * The player's heads-up display: health/energy, skill bar, and status
 * readout.
 *
 * Plain DOM, not Phaser (brief §21: "use normal HTML/CSS UI where that is
 * superior"). Bars and buttons are exactly what the DOM is good at, and
 * keeping them out of the canvas means they stay crisp, accessible, and
 * styleable without touching the renderer.
 */

export interface HudElements {
  readonly root: HTMLElement;
  readonly healthFill: HTMLElement;
  readonly healthText: HTMLElement;
  readonly energyFill: HTMLElement;
  readonly energyText: HTMLElement;
  readonly adrenalineText: HTMLElement;
  readonly statusList: HTMLElement;
  readonly skillBar: HTMLElement;
  readonly targetPanel: HTMLElement;
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

export function createHud(parent: HTMLElement): HudElements {
  const root = element("div", "hud", parent);

  const targetPanel = element("div", "hud-target", root);

  const bars = element("div", "hud-bars", root);

  const healthRow = element("div", "hud-bar hud-bar-health", bars);
  const healthFill = element("div", "hud-bar-fill", healthRow);
  const healthText = element("span", "hud-bar-label", healthRow);

  const energyRow = element("div", "hud-bar hud-bar-energy", bars);
  const energyFill = element("div", "hud-bar-fill", energyRow);
  const energyText = element("span", "hud-bar-label", energyRow);

  const adrenalineText = element("div", "hud-adrenaline", bars);
  const statusList = element("div", "hud-statuses", bars);

  const skillBar = element("div", "hud-skills", root);

  return {
    root,
    healthFill,
    healthText,
    energyFill,
    energyText,
    adrenalineText,
    statusList,
    skillBar,
    targetPanel,
  };
}

/** Render the skill bar once; slots are stable for the match's lifetime. */
export function renderSkillBar(
  hud: HudElements,
  slots: readonly SkillSlot[],
  onUse: (slot: number) => void,
): void {
  hud.skillBar.replaceChildren();
  slots.forEach((slot, index) => {
    const button = document.createElement("button");
    button.className = "hud-skill";
    button.type = "button";
    // 1-9 then 0, matching the hotkeys bound in main.ts.
    const hotkey = index < 9 ? String(index + 1) : "0";
    button.innerHTML =
      `<span class="hud-skill-key">${hotkey}</span>` +
      `<span class="hud-skill-name"></span>` +
      `<span class="hud-skill-cost"></span>`;
    const nameNode = button.querySelector(".hud-skill-name");
    const costNode = button.querySelector(".hud-skill-cost");
    if (nameNode !== null) {
      nameNode.textContent = slot.name;
    }
    if (costNode !== null) {
      costNode.textContent =
        slot.adrenalineCost > 0 ? `${String(slot.adrenalineCost)}a` : `${String(slot.energyCost)}e`;
    }
    button.addEventListener("click", () => {
      onUse(index);
    });
    hud.skillBar.appendChild(button);
  });
}

function setBar(
  fill: HTMLElement,
  label: HTMLElement,
  value: number,
  max: number,
  suffix: string,
): void {
  const fraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  fill.style.width = `${String(fraction * 100)}%`;
  label.textContent = `${String(Math.round(value))} / ${String(Math.round(max))} ${suffix}`;
}

/** Update the HUD from the latest authoritative snapshot of this player. */
export function updateHud(
  hud: HudElements,
  self: PlayerSnapshot | undefined,
  target: PlayerSnapshot | undefined,
  skillBar: readonly SkillSlot[],
): void {
  if (self === undefined) {
    return;
  }

  setBar(hud.healthFill, hud.healthText, self.health, self.maxHealth, "hp");
  setBar(hud.energyFill, hud.energyText, self.energy, self.maxEnergy, "en");
  hud.adrenalineText.textContent = `adrenaline ${String(self.adrenaline)}`;

  hud.statusList.textContent =
    self.statuses.length > 0 ? self.statuses.join(" · ") : "no active effects";

  hud.targetPanel.textContent =
    target === undefined
      ? "no target"
      : `target: ${target.sessionId.slice(0, 6)} — ${String(Math.round(target.health))}/${String(
          Math.round(target.maxHealth),
        )} hp${target.dead ? " (dead)" : ""}`;

  // Grey out skills the player cannot currently afford. The server is
  // still the authority on whether a cast is legal — this is a hint, not
  // a gate (brief §32).
  const buttons = hud.skillBar.querySelectorAll("button");
  skillBar.forEach((slot, index) => {
    const button = buttons[index];
    if (button === undefined) {
      return;
    }
    const affordable =
      slot.adrenalineCost > 0
        ? self.adrenaline >= slot.adrenalineCost
        : self.energy >= slot.energyCost;
    button.classList.toggle("is-unaffordable", !affordable);
  });
}
