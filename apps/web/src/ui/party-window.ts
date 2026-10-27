import type { MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import { healthTint, paintHealthTint, type HealthTint } from "./health-tint.js";
import {
  lostHealthPercent,
  targetHealthLabel,
  targetHealthPercent,
  targetProfessionIcons,
  type ProfessionIcon,
} from "./hud.js";
import { pipsElement, renderPips } from "./pips.js";

/**
 * The party window (#1055, docs/art/art-direction.md "Party window"): your
 * team's health at a glance, right middle, you first. A click on a row
 * targets that member. No energy, as GW1.
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
  readonly healthLabel: string;
  readonly tint: HealthTint | null;
  readonly pips: number;
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
    healthLabel: player.dead ? "dead" : targetHealthLabel(player, self.team),
    tint: player.dead ? null : healthTint(player.statuses.map((status) => status.id)),
    pips: player.healthPips,
  };
}

/** Your team, you first, then the others in seat order; empty when you are alone or spectating. */
export function partyRows(snapshot: MatchSnapshot): readonly PartyRow[] {
  const self = snapshot.players.find((player) => player.sessionId === snapshot.selfSessionId);
  if (self === undefined) {
    return [];
  }
  const others = snapshot.players.filter(
    (player) => player.team === self.team && player.sessionId !== self.sessionId,
  );
  if (others.length === 0) {
    return [];
  }
  return [self, ...others].map((player) => partyRow(player, self));
}

export interface PartyWindow {
  /** Paint from this frame's snapshot; the DOM is touched only where a row changed. */
  update(snapshot: MatchSnapshot): void;
  dispose(): void;
}

/** A member's row elements, made once and reused while they stay (ADR-0030). */
interface RowElements {
  readonly row: HTMLButtonElement;
  readonly professions: HTMLElement;
  readonly name: HTMLElement;
  readonly bar: HTMLElement;
  readonly fill: HTMLElement;
  readonly lost: HTMLElement;
  readonly label: HTMLElement;
  readonly pips: HTMLElement;
  readonly deadText: HTMLElement;
  /** What was last painted, so an unchanged row costs nothing. */
  key: string;
}

function span(className: string, parent: HTMLElement): HTMLElement {
  const element = document.createElement("span");
  element.className = className;
  parent.appendChild(element);
  return element;
}

function createRow(id: string, onTarget: (sessionId: string) => void): RowElements {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "party-row";
  row.dataset.member = id;
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
  const pips = bar.appendChild(pipsElement());
  const deadText = span("party-row-dead", row);
  deadText.textContent = "dead";
  return { row, professions, name, bar, fill, lost, label, pips, deadText, key: "" };
}

function paintRow(elements: RowElements, row: PartyRow, player: PlayerSnapshot): void {
  renderPips(elements.pips, row.pips);
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
  elements.label.textContent = row.healthLabel;
}

/** The window, in `parent`: hidden while there is no party to show. */
export function createPartyWindow(
  parent: HTMLElement,
  onTarget: (sessionId: string) => void,
): PartyWindow {
  const panel = document.createElement("div");
  panel.className = "party-window";
  panel.setAttribute("aria-label", "Party");
  panel.hidden = true;
  parent.appendChild(panel);
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
          elements.row.remove();
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
          elements = createRow(row.id, onTarget);
          rows.set(row.id, elements);
        }
        paintRow(elements, row, player);
      }
      const nextOrder = party.map((row) => row.id).join(" ");
      if (nextOrder !== order) {
        order = nextOrder;
        panel.replaceChildren(
          ...party.flatMap((row) => {
            const elements = rows.get(row.id);
            return elements === undefined ? [] : [elements.row];
          }),
        );
      }
    },
    dispose() {
      panel.remove();
      rows.clear();
    },
  };
}
