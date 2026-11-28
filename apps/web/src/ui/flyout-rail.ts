import { t } from "../i18n/index.js";
import { h } from "./kit.js";

/**
 * A flyout's sub-pages as a left rail beside the page (#4216, Q209): the
 * one way Help and Options, and any flyout that gains pages later, move
 * between them. ↑ ↓ Home End move along the rail, Enter or a click opens.
 *
 * Narrow (the `52rem` breakpoint, as the stylesheet's), the rail is a
 * list and opening an entry drills into its page, whose bar has a back
 * arrow and the page's title. Back, or Esc, returns to the list on the
 * entry that was open; a second Esc closes the flyout.
 */

/** The width the stylesheet turns the rail into a list at. */
const NARROW = "(width <= 52rem)";

export interface FlyoutRailEntry {
  readonly id: string;
  readonly title: string;
}

export interface FlyoutRail {
  /** The rail and the page, for the flyout to place. */
  readonly element: HTMLElement;
  /** Show `id`'s page and mark its entry; an unknown id changes nothing. */
  readonly select: (id: string) => void;
  /** Where focus goes as the flyout opens: the open page's title when drilled in narrow, else its entry. */
  readonly focusTarget: () => HTMLElement;
}

export function mountFlyoutRail({
  label,
  entries,
  pane,
  show,
  initial,
  drilled = false,
}: {
  /** The rail's `aria-label`. */
  readonly label: string;
  readonly entries: readonly FlyoutRailEntry[];
  /** The page's element, which `show` draws into. */
  readonly pane: HTMLElement;
  readonly show: (id: string, pane: HTMLElement) => void;
  /** The page it opens on; the first when absent or unknown. */
  readonly initial?: string | undefined;
  /** Opens narrow on the page rather than on the list: a link to a page. */
  readonly drilled?: boolean | undefined;
}): FlyoutRail {
  const element = h("div", "flyout-rail");
  const nav = document.createElement("nav");
  nav.className = "flyout-rail-nav";
  nav.setAttribute("aria-label", label);
  const main = h("div", "flyout-rail-main");
  const bar = h("div", "flyout-rail-back");
  const back = document.createElement("button");
  back.className = "flyout-rail-back-button";
  back.textContent = "‹";
  back.type = "button";
  back.setAttribute("aria-label", t("flyout.back"));
  const title = h("h2", "flyout-rail-title");
  title.tabIndex = -1;
  bar.append(back, title);
  main.append(bar, pane);
  element.append(nav, main);

  let current: string | undefined;
  const buttons = entries.map((entry) => {
    const button = document.createElement("button");
    button.className = "flyout-rail-entry";
    button.textContent = entry.title;
    button.type = "button";
    button.dataset.id = entry.id;
    button.addEventListener("click", () => {
      select(entry.id);
      element.classList.add("is-drilled");
      if (narrow()) {
        title.focus();
      }
    });
    nav.appendChild(button);
    return button;
  });

  const select = (id: string): void => {
    const entry = entries.find((candidate) => candidate.id === id);
    if (entry === undefined) {
      return;
    }
    current = id;
    show(id, pane);
    title.textContent = entry.title;
    for (const button of buttons) {
      if (button.dataset.id === id) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    }
  };
  const entryOf = (id: string | undefined): HTMLButtonElement | undefined =>
    buttons.find((button) => button.dataset.id === id);
  const toList = (): void => {
    element.classList.remove("is-drilled");
    entryOf(current)?.focus();
  };

  back.addEventListener("click", toList);
  nav.addEventListener("keydown", (event) => {
    const at = buttons.findIndex((button) => button === document.activeElement);
    const to =
      event.key === "ArrowDown"
        ? Math.min(at + 1, buttons.length - 1)
        : event.key === "ArrowUp"
          ? Math.max(at - 1, 0)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : undefined;
    if (to !== undefined && at !== -1) {
      event.preventDefault();
      buttons[to]?.focus();
    }
  });
  // Esc on a drilled-in page is the rail's: back to the list, the flyout stays.
  element.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && element.classList.contains("is-drilled") && narrow()) {
      event.preventDefault();
      event.stopPropagation();
      toList();
    }
  });

  select(entries.some((entry) => entry.id === initial) ? (initial ?? "") : (entries[0]?.id ?? ""));
  element.classList.toggle("is-drilled", drilled);
  return {
    element,
    select,
    focusTarget: () =>
      element.classList.contains("is-drilled") && narrow()
        ? title
        : (entryOf(current) ?? buttons[0] ?? element),
  };
}

function narrow(): boolean {
  return matchMedia(NARROW).matches;
}
