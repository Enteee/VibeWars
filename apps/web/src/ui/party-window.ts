import { PET_ATTACK_SECONDS, getSkill, type CompanionMode } from "@vibewars/game-core";
import type { ArmedAttackSnapshot, MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import { healthTint, paintHealthTint, type HealthTint } from "./health-tint.js";
import {
  lostHealthPercent,
  targetHealthPercent,
  targetProfessionIcons,
  type ProfessionIcon,
} from "./hud.js";
import { skillIcon } from "./icons.js";
import { pipsElement, renderPips } from "./pips.js";

/**
 * The party window (#1055, docs/art/art-direction.md "Party window"): your
 * team's health at a glance, right middle, you first. A click on a row
 * targets that member. No energy, as GW1. Of the creatures (#1052), only
 * your own companion is listed, under you, with its Guard, Fight and Heel
 * buttons (#1110), and the pet attack its next blow is armed with (#1167).
 */

/** Past this many rows, they go compact: name and bar on one line. */
export const FULL_ROWS = 8;

/** One member's row, as the window paints it. */
export interface PartyRow {
  readonly id: string;
  readonly name: string;
  readonly professions: readonly ProfessionIcon[];
  readonly self: boolean;
  readonly dead: boolean;
  readonly targeted: boolean;
  /** 0 … 100; undefined when dead. */
  readonly healthPercent: number | undefined;
  /** "120 / 480", beside the percentage while there is room; undefined when dead. */
  readonly healthPoints: string | undefined;
  readonly tint: HealthTint | null;
  readonly pips: number;
  /** Your companion's mode, lit on its row (#1110); undefined on a person's row. */
  readonly companionMode: CompanionMode | undefined;
  /** The pet attack your companion's next blow carries (#1167); undefined when none. */
  readonly armedAttack: ArmedAttackSnapshot | undefined;
}

function partyRow(player: PlayerSnapshot, self: PlayerSnapshot): PartyRow {
  return {
    id: player.sessionId,
    name: player.name,
    professions: targetProfessionIcons(player),
    self: player.sessionId === self.sessionId,
    dead: player.dead,
    targeted: player.sessionId === self.targetSessionId,
    healthPercent: player.dead ? undefined : targetHealthPercent(player),
    healthPoints: player.dead
      ? undefined
      : `${String(Math.round(player.health))} / ${String(Math.round(player.maxHealth))}`,
    tint: player.dead ? null : healthTint(player.statuses.map((status) => status.id)),
    pips: player.healthPips,
    companionMode: player.creature?.mode ?? undefined,
    armedAttack: player.creature?.armedAttack ?? undefined,
  };
}

/**
 * How much of an armed pet attack's wait has run (#1167), 0 just armed
 * to 1 lapsing, at match clock `now`: the share its sweep darkens.
 */
export function armedSweep(armedAttack: ArmedAttackSnapshot, now: number): number {
  return Math.min(1, Math.max(0, 1 - (armedAttack.endsAt - now) / PET_ATTACK_SECONDS));
}

/**
 * Your team, you first, then your companion (#1110), then the others in
 * seat order; empty when you are alone with no pet, or spectating.
 */
export function partyRows(snapshot: MatchSnapshot): readonly PartyRow[] {
  const self = snapshot.players.find((player) => player.sessionId === snapshot.selfSessionId);
  if (self === undefined) {
    return [];
  }
  const others = snapshot.players.filter(
    (player) =>
      player.team === self.team &&
      player.sessionId !== self.sessionId &&
      player.creature === undefined,
  );
  const companions = snapshot.players.filter(
    (player) => player.creature?.ownerId === self.sessionId && player.creature.mode !== null,
  );
  const members = [self, ...companions, ...others];
  if (members.length === 1) {
    return [];
  }
  return members.map((player) => partyRow(player, self));
}

export interface PartyWindow {
  /** Paint from this frame's snapshot; the DOM is touched only where a row changed. */
  update(snapshot: MatchSnapshot): void;
  dispose(): void;
}

/** A member's row elements, made once and reused while they stay (ADR-0030). */
interface RowElements {
  /** What sits in the panel: the row, or a companion's row and its buttons. */
  readonly element: HTMLElement;
  readonly row: HTMLButtonElement;
  readonly professions: HTMLElement;
  readonly name: HTMLElement;
  readonly bar: HTMLElement;
  readonly fill: HTMLElement;
  readonly lost: HTMLElement;
  readonly percent: HTMLElement;
  readonly points: HTMLElement;
  readonly pips: HTMLElement;
  readonly deadText: HTMLElement;
  /** A companion's Guard, Fight and Heel buttons (#1110), by mode; empty on a person's row. */
  readonly commands: ReadonlyMap<CompanionMode, HTMLButtonElement>;
  /** A companion's armed pet attack (#1167): the icon and its sweep; `undefined` on a person's row. */
  readonly armed: { readonly root: HTMLElement; readonly icon: HTMLImageElement } | undefined;
  /** What was last painted, so an unchanged row costs nothing. */
  key: string;
}

function span(className: string, parent: HTMLElement): HTMLElement {
  const element = document.createElement("span");
  element.className = className;
  parent.appendChild(element);
  return element;
}

/** The modes a companion's row offers, in its buttons' order (#1110). */
const COMMANDS: readonly { readonly mode: CompanionMode; readonly label: string }[] = [
  { mode: "guard", label: "Guard" },
  { mode: "fight", label: "Fight" },
  { mode: "heel", label: "Heel" },
];

/** Neither focusable nor taking focus on a press: the keyboard stays with the arena. */
function keepFocus(button: HTMLButtonElement): void {
  button.tabIndex = -1;
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
}

function createRow(
  id: string,
  companion: boolean,
  onTarget: (sessionId: string) => void,
  onCommand: (creatureId: string, mode: CompanionMode) => void,
): RowElements {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "party-row";
  row.dataset.member = id;
  // Targeting from the window must not take the keyboard away from the arena.
  keepFocus(row);
  row.addEventListener("click", () => {
    onTarget(id);
  });
  const header = span("party-row-header", row);
  const professions = span("party-row-professions", header);
  const name = span("party-row-name", header);
  const bar = span("hud-bar party-health", row);
  const fill = span("hud-bar-fill", bar);
  const lost = span("hud-bar-lost", bar);
  const label = span("hud-bar-label", bar);
  const percent = span("party-health-percent", label);
  // Gone in a compact row, where only the percentage fits.
  const points = span("party-health-points", label);
  const pips = bar.appendChild(pipsElement());
  const deadText = span("party-row-dead", row);
  deadText.textContent = "dead";
  const commands = new Map<CompanionMode, HTMLButtonElement>();
  let element: HTMLElement = row;
  let armed: RowElements["armed"];
  if (companion) {
    // Right of the bar; the sweep is its ::after, from `--armed` (styles.css).
    const root = span("party-armed", row);
    root.hidden = true;
    const icon = document.createElement("img");
    icon.alt = "";
    root.appendChild(icon);
    armed = { root, icon };
    // Buttons cannot nest in the row's button: they sit beside it, in one block.
    element = document.createElement("div");
    element.className = "party-companion";
    element.appendChild(row);
    const orders = span("party-commands", element);
    orders.setAttribute("role", "group");
    orders.setAttribute("aria-label", "Pet orders");
    for (const { mode, label } of COMMANDS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "party-command";
      button.dataset.mode = mode;
      button.textContent = label;
      keepFocus(button);
      button.addEventListener("click", () => {
        onCommand(id, mode);
      });
      orders.appendChild(button);
      commands.set(mode, button);
    }
  }
  return {
    element,
    row,
    professions,
    name,
    bar,
    fill,
    lost,
    percent,
    points,
    pips,
    deadText,
    commands,
    armed,
    key: "",
  };
}

function paintRow(elements: RowElements, row: PartyRow, player: PlayerSnapshot, now: number): void {
  renderPips(elements.pips, row.pips);
  if (elements.armed !== undefined && row.armedAttack !== undefined) {
    // Every frame, but only a hundredth's change touches the DOM.
    const sweep = (Math.round(armedSweep(row.armedAttack, now) * 100) / 100).toFixed(2);
    if (elements.armed.root.style.getPropertyValue("--armed") !== sweep) {
      elements.armed.root.style.setProperty("--armed", sweep);
    }
  }
  const lost = lostHealthPercent(player);
  const key = JSON.stringify([row, lost]);
  if (elements.key === key) {
    return;
  }
  elements.key = key;
  const icons = row.professions.map((icon) => icon.name).join(" / ");
  if (elements.professions.dataset.professions !== icons) {
    elements.professions.dataset.professions = icons;
    elements.professions.replaceChildren(
      ...row.professions.map((icon) => {
        const img = document.createElement("img");
        img.src = icon.src;
        img.alt = icon.name;
        img.title = icon.name;
        return img;
      }),
    );
  }
  elements.name.textContent = row.name;
  elements.row.title = `Target ${row.self ? "yourself" : row.name}`;
  elements.row.classList.toggle("is-self", row.self);
  elements.row.classList.toggle("is-dead", row.dead);
  elements.row.classList.toggle("is-targeted", row.targeted);
  elements.bar.hidden = row.dead;
  elements.deadText.hidden = !row.dead;
  paintHealthTint(elements.bar, player);
  elements.fill.style.width = `${String(row.healthPercent ?? 0)}%`;
  elements.lost.style.width = `${String(lost)}%`;
  elements.percent.textContent = `${String(row.healthPercent ?? 0)}%`;
  elements.points.textContent = row.healthPoints === undefined ? "" : ` · ${row.healthPoints}`;
  for (const [mode, button] of elements.commands) {
    const lit = mode === row.companionMode;
    button.classList.toggle("is-lit", lit);
    button.setAttribute("aria-pressed", String(lit));
  }
  if (elements.armed !== undefined) {
    const { root, icon } = elements.armed;
    root.hidden = row.armedAttack === undefined;
    if (row.armedAttack !== undefined) {
      icon.src = skillIcon(row.armedAttack.skillId);
      root.title = getSkill(row.armedAttack.skillId)?.name ?? row.armedAttack.skillId;
    }
  }
}

/**
 * The window, in `parent`: hidden while there is no party to show. A
 * companion's buttons call `onCommand` (#1110).
 */
export function createPartyWindow(
  parent: HTMLElement,
  onTarget: (sessionId: string) => void,
  onCommand: (creatureId: string, mode: CompanionMode) => void,
): PartyWindow {
  // The dock spans the right edge and centres the panel in it, clamped
  // under the compass (styles.css).
  const dock = document.createElement("div");
  dock.className = "party-dock";
  const panel = document.createElement("div");
  panel.className = "party-window";
  panel.setAttribute("aria-label", "Party");
  panel.hidden = true;
  dock.appendChild(panel);
  parent.appendChild(dock);
  const rows = new Map<string, RowElements>();
  let order = "";

  return {
    update(snapshot) {
      const party = partyRows(snapshot);
      panel.hidden = party.length === 0;
      panel.classList.toggle("is-compact", party.length > FULL_ROWS);
      const ids = new Set(party.map((row) => row.id));
      for (const [id, elements] of rows) {
        if (!ids.has(id)) {
          elements.element.remove();
          rows.delete(id);
        }
      }
      for (const row of party) {
        const player = snapshot.players.find((candidate) => candidate.sessionId === row.id);
        if (player === undefined) {
          continue;
        }
        let elements = rows.get(row.id);
        if (elements === undefined) {
          elements = createRow(row.id, row.companionMode !== undefined, onTarget, onCommand);
          rows.set(row.id, elements);
        }
        paintRow(elements, row, player, snapshot.elapsedSeconds);
      }
      const nextOrder = party.map((row) => row.id).join(" ");
      if (nextOrder !== order) {
        order = nextOrder;
        panel.replaceChildren(
          ...party.flatMap((row) => {
            const elements = rows.get(row.id);
            return elements === undefined ? [] : [elements.element];
          }),
        );
      }
    },
    dispose() {
      dock.remove();
      rows.clear();
    },
  };
}
