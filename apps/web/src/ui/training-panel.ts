import {
  TRAINING_SCENARIOS,
  getTrainingScenario,
  type StepResult,
  type Vec2,
  type TrainingScenario,
} from "@vibewars/game-core";

import { attachMatchSounds, type MatchSounds } from "../audio/match-sounds.js";
import { saveMuted } from "../audio/mute-preference.js";
import { soundPlayer } from "../audio/sound-player.js";
import {
  attackClickIntents,
  attackKeyIntents,
  isAttacking,
  isCasting,
} from "../input/attack-key.js";
import { createDoubleClick } from "../input/double-click.js";
import { attachKeyboardMoveInput } from "../input/keyboard-move.js";
import { attachNameReveal } from "../input/name-reveal.js";
import { nextTabTarget } from "../input/tab-target.js";
import { toArenaSnapshot, toRenderableWall } from "../match-view.js";
import type { MatchSnapshot, SkillSlot } from "../net/match-connection.js";
import {
  actorAtPoint,
  EMPTY_SNAPSHOT,
  withNames,
  type ArenaSnapshot,
  type RenderableWall,
} from "../render/arena-snapshot.js";
import { createArenaViewport, type ArenaViewport } from "../render/arena-viewport.js";
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
import { describeRefusal, MESSAGE_SECONDS } from "./hud.js";
import { skillBadgeHtml } from "./icons.js";
import { paintRecharge, prefersReducedMotion } from "./recharge-overlay.js";
import { castingSlot, flashSlot, slotFlashes } from "./skill-slot-state.js";
import {
  buildSignature,
  loadScenarioChoice,
  overlayMessage,
  resolveScenarioId,
  saveScenarioChoice,
  shouldRestoreFocus,
  slotForKey,
} from "./training-state.js";

/**
 * The Training Ground: a live arena beside the build editor (#2 §6).
 *
 * The editor re-renders its whole subtree on every change, so this panel
 * is created once and *moved* into each new render with `attach`. The
 * Phaser game inside it lives as long as the editor does: switching
 * scenarios swaps the simulation and resizes the game, and editing the
 * build re-arms the player in place. Nothing here ever recreates it.
 */

export interface TrainingPanel {
  readonly root: HTMLElement;
  /** Re-parent after a re-render. */
  attach(parent: HTMLElement): void;
  setBuild(character: StoredCharacter): void;
  setDisplayName(name: string): void;
  dispose(): void;
}

/** The newest rows the log keeps; older ones come off the front. */
const LOG_CAP = 200;

/** The meter is summed every step, but repainted at most this often. */
const METER_PAINT_SECONDS = 0.2;

const HINT_IDLE = "click the arena to take control";
const HINT_ARMED =
  "wasd move · 1–8 cast · tab/click to target · space/double-click attack · esc to release";

/**
 * Clicking one of these takes the keyboard, so it takes arena control
 * away. Clicking anything else outside the panel (an attribute `+`, a
 * skill box) re-renders the editor and hands control back.
 */
const TAKES_KEYBOARD = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/** Thrown when the arena cannot run here; the editor then stays two columns. */
export class TrainingUnavailableError extends Error {}

function hasWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) !== null;
  } catch {
    return false;
  }
}

function h(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function vitalBar(kind: string): { root: HTMLElement; fill: HTMLElement; label: HTMLElement } {
  const root = h("div", `training-bar training-bar-${kind}`);
  const fill = h("div", "training-bar-fill");
  const label = h("span", "training-bar-label");
  root.append(fill, label);
  return { root, fill, label };
}

interface Session {
  readonly scenario: TrainingScenario;
  readonly connection: LocalMatchConnection;
  readonly names: ReadonlyMap<string, string>;
  readonly walls: readonly RenderableWall[];
  readonly sounds: MatchSounds;
  parked: boolean;
}

export function createTrainingPanel(): TrainingPanel {
  if (!hasWebGl()) {
    throw new TrainingUnavailableError("no WebGL");
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
  controls.append(picker, resetButton);

  const teaches = h("p", "training-teaches");

  const stage = h("div", "training-stage");
  stage.tabIndex = 0;
  stage.setAttribute("role", "application");
  stage.setAttribute("aria-label", "training arena");
  const overlay = h("div", "training-overlay");
  overlay.hidden = true;
  stage.appendChild(overlay);

  const hint = h("p", "training-hint", HINT_IDLE);
  const message = h("p", "training-message");

  const health = vitalBar("health");
  const energy = vitalBar("energy");
  const adrenaline = h("span", "training-adrenaline");
  const vitals = h("div", "training-vitals");
  vitals.append(health.root, energy.root, adrenaline);

  const skills = h("div", "training-skills");

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

  root.append(controls, teaches, stage, hint, message, vitals, skills, meter, log);

  /* --- state ----------------------------------------------------------- */

  let disposed = false;
  let viewport: ArenaViewport | undefined;
  let session: Session | undefined;
  let character: StoredCharacter | undefined;
  let signature: string | undefined;
  let displayName = "";
  let armed = false;
  let logRows: readonly LogRow[] = [];
  let totals: MeterTotals = EMPTY_TOTALS;
  /** Gathers status ticks into a row a second (#151); one per session. */
  let ticks = new StatusTickBatcher();
  let sinceMeterPaint = 0;
  let latestMatch: MatchSnapshot | undefined;
  let latestArena: ArenaSnapshot = EMPTY_SNAPSHOT;
  let messageTimer: ReturnType<typeof setTimeout> | undefined;
  let skillButtons: HTMLButtonElement[] = [];

  // The player's professions follow the build being edited (#281).
  const professionsOf = (id: string): Professions =>
    id === SELF_ID && character !== undefined
      ? { primary: character.primaryProfession, secondary: character.secondaryProfession }
      : NO_PROFESSIONS;
  const nameOf = (id: string): string =>
    id === SELF_ID ? displayName.trim() || "You" : (session?.names.get(id) ?? id);

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
    logRows = appendRows(logRows, incoming, LOG_CAP).rows;
    for (const row of incoming) {
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
    appendLog([...ticks.flush(now, nameOf), dividerRow(label, now)]);
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

  const paintSkills = (slots: readonly SkillSlot[]): void => {
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
      button.addEventListener("click", () => {
        cast(index);
      });
      button.append(h("span", "training-skill-key", String(index + 1)));
      button.insertAdjacentHTML("beforeend", skillBadgeHtml(slot.id));
      button.append(h("span", "training-skill-name", slot.name));
      return button;
    });
    skills.replaceChildren(...skillButtons);
  };

  const paintOverlay = (
    problem: string | undefined,
    skillBar: readonly string[],
    scenario: TrainingScenario,
  ): void => {
    const text = overlayMessage(problem, skillBar, scenario);
    overlay.hidden = text === undefined;
    overlay.textContent = text ?? "";
  };

  const paintVitals = (match: MatchSnapshot): void => {
    const self = match.players.find((player) => player.sessionId === SELF_ID);
    if (self === undefined) {
      return;
    }
    const fraction = (value: number, max: number): string =>
      `${String(max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0)}%`;
    health.fill.style.width = fraction(self.health, self.maxHealth);
    health.label.textContent = `${String(self.health)} / ${String(self.maxHealth)}`;
    energy.fill.style.width = fraction(self.energy, self.maxEnergy);
    energy.label.textContent = `${String(self.energy)} / ${String(self.maxEnergy)}`;
    adrenaline.textContent =
      `adrenaline ${String(self.adrenaline)}` +
      (self.attackTargetSessionId === undefined ? "" : " · attacking");
    const slots = session?.connection.skillBar ?? [];
    const recharges = session?.connection.getRecharges() ?? [];
    const reducedMotion = prefersReducedMotion();
    const casting = castingSlot(slots, self);
    skillButtons.forEach((button, index) => {
      const slot = slots[index];
      // The casting slot is lit, as on the match HUD (#300).
      button.classList.toggle("is-casting", index === casting);
      // A hint, not a gate: the simulation still decides.
      const unaffordable =
        slot !== undefined &&
        (self.energy < slot.energyCost || self.adrenaline < slot.adrenalineCost);
      button.classList.toggle("is-unaffordable", unaffordable);
      // The same wipe as the match HUD (#152).
      paintRecharge(button, recharges[index], slot?.name ?? "", reducedMotion);
    });
  };

  /* --- the session ------------------------------------------------------ */

  const onStep = (result: StepResult): void => {
    totals = accumulate(totals, result.log, SELF_ID, TICK_SECONDS);
    const rows: LogRow[] = [];
    for (const entry of result.log) {
      rows.push(...ticks.push(entry, nameOf));
    }
    appendLog(rows);
  };

  const startSession = (scenario: TrainingScenario, build: StoredCharacter): void => {
    session?.sounds.dispose();
    void session?.connection.disconnect();
    const setup = setupScenario(scenario, build);
    ticks = new StatusTickBatcher();
    const connection = createLocalConnection({
      simulation: setup.simulation,
      selfId: SELF_ID,
      map: setup.map,
      nameOf,
      professionsOf,
    });
    session = {
      scenario,
      connection,
      names: setup.names,
      walls: setup.map.walls.map(toRenderableWall),
      // The same sounds as a match (#112), muted by the same M.
      sounds: attachMatchSounds(connection, soundPlayer()),
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
    viewport?.setWorldSize(map.width, map.height);
    paintSkills(connection.skillBar);
    paintOverlay(setup.arming.problem, setup.arming.skillBar, scenario);
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
    paintOverlay(arming.problem, arming.skillBar, session.scenario);
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
  let detachMovement = attachKeyboardMoveInput(stage, onMove);

  const onStageKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Tab") {
      // Never the browser's focus cycle while armed (#268): it would land in
      // the name field, and the next key would type into it. Esc releases
      // the stage, and then Tab is the browser's again.
      event.preventDefault();
      if (!event.repeat) {
        cycleTarget(event.shiftKey ? -1 : 1);
      }
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      // Held Space auto-repeats; one attack is all it means (#160).
      if (!event.repeat) {
        attack();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }
      // A cast or an attack in progress is cancelled first (#160, #300).
      const snapshot = session?.connection.getSnapshot();
      if (snapshot !== undefined && (isCasting(snapshot) || isAttacking(snapshot))) {
        session?.connection.sendIntent({ kind: "cancel" });
        return;
      }
      // Releases control; never navigates away from the editor.
      armed = false;
      stage.blur();
      return;
    }
    if (event.key === "m" || event.key === "M") {
      event.preventDefault();
      if (!event.repeat) {
        // No HUD here, so the message line says what M did.
        const sounds = soundPlayer();
        sounds.setMuted(!sounds.muted);
        saveMuted(sounds.muted);
        flash(sounds.muted ? "Sound off. Press M to turn it on." : "Sound on.");
      }
      return;
    }
    const slot = slotForKey(event.key, session?.connection.skillBar.length ?? 0);
    if (slot !== undefined) {
      event.preventDefault();
      cast(slot);
    }
  };

  const onStagePointerDown = (): void => {
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
    hint.textContent = HINT_ARMED;
  };

  const onStageBlur = (): void => {
    root.classList.remove("is-armed");
    hint.textContent = HINT_IDLE;
    // A key held while focus left will never send its keyup here: let go
    // of everything, rather than walk on forever.
    detachMovement();
    detachMovement = attachKeyboardMoveInput(stage, onMove);
    onMove({ x: 0, y: 0 });
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
  let offPointerMove: (() => void) | undefined;
  // Ctrl on the stage shows every name, as its other keys work; the
  // cursor shows one (#253). In world units, which a still cursor keeps.
  const nameReveal = attachNameReveal(stage);
  let pointer: Vec2 | undefined;
  // A double-click on an enemy attacks it, as Space would (#298).
  const doubleClick = createDoubleClick();

  void createArenaViewport(stage, {
    mode: "fit",
    width: firstMap.width,
    height: firstMap.height,
  }).then((created) => {
    if (disposed) {
      created.destroy();
      return;
    }
    viewport = created;
    if (session !== undefined) {
      const map = trainingMap(session.scenario);
      created.setWorldSize(map.width, map.height);
    }
    // The one clock: Phaser's STEP. It stops when the game is
    // destroyed, so teardown cannot leave an orphan loop behind.
    offFrame = created.onFrame((deltaSeconds) => {
      if (disposed || session === undefined) {
        return;
      }
      const { connection } = session;
      connection.advance(deltaSeconds);
      appendLog(ticks.advance(connection.simulation.elapsedSeconds, nameOf));
      latestMatch = connection.getSnapshot();
      session.sounds.snapshot(latestMatch);
      latestArena = withNames(
        toArenaSnapshot(latestMatch, session.walls),
        pointer,
        nameReveal.held(),
      );
      created.scene.setSnapshot(latestArena);
      paintVitals(latestMatch);
      sinceMeterPaint += deltaSeconds;
      if (sinceMeterPaint >= METER_PAINT_SECONDS) {
        sinceMeterPaint = 0;
        paintMeter();
      }
    });
    offPointer = created.onPointerDown((world) => {
      if (session === undefined) {
        return;
      }
      const hit = actorAtPoint(latestArena, world);
      session.connection.sendIntent({ kind: "target", targetSessionId: hit?.id ?? null });
      if (doubleClick.press(hit?.id, performance.now())) {
        for (const intent of attackClickIntents(session.connection.getSnapshot(), hit?.id)) {
          session.connection.sendIntent(intent);
        }
      }
    });
    offPointerMove = created.onPointerMove((world) => {
      pointer = world;
    });
  });

  return {
    root,
    attach(parent) {
      parent.appendChild(root);
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
      // Mirrors MatchView.dispose(): stop listening before tearing down,
      // so a late event cannot touch a destroyed scene.
      offFrame?.();
      offPointer?.();
      offPointerMove?.();
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
      void session?.connection.disconnect();
      session = undefined;
      root.remove();
      viewport?.destroy();
      viewport = undefined;
    },
  };
}
