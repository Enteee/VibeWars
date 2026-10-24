import { getWeapon, type ActivationRejection } from "@vibewars/game-core";

import type { MatchSnapshot, PlayerSnapshot, SkillSlot } from "../net/match-client.js";

/**
 * The player's heads-up display: health/energy, skill bar, and status
 * readout.
 *
 * Plain DOM, not Phaser (brief §21: "use normal HTML/CSS UI where that is
 * superior"). Bars and buttons are exactly what the DOM is good at, and
 * keeping them out of the canvas means they stay crisp, accessible, and
 * styleable without touching the renderer.
 */

/** A weapon's display name, falling back to its raw id if unknown. */
function describeWeaponName(weaponId: string): string {
  return getWeapon(weaponId)?.name ?? weaponId;
}

export interface HudElements {
  readonly root: HTMLElement;
  readonly healthFill: HTMLElement;
  readonly healthText: HTMLElement;
  readonly energyFill: HTMLElement;
  readonly energyText: HTMLElement;
  readonly adrenalineText: HTMLElement;
  readonly statusList: HTMLElement;
  readonly skillBar: HTMLElement;
  /** One line above the skill bar, for why a key did nothing. */
  readonly message: HTMLElement;
  readonly targetPanel: HTMLElement;
  readonly scoreboard: HTMLElement;
  readonly result: HTMLElement;
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

export function createHud(parent: HTMLElement): HudElements {
  const root = element("div", "hud", parent);

  // Score and clock sit at the top, away from the skill bar, so a glance
  // for "am I winning" never competes with a glance for "what can I cast".
  const scoreboard = element("div", "hud-scoreboard", parent);
  const result = element("div", "hud-result", parent);
  result.style.display = "none";

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

  const message = element("div", "hud-message", root);
  message.setAttribute("role", "status");
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
    message,
    targetPanel,
    scoreboard,
    result,
  };
}

/**
 * What the player is told when the server refuses a cast, in the terse,
 * one-line style of the genre. A `Record` over every rejection, so a new
 * one in game-core does not compile until it has a message here.
 */
const REFUSALS: Readonly<Record<ActivationRejection, string>> = {
  "caster-dead": "You are dead.",
  "skill-not-on-bar": "That skill is not on your bar.",
  "still-recharging": "That skill is recharging.",
  "already-casting": "You are already using a skill.",
  "insufficient-energy": "Not enough energy.",
  "insufficient-adrenaline": "Not enough adrenaline.",
  "no-target": "Select a target first.",
  "invalid-target-dead": "Your target is dead.",
  "invalid-target-self": "You cannot target yourself with that.",
  "invalid-target-ally": "That skill needs an enemy target.",
  "invalid-target-enemy": "That skill needs an ally target.",
  "out-of-range": "Target is out of range.",
  "no-line-of-sight": "Target is not in line of sight.",
};

/**
 * The line for a refusal reason as the server sent it. A reason this
 * client does not know (wrong data, not old data) still says something.
 */
export function describeRefusal(reason: string): string {
  return isRejection(reason) ? REFUSALS[reason] : "You cannot use that skill now.";
}

function isRejection(reason: string): reason is ActivationRejection {
  return Object.hasOwn(REFUSALS, reason);
}

/** How long a refusal stays on screen. */
export const MESSAGE_SECONDS = 2;

const messageTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Show `text` on the message line for MESSAGE_SECONDS. A newer message
 * replaces the old one and restarts the clock, so mashing a key that is out
 * of range keeps the reason up rather than flickering.
 */
export function flashMessage(hud: HudElements, text: string): void {
  hud.message.textContent = text;
  hud.message.classList.add("is-visible");
  const previous = messageTimers.get(hud.message);
  if (previous !== undefined) {
    clearTimeout(previous);
  }
  messageTimers.set(
    hud.message,
    setTimeout(() => {
      hud.message.classList.remove("is-visible");
    }, MESSAGE_SECONDS * 1000),
  );
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
/** Format a match clock as m:ss. */
export function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

/** The end-of-match line a player reads, from their own team's point of view. */
export function describeOutcome(
  winningTeam: number | undefined,
  reason: string | undefined,
  selfTeam: number | undefined,
): string {
  const why = reason === "time" ? " (time)" : "";
  if (winningTeam === undefined) {
    return `Draw${why}`;
  }
  if (selfTeam === undefined) {
    return `Team ${String(winningTeam + 1)} wins${why}`;
  }
  return winningTeam === selfTeam ? `Victory${why}` : `Defeat${why}`;
}

export function updateHud(
  hud: HudElements,
  self: PlayerSnapshot | undefined,
  target: PlayerSnapshot | undefined,
  skillBar: readonly SkillSlot[],
  match?: MatchSnapshot,
): void {
  if (match !== undefined) {
    hud.scoreboard.textContent = `${String(match.scoreTeam0)} — ${String(match.scoreTeam1)}  ·  ${formatClock(match.elapsedSeconds)}`;

    if (match.phase === "finished") {
      hud.result.style.display = "";
      hud.result.textContent = describeOutcome(match.winningTeam, match.endReason, self?.team);
    } else {
      hud.result.style.display = "none";
    }
  }

  if (self === undefined) {
    return;
  }

  setBar(hud.healthFill, hud.healthText, self.health, self.maxHealth, "hp");
  setBar(hud.energyFill, hud.energyText, self.energy, self.maxEnergy, "en");
  // Armor and weapon alongside adrenaline: both are now numbers that
  // change what a fight does, so hiding them would be the HUD lying by
  // omission.
  hud.adrenalineText.textContent =
    `adrenaline ${String(self.adrenaline)} · armor ${String(self.armor)}` +
    (self.weaponId === undefined ? "" : ` · ${describeWeaponName(self.weaponId)}`);

  hud.statusList.textContent =
    self.statuses.length > 0 ? self.statuses.join(" · ") : "no active effects";

  hud.targetPanel.textContent =
    target === undefined
      ? "no target"
      : `target: ${target.sessionId.slice(0, 6)} — ${String(Math.round(target.health))}/${String(
          Math.round(target.maxHealth),
        )} hp · armor ${String(target.armor)}${
          target.weaponId === undefined ? "" : ` · ${describeWeaponName(target.weaponId)}`
        }${target.dead ? " (dead)" : ""}`;

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
