/**
 * The pieces every menu screen builds from (ADR-0030): an element, a
 * button, and a keyed list that updates in place.
 *
 * A screen mounts once and each region updates its own elements when the
 * state changes, so the library keeps its scroll, the pressed control
 * keeps focus, and a hover or a drag survives a change made elsewhere.
 */

export function h(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

/**
 * A square button that is only an icon (#454): `label` names it for a
 * screen reader and on hover. Who uses it listens for its clicks.
 */
export function iconButton(className: string, label: string, icon = ""): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.setAttribute("aria-label", label);
  node.title = label;
  const image = node.appendChild(document.createElement("img"));
  image.alt = "";
  if (icon !== "") {
    image.src = icon;
  }
  return node;
}

/** The key each element `syncList` placed was made for. */
const listKeys = new WeakMap<Element, string>();

/**
 * Make `container`'s children one element per item of `items`, in order.
 *
 * An element whose key is still there is kept, moved only if its place
 * changed, and handed to `update`; it is never rebuilt, so its focus, hover
 * and listeners survive. A new key gets `create` and then `update`, so
 * `create` builds the structure and listeners and `update` fills in
 * everything that can change. Anything else in `container` is removed.
 */
export function syncList<T>(
  container: HTMLElement,
  items: readonly T[],
  key: (item: T) => string,
  create: (item: T) => HTMLElement,
  update: (element: HTMLElement, item: T) => void,
): void {
  const kept = new Map<string, HTMLElement>();
  for (const child of Array.from(container.children)) {
    const childKey = listKeys.get(child);
    if (childKey !== undefined && !kept.has(childKey)) {
      kept.set(childKey, child as HTMLElement);
    }
  }

  const wanted = items.map((item) => {
    const itemKey = key(item);
    let element = kept.get(itemKey);
    kept.delete(itemKey);
    if (element === undefined) {
      element = create(item);
      listKeys.set(element, itemKey);
    }
    update(element, item);
    return element;
  });

  const keep = new Set(wanted);
  for (const child of Array.from(container.children)) {
    if (!keep.has(child as HTMLElement)) {
      child.remove();
    }
  }
  wanted.forEach((element, index) => {
    const there = container.children[index];
    if (there !== element) {
      container.insertBefore(element, there ?? null);
    }
  });
}

/* --- screen bar, confirmations, problems, toasts (#566) ------------------- */

/** A screen's way back, right after its place in the top bar. */
export interface ScreenBarBack {
  readonly label: string;
  readonly onBack: () => void;
}

/** The global icon that is a screen itself, hidden while that screen shows (#1272). */
export type OwnIcon = "help" | "options" | "music";

/** What a screen puts in the top bar (#1272), left to right. */
export interface ScreenBarOptions {
  /**
   * Where the screen is: the titles of the screens it was reached through,
   * then its own. An element stands for a crumb the player edits, such as
   * the build editor's name field.
   */
  readonly crumbs: readonly (string | HTMLElement)[];
  /** The way back, which Esc takes too. The main menu has none. */
  readonly back?: ScreenBarBack;
  readonly status?: readonly HTMLElement[];
  /** The screen's own buttons, after a divider. */
  readonly actions: readonly HTMLElement[];
  /**
   * Esc puts away what the screen has open before it goes back: a menu,
   * a list, a pick. True when it put something away, so Esc stops there.
   * An open inline confirmation is put away before this is asked.
   */
  readonly putAway?: () => boolean;
  /**
   * The bar of an overlay above the screen, such as Options opened from
   * the top bar (#454): it shows, and Esc is its, until `release`, even
   * when the screen under it draws a new bar.
   */
  readonly overlay?: boolean;
  readonly own?: OwnIcon;
}

/** The parts of the top bar a screen's bar fills (index.html, topbar.ts). */
export interface TopbarSlots {
  readonly crumbs: HTMLElement;
  readonly back: HTMLElement;
  readonly status: HTMLElement;
  readonly actions: HTMLElement;
  /**
   * Told which bar shows after every change: where it is (its crumbs, as
   * text), the bar's own icon, and whether it is an overlay's.
   */
  readonly onShow: (shown: {
    readonly place: string;
    readonly own: OwnIcon | undefined;
    readonly overlay: boolean;
  }) => void;
  /** Puts away the bar's ⋯ overflow when it is open; true when it was. */
  readonly putAway: () => boolean;
}

interface LiveBar {
  readonly options: ScreenBarOptions;
  readonly crumbs: readonly HTMLElement[];
  readonly back: HTMLButtonElement | undefined;
  readonly escape: () => void;
}

let slots: TopbarSlots | undefined;
/** The newest screen's bar, which shows when no overlay's does. */
let screenLive: LiveBar | undefined;
/** The open overlays' bars, newest last: the newest shows, and Esc is its. */
const overlayBars: LiveBar[] = [];

/** Where screen bars go from now on; the top bar calls it once. */
export function setTopbarSlots(next: TopbarSlots): void {
  slots = next;
  showBar();
}

function shownBar(): LiveBar | undefined {
  return overlayBars.at(-1) ?? screenLive;
}

/** Put the shown bar's parts in the top bar, replacing the last one's. */
function showBar(): void {
  const bar = shownBar();
  if (slots === undefined || bar === undefined) {
    return;
  }
  slots.crumbs.replaceChildren(...bar.crumbs);
  slots.back.replaceChildren(...(bar.back === undefined ? [] : [bar.back]));
  slots.status.replaceChildren(...(bar.options.status ?? []));
  slots.actions.replaceChildren(...bar.options.actions);
  slots.onShow({
    place: bar.options.crumbs
      .map((crumb) => (typeof crumb === "string" ? crumb : crumb.textContent))
      .join(" / "),
    own: bar.options.own,
    overlay: bar.options.overlay === true,
  });
}

/** Whether `element` is in the page and nothing above it hides it. */
function onScreen(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node !== null; node = node.parentElement) {
    if (node.hidden || node.style.display === "none") {
      return false;
    }
  }
  return element.isConnected;
}

/**
 * The one Esc of every menu screen (#578): it cancels an open inline
 * confirmation, else lets the screen put away what it has open, else goes
 * back. On `window`, so it runs after anything on the page that wanted Esc
 * first and said so: the Training Ground cancels with it, a key being
 * rebound gives up with it. A search field and a text area keep their own.
 * In a match the top bar is hidden, so Esc keeps its in-match meaning.
 */
function onEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented || event.repeat) {
    return;
  }
  const bar = shownBar();
  if (bar === undefined || slots === undefined || !onScreen(slots.crumbs)) {
    return;
  }
  const target = event.target;
  if (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type === "search")
  ) {
    return;
  }
  event.preventDefault();
  if (cancelConfirm() || slots.putAway()) {
    return;
  }
  bar.escape();
}

let listening = false;

/** A crumb: a parent's title, or the place itself, last. */
function crumbNodes(crumbs: readonly (string | HTMLElement)[]): HTMLElement[] {
  return crumbs.flatMap((crumb, index) => {
    const place = index === crumbs.length - 1;
    const node = typeof crumb === "string" ? h("span", "", crumb) : crumb;
    node.classList.add("topbar-crumb");
    node.classList.toggle("is-place", place);
    // The place is the screen's heading, as its title was.
    if (place && typeof crumb === "string") {
      node.setAttribute("role", "heading");
      node.setAttribute("aria-level", "1");
    }
    if (index === 0) {
      return [node];
    }
    const separator = h("span", "topbar-crumb-separator", " > ");
    separator.setAttribute("aria-hidden", "true");
    return [separator, node];
  });
}

/**
 * A screen's place and controls in the top bar (#566, #1272): its
 * breadcrumb, Back, its status, then its own buttons. It shows at once,
 * replacing the last screen's; an overlay's shows above every screen's
 * until `release`. `back` is returned so a screen can ask before leaving.
 *
 * Esc on the screen is the shown bar's (#578).
 */
export function screenBar(options: ScreenBarOptions & { readonly back: ScreenBarBack }): {
  readonly back: HTMLButtonElement;
  readonly release: () => void;
};
export function screenBar(options: ScreenBarOptions): {
  readonly back: HTMLButtonElement | undefined;
  readonly release: () => void;
};
export function screenBar(options: ScreenBarOptions): {
  readonly back: HTMLButtonElement | undefined;
  readonly release: () => void;
} {
  let back: HTMLButtonElement | undefined;
  if (options.back !== undefined) {
    back = button("", "topbar-back-button", options.back.onBack);
    // A chevron on a phone, the word on a wider screen (styles.css).
    const chevron = h("span", "topbar-back-chevron", "‹");
    chevron.setAttribute("aria-hidden", "true");
    back.append(chevron, h("span", "topbar-back-label", options.back.label));
    back.setAttribute("aria-label", options.back.label);
  }
  const live: LiveBar = {
    options,
    crumbs: crumbNodes(options.crumbs),
    back,
    escape: () => {
      if (options.putAway?.() === true) {
        return;
      }
      options.back?.onBack();
    },
  };
  if (options.overlay === true) {
    overlayBars.push(live);
  } else {
    screenLive = live;
  }
  showBar();
  if (!listening) {
    listening = true;
    window.addEventListener("keydown", onEscape);
  }
  const release = (): void => {
    const at = overlayBars.indexOf(live);
    if (at !== -1) {
      overlayBars.splice(at, 1);
      showBar();
    }
  };
  return { back, release };
}

/** An open inline confirmation, which a screen can put away (Esc). */
export interface InlineConfirm {
  /** Until one of its buttons is pressed, or it is dismissed. */
  isOpen(): boolean;
  /** Put the question away and the anchor back, as cancel does. */
  dismiss(): void;
}

/** Each open confirmation, and its cancel, for Esc. */
const openConfirms = new Map<HTMLElement, () => void>();

/**
 * Cancel the newest open confirmation on the page; false when there is
 * none. One a re-render took off the page is forgotten on the way.
 */
function cancelConfirm(): boolean {
  for (const ask of openConfirms.keys()) {
    if (!ask.isConnected) {
      openConfirms.delete(ask);
    }
  }
  const newest = [...openConfirms].at(-1);
  if (newest === undefined) {
    return false;
  }
  newest[1]();
  return true;
}

/**
 * Ask in place, never with `window.confirm()` (#566): `anchor` gives way
 * to "question, confirm, cancel" until one is pressed. Cancel has the
 * focus, so Enter on a stray press keeps what you have. Esc cancels it.
 */
export function inlineConfirm(
  anchor: HTMLElement,
  question: string,
  confirmLabel: string,
  onConfirm: () => void,
  cancelLabel = "Cancel",
): InlineConfirm {
  const ask = h("span", "inline-confirm");
  ask.setAttribute("role", "group");
  let open = true;
  const dismiss = (): void => {
    if (!open) {
      return;
    }
    open = false;
    openConfirms.delete(ask);
    ask.remove();
    anchor.hidden = false;
  };
  const cancelAndRefocus = (): void => {
    dismiss();
    anchor.focus();
  };
  const cancel = button(cancelLabel, "", cancelAndRefocus);
  ask.append(
    h("span", "inline-confirm-question", question),
    button(confirmLabel, "danger", () => {
      dismiss();
      onConfirm();
    }),
    cancel,
  );
  anchor.hidden = true;
  anchor.after(ask);
  openConfirms.set(ask, cancelAndRefocus);
  cancel.focus();
  return { isOpen: () => open, dismiss };
}

/**
 * A choosable row in a list (#578): a real `<button>`, so Tab reaches it
 * and Enter or Space choose it, with the dot, the name, a subtitle and a
 * mini skill bar inside it. Its own actions sit after it, outside, so no
 * button is ever inside another.
 */
export interface SelectableRowOptions {
  readonly dot?: HTMLElement;
  readonly name: string;
  readonly subtitle?: string;
  readonly miniBar?: HTMLElement;
  readonly actions?: readonly HTMLElement[];
  /** The one chosen in its list, such as who you play as. */
  readonly selected?: boolean;
  readonly onSelect: () => void;
}

export function selectableRow(options: SelectableRowOptions): HTMLElement {
  const row = h("div", "selectable-row");
  const choose = button("", "selectable-row-choose", options.onSelect);
  choose.setAttribute("aria-pressed", String(options.selected === true));
  row.classList.toggle("is-selected", options.selected === true);
  if (options.dot !== undefined) {
    choose.appendChild(options.dot);
  }
  const text = h("span", "selectable-row-text");
  text.appendChild(h("span", "selectable-row-name", options.name));
  if (options.subtitle !== undefined) {
    text.appendChild(h("span", "selectable-row-subtitle", options.subtitle));
  }
  choose.appendChild(text);
  if (options.miniBar !== undefined) {
    choose.appendChild(options.miniBar);
  }
  row.appendChild(choose);
  if (options.actions !== undefined && options.actions.length > 0) {
    const actions = h("span", "selectable-row-actions");
    actions.append(...options.actions);
    row.appendChild(actions);
  }
  return row;
}

/**
 * What an empty list shows (#578): what is missing, and the button that
 * makes the first one, so the way forward is where the list would be.
 */
export function emptyState(
  message: string,
  actionLabel: string,
  onAction: () => void,
): HTMLElement {
  const element = h("div", "empty-state");
  element.append(h("p", "empty-state-message", message), button(actionLabel, "primary", onAction));
  return element;
}

/** One line of a problems chip: a plain sentence, and where its cause is. */
export interface ChipProblem {
  readonly text: string;
  /** A blocking problem stops the save; anything else is a hint. */
  readonly blocking: boolean;
  /** Show the cause; `undefined` when there is nothing to show. */
  readonly jump?: () => void;
}

/** The chip's own label: blocking problems, else hints, else ready. */
export function chipLabel(problems: readonly ChipProblem[]): string {
  const blocking = problems.filter((problem) => problem.blocking).length;
  const count = (n: number, noun: string): string => `${String(n)} ${noun}${n === 1 ? "" : "s"}`;
  if (blocking > 0) {
    return count(blocking, "problem");
  }
  return problems.length > 0 ? count(problems.length, "hint") : "Ready";
}

export interface ProblemsChip {
  readonly element: HTMLElement;
  update(problems: readonly ChipProblem[]): void;
  /** Whether its list is open, for a screen whose Esc closes it first. */
  readonly isOpen: () => boolean;
  close(): void;
}

/**
 * A count in a screen's bar (#566) that opens a list of plain sentences,
 * blocking ones first; pressing one closes the list and shows its cause.
 */
export function problemsChip(problems: readonly ChipProblem[]): ProblemsChip {
  const element = h("span", "problems-chip");
  const list = h("ul", "problems-list");
  list.hidden = true;
  const toggle = button("", "problems-chip-toggle", () => {
    if (list.hidden) {
      list.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
    } else {
      close();
    }
  });
  toggle.setAttribute("aria-expanded", "false");
  const close = (): void => {
    list.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };
  element.append(toggle, list);

  const update = (next: readonly ChipProblem[]): void => {
    const blocking = next.some((problem) => problem.blocking);
    toggle.textContent = chipLabel(next);
    toggle.classList.toggle("is-blocking", blocking);
    toggle.disabled = next.length === 0;
    if (next.length === 0) {
      close();
    }
    const ordered = [...next.filter((p) => p.blocking), ...next.filter((p) => !p.blocking)];
    list.replaceChildren(
      ...ordered.map((problem) => {
        const item = h("li", problem.blocking ? "is-blocking" : "is-hint");
        const { jump } = problem;
        if (jump === undefined) {
          item.textContent = problem.text;
        } else {
          item.appendChild(
            button(problem.text, "problems-jump", () => {
              close();
              jump();
            }),
          );
        }
        return item;
      }),
    );
  };
  update(problems);
  return { element, update, isOpen: () => !list.hidden, close };
}

/** How long a toast stays, unless another replaces it first. */
export const TOAST_SECONDS = 5;

let shownToast:
  { readonly element: HTMLElement; readonly timer: ReturnType<typeof setTimeout> } | undefined;

/** Take the toast down now, if one is up. */
export function dismissToast(): void {
  if (shownToast === undefined) {
    return;
  }
  clearTimeout(shownToast.timer);
  shownToast.element.remove();
  shownToast = undefined;
}

/**
 * A short note at the bottom centre (#566): "Saved", or what a change
 * removed with an Undo. One at a time: a new one replaces the old.
 * `problems` lists why something failed, as a problems chip lists them.
 * Returns a dismiss that takes down this toast only, not one that
 * replaced it.
 */
export function toast(
  text: string,
  options: { readonly undo?: () => void; readonly problems?: readonly string[] } = {},
): () => void {
  dismissToast();
  const element = h("div", "toast");
  element.setAttribute("role", "status");
  element.appendChild(h("span", "toast-text", text));
  const { undo, problems = [] } = options;
  if (problems.length > 0) {
    const list = h("ul", "problems-list toast-problems");
    list.append(...problems.map((problem) => h("li", "is-blocking", problem)));
    element.appendChild(list);
  }
  if (undo !== undefined) {
    element.appendChild(
      button("Undo", "", () => {
        dismissToast();
        undo();
      }),
    );
  }
  document.body.appendChild(element);
  shownToast = { element, timer: setTimeout(dismissToast, TOAST_SECONDS * 1000) };
  return () => {
    if (shownToast?.element === element) {
      dismissToast();
    }
  };
}

/** Elements that take typing, where a key or a paste is the field's. */
export const TAKES_TYPING =
  "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/**
 * Hand text pasted anywhere but a field to `handle` (#572, #577); a
 * paste it takes is not pasted elsewhere. Returns the way to stop.
 */
export function listenForPaste(handle: (text: string) => boolean): () => void {
  const onPaste = (event: ClipboardEvent): void => {
    const target = event.target;
    if (target instanceof Element && target.closest(TAKES_TYPING) !== null) {
      return;
    }
    if (handle(event.clipboardData?.getData("text/plain") ?? "")) {
      event.preventDefault();
    }
  };
  document.addEventListener("paste", onPaste);
  return () => {
    document.removeEventListener("paste", onPaste);
  };
}

export interface ShareLine {
  /** The line and its Copy, hidden until `show`. */
  readonly element: HTMLElement;
  show(text: string): void;
  hide(): void;
  isOpen(): boolean;
}

/**
 * A code to share as one line, selected, with Copy (#572). Copy toasts
 * "Copied"; when the clipboard is refused the line stays selected, so it
 * copies by hand.
 */
export function shareLine(label: string): ShareLine {
  const element = h("div", "editor-share");
  element.hidden = true;
  const line = document.createElement("input");
  line.className = "editor-share-line";
  line.readOnly = true;
  line.spellcheck = false;
  line.setAttribute("aria-label", label);
  const selectLine = (): void => {
    line.focus();
    line.select();
    // Selecting scrolls to the end; the start says whose code it is.
    line.scrollLeft = 0;
  };
  const copy = button("Copy", "", () => {
    // `clipboard` is missing outside a secure context; the promise turns
    // that into a refusal like any other.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(line.value))
      .then(() => {
        element.hidden = true;
        toast("Copied");
      }, selectLine);
  });
  element.append(line, copy);
  return {
    element,
    show(text) {
      line.value = text;
      element.hidden = false;
      selectLine();
    },
    hide() {
      element.hidden = true;
    },
    isOpen: () => !element.hidden,
  };
}
