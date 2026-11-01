import {
  TRAINING_SCENARIOS,
  getTrainingScenario,
  type StepResult,
  type Segment,
  type TrainingScenario,
} from "@vibewars/game-core";
import { allWallSegments } from "@vibewars/game-maps/geometry";
import { NO_GUILD, type MatchSnapshot, type SkillSlot } from "@vibewars/game-session";

import { attachMatchSounds, type MatchSounds } from "../audio/match-sounds.js";
import { setGlobalMute } from "../audio/global-mute.js";
import { soundPlayer } from "../audio/sound-player.js";
import { attackKeyIntents, escapeIntent } from "../input/attack-key.js";
import { createDoubleClick } from "../input/double-click.js";
import {
  calledTargetIntent,
  callTargetCall,
  middleClickAction,
  pingCall,
  secondaryClickIntents,
} from "../input/mouse-intents.js";
import { attachKeyboardMoveInput } from "../input/keyboard-move.js";
import { loadLayoutLabeller, type KeyLabeller } from "../input/key-labels.js";
import {
  SKILL_ACTIONS,
  WEAPON_SET_ACTIONS,
  actionForCode,
  actionLabel,
  codeLabel,
  isShortcut,
} from "../input/keymap.js";
import { loadKeymap } from "../input/keymap-preference.js";
import { skillSlotForKeyDown } from "../input/skill-keys.js";
import { weaponSetIntent } from "../input/weapon-set-keys.js";
import { attachNameReveal } from "../input/name-reveal.js";
import { closestTarget, nextTabTarget, selfTargetIntent } from "../input/tab-target.js";
import { toArenaSnapshot, toRenderableWall } from "../match-view.js";
import { attachMatchMusic, type MatchMusic } from "../music/match-music.js";
import { music } from "../music/play-music.js";
import { mapShrines, type MapShrine } from "../net/maps.js";
import { TRACKS } from "../music/tracks/index.js";
import {
  EMPTY_SNAPSHOT,
  nameShown,
  withCalls,
  withNames,
  type ArenaSnapshot,
  type RenderableWall,
} from "../render/arena-snapshot.js";
import {
  NoWebGlError,
  createArenaViewport,
  hasWebGl,
  type ArenaViewport,
} from "../render/arena-viewport.js";
import { attachFollowCamera, type FollowCamera } from "../render/follow-camera.js";
import { showCombatFeedback } from "../render/combat-feedback.js";
import type { StoredCharacter } from "../storage/schema.js";
import {
  createLocalConnection,
  NO_PROFESSIONS,
  TICK_SECONDS,
  type LocalMatchConnection,
  type Professions,
} from "../training/local-connection.js";
import { playerArming, setupScenario, SELF_ID, trainingMap } from "../training/scenario-setup.js";
import {
  EMPTY_TOTALS,
  accumulate,
  appendRows,
  dividerRow,
  meterRows,
  shouldStickToBottom,
  StatusTickBatcher,
  type LogRow,
  type MeterTotals,
} from "./combat-readouts.js";
import { changedSlots, describeRefusal, MESSAGE_SECONDS, SKILL_SLOT_ICON_PX } from "./hud.js";
import { percent, setHidden, setStyle, setText } from "./dom-write.js";
import { isEliteSkill, skillBadgeHtml, skillIconHtml } from "./icons.js";
import { energyLabel, overcastBandElement, renderOvercastBand } from "./overcast-band.js";
import { paintHealthTint } from "./health-tint.js";
import { createPartyWindow } from "./party-window.js";
import { pipsElement, renderPips } from "./pips.js";
import { paintRecharge, prefersReducedMotion } from "./recharge-overlay.js";
import {
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
  midAction,
  slotAffordable,
  slotFlashes,
  silenced,
  wrongWeapon,
} from "./skill-slot-state.js";
import { createSlotTooltips } from "./slot-tooltip.js";
import { echoStripHtml, paintEchoStrip } from "./echo-strip.js";
import {
  armedHint,
  buildSignature,
  escapeStep,
  loadScenarioChoice,
  logActorName,
  overlayMessage,
  resolveScenarioId,
  saveScenarioChoice,
  shouldRestoreFocus,
} from "./training-state.js";
import { h } from "./kit.js";
import { playerGuild } from "./player-section.js";
import { labelWeaponSets, renderWeaponSets, weaponSetSlots } from "./weapon-set-slots.js";

/**
 * The Training Ground: a live arena beside the build editor (#2 §6).
 *
 * Created and attached once per editor (ADR-0030). The Phaser game inside
 * it lives as long as the editor does: switching scenarios swaps the
 * simulation and resizes the game, and editing the build re-arms the
 * player in place. Nothing here ever recreates it.
 */

export interface TrainingPanel {
  readonly root: HTMLElement;
  /** Under the arena, for the editor's derived stats (#571). */
  readonly statsSlot: HTMLElement;
  attach(parent: HTMLElement): void;
  /**
   * Hand the keyboard back to the arena after an edit, if the player had
   * it and the edit left focus on nothing: a click on a skill box, say.
   * A focused control, such as the `+` just pressed, keeps it.
   */
  refocus(): void;
  setBuild(character: StoredCharacter): void;
  setDisplayName(name: string): void;
  dispose(): void;
}

/** The newest rows the log keeps; older ones come off the front. */
const LOG_CAP = 200;

/** The meter is summed every step, but repainted at most this often. */
const METER_PAINT_SECONDS = 0.2;

/**
 * Clicking one of these takes the keyboard, so it takes arena control
 * away. Clicking anything else outside the panel (a skill box, say) edits
 * the build, and `refocus` hands control back.
 */
const TAKES_KEYBOARD = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/**
 * Corner marks pointing out (expand) or in (collapse), drawn rather than
 * typed: not every font has ⛶ (#495).
 */
const EXPAND_ICON = iconSvg("M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4");
const COLLAPSE_ICON = iconSvg("M5 1v4H1M15 5h-4V1M11 15v-4h4M1 11h4v4");

function iconSvg(path: string): string {
  return (
    `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">` +
    `<path d="${path}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`
  );
}

/** Thrown when there is nothing to train on; the editor then stays two columns. */
export class TrainingUnavailableError extends Error {}

function vitalBar(kind: string): {
  root: HTMLElement;
  fill: HTMLElement;
  label: HTMLElement;
  pips: HTMLElement;
} {
  const root = h("div", `training-bar training-bar-${kind}`);
  const fill = h("div", "training-bar-fill");
  const label = h("span", "training-bar-label");
  // Net regeneration or degeneration, as on the match HUD (#504).
  const pips = pipsElement();
  root.append(fill, label, pips);
  return { root, fill, label, pips };
}

interface Session {
  readonly scenario: TrainingScenario;
  readonly connection: LocalMatchConnection;
  readonly names: ReadonlyMap<string, string>;
  readonly walls: readonly RenderableWall[];
  /** The map's resurrection shrines (#1199), as a match's. */
  readonly shrines: readonly MapShrine[];
  /** The same walls as segments, for the skill bar's line-of-sight hint (#485). */
  readonly wallSegments: readonly Segment[];
  readonly sounds: MatchSounds;
  readonly music: MatchMusic;
  parked: boolean;
}

/** `menuDepth`: the editor's, which the music keeps to with nothing fighting (#2020). */
export function createTrainingPanel(menuDepth: 0 | 1): TrainingPanel {
  // Up front, before any DOM: the editor shows the notice instead (#655).
  if (!hasWebGl()) {
    throw new NoWebGlError("no WebGL");
  }

  const storage = (): Storage => window.localStorage;

  /* --- DOM ------------------------------------------------------------- */

  const root = h("section", "training");
  root.setAttribute("aria-label", "training ground");

  const controls = h("div", "training-controls");
  const picker = document.createElement("select");
  picker.className = "training-scenario";
  picker.setAttribute("aria-label", "scenario");
  for (const scenario of TRAINING_SCENARIOS) {
    const option = document.createElement("option");
    option.value = scenario.id;
    option.textContent = scenario.label;
    picker.appendChild(option);
  }
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "training-reset";
  resetButton.textContent = "reset";
  // Fills the window, so the arena plays like a match (Q60, #495).
  const expandButton = document.createElement("button");
  expandButton.type = "button";
  expandButton.className = "training-expand";
  controls.append(picker, resetButton, expandButton);

  const teaches = h("p", "training-teaches");

  const stage = h("div", "training-stage");
  // Your team's health (#1055), as on the match HUD: shown when the
  // scenario gives you allies. A row's click targets its member.
  const partyWindow = createPartyWindow(
    stage,
    (targetSessionId) => {
      if (session !== undefined && !session.parked) {
        session.connection.sendIntent({ kind: "target", targetSessionId });
      }
    },
    // Your pet's Guard, Fight and Heel (#1110).
    (creatureId, mode) => {
      if (session !== undefined && !session.parked) {
        session.connection.sendIntent({
          kind: "command",
          creatureId,
          order: { kind: "mode", mode },
        });
      }
    },
  );
  stage.tabIndex = 0;
  stage.setAttribute("role", "application");
  stage.setAttribute("aria-label", "training arena");
  const overlay = h("div", "training-overlay");
  overlay.hidden = true;
  stage.appendChild(overlay);

  // The keys, while the arena has control; empty otherwise.
  const hint = h("p", "training-hint");
  const message = h("p", "training-message");

  const health = vitalBar("health");
  const energy = vitalBar("energy");
  // Overcast's grey band, after the fill and under the label (#461).
  const energyOvercast = overcastBandElement();
  energy.fill.after(energyOvercast);
  const attacking = h("span", "training-attacking");
  const vitals = h("div", "training-vitals");
  vitals.append(health.root, energy.root, attacking);

  const skills = h("div", "training-skills");
  // The weapon sets, at the bar's left end as on the match HUD (#489).
  const weaponSets = weaponSetSlots((set) => {
    swapTo(set);
  });

  const meter = h("dl", "training-meter");

  const log = h("div", "training-log");
  const logRowsEl = h("div", "training-log-rows");
  logRowsEl.setAttribute("role", "log");
  const newest = document.createElement("button");
  newest.type = "button";
  newest.className = "training-log-newest";
  newest.textContent = "↓ newest";
  newest.hidden = true;
  log.append(logRowsEl, newest);

  const statsSlot = h("div", "training-stats-slot");
  root.append(controls, teaches, stage, hint, message, statsSlot, vitals, skills, meter, log);

  /* --- state ----------------------------------------------------------- */

  let disposed = false;
  // Read once per panel, so the arena and its hint agree (#302); the
  // labels by code until the browser says what the layout is.
  const keymap = loadKeymap();
  let keyLabel: KeyLabeller = codeLabel;
  let viewport: ArenaViewport | undefined;
  /** The same follow camera as a match's (Q57). */
  let camera: FollowCamera | undefined;
  let session: Session | undefined;
  let character: StoredCharacter | undefined;
  let signature: string | undefined;
  let displayName = "";
  let armed = false;
  /** Over the whole window, above the editor (#495); never saved. */
  let expanded = false;
  /**
   * Whether the stage was armed when this click began: the click that
   * takes control only takes it, and does not walk the hero off (#310).
   */
  let armedBeforeClick = false;
  let logRows: readonly LogRow[] = [];
  let totals: MeterTotals = EMPTY_TOTALS;
  /** Gathers status ticks into a row a second (#151); one per session. */
  let ticks = new StatusTickBatcher();
  let sinceMeterPaint = 0;
  let latestMatch: MatchSnapshot | undefined;
  let latestArena: ArenaSnapshot = EMPTY_SNAPSHOT;
  let messageTimer: ReturnType<typeof setTimeout> | undefined;
  let skillButtons: HTMLButtonElement[] = [];
  /** The skill each slot was painted with: a copy standing in one redraws the bar (#469). */
  let paintedSkills: readonly (string | null)[] = [];
  const slotTips = createSlotTooltips();

  // The player's professions follow the build being edited (#281).
  const professionsOf = (id: string): Professions =>
    id === SELF_ID && character !== undefined
      ? { primary: character.primaryProfession, secondary: character.secondaryProfession }
      : NO_PROFESSIONS;
  const nameOf = (id: string): string =>
    id === SELF_ID
      ? displayName.trim() || "You"
      : logActorName(id, session?.names, latestMatch?.players);
  // A creature in the latest snapshot (#1052): it swings under its own name (#1144).
  const isCreature = (id: string): boolean =>
    latestMatch?.players.find((player) => player.sessionId === id)?.creature !== undefined;

  /* --- painting -------------------------------------------------------- */

  const appendLog = (incoming: readonly LogRow[]): void => {
    if (incoming.length === 0) {
      return;
    }
    // Measured before appending, so a reader scrolled up stays put.
    const stick = shouldStickToBottom(
      logRowsEl.scrollTop,
      logRowsEl.scrollHeight,
      logRowsEl.clientHeight,
    );
    const appended = appendRows(logRows, incoming, LOG_CAP);
    logRows = appended.rows;
    // A regeneration run grew (#590): rewrite its row, don't add one.
    const folded = appended.replacedLast ? logRows.at(-1 - appended.added.length) : undefined;
    const foldedText = logRowsEl.lastElementChild?.querySelector(".training-log-text");
    if (folded !== undefined && foldedText) {
      foldedText.textContent = folded.text;
    }
    for (const row of appended.added) {
      const line = h("div", "training-log-row");
      line.dataset.tone = row.tone;
      line.append(
        h("span", "training-log-time", row.time),
        h("span", "training-log-text", row.text),
      );
      logRowsEl.appendChild(line);
    }
    while (logRowsEl.childElementCount > LOG_CAP) {
      logRowsEl.firstElementChild?.remove();
    }
    if (stick) {
      logRowsEl.scrollTop = logRowsEl.scrollHeight;
    } else {
      newest.hidden = false;
    }
  };

  const paintMeter = (): void => {
    meter.replaceChildren(
      ...meterRows(totals).flatMap((row) => {
        const value = h("dd", "training-meter-value", row.value);
        value.dataset.meter = row.label;
        return [h("dt", "training-meter-label", row.label), value];
      }),
    );
  };

  const restartMeter = (label: string): void => {
    totals = EMPTY_TOTALS;
    sinceMeterPaint = 0;
    paintMeter();
    // The gathered ticks belong before the line, not after it.
    const now = session?.connection.simulation.elapsedSeconds ?? 0;
    appendLog([...ticks.flush(now, nameOf, isCreature), dividerRow(label, now)]);
  };

  const flash = (text: string): void => {
    message.textContent = text;
    if (messageTimer !== undefined) {
      clearTimeout(messageTimer);
    }
    messageTimer = setTimeout(() => {
      message.textContent = "";
    }, MESSAGE_SECONDS * 1000);
  };

  const cast = (slot: number): void => {
    if (session === undefined || session.parked) {
      return;
    }
    session.connection.sendIntent({ kind: "use-skill", slot });
  };

  /** Swap to weapon set `set` (0-3), by its key or its slot (#489). */
  const swapTo = (set: number): void => {
    const action = WEAPON_SET_ACTIONS[set];
    if (session === undefined || session.parked || action === undefined) {
      return;
    }
    const intent = weaponSetIntent(action, session.connection.weaponSets);
    if (intent !== undefined) {
      session.connection.sendIntent(intent);
    }
  };

  const attack = (): void => {
    if (session === undefined || session.parked) {
      return;
    }
    for (const intent of attackKeyIntents(session.connection.getSnapshot())) {
      session.connection.sendIntent(intent);
    }
  };

  /** Tab and Shift+Tab: the next living enemy by distance, as in a match (#55). */
  const cycleTarget = (step: 1 | -1): void => {
    if (session === undefined || session.parked) {
      return;
    }
    const { players } = session.connection.getSnapshot();
    const current = players.find((player) => player.sessionId === SELF_ID)?.targetSessionId;
    const next = nextTabTarget(players, SELF_ID, current, step);
    if (next !== undefined && next !== current) {
      session.connection.sendIntent({ kind: "target", targetSessionId: next });
    }
  };

  const targetByKey = (action: "target-closest" | "target-called" | "target-self"): void => {
    if (session === undefined || session.parked) {
      return;
    }
    const { connection } = session;
    const snapshot = connection.getSnapshot();
    if (action === "target-called" || action === "target-self") {
      const intent =
        action === "target-called"
          ? calledTargetIntent(snapshot, connection.getCalls())
          : selfTargetIntent(snapshot.players, SELF_ID);
      if (intent !== undefined) {
        connection.sendIntent(intent);
      }
      return;
    }
    const current = snapshot.players.find(
      (player) => player.sessionId === SELF_ID,
    )?.targetSessionId;
    const closest = closestTarget(snapshot.players, SELF_ID);
    if (closest !== undefined && closest !== current) {
      connection.sendIntent({ kind: "target", targetSessionId: closest });
    }
  };

  const paintSkills = (slots: readonly (SkillSlot | null)[]): void => {
    paintedSkills = slots.map((slot) => slot?.id ?? null);
    skillButtons = slots.map((slot, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "training-skill";
      // Not focusable, and pressing it does not move focus: casting from
      // the bar must not take the keyboard away from the arena.
      button.tabIndex = -1;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      const action = SKILL_ACTIONS[index];
      button.append(
        h(
          "span",
          "training-skill-key",
          action === undefined ? "" : actionLabel(keymap, action, keyLabel),
        ),
      );
      if (slot === null) {
        // An empty slot keeps its place and its key, and does nothing (#347).
        button.classList.add("is-empty");
        button.disabled = true;
        return button;
      }
      button.addEventListener("click", () => {
        cast(index);
      });
      // The slot and ranks read at hover and each step after, so a rearm,
      // a glyph's discount (#637) or Primal Echoes (#1920) shows at once.
      slotTips.bind(
        button,
        index,
        () => session?.connection.skillBar[index] ?? null,
        () => session?.connection.ranks ?? new Map(),
        () => session?.connection.simulation.elapsedSeconds ?? 0,
      );
      // The icon alone, as on the match HUD (#719): the name is the label.
      // The echo strip first, so the hotkey and the range mark draw over it.
      button.insertAdjacentHTML(
        "afterbegin",
        echoStripHtml(slot) +
          skillIconHtml(slot.id, SKILL_SLOT_ICON_PX) +
          adrenalineGaugeHtml(slot),
      );
      button.insertAdjacentHTML("beforeend", skillBadgeHtml(slot.id));
      button.insertAdjacentHTML(
        "beforeend",
        `<span class="skill-range-mark" aria-hidden="true"></span>`,
      );
      button.classList.toggle("is-elite", isEliteSkill(slot.id));
      button.setAttribute("aria-label", slot.name);
      return button;
    });
    labelWeaponSets(weaponSets, keymap, keyLabel);
    skills.replaceChildren(weaponSets, ...skillButtons);
  };

  const paintOverlay = (problem: string | undefined): void => {
    const text = overlayMessage(problem);
    setHidden(overlay, text === undefined);
    setText(overlay, text ?? "");
  };

  const paintVitals = (match: MatchSnapshot): void => {
    const self = match.players.find((player) => player.sessionId === SELF_ID);
    if (self === undefined) {
      return;
    }
    const fraction = (value: number, max: number): string =>
      percent(max > 0 ? Math.max(0, Math.min(1, value / max)) : 0);
    setStyle(health.fill.style, "width", fraction(self.health, self.maxHealth));
    setText(health.label, `${String(self.health)} / ${String(self.maxHealth)}`);
    paintHealthTint(health.root, self);
    setStyle(energy.fill.style, "width", fraction(self.energy, self.maxEnergy));
    setText(energy.label, energyLabel(self.energy, self.maxEnergy, self.overcast));
    renderOvercastBand(energyOvercast, self.overcast, self.maxEnergy);
    renderPips(health.pips, self.healthPips);
    renderPips(energy.pips, self.energyPips);
    setText(attacking, self.attackTargetSessionId === undefined ? "" : "attacking");
    renderWeaponSets(weaponSets, session?.connection.weaponSets);
    const slots = session?.connection.skillBar ?? [];
    if (changedSlots(paintedSkills, slots).length > 0) {
      // Every button is made anew, so a tooltip on any of them would hang
      // off one no longer on the page.
      slotTips.repainted(slots.map((_, index) => index));
      paintSkills(slots);
    }
    const recharges = session?.connection.getRecharges() ?? [];
    const queued = session?.connection.getQueuedSlot();
    const adrenaline = session?.connection.getAdrenaline() ?? [];
    const adrenalineLossIn = session?.connection.getAdrenalineLossIn() ?? null;
    const reducedMotion = prefersReducedMotion();
    const now = session?.connection.simulation.elapsedSeconds ?? 0;
    const fill = castFill(slots, self);
    const target = match.players.find((player) => player.sessionId === self.targetSessionId);
    const far = outOfRange(
      slots,
      self,
      target,
      ownCompanion(match.players, self),
      session?.wallSegments ?? [],
    );
    const unwielded = wrongWeapon(slots, self);
    const barred = silenced(slots, self);
    const lit = midAction(slots);
    slotTips.casting(fill?.slot);
    slotTips.refresh();
    // Greyed while you lie knocked down, as on the match HUD (#545).
    paintKnockdown(skills, self.knockdownRemaining);
    skillButtons.forEach((button, index) => {
      const slot = slots[index] ?? null;
      if (slot === null) {
        return;
      }
      // The casting slot is lit and fills, as on the match HUD (#300, #485).
      button.classList.toggle("is-casting", index === fill?.slot);
      paintCastFill(button, index === fill?.slot ? fill.fraction : undefined);
      // Queued to go next, as on the match HUD (#1722).
      button.classList.toggle("is-queued", index === queued);
      button.classList.toggle("is-out-of-range", far[index] === true);
      // A hint, not a gate: the simulation still decides.
      button.classList.toggle(
        "is-unaffordable",
        !slotAffordable(slot, self, adrenaline[index] ?? 0),
      );
      // The match HUD's gauge (#826).
      paintAdrenalineFill(button, adrenalineFill(slot, adrenaline[index] ?? 0));
      button.classList.toggle(
        "is-adrenaline-fading",
        adrenalineFading(adrenaline[index] ?? 0, adrenalineLossIn),
      );
      button.classList.toggle("is-wrong-weapon", unwielded[index] === true);
      button.classList.toggle("is-silenced", barred[index] === true);
      button.classList.toggle("is-mid-action", lit[index] === true);
      // The same wipe as the match HUD (#152).
      paintRecharge(button, recharges[index], slot.name, reducedMotion);
      paintEchoStrip(button, slot, now, reducedMotion);
    });
  };

  /* --- the session ------------------------------------------------------ */

  const onStep = (result: StepResult): void => {
    totals = accumulate(totals, result.log, SELF_ID, TICK_SECONDS);
    const rows: LogRow[] = [];
    for (const entry of result.log) {
      rows.push(...ticks.push(entry, nameOf, isCreature));
    }
    appendLog(rows);
  };

  const startSession = (scenario: TrainingScenario, build: StoredCharacter): void => {
    session?.sounds.dispose();
    session?.music.dispose();
    void session?.connection.disconnect();
    const setup = setupScenario(scenario, build);
    ticks = new StatusTickBatcher();
    const connection = createLocalConnection({
      simulation: setup.simulation,
      selfId: SELF_ID,
      map: setup.map,
      nameOf,
      // Your own body wears your tag (#1406), it is your name, and your cape (#1422).
      guildOf: (id) => (id === SELF_ID ? playerGuild() : NO_GUILD),
      professionsOf,
    });
    session = {
      scenario,
      connection,
      names: setup.names,
      walls: setup.map.walls.map(toRenderableWall),
      shrines: mapShrines(setup.map.id),
      wallSegments: allWallSegments(setup.map.walls),
      // The same sounds as a match (#112), muted by the same M.
      sounds: attachMatchSounds(connection, soundPlayer()),
      music: attachMatchMusic(connection, {
        screen: "training",
        menuDepth,
        mode: () => music().mode(),
        tracks: TRACKS,
        onChange: (state) => {
          music().follow(state);
        },
      }),
      parked: setup.arming.problem !== undefined,
    };
    connection.onStep(onStep);
    connection.onCombat((combat) => {
      if (viewport !== undefined && latestMatch !== undefined) {
        showCombatFeedback(viewport.scene, combat, latestMatch);
      }
      for (const failed of slotFlashes(combat.events, SELF_ID, connection.skillBar)) {
        const button = skillButtons[failed.slot];
        if (button !== undefined) {
          flashSlot(button, failed.kind);
        }
      }
    });
    connection.onCastRefused((refusal) => {
      flash(describeRefusal(refusal));
    });

    picker.value = scenario.id;
    teaches.textContent = scenario.teaches;
    const map = trainingMap(scenario);
    stage.style.setProperty("--training-aspect", `${String(map.width)} / ${String(map.height)}`);
    camera?.restart(map);
    paintSkills(connection.skillBar);
    paintOverlay(setup.arming.problem);
    restartMeter(scenario.label);
  };

  const rearm = (build: StoredCharacter): void => {
    if (session === undefined) {
      return;
    }
    const arming = playerArming(build);
    const parked = arming.problem !== undefined;
    if (parked) {
      session.connection.sendIntent({ kind: "stop" });
    }
    session.connection.rearm(arming.loadout, arming.skillBar);
    session.parked = parked;
    paintSkills(session.connection.skillBar);
    paintOverlay(arming.problem);
    // A meter averaging two builds is a lie; the log keeps the history.
    restartMeter("re-armed");
  };

  /* --- input ------------------------------------------------------------- */

  const onMove = (direction: { x: number; y: number }): void => {
    if (session === undefined || session.parked) {
      return;
    }
    session.connection.sendIntent(
      direction.x === 0 && direction.y === 0
        ? { kind: "stop" }
        : { kind: "move", dirX: direction.x, dirY: direction.y },
    );
  };
  // On the stage, never on `window`: typing in the name field or the
  // library search bubbles up past the stage and can never move anyone.
  const detachMovement = attachKeyboardMoveInput(stage, keymap, onMove);

  const onStageKeyDown = (event: KeyboardEvent): void => {
    // Ctrl, Alt and Meta are the browser's, armed or not (#302).
    if (isShortcut(event)) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }
      const snapshot = session?.connection.getSnapshot();
      const step = escapeStep(
        snapshot === undefined ? undefined : escapeIntent(snapshot),
        expanded,
      );
      if (step === "cancel") {
        session?.connection.sendIntent({ kind: "cancel" });
      } else if (step === "clear-target") {
        session?.connection.sendIntent({ kind: "target", targetSessionId: null });
      } else if (step === "collapse") {
        setExpanded(false);
      } else {
        armed = false;
        stage.blur();
      }
      return;
    }
    const action = actionForCode(keymap, event.code);
    if (action === undefined || action === "show-names") {
      return;
    }
    // A bound key is the arena's, and never scrolls the editor.
    event.preventDefault();
    if (action === "target-next") {
      // Never the browser's focus cycle while armed (#268): it would land in
      // the name field, and the next key would type into it. Esc releases
      // the stage, and then Tab is the browser's again.
      if (!event.repeat) {
        cycleTarget(event.shiftKey ? -1 : 1);
      }
      return;
    }
    if (action === "target-closest" || action === "target-called" || action === "target-self") {
      if (!event.repeat) {
        targetByKey(action);
      }
      return;
    }
    if (action === "attack") {
      // Held Space auto-repeats; one attack is all it means (#160).
      if (!event.repeat) {
        attack();
      }
      return;
    }
    if (action === "call-target" || action === "ping") {
      // For a mouse without a wheel click (#443).
      const snapshot = session?.connection.getSnapshot();
      const call =
        snapshot === undefined || event.repeat
          ? undefined
          : action === "call-target"
            ? callTargetCall(snapshot)
            : pingCall(snapshot, viewport?.pointerWorld());
      if (call !== undefined) {
        session?.connection.sendCall(call);
      }
      return;
    }
    if (WEAPON_SET_ACTIONS.includes(action)) {
      if (!event.repeat) {
        swapTo(WEAPON_SET_ACTIONS.indexOf(action));
      }
      return;
    }
    if (action === "mute") {
      if (!event.repeat) {
        // No HUD here, so the message line says what the mute key did.
        const muted = !soundPlayer().muted;
        setGlobalMute(muted);
        flash(muted ? "Sound off." : "Sound on.");
      }
      return;
    }
    const slot = skillSlotForKeyDown(event, keymap, session?.connection.skillBar ?? []);
    if (slot !== undefined) {
      cast(slot);
    }
  };

  /** Esc anywhere else on the page collapses an expanded arena (#495). */
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key !== "Escape" ||
      event.repeat ||
      isShortcut(event) ||
      (event.target instanceof Node && stage.contains(event.target))
    ) {
      return;
    }
    event.preventDefault();
    setExpanded(false);
  };

  const paintExpandButton = (): void => {
    const verb = expanded ? "collapse" : "expand";
    expandButton.setAttribute("aria-label", `${verb} training ground`);
    expandButton.title = expanded ? "Collapse" : "Expand";
    expandButton.setAttribute("aria-pressed", String(expanded));
    expandButton.innerHTML = expanded ? COLLAPSE_ICON : EXPAND_ICON;
  };

  /**
   * An in-page overlay, not the Fullscreen API: the panel moves nowhere in
   * the DOM, so collapsing puts it back exactly as it was, fight and all.
   */
  function setExpanded(on: boolean): void {
    if (on === expanded) {
      return;
    }
    expanded = on;
    root.classList.toggle("is-expanded", on);
    document.body.classList.toggle("has-expanded-training", on);
    if (on) {
      document.addEventListener("keydown", onDocumentKeyDown);
    } else {
      document.removeEventListener("keydown", onDocumentKeyDown);
    }
    paintExpandButton();
    // Phaser would see the new stage size on its next poll; now is sooner.
    viewport?.refreshScale();
    // Expanding takes control, as a click on the stage does; collapsing
    // keeps it if the player had it.
    if (on) {
      armed = true;
    }
    if (armed && !disposed) {
      stage.focus({ preventScroll: true });
    }
  }
  paintExpandButton();
  expandButton.addEventListener("click", () => {
    setExpanded(!expanded);
  });

  const onStagePointerDown = (): void => {
    armedBeforeClick = armed;
    armed = true;
    stage.focus({ preventScroll: true });
  };

  const onDocumentPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || root.contains(target)) {
      return;
    }
    if (target.closest(TAKES_KEYBOARD) !== null) {
      armed = false;
    }
  };

  const onStageFocus = (): void => {
    root.classList.add("is-armed");
    hint.textContent = armedHint(keymap, keyLabel);
  };

  const onStageBlur = (): void => {
    root.classList.remove("is-armed");
    hint.textContent = "";
    // The move input lets go of any held key itself, on the same blur.
  };

  stage.addEventListener("keydown", onStageKeyDown);
  stage.addEventListener("pointerdown", onStagePointerDown, { capture: true });
  stage.addEventListener("focus", onStageFocus);
  stage.addEventListener("blur", onStageBlur);
  document.addEventListener("pointerdown", onDocumentPointerDown, { capture: true });

  const onPickScenario = (): void => {
    const scenario = getTrainingScenario(picker.value);
    if (scenario === undefined || character === undefined) {
      return;
    }
    saveScenarioChoice(storage, scenario.id);
    startSession(scenario, character);
  };
  picker.addEventListener("change", onPickScenario);

  const onReset = (): void => {
    if (session === undefined) {
      return;
    }
    const { simulation } = session.connection;
    for (const participant of [...simulation.participants()]) {
      simulation.resetParticipant(participant.id);
    }
    restartMeter("reset");
  };
  resetButton.addEventListener("click", onReset);

  const onLogScroll = (): void => {
    if (shouldStickToBottom(logRowsEl.scrollTop, logRowsEl.scrollHeight, logRowsEl.clientHeight)) {
      newest.hidden = true;
    }
  };
  logRowsEl.addEventListener("scroll", onLogScroll);
  newest.addEventListener("click", () => {
    logRowsEl.scrollTop = logRowsEl.scrollHeight;
    newest.hidden = true;
  });

  /* --- the arena --------------------------------------------------------- */

  const firstScenario =
    getTrainingScenario(resolveScenarioId(loadScenarioChoice(storage), TRAINING_SCENARIOS) ?? "") ??
    TRAINING_SCENARIOS[0];
  if (firstScenario === undefined) {
    throw new TrainingUnavailableError("no training scenarios");
  }
  const firstMap = trainingMap(firstScenario);
  stage.style.setProperty(
    "--training-aspect",
    `${String(firstMap.width)} / ${String(firstMap.height)}`,
  );

  let offFrame: (() => void) | undefined;
  let offPointer: (() => void) | undefined;
  // The names key on the stage shows every name, as its other keys work;
  // the cursor shows one (#253).
  const nameReveal = attachNameReveal(stage, keymap);

  void loadLayoutLabeller().then((label) => {
    if (label === undefined || disposed) {
      return;
    }
    keyLabel = label;
    if (session !== undefined) {
      paintSkills(session.connection.skillBar);
    }
    if (root.classList.contains("is-armed")) {
      hint.textContent = armedHint(keymap, keyLabel);
    }
  });
  // A double right click on an enemy attacks it, as Space would (#298, #438).
  const doubleClick = createDoubleClick();

  void createArenaViewport(stage).then((created) => {
    if (disposed) {
      created.destroy();
      return;
    }
    viewport = created;
    // At a match's scale (#709): the small stage shows less of the world
    // instead of all of it shrunk. A match's canvas is the whole window
    // (#viewport; the top bar hides in a match, #454), so that is the box
    // the zoom comes from.
    const follow = attachFollowCamera(
      created,
      stage,
      session === undefined ? firstMap : trainingMap(session.scenario),
      () => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
    camera = follow;
    // The one clock: Phaser's STEP. It stops when the game is
    // destroyed, so teardown cannot leave an orphan loop behind.
    offFrame = created.onFrame((deltaSeconds) => {
      if (disposed || session === undefined) {
        return;
      }
      const { connection } = session;
      connection.advance(deltaSeconds);
      appendLog(ticks.advance(connection.simulation.elapsedSeconds, nameOf, isCreature));
      latestMatch = connection.getSnapshot();
      session.sounds.snapshot(latestMatch);
      session.music.snapshot(latestMatch);
      const self = latestMatch.players.find((player) => player.sessionId === SELF_ID);
      follow.frame(deltaSeconds, self);
      partyWindow.update(latestMatch);
      latestArena = withCalls(
        withNames(
          // The Training Ground has no flags (#1225) or relics (#1374).
          toArenaSnapshot(latestMatch, session.walls, session.shrines, undefined, undefined),
          created.pointerWorld(),
          nameReveal.held(),
        ),
        connection.getCalls(),
      );
      created.scene.setSnapshot(latestArena);
      // For the e2e specs: who your team has called.
      const called = latestArena.calledId ?? "";
      if (stage.dataset.called !== called) {
        stage.dataset.called = called;
      }
      // And whose names are drawn (#253): screen-sized names overlap on a
      // crowded stage (#456), so a pixel band cannot tell them apart.
      const names = latestArena.actors
        .filter((actor) => nameShown(latestArena, actor))
        .map((actor) => actor.id)
        .join(",");
      if (stage.dataset.names !== names) {
        stage.dataset.names = names;
      }
      // And where everyone stands, to the unit (#497): that a dummy walks.
      const positions = latestArena.actors
        .map(
          ({ id, position }) =>
            `${id}:${Math.round(position.x).toString()},${Math.round(position.y).toString()}`,
        )
        .join(";");
      if (stage.dataset.positions !== positions) {
        stage.dataset.positions = positions;
      }
      paintVitals(latestMatch);
      sinceMeterPaint += deltaSeconds;
      if (sinceMeterPaint >= METER_PAINT_SECONDS) {
        sinceMeterPaint = 0;
        paintMeter();
      }
    });
    // As in a match (#438, #442): the left button walks, a right click
    // picks, a right drag pans.
    follow.onSecondaryClick((world) => {
      if (session === undefined) {
        return;
      }
      const intents = secondaryClickIntents(
        session.connection.getSnapshot(),
        latestArena,
        world,
        doubleClick,
        performance.now(),
      );
      for (const intent of intents) {
        session.connection.sendIntent(intent);
      }
    });
    offPointer = created.onButton(({ button, phase, world }) => {
      if (session === undefined) {
        return;
      }
      // A wheel click calls a foe, or pings the point (#443, #1055).
      if (button === "middle" && phase === "down") {
        const action = middleClickAction(session.connection.getSnapshot(), latestArena, world);
        if (action.kind === "call") {
          session.connection.sendCall(action.call);
        }
        return;
      }
      // The stage's capturing listener ran first, so this click's arming
      // is already known: the click that takes control only takes it.
      if (button !== "left" || phase !== "down" || !armedBeforeClick) {
        return;
      }
      session.connection.sendIntent({ kind: "walk-to", x: world.x, y: world.y });
      created.scene.showWalkMarker(world);
    });
  });

  return {
    root,
    statsSlot,
    attach(parent) {
      parent.appendChild(root);
    },
    refocus() {
      const active = document.activeElement;
      if (shouldRestoreFocus(armed, active === null || active === document.body)) {
        stage.focus({ preventScroll: true });
      }
    },
    setBuild(next) {
      character = next;
      const nextSignature = buildSignature(next);
      if (session === undefined) {
        signature = nextSignature;
        startSession(firstScenario, next);
        return;
      }
      if (nextSignature !== signature) {
        signature = nextSignature;
        rearm(next);
      }
    },
    setDisplayName(name) {
      displayName = name;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      // Leaving the editor while expanded collapses first: the page behind
      // must scroll again, and Esc be nobody's.
      setExpanded(false);
      // Mirrors MatchView.dispose(): stop listening before tearing down,
      // so a late event cannot touch a destroyed scene.
      offFrame?.();
      offPointer?.();
      camera?.dispose();
      camera = undefined;
      partyWindow.dispose();
      delete stage.dataset.called;
      delete stage.dataset.names;
      delete stage.dataset.positions;
      nameReveal.detach();
      detachMovement();
      stage.removeEventListener("keydown", onStageKeyDown);
      stage.removeEventListener("pointerdown", onStagePointerDown, { capture: true });
      stage.removeEventListener("focus", onStageFocus);
      stage.removeEventListener("blur", onStageBlur);
      document.removeEventListener("pointerdown", onDocumentPointerDown, { capture: true });
      if (messageTimer !== undefined) {
        clearTimeout(messageTimer);
      }
      session?.sounds.dispose();
      session?.music.dispose();
      void session?.connection.disconnect();
      session = undefined;
      root.remove();
      slotTips.dispose();
      viewport?.destroy();
      viewport = undefined;
    },
  };
}
