import type { MatchSnapshot } from "@vibewars/game-session";

/**
 * Watch an ally (#443): a wheel click on one shows their name and health in
 * a corner panel, live, and brackets them in the arena. One at a time; a
 * wheel click on them again stops, on another switches. Yours alone: the
 * host never hears of it.
 */

/** What the panel shows for the watched ally. */
export interface AllyWatchView {
  readonly name: string;
  /** 0 … 100. */
  readonly healthPercent: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly dead: boolean;
}

/** The watched ally as the panel shows them; `undefined` once they left, which closes it. */
export function allyWatchView(
  snapshot: MatchSnapshot,
  watchedId: string | undefined,
): AllyWatchView | undefined {
  const ally = snapshot.players.find((player) => player.sessionId === watchedId);
  if (ally === undefined) {
    return undefined;
  }
  const fraction = ally.maxHealth > 0 ? ally.health / ally.maxHealth : 0;
  return {
    name: ally.name,
    healthPercent: Math.round(Math.max(0, Math.min(1, fraction)) * 100),
    health: ally.health,
    maxHealth: ally.maxHealth,
    dead: ally.dead,
  };
}

/** A wheel click on `allyId`: watch them, or stop if they are the one watched. */
export function toggleWatch(watchedId: string | undefined, allyId: string): string | undefined {
  return watchedId === allyId ? undefined : allyId;
}

export interface AllyWatch {
  /** Who is watched, if anyone. */
  readonly watchedId: string | undefined;
  toggle(allyId: string): void;
  /** Paint the panel from this frame's snapshot; a watched ally who left closes it. */
  update(snapshot: MatchSnapshot): void;
  dispose(): void;
}

/** The corner panel, in `parent`: hidden until someone is watched. */
export function createAllyWatch(parent: HTMLElement): AllyWatch {
  const panel = document.createElement("div");
  panel.className = "ally-watch";
  panel.hidden = true;
  const name = document.createElement("div");
  name.className = "ally-watch-name";
  const bar = document.createElement("div");
  bar.className = "hud-bar ally-watch-health";
  const fill = document.createElement("div");
  fill.className = "hud-bar-fill";
  const label = document.createElement("span");
  label.className = "hud-bar-label";
  bar.append(fill, label);
  panel.append(name, bar);
  parent.appendChild(panel);

  let watchedId: string | undefined;
  return {
    get watchedId() {
      return watchedId;
    },
    toggle(allyId) {
      watchedId = toggleWatch(watchedId, allyId);
    },
    update(snapshot) {
      const view = allyWatchView(snapshot, watchedId);
      if (view === undefined) {
        watchedId = undefined;
        panel.hidden = true;
        return;
      }
      panel.hidden = false;
      panel.classList.toggle("is-dead", view.dead);
      name.textContent = view.name;
      fill.style.width = `${String(view.dead ? 0 : view.healthPercent)}%`;
      label.textContent = view.dead
        ? "dead"
        : `${String(view.health)} / ${String(view.maxHealth)} hp`;
    },
    dispose() {
      panel.remove();
    },
  };
}
