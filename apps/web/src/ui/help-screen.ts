import { h, screenBar } from "./kit.js";
import {
  PLAYER_DOC_PAGES,
  playerDocTargets,
  renderPlayerDoc,
  type DocNode,
} from "./player-docs.js";

/**
 * The Help screen (#1257): the player docs of `docs/player/`, the page
 * list on the left, the page on the right. It opens over whatever runs
 * under it, from the top bar's [?] or the HUD's, as Options does (#454):
 * Close, or Esc, puts it away and leaves the screen or match beneath
 * exactly as it was. A link to another page switches page in place.
 *
 * The top bar says where you are, `VibeWars > Help > <Page>` (#1272).
 */

/** The open overlay, closed by `closeHelpOverlay`. */
let overlay:
  | {
      readonly element: HTMLElement;
      readonly onClose: (() => void) | undefined;
      readonly release: () => void;
    }
  | undefined;

/** Help over `parent`, on `pageId` or the first page. `onClose` hears every way it closes. */
export function openHelpOverlay(parent: HTMLElement, onClose?: () => void, pageId?: string): void {
  closeHelpOverlay();
  const backdrop = h("div", "options-overlay help-overlay");
  const panel = h("div", "screen help-screen");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Help");

  const crumb = h("span");
  const { release } = screenBar({
    crumbs: ["VibeWars", "Help", crumb],
    back: { label: "Close", onBack: closeHelpOverlay },
    actions: [],
    overlay: true,
    own: "help",
  });

  const body = h("div", "options-body");
  const nav = h("nav", "options-nav");
  nav.setAttribute("aria-label", "help pages");
  const pane = h("article", "help-page");
  body.append(nav, pane);
  panel.appendChild(body);

  const targets = playerDocTargets();
  const entries = PLAYER_DOC_PAGES.map((page) => {
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "options-entry";
    entry.dataset.page = page.id;
    entry.textContent = page.title;
    entry.addEventListener("click", () => {
      show(page.id);
    });
    nav.appendChild(entry);
    return entry;
  });
  const show = (id: string): void => {
    const page = PLAYER_DOC_PAGES.find((candidate) => candidate.id === id);
    if (page === undefined) {
      return;
    }
    crumb.textContent = page.title;
    pane.dataset.page = page.id;
    pane.replaceChildren(...renderPlayerDoc(page.markdown, targets).map(toDom));
    backdrop.scrollTop = 0;
    for (const entry of entries) {
      const selected = entry.dataset.page === id;
      entry.classList.toggle("is-selected", selected);
      if (selected) {
        entry.setAttribute("aria-current", "page");
      } else {
        entry.removeAttribute("aria-current");
      }
    }
  };
  // A link to another page stays in the screen.
  pane.addEventListener("click", (event) => {
    const target = event.target;
    const link = target instanceof Element ? target.closest<HTMLElement>("a[data-page]") : null;
    if (link?.dataset.page !== undefined) {
      event.preventDefault();
      show(link.dataset.page);
    }
  });

  show(pageId ?? PLAYER_DOC_PAGES[0]?.id ?? "");
  backdrop.appendChild(panel);
  parent.appendChild(backdrop);
  overlay = { element: backdrop, onClose, release };
  panel.querySelector<HTMLElement>(".options-entry.is-selected")?.focus();
}

/** Whether Help is open, for whoever routes keys around it. */
export function isHelpOverlayOpen(): boolean {
  return overlay !== undefined;
}

export function closeHelpOverlay(): void {
  const closing = overlay;
  if (closing === undefined) {
    return;
  }
  overlay = undefined;
  closing.element.remove();
  closing.release();
  closing.onClose?.();
}

/** A sanitised node as DOM: only `DocTag`s, attributes set one by one, text as text. */
function toDom(node: DocNode): Node {
  if (node.kind === "text") {
    return document.createTextNode(node.text);
  }
  const element = document.createElement(node.tag);
  for (const [name, value] of Object.entries(node.attrs)) {
    element.setAttribute(name, value);
  }
  element.append(...node.children.map(toDom));
  return element;
}
