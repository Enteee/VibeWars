import { t } from "../i18n/index.js";
import { availableLanguages } from "../i18n/languages.js";
import { overlayClose } from "./kit.js";
import { optionsSections } from "./options-sections.js";
import { attachTopbarPopover } from "./topbar-popover.js";

/**
 * Options (#423, #454): the sections of `optionsSections` listed on the
 * left, the selected one on the right, opening on the first, as a window
 * from the top bar or a match's HUD (#2386). Its ×, or Esc, closes it
 * (#2381); a section that wants Esc for itself, as
 * Controls does while a key is being rebound, stops it first.
 */

/** A section, as far as switching between them goes. */
export interface Mountable<C> {
  readonly id: string;
  readonly mount: (container: C) => () => void;
}

/**
 * Keeps exactly one section mounted in `container`: the old one is cleaned
 * up before the next is drawn. Plain data, so it is tested without a DOM.
 */
export class SectionSwitcher<C> {
  readonly #container: C;
  readonly #clear: (container: C) => void;
  #current: { readonly id: string; readonly cleanup: () => void } | undefined;

  constructor(container: C, clear: (container: C) => void) {
    this.#container = container;
    this.#clear = clear;
  }

  /** The id of the mounted section, if any. */
  get current(): string | undefined {
    return this.#current?.id;
  }

  show(section: Mountable<C>): void {
    if (this.#current?.id === section.id) {
      return;
    }
    this.close();
    this.#current = { id: section.id, cleanup: section.mount(this.#container) };
  }

  close(): void {
    if (this.#current === undefined) {
      return;
    }
    this.#current.cleanup();
    this.#current = undefined;
    this.#clear(this.#container);
  }
}

/** Whether the Options window is open, page-wide. */
let windowOpen = false;

/**
 * Options as a window from `trigger`, the top bar's or the HUD's ⚙
 * (#454, #2386), in `parent`: a top-bar popover (#2385), so it shuts
 * the Lobby's and the music's, and the screen or match under it goes on.
 * Its ×, Esc or a click outside closes it, except while Controls waits for
 * a key: Esc then cancels only that wait. `onClose` hears every way it closes.
 * `signet` is the player key's, for the Player section (#3235).
 */
export function attachOptionsWindow(
  trigger: HTMLButtonElement,
  parent: HTMLElement,
  signet: number,
  onClose?: () => void,
): { dispose(): void } {
  return attachTopbarPopover(trigger, parent, (close) => {
    const options = optionsPanel(close, signet);
    options.panel.classList.add("screen", "options-screen", "options-window");
    options.panel.setAttribute("aria-label", t("options.label"));
    // A press inside keeps the focus, and so Esc, in the window.
    options.panel.tabIndex = -1;
    windowOpen = true;
    return {
      element: options.panel,
      focus:
        options.panel.querySelector<HTMLElement>(".options-entry.is-selected") ?? options.panel,
      // A click outside leaves a key-rebind that still waits open (#2386).
      holdsOpen: () => options.panel.querySelector(".key-cell.is-capturing") !== null,
      dispose() {
        windowOpen = false;
        options.dispose();
        onClose?.();
      },
    };
  });
}

/** Whether the Options window is open, for whoever routes keys around it. */
export function isOptionsWindowOpen(): boolean {
  return windowOpen;
}

/** The Options frame and its sections. */
function optionsPanel(
  close: () => void,
  signet: number,
): {
  readonly panel: HTMLElement;
  readonly dispose: () => void;
} {
  const panel = document.createElement("div");
  panel.appendChild(overlayClose(close));

  const body = document.createElement("div");
  body.className = "options-body";
  const nav = document.createElement("nav");
  nav.className = "options-nav";
  nav.setAttribute("aria-label", t("options.sections"));
  const pane = document.createElement("section");
  pane.className = "options-pane";
  body.append(nav, pane);
  panel.appendChild(body);

  const sections = optionsSections(availableLanguages(), signet);
  const switcher = new SectionSwitcher<HTMLElement>(pane, (container) => {
    container.replaceChildren();
  });
  const entries = sections.map((section) => {
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "options-entry";
    entry.dataset.section = section.id;
    entry.textContent = section.title;
    entry.addEventListener("click", () => {
      select(section.id);
    });
    nav.appendChild(entry);
    return entry;
  });
  const select = (id: string): void => {
    const section = sections.find((candidate) => candidate.id === id);
    if (section === undefined) {
      return;
    }
    pane.dataset.section = section.id;
    switcher.show(section);
    for (const entry of entries) {
      const selected = entry.dataset.section === id;
      entry.classList.toggle("is-selected", selected);
      if (selected) {
        entry.setAttribute("aria-current", "true");
      } else {
        entry.removeAttribute("aria-current");
      }
    }
  };

  const [first] = sections;
  if (first !== undefined) {
    select(first.id);
  }
  return {
    panel,
    dispose: () => {
      switcher.close();
    },
  };
}
