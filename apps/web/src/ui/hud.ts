import {
  getProfession,
  getSkill,
  getWeapon,
  type ActivationRejection,
  type AttackWeaponClass,
} from "@vibewars/game-core";
import type { CastRefusedMessage } from "@vibewars/game-protocol";
import type {
  MatchSnapshot,
  PlayerSnapshot,
  SkillSlot,
  SlotRecharge,
} from "@vibewars/game-session";

import type { KeyLabeller } from "../input/key-labels.js";
import { SKILL_ACTIONS, actionLabel, codeLabel, type Keymap } from "../input/keymap.js";
import { attackingIcon, professionIcon, skillBadgeHtml, soundIcon } from "./icons.js";
import { paintRecharge, prefersReducedMotion } from "./recharge-overlay.js";
import { castingSlot } from "./skill-slot-state.js";

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
  /** How to target, until the first target of the match (#55). */
  readonly hint: HTMLElement;
  /** Set once there has been a target; the hint never comes back that match. */
  hintDismissed: boolean;
  readonly targetPanel: HTMLElement;
  /** The target's primary and secondary profession icons, before its name (#281). */
  readonly targetProfessions: HTMLElement;
  /** Who is targeted, as text, inside the target panel. */
  readonly targetText: HTMLElement;
  /** Crossed swords and "attacking", shown while self attacks the target (#160). */
  readonly attacking: HTMLElement;
  readonly scoreboard: HTMLElement;
  readonly result: HTMLElement;
  /** Sound on or off (#112); `renderMute` keeps it showing which. */
  readonly mute: HTMLButtonElement;
  /** Opens the jukebox (#372), showing whether the music is muted. */
  readonly music: HTMLButtonElement;
  /** Leave the match, after a yes (#160): Esc cancels an attack now. */
  readonly leave: HTMLElement;
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

/**
 * Shown above the skill bar until the player first has a target (#55),
 * with the keymap's target and names keys (#253, #302). A clause whose
 * action has no key is left out.
 */
export function targetHint(keymap: Keymap, label: KeyLabeller = codeLabel): string {
  const next = actionLabel(keymap, "target-next", label);
  const names = actionLabel(keymap, "show-names", label);
  return (
    (next === "" ? "Click an enemy to target" : `Click an enemy or press ${next} to target`) +
    (names === "" ? "" : ` · hold ${names} for names`)
  );
}

/**
 * Label the skill slots' hotkeys and the targeting hint from `keymap`:
 * once by code when the HUD is drawn, and again once the keyboard's
 * layout is known.
 */
export function renderKeyLabels(
  hud: HudElements,
  keymap: Keymap,
  label: KeyLabeller = codeLabel,
): void {
  hud.hint.textContent = targetHint(keymap, label);
  hud.skillBar.querySelectorAll(".hud-skill-key").forEach((node, index) => {
    const action = SKILL_ACTIONS[index];
    node.textContent = action === undefined ? "" : actionLabel(keymap, action, label);
  });
}

/**
 * Whether the targeting hint is gone for good: it was already, or the
 * player has a target now. Clearing the target later does not bring it
 * back.
 */
export function targetHintDismissed(
  wasDismissed: boolean,
  self: PlayerSnapshot | undefined,
): boolean {
  return wasDismissed || self?.targetSessionId !== undefined;
}

export function createHud(parent: HTMLElement): HudElements {
  const root = element("div", "hud", parent);

  // Score and clock sit at the top, away from the skill bar, so a glance
  // for "am I winning" never competes with a glance for "what can I cast".
  const scoreboard = element("div", "hud-scoreboard", parent);
  const result = element("div", "hud-result", parent);
  result.style.display = "none";
  const mute = document.createElement("button");
  mute.type = "button";
  mute.className = "hud-mute";
  mute.appendChild(document.createElement("img")).alt = "";
  parent.appendChild(mute);
  const music = document.createElement("button");
  music.type = "button";
  music.className = "hud-music";
  music.setAttribute("aria-label", "Music");
  music.setAttribute("aria-haspopup", "dialog");
  music.title = "Music";
  music.appendChild(document.createElement("img")).alt = "";
  parent.appendChild(music);
  const leave = element("div", "hud-leave", parent);

  const targetPanel = element("div", "hud-target", root);
  const targetProfessions = element("span", "hud-target-professions", targetPanel);
  const targetText = element("span", "hud-target-text", targetPanel);
  const attacking = element("span", "hud-attacking", targetPanel);
  const swords = attacking.appendChild(document.createElement("img"));
  swords.src = attackingIcon();
  swords.alt = "";
  attacking.append("attacking");
  attacking.hidden = true;

  const bars = element("div", "hud-bars", root);

  const healthRow = element("div", "hud-bar hud-bar-health", bars);
  const healthFill = element("div", "hud-bar-fill", healthRow);
  const healthText = element("span", "hud-bar-label", healthRow);

  const energyRow = element("div", "hud-bar hud-bar-energy", bars);
  const energyFill = element("div", "hud-bar-fill", energyRow);
  const energyText = element("span", "hud-bar-label", energyRow);

  const adrenalineText = element("div", "hud-adrenaline", bars);
  const statusList = element("div", "hud-statuses", bars);

  const hint = element("div", "hud-hint", root);
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
    hint,
    hintDismissed: false,
    targetPanel,
    targetProfessions,
    targetText,
    attacking,
    scoreboard,
    result,
    mute,
    music,
    leave,
  };
}

/**
 * Show whether the sound is on. The icon is the current state, not what a
 * click does (art-direction §UI controls), and the label says both.
 */
export function muteButtonState(muted: boolean): {
  readonly label: string;
  readonly pressed: "true" | "false";
  readonly title: string;
  readonly icon: string;
} {
  return {
    // A toggle keeps one name; whether it is on is what aria-pressed says.
    label: "Mute sounds",
    pressed: muted ? "true" : "false",
    title: muted ? "Sound off. Press M to turn it on." : "Sound on. Press M to mute.",
    icon: soundIcon(muted),
  };
}

export function renderMute(hud: HudElements, muted: boolean): void {
  const state = muteButtonState(muted);
  const icon = hud.mute.querySelector("img");
  if (icon !== null) {
    icon.src = state.icon;
  }
  hud.mute.setAttribute("aria-label", state.label);
  hud.mute.setAttribute("aria-pressed", state.pressed);
  hud.mute.title = state.title;
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
  "wrong-weapon": "You need another weapon for that.",
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

/** Where an attack's refusal differs from a cast's: it is about the weapon, not a skill. */
const ATTACK_REFUSALS: Readonly<Partial<Record<ActivationRejection, string>>> = {
  "invalid-target-self": "You cannot attack yourself.",
  "invalid-target-ally": "You can only attack an enemy.",
};

/** An attack skill refused for the weapon in hand names the one it needs (ADR-0029). */
const NEEDS: Readonly<Record<AttackWeaponClass, string>> = {
  axe: "Needs an axe.",
  sword: "Needs a sword.",
  hammer: "Needs a hammer.",
  daggers: "Needs daggers.",
  scythe: "Needs a scythe.",
  spear: "Needs a spear.",
  bow: "Needs a bow.",
  melee: "Needs a melee weapon.",
};

/**
 * The line for a refusal as the server sent it. A reason this client does
 * not know (wrong data, not old data) still says something.
 */
export function describeRefusal(refusal: CastRefusedMessage): string {
  const { reason } = refusal;
  if (!isRejection(reason)) {
    return refusal.kind === "attack" ? "You cannot attack now." : "You cannot use that skill now.";
  }
  if (refusal.kind === "skill" && reason === "wrong-weapon") {
    const needed = getSkill(refusal.skillId)?.attack?.weapon;
    return needed === undefined ? REFUSALS[reason] : NEEDS[needed];
  }
  return (refusal.kind === "attack" ? ATTACK_REFUSALS[reason] : undefined) ?? REFUSALS[reason];
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
/**
 * The inside of one skill-bar button: type badge, and empty hotkey, name
 * and cost spans for the caller to fill as text (the hotkey from the
 * keymap, `renderKeyLabels`). The type comes from game-core's catalogue,
 * so the wire needs no field for it; a skill this client does not know
 * gets no badge.
 */
export function skillSlotHtml(slot: SkillSlot): string {
  return (
    `<span class="hud-skill-key"></span>` +
    skillBadgeHtml(slot.id) +
    `<span class="hud-skill-name"></span>` +
    `<span class="hud-skill-cost"></span>`
  );
}

export function renderSkillBar(
  hud: HudElements,
  slots: readonly (SkillSlot | null)[],
  onUse: (slot: number) => void,
): void {
  hud.skillBar.replaceChildren();
  slots.forEach((slot, index) => {
    const button = document.createElement("button");
    button.className = "hud-skill";
    button.type = "button";
    if (slot === null) {
      // An empty slot keeps its place and its key, as in GW1, and does
      // nothing (#347).
      button.classList.add("is-empty");
      button.disabled = true;
      button.innerHTML = `<span class="hud-skill-key"></span>`;
      hud.skillBar.appendChild(button);
      return;
    }
    button.innerHTML = skillSlotHtml(slot);
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

/** Paint each slot's recharge wipe, from the render loop (#152). */
export function updateRecharges(
  hud: HudElements,
  skillBar: readonly (SkillSlot | null)[],
  recharges: readonly SlotRecharge[],
): void {
  const buttons = hud.skillBar.querySelectorAll("button");
  const reducedMotion = prefersReducedMotion();
  skillBar.forEach((slot, index) => {
    const button = buttons[index];
    if (button !== undefined && slot !== null) {
      paintRecharge(button, recharges[index], slot.name, reducedMotion);
    }
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

/** The target panel's line. */
export function describeTarget(target: PlayerSnapshot | undefined): string {
  return target === undefined
    ? "no target"
    : `target: ${target.name} — ${String(Math.round(target.health))}/${String(
        Math.round(target.maxHealth),
      )} hp · armor ${String(target.armor)}${
        target.weaponId === undefined ? "" : ` · ${describeWeaponName(target.weaponId)}`
      }${target.dead ? " (dead)" : ""}`;
}

/** Whether self's weapon is swinging at the target the panel shows. */
export function isAttackingTarget(
  self: PlayerSnapshot,
  target: PlayerSnapshot | undefined,
): boolean {
  return target !== undefined && self.attackTargetSessionId === target.sessionId;
}

/** The leave question, shared by the button and the keyboard (#221). */
export interface LeaveControl {
  /** Ask "leave? yes / no", with focus on "no" so a stray Enter is harmless. */
  readonly open: () => void;
  /** Back to the button, and focus back to the game. */
  readonly close: () => void;
  readonly isOpen: () => boolean;
  /** Tab while asking: between "yes" and "no", never out to the page. */
  readonly cycleFocus: () => void;
}

/**
 * Fill the leave control: a "leave match (F10)" button that asks "leave?
 * yes / no" first, so a stray click or key cannot drop a player out of a
 * match.
 */
export function renderLeave(hud: HudElements, onLeave: () => void): LeaveControl {
  let answers: readonly HTMLButtonElement[] = [];
  let left = false;
  const button = (label: string, onClick: () => void): HTMLButtonElement => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.addEventListener("click", onClick);
    return node;
  };
  const control: LeaveControl = {
    open: () => {
      const question = document.createElement("span");
      question.textContent = "leave?";
      const yes = button("yes", () => {
        if (!left) {
          left = true;
          onLeave();
        }
      });
      const no = button("no", control.close);
      answers = [yes, no];
      hud.leave.replaceChildren(question, yes, no);
      no.focus();
    },
    close: () => {
      answers = [];
      // The game listens on the window: nothing in the HUD keeps the keys.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && hud.leave.contains(focused)) {
        focused.blur();
      }
      hud.leave.replaceChildren(button("leave match (F10)", control.open));
    },
    isOpen: () => {
      return answers.length > 0;
    },
    cycleFocus: () => {
      const at = answers.findIndex((answer) => answer === document.activeElement);
      answers[(at + 1) % answers.length]?.focus();
    },
  };
  control.close();
  return control;
}

/** One profession icon for the target panel. */
export interface ProfessionIcon {
  readonly src: string;
  /** The profession's name, for `alt` and `title`. */
  readonly name: string;
}

/**
 * The target's profession icons (#281): the primary, then the secondary
 * if it has one, in their own colours as the editor shows them. None for
 * no target, or for one without a profession, like a training dummy.
 */
export function targetProfessionIcons(target: PlayerSnapshot | undefined): ProfessionIcon[] {
  return [target?.primaryProfession, target?.secondaryProfession].flatMap((id) =>
    id === undefined ? [] : [{ src: professionIcon(id), name: getProfession(id).name }],
  );
}

/** Replace the icons only when the target or its professions changed, never every frame. */
function renderTargetProfessions(container: HTMLElement, target: PlayerSnapshot | undefined): void {
  const icons = targetProfessionIcons(target);
  const key = icons.map((icon) => icon.name).join(" / ");
  if (container.dataset.professions === key) {
    return;
  }
  container.dataset.professions = key;
  container.title = key;
  container.replaceChildren(
    ...icons.map((icon) => {
      const img = document.createElement("img");
      img.src = icon.src;
      img.alt = icon.name;
      img.title = icon.name;
      return img;
    }),
  );
}

export function updateHud(
  hud: HudElements,
  self: PlayerSnapshot | undefined,
  target: PlayerSnapshot | undefined,
  skillBar: readonly (SkillSlot | null)[],
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

  hud.hintDismissed = targetHintDismissed(hud.hintDismissed, self);
  hud.hint.hidden = hud.hintDismissed;

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

  renderTargetProfessions(hud.targetProfessions, target);
  hud.targetText.textContent = describeTarget(target);
  hud.attacking.hidden = !isAttackingTarget(self, target);

  // Grey out skills the player cannot currently afford. The server is
  // still the authority on whether a cast is legal — this is a hint, not
  // a gate (brief §32).
  const buttons = hud.skillBar.querySelectorAll("button");
  const casting = castingSlot(skillBar, self);
  skillBar.forEach((slot, index) => {
    const button = buttons[index];
    if (button === undefined || slot === null) {
      return;
    }
    // Lit for as long as the snapshot says it casts, however it ends (#300).
    button.classList.toggle("is-casting", index === casting);
    const affordable =
      slot.adrenalineCost > 0
        ? self.adrenaline >= slot.adrenalineCost
        : self.energy >= slot.energyCost;
    button.classList.toggle("is-unaffordable", !affordable);
  });
}
