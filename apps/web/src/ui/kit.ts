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

/** What a screen's bar holds, left to right. */
export interface ScreenBarOptions {
  /** The way back, on the left. */
  readonly back: { readonly label: string; readonly onBack: () => void };
  readonly title?: readonly HTMLElement[];
  readonly status?: readonly HTMLElement[];
  /** The screen's main actions, on the right. */
  readonly actions: readonly HTMLElement[];
}

/**
 * A screen's bar (#566, #555): back on the left, then the title, a status
 * in the middle and the main actions on the right, wrapping on a narrow
 * window. `back` is returned so a screen can ask before leaving.
 */
export function screenBar(options: ScreenBarOptions): {
  readonly element: HTMLElement;
  readonly back: HTMLButtonElement;
} {
  const element = h("div", "screen-bar");
  const back = button(options.back.label, "screen-bar-back", options.back.onBack);
  const part = (className: string, children: readonly HTMLElement[]): HTMLElement => {
    const node = h("div", className);
    node.append(...children);
    return node;
  };
  element.append(
    back,
    part("screen-bar-title", options.title ?? []),
    part("screen-bar-status", options.status ?? []),
    part("screen-bar-actions", options.actions),
  );
  return { element, back };
}

/** An open inline confirmation, which a screen can put away (Esc). */
export interface InlineConfirm {
  /** Until one of its buttons is pressed, or it is dismissed. */
  isOpen(): boolean;
  /** Put the question away and the anchor back, as cancel does. */
  dismiss(): void;
}

/**
 * Ask in place, never with `window.confirm()` (#566): `anchor` gives way
 * to "question, confirm, cancel" until one is pressed. Cancel has the
 * focus, so Enter on a stray press keeps what you have.
 */
export function inlineConfirm(
  anchor: HTMLElement,
  question: string,
  confirmLabel: string,
  onConfirm: () => void,
  cancelLabel = "cancel",
): InlineConfirm {
  const ask = h("span", "inline-confirm");
  ask.setAttribute("role", "group");
  let open = true;
  const dismiss = (): void => {
    if (!open) {
      return;
    }
    open = false;
    ask.remove();
    anchor.hidden = false;
  };
  const cancel = button(cancelLabel, "", () => {
    dismiss();
    anchor.focus();
  });
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
  cancel.focus();
  return { isOpen: () => open, dismiss };
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
  return problems.length > 0 ? count(problems.length, "hint") : "ready";
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
 */
export function toast(
  text: string,
  options: { readonly undo?: () => void; readonly problems?: readonly string[] } = {},
): void {
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
      button("undo", "", () => {
        dismissToast();
        undo();
      }),
    );
  }
  document.body.appendChild(element);
  shownToast = { element, timer: setTimeout(dismissToast, TOAST_SECONDS * 1000) };
}
