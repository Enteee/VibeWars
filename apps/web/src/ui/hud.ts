import {
  getProfession,
  getSkill,
  getWeapon,
  maxHealthLossOfStatusIds,
  neededWeaponText,
  type ActivationRejection,
  type ChainRole,
  type Segment,
  type StatusId,
} from "@vibewars/game-core";
import type { CastRefusedMessage } from "@vibewars/game-protocol";
import type {
  CombatMessage,
  MatchSnapshot,
  PlayerSnapshot,
  SkillSlot,
  SlotRecharge,
} from "@vibewars/game-session";

import type { KeyLabeller } from "../input/key-labels.js";
import { SKILL_ACTIONS, actionLabel, codeLabel, type Keymap } from "../input/keymap.js";
import { teamColour } from "../render/arena-snapshot.js";
import { cssColour } from "./character-preview.js";
import { paintHealthTint } from "./health-tint.js";
import {
  attackingIcon,
  chainMarkIcon,
  isEliteSkill,
  professionIcon,
  settingsIcon,
  skillBadgeHtml,
  skillIcon,
  skillIconHtml,
  soundIcon,
  weaponIcon,
} from "./icons.js";
import {
  createEffectsMonitor,
  effectRows,
  maintainedRows,
  type EffectRow,
  type EffectsMonitor,
} from "./effects-monitor.js";
import { iconButton } from "./kit.js";
import { energyLabel, overcastBandElement, renderOvercastBand } from "./overcast-band.js";
import { pipsElement, renderPips } from "./pips.js";
import { paintRecharge, prefersReducedMotion } from "./recharge-overlay.js";
import {
  castFailures,
  castFill,
  flashSlot,
  outOfRange,
  ownCompanion,
  adrenalineFading,
  adrenalineFill,
  adrenalineGaugeHtml,
  paintAdrenalineFill,
  paintCastFill,
  paintKnockdown,
  slotAffordable,
  wrongWeapon,
} from "./skill-slot-state.js";
import { createSlotTooltips, type SlotTooltips } from "./slot-tooltip.js";
import { echoStripHtml, paintEchoStrip } from "./echo-strip.js";

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
  /** Your block, bottom centre (#1042): hint, message, effects, bars, skill bar. */
  readonly root: HTMLElement;
  /** Morale and gear, health and energy: from its top down, the HUD hides the arena. */
  readonly bars: HTMLElement;
  /**
   * Top centre (#1042): the scoreboard and the target frame under it; down
   * to its bottom, the HUD hides the arena.
   */
  readonly top: HTMLElement;
  /** Your health bar, tinted by your worst degeneration (#807). */
  readonly healthRow: HTMLElement;
  readonly healthFill: HTMLElement;
  /** The greyed end of the bar: maximum health a deep wound took (#764). */
  readonly healthLost: HTMLElement;
  readonly healthText: HTMLElement;
  /** Net regeneration or degeneration arrows in the bar (#504). */
  readonly healthPips: HTMLElement;
  /** Your morale next to the health bar (#843): "−15%", "+10%"; hidden at 0. */
  readonly morale: HTMLElement;
  readonly energyFill: HTMLElement;
  /** Overcast's grey band at the energy bar's right end (#461). */
  readonly energyOvercast: HTMLElement;
  readonly energyText: HTMLElement;
  readonly energyPips: HTMLElement;
  readonly gearText: HTMLElement;
  /** The skill bar's row: the weapon-set slots go first in it (#489). */
  readonly skillRow: HTMLElement;
  /** Your statuses as icons with draining bars (#834); `dispose` it with the HUD. */
  readonly effects: EffectsMonitor;
  /**
   * The match clock of the latest snapshot, and `performance.now()` when
   * it arrived: the effects count down between snapshots from it.
   */
  clock: { matchSeconds: number; arrivedMs: number };
  readonly skillBar: HTMLElement;
  /** The skill bar's hover tooltips (#485); `dispose` it with the HUD. */
  readonly slotTips: SlotTooltips;
  /** One line above your bars, for why a key did nothing. */
  readonly message: HTMLElement;
  /** How to target, until the first target of the match (#55). */
  readonly hint: HTMLElement;
  /** Set once there has been a target; the hint never comes back that match. */
  hintDismissed: boolean;
  readonly targetPanel: HTMLElement;
  /** The target's statuses, as your own monitor shows them (#835). */
  readonly targetEffects: EffectsMonitor;
  /** The target's primary and secondary profession icons, before its name (#281). */
  readonly targetProfessions: HTMLElement;
  /** The target's name, or "no target", in the panel's header. */
  readonly targetText: HTMLElement;
  /** The target's health bar (#484), labelled with its percentage. */
  readonly targetHealth: HTMLElement;
  readonly targetHealthFill: HTMLElement;
  readonly targetHealthLost: HTMLElement;
  readonly targetHealthText: HTMLElement;
  readonly targetHealthPips: HTMLElement;
  /** Your dagger chain mark on the target, right of its health (#916). */
  readonly targetChain: HTMLImageElement;
  /** What the target is casting (#484): icon (#727), badge, name and a filling bar. */
  readonly targetCast: HTMLElement;
  readonly targetCastIcon: HTMLImageElement;
  readonly targetCastBadge: HTMLElement;
  readonly targetCastName: HTMLElement;
  readonly targetCastFill: HTMLElement;
  /** Crossed swords and "attacking", shown while self attacks the target (#160). */
  readonly attacking: HTMLElement;
  /** The count and clock, and beside them the foes' pips (#881). */
  readonly scoreboard: HTMLElement;
  readonly scoreboardText: HTMLElement;
  readonly enemies: HTMLElement;
  readonly result: HTMLElement;
  /** The match's buttons, top right, as one cluster (#454): the five below. */
  readonly controls: HTMLElement;
  /** Sound on or off (#112); `renderMute` keeps it showing which. */
  readonly mute: HTMLButtonElement;
  /** Opens the jukebox (#372), showing whether the music is muted. */
  readonly music: HTMLButtonElement;
  /** Leave the match, after a yes (#160): Esc cancels an attack now. */
  readonly leave: HTMLElement;
  /** Opens Options over the running match (#454). */
  readonly options: HTMLButtonElement;
  /** Fullscreen on and off (#454). */
  readonly fullscreen: HTMLButtonElement;
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

/**
 * Shown above your bars until the player first has a target (#55),
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

/**
 * The HUD, in `parent`. `onEndUpkeep` ends an enchantment you maintain,
 * double-clicked in your effects monitor (#838).
 */
export function createHud(
  parent: HTMLElement,
  onEndUpkeep: (targetId: string, statusId: StatusId) => void,
): HudElements {
  const root = element("div", "hud", parent);

  // Top centre, as GW1 (#1042): score and clock, away from the skill bar,
  // so a glance for "am I winning" never competes with a glance for "what
  // can I cast"; the target frame under them.
  const top = element("div", "hud-top", parent);
  const scoreboard = element("div", "hud-scoreboard", top);
  const scoreboardText = element("span", "hud-scoreboard-text", scoreboard);
  const enemies = element("span", "hud-enemies", scoreboard);
  const result = element("div", "hud-result", parent);
  result.style.display = "none";
  // One cluster, top right (#454): leave and mute on top, Options,
  // fullscreen and music under them.
  const controls = element("div", "hud-controls", parent);
  const controlsTop = element("div", "hud-controls-row", controls);
  const leave = element("div", "hud-leave", controlsTop);
  const mute = controlsTop.appendChild(iconButton("hud-mute", "Mute sounds"));
  const controlsUnder = element("div", "hud-controls-row", controls);
  const options = controlsUnder.appendChild(iconButton("hud-options", "Options", settingsIcon()));
  options.setAttribute("aria-haspopup", "dialog");
  const fullscreen = controlsUnder.appendChild(iconButton("hud-fullscreen", "Fullscreen"));
  const music = controlsUnder.appendChild(iconButton("hud-music", "Music"));
  music.setAttribute("aria-haspopup", "dialog");

  // Three rows (#484): who, how hurt, and what they are casting. The cast
  // row keeps its space when empty, so the HUD never jumps; the effects
  // under it grow downward (#1042), so the health bar never moves.
  const targetPanel = element("div", "hud-target", top);
  const targetHeader = element("div", "hud-target-header", targetPanel);
  const targetProfessions = element("span", "hud-target-professions", targetHeader);
  const targetText = element("span", "hud-target-text", targetHeader);
  const attacking = element("span", "hud-attacking", targetHeader);
  const swords = attacking.appendChild(document.createElement("img"));
  swords.src = attackingIcon();
  swords.alt = "";
  attacking.append("attacking");
  attacking.hidden = true;
  const targetHealthRow = element("div", "hud-target-health-row", targetPanel);
  const targetHealth = element("div", "hud-bar hud-target-health", targetHealthRow);
  const targetHealthFill = element("div", "hud-bar-fill", targetHealth);
  const targetHealthLost = element("div", "hud-bar-lost", targetHealth);
  const targetHealthText = element("span", "hud-bar-label", targetHealth);
  const targetHealthPips = targetHealth.appendChild(pipsElement());
  const targetChain = targetHealthRow.appendChild(document.createElement("img"));
  targetChain.className = "hud-target-chain";
  targetChain.alt = "";
  targetChain.hidden = true;
  targetHealth.hidden = true;
  const targetCast = element("div", "hud-target-cast", targetPanel);
  const targetCastIcon = targetCast.appendChild(document.createElement("img"));
  targetCastIcon.className = "skill-icon hud-target-cast-icon";
  targetCastIcon.alt = "";
  targetCastIcon.width = TARGET_CAST_ICON_PX;
  targetCastIcon.height = TARGET_CAST_ICON_PX;
  const targetCastBadge = element("span", "hud-target-cast-badge", targetCast);
  const targetCastName = element("span", "hud-target-cast-name", targetCast);
  const targetCastBar = element("span", "hud-target-cast-bar", targetCast);
  const targetCastFill = element("span", "hud-target-cast-fill", targetCastBar);
  const targetEffects = createEffectsMonitor(
    targetPanel,
    TARGET_EFFECT_ICON_PX,
    "your target's effects",
    "below",
  );

  // Bottom centre, as GW1 (#1042), bottom up: the skill bar, energy,
  // health, morale and gear, your effects growing upward, hint and message.
  const hint = element("div", "hud-hint", root);
  const message = element("div", "hud-message", root);
  message.setAttribute("role", "status");
  // As wide as the skill bar: everything else in it takes its width.
  const column = element("div", "hud-column", root);
  const effects = createEffectsMonitor(
    column,
    EFFECT_ICON_PX,
    "your effects",
    "above",
    onEndUpkeep,
  );
  const bars = element("div", "hud-bars", column);

  const status = element("div", "hud-status", bars);
  const morale = element("span", "hud-morale", status);
  morale.hidden = true;
  const gearText = element("span", "hud-gear", status);

  const healthRow = element("div", "hud-bar hud-bar-health", bars);
  const healthFill = element("div", "hud-bar-fill", healthRow);
  const healthLost = element("div", "hud-bar-lost", healthRow);
  const healthText = element("span", "hud-bar-label", healthRow);
  const healthPips = healthRow.appendChild(pipsElement());

  const energyRow = element("div", "hud-bar hud-bar-energy", bars);
  const energyFill = element("div", "hud-bar-fill", energyRow);
  const energyOvercast = energyRow.appendChild(overcastBandElement());
  const energyText = element("span", "hud-bar-label", energyRow);
  const energyPips = energyRow.appendChild(pipsElement());

  const skillRow = element("div", "hud-skill-row", column);
  const skillBar = element("div", "hud-skills", skillRow);

  return {
    root,
    bars,
    top,
    healthRow,
    healthFill,
    healthLost,
    healthText,
    healthPips,
    morale,
    energyFill,
    energyOvercast,
    energyText,
    energyPips,
    gearText,
    skillRow,
    effects,
    clock: { matchSeconds: Number.NaN, arrivedMs: 0 },
    skillBar,
    slotTips: createSlotTooltips(),
    message,
    hint,
    hintDismissed: false,
    targetPanel,
    targetEffects,
    targetProfessions,
    targetText,
    targetHealth,
    targetHealthFill,
    targetHealthLost,
    targetHealthText,
    targetHealthPips,
    targetChain,
    targetCast,
    targetCastIcon,
    targetCastBadge,
    targetCastName,
    targetCastFill,
    attacking,
    scoreboard,
    scoreboardText,
    enemies,
    result,
    controls,
    mute,
    music,
    leave,
    options,
    fullscreen,
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
  paintMuteButton(hud.mute, muted);
}

/** Any mute-all button, the HUD's or the top bar's (#454), as `muteButtonState` says. */
export function paintMuteButton(button: HTMLButtonElement, muted: boolean): void {
  const state = muteButtonState(muted);
  const icon = button.querySelector("img");
  if (icon !== null) {
    icon.src = state.icon;
  }
  button.setAttribute("aria-label", state.label);
  button.setAttribute("aria-pressed", state.pressed);
  button.title = state.title;
}

/**
 * What the player is told when the server refuses a cast, in the terse,
 * one-line style of the genre. A `Record` over every rejection, so a new
 * one in game-core does not compile until it has a message here.
 */
const REFUSALS: Readonly<Record<ActivationRejection, string>> = {
  "caster-dead": "You are dead.",
  "caster-knocked-down": "You are knocked down.",
  "skill-not-on-bar": "That skill is not on your bar.",
  "still-recharging": "That skill is recharging.",
  "spent-until-morale-boost": "That skill recharges only on a morale boost.",
  "already-casting": "You are already using a skill.",
  "wrong-weapon": "You need another weapon for that.",
  "insufficient-energy": "Not enough energy.",
  "insufficient-adrenaline": "Not enough adrenaline.",
  "no-target": "Select a target first.",
  "invalid-target-dead": "Your target is dead.",
  "invalid-target-alive": "That ally is alive.",
  "invalid-target-self": "You cannot target yourself with that.",
  "invalid-target-ally": "That skill needs an enemy target.",
  "invalid-target-enemy": "That skill needs an ally target.",
  "out-of-range": "Target is out of range.",
  "no-line-of-sight": "Target is not in line of sight.",
  "no-corpse": "No corpse in range.",
  "no-companion": "You have no pet.",
  "companion-dead": "Your pet is dead.",
  "companion-too-far": "Your pet is too far away.",
  "no-animal-to-charm": "There is no animal to charm here.",
  "invalid-target-creature": "That cannot be revived that way.",
};

/** Where an attack's refusal differs from a cast's: it is about the weapon, not a skill. */
const ATTACK_REFUSALS: Readonly<Partial<Record<ActivationRejection, string>>> = {
  "invalid-target-self": "You cannot attack yourself.",
  "invalid-target-ally": "You can only attack an enemy.",
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
    // An attack skill refused for the weapon in hand names the one it needs (ADR-0029).
    return needed === undefined ? REFUSALS[reason] : `Needs ${neededWeaponText(needed)}.`;
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

/**
 * The inside of one skill-bar button (#719): the skill's icon edge to
 * edge, and over it an empty hotkey span for `renderKeyLabels` to fill,
 * the type badge, the out-of-range mark and an echo's copy's strip (#1154). No name and no cost: the
 * button's `aria-label` names it and the tooltip prices it (Q77). The
 * type comes from game-core's catalogue, so the wire needs no field for
 * it; a skill this client does not know gets the bare plate and no badge.
 */
export function skillSlotHtml(slot: SkillSlot): string {
  // The echo strip first, so the hotkey and the range mark, lifted as
  // high, draw over it.
  return (
    echoStripHtml(slot) +
    skillIconHtml(slot.id, SKILL_SLOT_ICON_PX) +
    adrenalineGaugeHtml(slot) +
    `<span class="hud-skill-key"></span>` +
    skillBadgeHtml(slot.id) +
    `<span class="skill-range-mark" aria-hidden="true"></span>`
  );
}

/** A combat bar slot's icon, px (#719). */
export const SKILL_SLOT_ICON_PX = 48;

/**
 * Render the skill bar once; its slots keep their places for the match's
 * lifetime, and `refreshSkillBar` redraws one whose skill changed (#469).
 * `bar` is read again on each hover, so the tooltip prices and names a
 * slot as the host last sent it, a glyph's discount included (#637).
 */
export function renderSkillBar(
  hud: HudElements,
  bar: () => readonly (SkillSlot | null)[],
  ranks: ReadonlyMap<string, number>,
  onUse: (slot: number) => void,
): void {
  hud.skillBar.replaceChildren();
  bar().forEach((slot, index) => {
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
    paintSkillSlot(button, slot);
    button.addEventListener("click", () => {
      onUse(index);
    });
    hud.slotTips.bind(
      button,
      index,
      () => bar()[index] ?? null,
      () => ranks,
      () => hud.clock.matchSeconds,
    );
    hud.skillBar.appendChild(button);
  });
}

/** Draw `slot` on `button`: its icon, gauge, badge and name. */
function paintSkillSlot(button: HTMLButtonElement, slot: SkillSlot): void {
  button.innerHTML = skillSlotHtml(slot);
  button.dataset.skillId = slot.id;
  button.classList.toggle("is-elite", isEliteSkill(slot.id));
  button.setAttribute("aria-label", slot.name);
}

/**
 * The slots of `bar` that hold another skill than `painted` drew there
 * (#469): an echo's copy standing in its slot, or the echo back. A slot
 * empty in either is never one: an empty slot stays empty.
 */
export function changedSlots(
  painted: readonly (string | null)[],
  bar: readonly (SkillSlot | null)[],
): number[] {
  return bar.flatMap((slot, index) => {
    const before = painted[index] ?? null;
    return slot !== null && before !== null && slot.id !== before ? [index] : [];
  });
}

/**
 * Redraw each slot whose skill changed since it was drawn (#469), from the
 * render loop, keeping its key label. Its click and tooltip read the slot
 * by index, so they follow on their own; an open tooltip is hidden, as it
 * still names the skill that was there. A redrawn slot starts with no
 * recharge mark: the next `updateRecharges` puts one back if it waits.
 */
export function refreshSkillBar(hud: HudElements, bar: readonly (SkillSlot | null)[]): void {
  const buttons = [...hud.skillBar.querySelectorAll("button")];
  const painted = buttons.map((button) => button.dataset.skillId ?? null);
  const changed = changedSlots(painted, bar);
  hud.slotTips.repainted(changed);
  for (const index of changed) {
    const button = buttons[index];
    const slot = bar[index];
    if (button === undefined || slot === undefined || slot === null) {
      continue;
    }
    const key = button.querySelector(".hud-skill-key")?.textContent ?? "";
    button.classList.remove("is-recharging");
    paintSkillSlot(button, slot);
    const label = button.querySelector(".hud-skill-key");
    if (label !== null) {
      label.textContent = key;
    }
  }
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
  text: string,
): void {
  const fraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  fill.style.width = `${String(fraction * 100)}%`;
  label.textContent = text;
}

/**
 * Morale as GW1 shows it by the health bar (#843): "−15%" for the death
 * penalty, "+10%" for a boost, and `undefined` at 0, where nothing shows.
 */
export function moraleLabel(morale: number): string | undefined {
  if (morale === 0) {
    return undefined;
  }
  return morale < 0 ? `−${String(-morale)}%` : `+${String(morale)}%`;
}

function renderMorale(element: HTMLElement, morale: number): void {
  const label = moraleLabel(morale) ?? "";
  // Every frame calls this; the label says it all, so only a new one is written.
  if (element.textContent === label) {
    return;
  }
  element.hidden = label === "";
  element.textContent = label;
  element.classList.toggle("is-penalty", morale < 0);
}

/**
 * How much of a health bar is greyed (#764): the share of maximum health
 * a loss such as deep wound's took, as a percentage of the whole bar,
 * read from the snapshot's statuses as the host reads its own. None for
 * the dead, whose bar is an empty track.
 */
export function lostHealthPercent(
  player: Pick<PlayerSnapshot, "dead" | "maxHealth" | "statuses">,
): number {
  if (player.dead || player.maxHealth <= 0) {
    return 0;
  }
  const lost = maxHealthLossOfStatusIds(
    player.maxHealth,
    player.statuses.map((status) => status.id),
  );
  return Math.max(0, Math.min(100, (lost / player.maxHealth) * 100));
}

/** Update the HUD from the latest authoritative snapshot of this player. */
/** Format a match clock as m:ss. */
export function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

/** One foe on the HUD's pip row (#881): filled while alive, hollow and grey dead. */
export interface EnemyPip {
  readonly name: string;
  readonly team: number;
  readonly dead: boolean;
}

/**
 * The pips for `players` as `selfTeam` sees them: every player not on it,
 * in snapshot order. A spectator, with no team, gets every player, grouped
 * by team. Only players in the snapshot get one, so an empty seat has none,
 * and a creature (#1052) never counts.
 */
export function enemyPips(
  players: readonly PlayerSnapshot[],
  selfTeam: number | undefined,
): EnemyPip[] {
  const pips = players
    .filter((player) => player.team !== selfTeam && player.creature === undefined)
    .map(({ name, team, dead }) => ({ name, team, dead }));
  // Stable, so each team keeps its snapshot order.
  return selfTeam === undefined ? pips.sort((a, b) => a.team - b.team) : pips;
}

/** How many of `team`'s players are alive: its creatures never count (#1052). */
export function livingCount(players: readonly PlayerSnapshot[], team: number): number {
  return players.filter(
    (player) => player.team === team && !player.dead && player.creature === undefined,
  ).length;
}

/**
 * "4 v 3 · 7:12": the living on each side, your own first, and the clock
 * (#881). Every match is annihilation (#846), so this is the one
 * scoreboard there is. A spectator reads team 1 first.
 */
export function scoreboardText(
  players: readonly PlayerSnapshot[],
  selfTeam: number | undefined,
  elapsedSeconds: number,
): string {
  const ours = selfTeam ?? 0;
  const theirs = ours === 0 ? 1 : 0;
  return `${String(livingCount(players, ours))} v ${String(livingCount(players, theirs))} · ${formatClock(elapsedSeconds)}`;
}

/**
 * Paint `pips` into `row`, one line a team, rebuilt only when one changes.
 * A foe is drawn in the enemy colour; a spectator sees team 1 in the
 * ally's and team 2 in the enemy's, as the splash shows a side.
 */
function renderEnemyPips(
  row: HTMLElement,
  pips: readonly EnemyPip[],
  selfTeam: number | undefined,
): void {
  const key = JSON.stringify(pips);
  if (row.dataset.pips === key) {
    return;
  }
  row.dataset.pips = key;
  const lines = new Map<number, HTMLElement>();
  row.replaceChildren();
  for (const pip of pips) {
    let line = lines.get(pip.team);
    if (line === undefined) {
      line = element("span", "hud-enemy-row", row);
      line.style.setProperty(
        "--pip-colour",
        cssColour(teamColour(selfTeam === undefined && pip.team === 0 ? "ally" : "enemy")),
      );
      lines.set(pip.team, line);
    }
    const node = element("span", pip.dead ? "hud-enemy-pip is-dead" : "hud-enemy-pip", line);
    node.title = pip.name;
    node.setAttribute("aria-label", pip.dead ? `${pip.name} (dead)` : pip.name);
  }
}

/**
 * The end-of-match line a player reads, from their own team's point of
 * view. An annihilation match nobody won is lost by every team (GW1,
 * #846); only kill-count draws.
 */
export function describeOutcome(
  winningTeam: number | undefined,
  reason: string | undefined,
  selfTeam: number | undefined,
): string {
  const why = reason === "time" ? " (time)" : reason === "morale" ? " (morale)" : "";
  if (winningTeam === undefined) {
    if (reason === "annihilation" || reason === "morale") {
      return selfTeam === undefined ? `No winner${why}` : `Defeat${why}`;
    }
    return `Draw${why}`;
  }
  if (selfTeam === undefined) {
    return `Team ${String(winningTeam + 1)} wins${why}`;
  }
  return winningTeam === selfTeam ? `Victory${why}` : `Defeat${why}`;
}

/**
 * The target's health as a whole percentage of its current maximum (#484),
 * rounded down, except that the living never read 0%: 1 hp of 480 is 1%.
 */
export function targetHealthPercent(target: PlayerSnapshot): number {
  if (target.dead || target.maxHealth <= 0 || target.health <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(100, Math.floor((target.health / target.maxHealth) * 100)));
}

/**
 * The label on the target's health bar (#484): the percentage, which is
 * what players call, and for yourself and allies the hit points as well.
 * A foe, or anyone to a spectator, shows the percentage alone, as GW1
 * shows a foe's bar alone.
 */
export function targetHealthLabel(target: PlayerSnapshot, selfTeam: number | undefined): string {
  const percent = `${String(targetHealthPercent(target))}%`;
  if (target.dead) {
    return `${percent} · dead`;
  }
  return target.team === selfTeam
    ? `${percent} · ${String(Math.round(target.health))} / ${String(Math.round(target.maxHealth))}`
    : percent;
}

/** The target frame's cast row icon, px (#727). */
const TARGET_CAST_ICON_PX = 20;

/** What the target frame's cast row shows (#484). */
export interface TargetCast {
  /** The skill's id, which picks its type badge: none for an unknown one. */
  readonly skillId: string;
  /** Its name, or its id if this client does not know it. */
  readonly name: string;
  /** How far the cast has run, 0 to 1. */
  readonly progress: number;
}

/** What the target is casting, or undefined: nothing, or an instant skill. */
export function targetCast(target: PlayerSnapshot): TargetCast | undefined {
  if (target.castingSkillId === undefined || target.castTotal <= 0) {
    return undefined;
  }
  const skill = getSkill(target.castingSkillId);
  return {
    skillId: target.castingSkillId,
    name: skill?.name ?? target.castingSkillId,
    progress: Math.max(0, Math.min(1, 1 - target.castRemaining / target.castTotal)),
  };
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

/**
 * The target's weapon icon (#419), after its professions: what to watch
 * for in the fight. None for no target, no weapon or one this client does
 * not know.
 */
export function targetWeaponIcon(target: PlayerSnapshot | undefined): ProfessionIcon | undefined {
  return target?.weaponId === undefined ? undefined : weaponIcon(target.weaponId);
}

/** What each chain mark's icon says on hover (#916), as GW1 means it. */
const CHAIN_MARK_TITLE: Readonly<Record<ChainRole, string>> = {
  lead: "lead attack landed",
  "off-hand": "off-hand attack landed",
  dual: "dual attack landed",
};

/**
 * The icon for your dagger chain mark on `target` (#916): which of your
 * chain attacks last hit it, while that mark runs. Nothing with no target
 * or no mark of yours on it; nobody else's mark ever shows.
 */
export function targetChainIcon(
  target: PlayerSnapshot | undefined,
  chainMark: (targetId: string) => ChainRole | undefined,
): ProfessionIcon | undefined {
  const role = target === undefined ? undefined : chainMark(target.sessionId);
  return role === undefined
    ? undefined
    : { src: chainMarkIcon(role), name: CHAIN_MARK_TITLE[role] };
}

/** Touch the chain icon only when its mark changes, never every frame. */
function renderTargetChain(img: HTMLImageElement, icon: ProfessionIcon | undefined): void {
  img.hidden = icon === undefined;
  if (icon !== undefined && img.title !== icon.name) {
    img.src = icon.src;
    img.alt = icon.name;
    img.title = icon.name;
  }
}

/** Replace the icons only when the target or its professions changed, never every frame. */
function renderTargetProfessions(container: HTMLElement, target: PlayerSnapshot | undefined): void {
  const weapon = targetWeaponIcon(target);
  const icons = [...targetProfessionIcons(target), ...(weapon === undefined ? [] : [weapon])];
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

/** What the cast row shows of a skill (#727): its icon, its type badge's markup and its name. */
export interface CastRowSkill {
  /** The bare plate for a skill this client does not know. */
  readonly icon: string;
  /** Empty for a skill this client does not know. */
  readonly badgeHtml: string;
  /** Its id, for a skill this client does not know. */
  readonly name: string;
}

export function castRowSkill(skillId: string): CastRowSkill {
  return {
    icon: skillIcon(skillId),
    badgeHtml: skillBadgeHtml(skillId),
    name: getSkill(skillId)?.name ?? skillId,
  };
}

/** Paint the cast row's icon, badge and name, only when the skill changes. */
function setTargetCastSkill(hud: HudElements, skillId: string): void {
  if (hud.targetCast.dataset.skill === skillId) {
    return;
  }
  hud.targetCast.dataset.skill = skillId;
  const skill = castRowSkill(skillId);
  hud.targetCastIcon.src = skill.icon;
  hud.targetCastBadge.innerHTML = skill.badgeHtml;
  hud.targetCastName.textContent = skill.name;
}

function isFlashing(row: HTMLElement): boolean {
  return row.classList.contains("is-interrupted") || row.classList.contains("is-cancelled");
}

/**
 * Paint the target's cast, or clear the row the frame it ends. A flash
 * still running for this target keeps the row as it failed; one for an
 * earlier target is cleared, since it belongs to someone no longer shown.
 */
function renderTargetCast(hud: HudElements, target: PlayerSnapshot | undefined): void {
  const row = hud.targetCast;
  if (isFlashing(row)) {
    if (target !== undefined && row.dataset.target === target.sessionId) {
      return;
    }
    row.classList.remove("is-interrupted", "is-cancelled");
  }
  const cast = target === undefined ? undefined : targetCast(target);
  row.classList.toggle("is-active", cast !== undefined);
  if (target === undefined || cast === undefined) {
    return;
  }
  row.dataset.target = target.sessionId;
  setTargetCastSkill(hud, cast.skillId);
  hud.targetCastFill.style.width = `${String(cast.progress * 100)}%`;
}

/**
 * Flash the cast row when the target's cast is interrupted or cancelled
 * (#484), as a failed slot flashes (#300), however the snapshot that
 * ends the cast and this message are ordered.
 */
export function flashTargetCast(
  hud: HudElements,
  events: CombatMessage["events"],
  targetId: string | undefined,
): void {
  if (targetId === undefined) {
    return;
  }
  for (const failure of castFailures(events, targetId)) {
    hud.targetCast.dataset.target = targetId;
    setTargetCastSkill(hud, failure.skillId);
    hud.targetCast.classList.add("is-active");
    flashSlot(hud.targetCast, failure.kind);
  }
}

/** The target frame (#484): header, health bar and cast row. */
function renderTarget(
  hud: HudElements,
  self: PlayerSnapshot,
  target: PlayerSnapshot | undefined,
): void {
  renderTargetProfessions(hud.targetProfessions, target);
  hud.targetText.textContent = target === undefined ? "no target" : target.name;
  hud.attacking.hidden = !isAttackingTarget(self, target);
  // Armor on hover: a number to look up, not to read at a glance.
  hud.targetPanel.title = target === undefined ? "" : `armor ${String(target.armor)}`;
  hud.targetHealth.hidden = target === undefined;
  if (target !== undefined) {
    hud.targetHealth.classList.toggle("is-dead", target.dead);
    paintHealthTint(hud.targetHealth, target);
    hud.targetHealthFill.style.width = `${String(targetHealthPercent(target))}%`;
    hud.targetHealthLost.style.width = `${String(lostHealthPercent(target))}%`;
    hud.targetHealthText.textContent = targetHealthLabel(target, self.team);
    renderPips(hud.targetHealthPips, target.healthPips);
  }
  renderTargetCast(hud, target);
}

/** The effects monitor's icons in the HUD, px (#834). */
const EFFECT_ICON_PX = 24;

/** The target frame's effect icons, px (#835). */
const TARGET_EFFECT_ICON_PX = 16;

/**
 * The target frame's effects (#835): the target's statuses as your own
 * monitor would show them, the tick on an enchantment you put on it.
 * None with no target, a dead one, or no match clock.
 */
export function targetEffectRows(
  self: PlayerSnapshot,
  target: PlayerSnapshot | undefined,
  names: ReadonlyMap<string, string>,
  now: number | undefined,
): EffectRow[] {
  return target === undefined || target.dead || now === undefined
    ? []
    : effectRows(target, self.sessionId, names, now);
}

/** How far past the latest snapshot the effects count down, s: ten snapshots. */
const MAX_CLOCK_LEAD_SECONDS = 0.5;

/**
 * The match clock now: the latest snapshot's, plus the time since it
 * arrived, so a duration bar drains between snapshots. Each new snapshot
 * starts it again; a host gone quiet, or a match over, stops it soon after.
 */
function matchNow(hud: HudElements, matchSeconds: number): number {
  const nowMs = performance.now();
  if (matchSeconds !== hud.clock.matchSeconds) {
    hud.clock = { matchSeconds, arrivedMs: nowMs };
  }
  return matchSeconds + Math.min(MAX_CLOCK_LEAD_SECONDS, (nowMs - hud.clock.arrivedMs) / 1000);
}

export function updateHud(
  hud: HudElements,
  self: PlayerSnapshot | undefined,
  target: PlayerSnapshot | undefined,
  skillBar: readonly (SkillSlot | null)[],
  /** Units each slot's skill holds, by slot (#463). */
  adrenaline: readonly number[],
  /** Seconds until that is lost out of combat, `null` with none held (#828). */
  adrenalineLossIn: number | null,
  /** Your chain mark on a target, still running (#916). */
  chainMark: (targetId: string) => ChainRole | undefined,
  walls: readonly Segment[],
  match?: MatchSnapshot,
): void {
  if (match !== undefined) {
    hud.scoreboardText.textContent = scoreboardText(
      match.players,
      self?.team,
      match.elapsedSeconds,
    );
    renderEnemyPips(hud.enemies, enemyPips(match.players, self?.team), self?.team);

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

  const healthText = `${String(Math.round(self.health))} / ${String(Math.round(self.maxHealth))} hp`;
  setBar(hud.healthFill, hud.healthText, self.health, self.maxHealth, healthText);
  hud.healthLost.style.width = `${String(lostHealthPercent(self))}%`;
  paintHealthTint(hud.healthRow, self);
  renderMorale(hud.morale, self.morale);
  // Counted to the ceiling overcast leaves, the rest of the bar greyed (#461).
  const energyText = `${energyLabel(self.energy, self.maxEnergy, self.overcast)} en`;
  setBar(hud.energyFill, hud.energyText, self.energy, self.maxEnergy, energyText);
  renderOvercastBand(hud.energyOvercast, self.overcast, self.maxEnergy);
  renderPips(hud.healthPips, self.healthPips);
  renderPips(hud.energyPips, self.energyPips);
  // Armor and weapon: both are numbers that change what a fight does, so
  // hiding them would be the HUD lying by omission. Adrenaline is each
  // slot's own (#463).
  hud.gearText.textContent =
    `armor ${String(self.armor)}` +
    (self.weaponId === undefined ? "" : ` · ${describeWeaponName(self.weaponId)}`);

  const names = new Map(match?.players.map((player) => [player.sessionId, player.name]));
  const now = match === undefined ? undefined : matchNow(hud, match.elapsedSeconds);
  hud.effects.update(
    self.dead || now === undefined
      ? []
      : [
          ...effectRows(self, self.sessionId, names, now),
          ...maintainedRows(match?.players ?? [], self.sessionId),
        ],
  );

  renderTarget(hud, self, target);
  renderTargetChain(hud.targetChain, targetChainIcon(target, chainMark));
  hud.targetEffects.update(targetEffectRows(self, target, names, now));

  // Grey out skills the player cannot currently afford or the weapon in
  // hand cannot use (#417), and mark those that cannot reach the target. The server is still the authority on
  // whether a cast is legal — these are hints, not gates (brief §32).
  const buttons = hud.skillBar.querySelectorAll("button");
  const reducedMotion = prefersReducedMotion();
  const fill = castFill(skillBar, self);
  const companion = match === undefined ? undefined : ownCompanion(match.players, self);
  const far = outOfRange(skillBar, self, target, companion, walls);
  const unwielded = wrongWeapon(skillBar, self);
  hud.slotTips.casting(fill?.slot);
  paintKnockdown(hud.skillBar, self.knockdownRemaining);
  skillBar.forEach((slot, index) => {
    const button = buttons[index];
    if (button === undefined || slot === null) {
      return;
    }
    // Lit for as long as the snapshot says it casts, however it ends (#300),
    // and filling as it goes (#485).
    button.classList.toggle("is-casting", index === fill?.slot);
    paintCastFill(button, index === fill?.slot ? fill.fraction : undefined);
    button.classList.toggle("is-out-of-range", far[index] === true);
    button.classList.toggle("is-unaffordable", !slotAffordable(slot, self, adrenaline[index] ?? 0));
    // Lit from the bottom as it charges (#826): empty before any message.
    paintAdrenalineFill(button, adrenalineFill(slot, adrenaline[index] ?? 0));
    // Blinking for the last seconds before it is lost (#828).
    button.classList.toggle(
      "is-adrenaline-fading",
      adrenalineFading(adrenaline[index] ?? 0, adrenalineLossIn),
    );
    button.classList.toggle("is-wrong-weapon", unwielded[index] === true);
    // An echo's copy drains its strip as its time runs out (#1154).
    if (now !== undefined) {
      paintEchoStrip(button, slot, now, reducedMotion);
    }
  });
}
