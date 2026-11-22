import { t } from "../i18n/index.js";
import { button, h, inlineConfirm } from "../ui/kit.js";

/**
 * The menu quest's coach (#3540): the menu dimmed but for a lit cut-out
 * round the control a beat points at, which alone takes the pointer and
 * the keyboard (operator Q103: lock); a bubble beside it with the beat's
 * line; and the quest panel in a corner, with its checklist and Skip
 * tutorial. DOM only: what to show comes from the session.
 */

/**
 * The attribute a control a step points at carries, never a CSS class: a
 * space-separated list of ids, for a control that is part of more than one
 * beat's region (#3541).
 */
export const TUTORIAL_TARGET = "data-tutorial";

/** The cut-out's room round its target, in px. */
const CUT_OUT_PAD = 8;
/** The gap between the cut-out and the bubble beside it, in px. */
const BUBBLE_GAP = 12;
/** The panel's and the bubble's distance from the window's edge, in px. */
const EDGE = 16;

const PULSE_CLASS = "tutorial-pulse";

/**
 * How long a beat's target may be missing from the page before the coach
 * lets go (#3785): it waits that long on one not drawn yet, then lifts the
 * dim and the lock, and says how to get back, until the target is there.
 */
export const LOST_TARGET_MS = 1500;

const FOCUSABLE = "a[href], button:not([disabled]), input, select, textarea, [tabindex]";

/**
 * What the game opens over the menu itself, a toast or a dialog: above
 * the dim, and never locked, so the overlay never blocks an error.
 */
const ABOVE_THE_LOCK = ".toast, [role='dialog'], [role='alertdialog']";

/** The events a locked-out pointer could do something with. */
const POINTER_EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
] as const;

export interface CoachView {
  readonly title: string;
  readonly line: string;
  /** The `data-tutorial` id of the control, or region, the beat points at: every element with it. */
  readonly target: string;
  readonly objectives: readonly { readonly label: string; readonly done: boolean }[];
  /** `false` points at the target with no dim and no lock (#3785): the rest of the screen is the player's. */
  readonly locked: boolean;
  /** Got it, on a pure explanation; a thing to do has no button. */
  readonly gotIt: (() => void) | undefined;
}

export interface CoachOverlay {
  show(view: CoachView): void;
  /**
   * The lock lifted and the dim gone, the panel says `line` alone (#3544),
   * until clicked or `ms` have passed: then the overlay goes, and `onGone`.
   */
  farewell(line: string, ms: number, onGone: () => void): void;
  remove(): void;
}

export interface CoachRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CoachViewport {
  readonly width: number;
  readonly height: number;
}

export function tutorialTargetSelector(id: string): string {
  return `[${TUTORIAL_TARGET}~="${id}"]`;
}

/** The box round all of `boxes` that are drawn; none drawn is none. */
export function unionBox(boxes: readonly CoachRect[]): CoachRect | undefined {
  const drawn = boxes.filter(({ width, height }) => width > 0 && height > 0);
  if (drawn.length === 0) {
    return undefined;
  }
  const left = Math.min(...drawn.map((box) => box.left));
  const top = Math.min(...drawn.map((box) => box.top));
  const right = Math.max(...drawn.map((box) => box.left + box.width));
  const bottom = Math.max(...drawn.map((box) => box.top + box.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** The lit cut-out round a target's box. */
export function cutOut(box: CoachRect): CoachRect {
  return {
    left: box.left - CUT_OUT_PAD,
    top: box.top - CUT_OUT_PAD,
    width: box.width + 2 * CUT_OUT_PAD,
    height: box.height + 2 * CUT_OUT_PAD,
  };
}

function overlaps(a: CoachRect, b: CoachRect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

/** Where the panel sits: a corner, or the whole edge in a narrow window. */
export interface PanelSpot {
  readonly edge: "bottom" | "top";
  readonly corner: "end" | "start";
}

const PANEL_SPOTS: readonly PanelSpot[] = [
  { edge: "bottom", corner: "end" },
  { edge: "bottom", corner: "start" },
  { edge: "top", corner: "end" },
  { edge: "top", corner: "start" },
];

/**
 * Where the panel goes: the bottom corner at the inline end, else the
 * first of the bottom start, top end and top start corners that covers
 * none of `clear` (the cut-out, then the bubble). Nothing clear, the
 * first that leaves the cut-out alone, else the bubble (a cut-out as
 * tall as the window). A panel as wide as the window is docked to its
 * bottom or top edge. `rtl` puts the inline end on the left.
 */
export function panelSpot(
  clear: readonly CoachRect[],
  panel: { readonly width: number; readonly height: number },
  viewport: CoachViewport,
  rtl: boolean,
): PanelSpot {
  const docked = panel.width > viewport.width - 2 * EDGE;
  const inset = docked ? 0 : EDGE;
  const rect = ({ edge, corner }: PanelSpot): CoachRect => ({
    left: docked ? 0 : (corner === "end") !== rtl ? viewport.width - EDGE - panel.width : EDGE,
    top: edge === "top" ? inset : viewport.height - inset - panel.height,
    width: panel.width,
    height: panel.height,
  });
  const covers = (spot: PanelSpot, rects: readonly CoachRect[]): boolean =>
    rects.some((each) => overlaps(each, rect(spot)));
  return (
    PANEL_SPOTS.find((spot) => !covers(spot, clear)) ??
    PANEL_SPOTS.find((spot) => !covers(spot, clear.slice(0, 1))) ??
    PANEL_SPOTS.find((spot) => !covers(spot, clear.slice(1))) ?? {
      edge: "bottom",
      corner: "end",
    }
  );
}

/**
 * Where the bubble goes: beside the cut-out, after it where there is
 * room and before it where not, below it if neither; kept on screen.
 */
export function bubblePlace(
  hole: CoachRect,
  bubble: { readonly width: number; readonly height: number },
  viewport: CoachViewport,
): { readonly left: number; readonly top: number } {
  const clamp = (value: number, max: number): number => Math.max(EDGE, Math.min(value, max - EDGE));
  const after = hole.left + hole.width + BUBBLE_GAP;
  const before = hole.left - BUBBLE_GAP - bubble.width;
  if (after + bubble.width <= viewport.width - EDGE) {
    return { left: after, top: clamp(hole.top, viewport.height - bubble.height) };
  }
  if (before >= EDGE) {
    return { left: before, top: clamp(hole.top, viewport.height - bubble.height) };
  }
  return {
    left: clamp(hole.left, viewport.width - bubble.width),
    top: clamp(hole.top + hole.height + BUBBLE_GAP, viewport.height - bubble.height),
  };
}

/** Whether the lock lets an event at `target` through: only into one of `open`. */
export function lockLets<T>(
  target: T | null,
  open: readonly { contains(node: T): boolean }[],
): boolean {
  return target !== null && open.some((node) => node.contains(target));
}

/** Where Tab, or Shift+Tab when `back`, takes the focus among `list`: round, never out. */
export function cycleFocus<T>(
  list: readonly T[],
  current: T | undefined,
  back: boolean,
): T | undefined {
  if (list.length === 0) {
    return undefined;
  }
  const at = current === undefined ? -1 : list.indexOf(current);
  if (at === -1) {
    return back ? list[list.length - 1] : list[0];
  }
  return list[(at + (back ? -1 : 1) + list.length) % list.length];
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [
    ...(root.matches(FOCUSABLE) ? [root] : []),
    ...root.querySelectorAll<HTMLElement>(FOCUSABLE),
  ].filter((node) => !node.hidden && node.tabIndex >= 0 && node.closest("[hidden]") === null);
}

function sameRect(a: CoachRect | undefined, b: CoachRect | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

/** The coach over `root`'s document, showing nothing until `show`; `onSkip` once Skip is confirmed. */
export function mountCoachOverlay(
  root: HTMLElement,
  options: { readonly onSkip: () => void },
): CoachOverlay {
  const doc = root.ownerDocument;
  const coach = h("div", "coach");
  const dim = coach.appendChild(h("div", "coach-dim"));
  const hole = coach.appendChild(h("div", "coach-hole"));
  hole.hidden = true;
  const bubble = coach.appendChild(h("div", "coach-bubble"));
  bubble.setAttribute("role", "note");
  bubble.hidden = true;
  const bubbleLine = bubble.appendChild(h("p", "coach-bubble-line"));
  let onGotIt: (() => void) | undefined;
  const gotIt = bubble.appendChild(
    button(t("tutorial.menu.gotIt"), "primary", () => {
      onGotIt?.();
    }),
  );
  const panel = coach.appendChild(h("aside", "coach-panel"));
  const panelTitle = panel.appendChild(h("h2", "coach-panel-title"));
  panelTitle.id = "coach-panel-title";
  panel.setAttribute("aria-labelledby", panelTitle.id);
  const panelLine = panel.appendChild(h("p", "coach-panel-line"));
  const checklist = panel.appendChild(h("ul", "coach-checklist"));
  const skip = button(t("tutorial.skipTutorial"), "coach-skip", () => {
    inlineConfirm(skip, t("tutorial.menu.skipAsk"), t("tutorial.skip"), options.onSkip);
  });
  const actions = panel.appendChild(h("div", "coach-panel-actions"));
  actions.append(skip);
  root.appendChild(coach);

  let view: CoachView | undefined;
  let targets: readonly HTMLElement[] = [];
  let shownHole: CoachRect | undefined;
  // A new beat re-places everything, even round the same cut-out.
  let stale = true;
  let frame = 0;
  let removed = false;
  /** Since when, on the frame clock, the target has been missing; `undefined` while it is there. */
  let missingSince: number | undefined;
  let lost = false;
  /** Whether the player may click and tab anywhere: a beat unlocked, or a target lost. */
  const free = (): boolean => lost || view?.locked === false;

  const open = (): HTMLElement[] => [...targets, ...(bubble.hidden ? [] : [bubble]), panel];
  const above = (node: EventTarget | null): boolean =>
    node instanceof Element && node.closest(ABOVE_THE_LOCK) !== null;
  const swallow = (event: Event): void => {
    if (
      free() ||
      above(event.target) ||
      lockLets(event.target instanceof Node ? event.target : null, open())
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };
  const trapTab = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || free() || above(event.target)) {
      return;
    }
    const list = open().flatMap(focusables);
    const active = doc.activeElement instanceof HTMLElement ? doc.activeElement : undefined;
    event.preventDefault();
    cycleFocus(list, active, event.shiftKey)?.focus();
  };
  const keepFocus = (event: FocusEvent): void => {
    if (
      free() ||
      above(event.target) ||
      lockLets(event.target instanceof Node ? event.target : null, open())
    ) {
      return;
    }
    open().flatMap(focusables)[0]?.focus();
  };

  const place = (): void => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    // A target's own popover, as the profession grid, may hang out of its
    // box: the cut-out takes it in, so the bubble never sits on it.
    const box = unionBox(
      targets.flatMap((target) =>
        [target, ...target.querySelectorAll(ABOVE_THE_LOCK)].map((node) =>
          node.getBoundingClientRect(),
        ),
      ),
    );
    const next = box === undefined ? undefined : cutOut(box);
    if (!stale && sameRect(next, shownHole) && !hole.hidden === (next !== undefined)) {
      return;
    }
    shownHole = next;
    stale = false;
    dim.hidden = next !== undefined || free();
    coach.classList.toggle("coach-free", free());
    hole.hidden = next === undefined;
    bubble.hidden = next === undefined || view === undefined;
    // The bubble says the line; the panel says it only when there is none.
    panelLine.hidden = !bubble.hidden;
    panelLine.textContent = lost ? t("tutorial.coach.lost") : (view?.line ?? "");
    const clear: CoachRect[] = [];
    if (next !== undefined) {
      Object.assign(hole.style, {
        left: `${String(next.left)}px`,
        top: `${String(next.top)}px`,
        width: `${String(next.width)}px`,
        height: `${String(next.height)}px`,
      });
      const size = bubble.getBoundingClientRect();
      const at = bubblePlace(next, size, viewport);
      bubble.style.left = `${String(at.left)}px`;
      bubble.style.top = `${String(at.top)}px`;
      clear.push(
        next,
        ...(bubble.hidden ? [] : [{ ...at, width: size.width, height: size.height }]),
      );
    }
    const spot = panelSpot(
      clear,
      panel.getBoundingClientRect(),
      viewport,
      getComputedStyle(panel).direction === "rtl",
    );
    panel.dataset.edge = spot.edge;
    panel.dataset.corner = spot.corner;
  };
  // The target is looked up every frame, so the cut-out follows it as it
  // moves or is drawn anew; one not drawn yet is the dim, without a hole,
  // until it has been missing for LOST_TARGET_MS.
  const follow = (now: number = performance.now()): void => {
    if (removed) {
      return;
    }
    const found =
      view === undefined
        ? []
        : [...doc.querySelectorAll<HTMLElement>(tutorialTargetSelector(view.target))];
    if (found.length !== targets.length || found.some((node, at) => node !== targets[at])) {
      for (const target of targets) {
        target.classList.remove(PULSE_CLASS);
      }
      targets = found;
      for (const target of targets) {
        target.classList.add(PULSE_CLASS);
      }
      shownHole = undefined;
      hole.hidden = true;
    }
    missingSince = view === undefined || found.length > 0 ? undefined : (missingSince ?? now);
    const wasLost = lost;
    lost = missingSince !== undefined && now - missingSince >= LOST_TARGET_MS;
    stale ||= lost !== wasLost;
    place();
    frame = requestAnimationFrame(follow);
  };

  for (const type of POINTER_EVENTS) {
    doc.addEventListener(type, swallow, true);
  }
  doc.addEventListener("keydown", trapTab, true);
  doc.addEventListener("focusin", keepFocus, true);
  follow();

  let farewellTimer = 0;
  const unlock = (): void => {
    cancelAnimationFrame(frame);
    for (const type of POINTER_EVENTS) {
      doc.removeEventListener(type, swallow, true);
    }
    doc.removeEventListener("keydown", trapTab, true);
    doc.removeEventListener("focusin", keepFocus, true);
    for (const target of targets) {
      target.classList.remove(PULSE_CLASS);
    }
  };
  const remove = (): void => {
    removed = true;
    clearTimeout(farewellTimer);
    unlock();
    coach.remove();
  };

  return {
    show: (next) => {
      view = next;
      panelTitle.textContent = next.title;
      bubbleLine.textContent = next.line;
      checklist.replaceChildren(
        ...next.objectives.map(({ label, done }) => {
          const item = h("li", done ? "is-done" : "", label);
          item.setAttribute("aria-checked", String(done));
          return item;
        }),
      );
      gotIt.hidden = next.gotIt === undefined;
      onGotIt = next.gotIt;
      stale = true;
      // A new target has its own LOST_TARGET_MS to be drawn in.
      missingSince = undefined;
      lost = false;
      // A new beat may point elsewhere: look it up now, not a frame late.
      cancelAnimationFrame(frame);
      follow();
      (next.gotIt === undefined ? open().flatMap(focusables)[0] : gotIt)?.focus();
    },
    farewell: (line, ms, onGone) => {
      unlock();
      dim.hidden = true;
      hole.hidden = true;
      bubble.hidden = true;
      checklist.replaceChildren();
      actions.hidden = true;
      panelLine.textContent = line;
      panelLine.hidden = false;
      panel.classList.add("coach-farewell");
      const gone = (): void => {
        if (!removed) {
          remove();
          onGone();
        }
      };
      panel.addEventListener("click", gone);
      farewellTimer = window.setTimeout(gone, ms);
    },
    remove,
  };
}
