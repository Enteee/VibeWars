import { h, screenBar, type ScreenBarBack } from "./kit.js";
import { OPTIONS_SECTIONS } from "./options-sections.js";

/**
 * The Options screen (#423): the sections of `OPTIONS_SECTIONS` listed on
 * the left, the selected one on the right. It opens on the first section,
 * or on the one asked for, as the jukebox's "sound settings" link does.
 * Back, or Esc, returns to the menu (the screen bar's, #578); a section
 * that wants Esc for itself, as Controls does while a key is being
 * rebound, stops it first.
 *
 * The same sections open as an overlay too (#454), from the top bar or a
 * match's HUD: there Close, or Esc, closes it instead of going back.
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

export interface OptionsScreenCallbacks {
  readonly onBack: () => void;
}

/** Torn down by `disposeOptionsScreen`, which every way back to the menu calls. */
let disposeCurrent: (() => void) | undefined;

export function disposeOptionsScreen(): void {
  disposeCurrent?.();
  disposeCurrent = undefined;
}

export function renderOptionsScreen(
  root: HTMLElement,
  callbacks: OptionsScreenCallbacks,
  sectionId = OPTIONS_SECTIONS[0]?.id,
): void {
  disposeOptionsScreen();

  root.replaceChildren();
  const options = optionsPanel({ label: "Back", onBack: callbacks.onBack }, false, sectionId);
  options.panel.classList.add("screen", "options-screen");
  root.appendChild(options.panel);
  disposeCurrent = options.dispose;
}

/** The open overlay, closed by `closeOptionsOverlay`. */
let overlay: { readonly element: HTMLElement; readonly dispose: () => void } | undefined;

/**
 * Options above whatever runs under it (#454), from the top bar or the
 * HUD's ⚙: the same sections as the screen, in a panel over `parent`.
 * Close, or Esc, closes it and leaves what is under it exactly as it was;
 * a match goes on underneath. `onClose` hears every way it closes.
 */
export function openOptionsOverlay(parent: HTMLElement, onClose?: () => void): void {
  closeOptionsOverlay();
  const backdrop = h("div", "options-overlay");
  const options = optionsPanel({ label: "Close", onBack: closeOptionsOverlay }, true);
  options.panel.classList.add("screen", "options-screen");
  options.panel.setAttribute("role", "dialog");
  options.panel.setAttribute("aria-modal", "true");
  options.panel.setAttribute("aria-label", "Options");
  backdrop.appendChild(options.panel);
  parent.appendChild(backdrop);
  overlay = {
    element: backdrop,
    dispose: () => {
      options.dispose();
      onClose?.();
    },
  };
  options.panel.querySelector<HTMLElement>(".options-entry.is-selected")?.focus();
}

/** Whether the Options overlay is open, for whoever routes keys around it. */
export function isOptionsOverlayOpen(): boolean {
  return overlay !== undefined;
}

export function closeOptionsOverlay(): void {
  const closing = overlay;
  if (closing === undefined) {
    return;
  }
  overlay = undefined;
  closing.element.remove();
  closing.dispose();
}

/** The Options frame and its sections; the screen and the overlay differ only around it. */
function optionsPanel(
  back: ScreenBarBack,
  asOverlay: boolean,
  sectionId = OPTIONS_SECTIONS[0]?.id,
): { readonly panel: HTMLElement; readonly dispose: () => void } {
  const panel = document.createElement("div");

  const { release } = screenBar({
    crumbs: ["VibeWars", "Options"],
    back,
    actions: [],
    overlay: asOverlay,
    own: "options",
  });

  const body = document.createElement("div");
  body.className = "options-body";
  const nav = document.createElement("nav");
  nav.className = "options-nav";
  nav.setAttribute("aria-label", "options sections");
  const pane = document.createElement("section");
  pane.className = "options-pane";
  body.append(nav, pane);
  panel.appendChild(body);

  const switcher = new SectionSwitcher<HTMLElement>(pane, (container) => {
    container.replaceChildren();
  });
  const entries = OPTIONS_SECTIONS.map((section) => {
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
    const section = OPTIONS_SECTIONS.find((candidate) => candidate.id === id);
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

  if (sectionId !== undefined) {
    select(sectionId);
  }
  return {
    panel,
    dispose: () => {
      switcher.close();
      release();
    },
  };
}
