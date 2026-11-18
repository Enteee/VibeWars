import { t } from "../i18n/index.js";
import { button, h, inlineConfirm } from "../ui/kit.js";

/**
 * The menu quest's coach (#3540): the menu dimmed but for a lit cut-out
 * round the control a beat points at, which alone takes the pointer and
 * the keyboard (operator Q103: lock); a bubble beside it with the beat's
 * line; and the quest panel in a corner, with its checklist and Skip
 * tutorial. DOM only: what to show comes from the session.
 */

/** The attribute a control a step points at carries, never a CSS class. */
export const TUTORIAL_TARGET = "data-tutorial";

/** The cut-out's room round its target, in px. */
const CUT_OUT_PAD = 8;
/** The gap between the cut-out and the bubble beside it, in px. */
const BUBBLE_GAP = 12;
/** The panel's and the bubble's distance from the window's edge, in px. */
const EDGE = 16;

const PULSE_CLASS = "tutorial-pulse";

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
  /** The `data-tutorial` id of the control, or region, the beat points at. */
  readonly target: string;
  readonly objectives: readonly { readonly label: string; readonly done: boolean }[];
  /** Got it, on a pure explanation; a thing to do has no button. */
  readonly gotIt: (() => void) | undefined;
}

export interface CoachOverlay {
  show(view: CoachView): void;
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
  return `[${TUTORIAL_TARGET}="${id}"]`;
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

/**
 * The corner the panel sits in: the bottom one at the inline end, unless
 * the cut-out reaches into it, then the one at the start. `rtl` puts
 * the inline end on the left.
 */
export function panelCorner(
  hole: CoachRect | undefined,
  panel: { readonly width: number; readonly height: number },
  viewport: CoachViewport,
  rtl: boolean,
): "end" | "start" {
  const atEnd = {
    left: rtl ? EDGE : viewport.width - EDGE - panel.width,
    top: viewport.height - EDGE - panel.height,
    width: panel.width,
    height: panel.height,
  };
  return hole !== undefined && overlaps(hole, atEnd) ? "start" : "end";
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
  panel.appendChild(h("div", "coach-panel-actions")).append(skip);
  root.appendChild(coach);

  let view: CoachView | undefined;
  let target: HTMLElement | undefined;
  let shownHole: CoachRect | undefined;
  let frame = 0;
  let removed = false;

  const open = (): HTMLElement[] => [
    ...(target === undefined ? [] : [target]),
    ...(bubble.hidden ? [] : [bubble]),
    panel,
  ];
  const above = (node: EventTarget | null): boolean =>
    node instanceof Element && node.closest(ABOVE_THE_LOCK) !== null;
  const swallow = (event: Event): void => {
    if (
      above(event.target) ||
      lockLets(event.target instanceof Node ? event.target : null, open())
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };
  const trapTab = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || above(event.target)) {
      return;
    }
    const list = open().flatMap(focusables);
    const active = doc.activeElement instanceof HTMLElement ? doc.activeElement : undefined;
    event.preventDefault();
    cycleFocus(list, active, event.shiftKey)?.focus();
  };
  const keepFocus = (event: FocusEvent): void => {
    if (
      above(event.target) ||
      lockLets(event.target instanceof Node ? event.target : null, open())
    ) {
      return;
    }
    open().flatMap(focusables)[0]?.focus();
  };

  const place = (): void => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const box = target?.getBoundingClientRect();
    const next = box === undefined ? undefined : cutOut(box);
    if (sameRect(next, shownHole) && !hole.hidden === (next !== undefined)) {
      return;
    }
    shownHole = next;
    dim.hidden = next !== undefined;
    hole.hidden = next === undefined;
    bubble.hidden = next === undefined || view === undefined;
    if (next !== undefined) {
      Object.assign(hole.style, {
        left: `${String(next.left)}px`,
        top: `${String(next.top)}px`,
        width: `${String(next.width)}px`,
        height: `${String(next.height)}px`,
      });
      const at = bubblePlace(next, bubble.getBoundingClientRect(), viewport);
      bubble.style.left = `${String(at.left)}px`;
      bubble.style.top = `${String(at.top)}px`;
    }
    panel.dataset.corner = panelCorner(
      next,
      panel.getBoundingClientRect(),
      viewport,
      getComputedStyle(panel).direction === "rtl",
    );
  };
  // The target is looked up every frame, so the cut-out follows it as it
  // moves or is drawn anew; one not drawn yet is the dim, without a hole.
  const follow = (): void => {
    if (removed) {
      return;
    }
    const found =
      view === undefined
        ? undefined
        : (doc.querySelector<HTMLElement>(tutorialTargetSelector(view.target)) ?? undefined);
    if (found !== target) {
      target?.classList.remove(PULSE_CLASS);
      target = found;
      target?.classList.add(PULSE_CLASS);
      shownHole = undefined;
      hole.hidden = true;
    }
    place();
    frame = requestAnimationFrame(follow);
  };

  for (const type of POINTER_EVENTS) {
    doc.addEventListener(type, swallow, true);
  }
  doc.addEventListener("keydown", trapTab, true);
  doc.addEventListener("focusin", keepFocus, true);
  follow();

  return {
    show: (next) => {
      view = next;
      panelTitle.textContent = next.title;
      panelLine.textContent = next.line;
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
      // A new beat may point elsewhere: look it up now, not a frame late.
      cancelAnimationFrame(frame);
      follow();
      (next.gotIt === undefined ? open().flatMap(focusables)[0] : gotIt)?.focus();
    },
    remove: () => {
      removed = true;
      cancelAnimationFrame(frame);
      for (const type of POINTER_EVENTS) {
        doc.removeEventListener(type, swallow, true);
      }
      doc.removeEventListener("keydown", trapTab, true);
      doc.removeEventListener("focusin", keepFocus, true);
      target?.classList.remove(PULSE_CLASS);
      coach.remove();
    },
  };
}
