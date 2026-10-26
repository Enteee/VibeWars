import { h, screenBar } from "./kit.js";
import { OPTIONS_SECTIONS } from "./options-sections.js";

/**
 * The Options screen (#423): the sections of `OPTIONS_SECTIONS` listed on
 * the left, the selected one on the right. It opens on the first section,
 * or on the one asked for, as the jukebox's "sound settings" link does.
 * Back, or Esc, returns to the menu (the screen bar's, #578); a section
 * that wants Esc for itself, as Controls does while a key is being
 * rebound, stops it first.
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
  const panel = document.createElement("div");
  panel.className = "screen options-screen";
  root.appendChild(panel);

  panel.appendChild(
    screenBar({
      back: { label: "Back", onBack: callbacks.onBack },
      title: [h("h2", "screen-title", "Options")],
      actions: [],
    }).element,
  );

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

  disposeCurrent = () => {
    switcher.close();
  };

  if (sectionId !== undefined) {
    select(sectionId);
  }
}
