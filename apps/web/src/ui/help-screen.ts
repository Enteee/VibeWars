import { versionLine } from "../build-info.js";
import { t } from "../i18n/index.js";
import { SOURCE_URL } from "../source.js";
import { h, overlayClose } from "./kit.js";
import { mountLicences } from "./licences-section.js";
import { helpDocPages, playerDocTargets, renderPlayerDoc, type DocNode } from "./player-docs.js";
import { attachTopbarPopover, closeTopbarPopover } from "./topbar-popover.js";
import { mountTrailer } from "./trailer-section.js";

/**
 * Help (#1257): the player docs of `docs/player/`, as a window that drops
 * from the top bar's [?] or the HUD's (#3552), like Options. A second
 * press on [?], Esc, a click outside or its × puts it away, and the screen
 * or match under it goes on as it was: a match is never paused. A page
 * picker on top chooses the page; a link to another page switches page in
 * place.
 *
 * After the docs, the trailer (#3835) and the third-party licences (#2559)
 * have pages of their own, drawn by code rather than from markdown.
 */

/** The trailer page, first after the docs: not a doc page either. */
const TRAILER_PAGE = {
  id: "trailer",
  get title() {
    return t("help.trailer");
  },
};

/** The licences page, after the docs: not a doc page, so not in `helpDocPages()`. */
const LICENCES_PAGE = {
  id: "licences",
  get title() {
    return t("help.licences");
  },
};

/** The [?]s that open Help, the latest attached last: `openHelp` uses it. */
const openers: ((pageId?: string) => void)[] = [];

/** The page the next opening shows; the first page when none. */
let nextPage: string | undefined;

/** Whether Help is open, page-wide. */
let helpOpen = false;

/**
 * Help as a window from `trigger`, the top bar's or the HUD's [?]. It
 * hangs just under the button, over the tutorial's dim (#3552): Help is
 * the latest thing the player opened. `onClose` hears every way it closes.
 */
export function attachHelpWindow(
  trigger: HTMLButtonElement,
  onClose?: () => void,
): { dispose(): void } {
  const popover = attachTopbarPopover(trigger, document.body, (close) => {
    const help = helpPanel(close, nextPage);
    nextPage = undefined;
    help.panel.style.setProperty(
      "--help-top",
      `${String(trigger.getBoundingClientRect().bottom)}px`,
    );
    helpOpen = true;
    return {
      element: help.panel,
      focus: help.picker,
      dispose() {
        helpOpen = false;
        onClose?.();
      },
    };
  });
  const open = (pageId?: string): void => {
    // Open on another page: shut first, so the window is built anew on it.
    closeTopbarPopover();
    nextPage = pageId;
    popover.open();
  };
  openers.push(open);
  return {
    dispose() {
      openers.splice(openers.indexOf(open), 1);
      popover.dispose();
    },
  };
}

/** Open Help on `pageId`, or the first page, from the [?] attached last. */
export function openHelp(pageId?: string): void {
  openers.at(-1)?.(pageId);
}

/** Whether Help is open, for whoever routes keys around it. */
export function isHelpOpen(): boolean {
  return helpOpen;
}

/** The window: its ×, the page picker, the page, then the source and version. */
function helpPanel(
  close: () => void,
  pageId: string | undefined,
): { readonly panel: HTMLElement; readonly picker: HTMLSelectElement } {
  const panel = h("div", "screen help-screen help-window");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", t("help.label"));
  // A press inside keeps the focus, and so Esc, in the window.
  panel.tabIndex = -1;
  panel.appendChild(overlayClose(close));

  const picker = document.createElement("select");
  picker.className = "help-picker";
  picker.setAttribute("aria-label", t("help.pages"));
  const pages = helpDocPages();
  for (const page of [...pages, TRAILER_PAGE, LICENCES_PAGE]) {
    const option = document.createElement("option");
    option.value = page.id;
    option.textContent = page.title;
    picker.appendChild(option);
  }
  const pane = h("article", "help-page");
  const footer = h("div", "help-footer");
  // The AGPL's network clause: whoever plays it is offered the source (#1442).
  const source = h("a", "help-source", t("help.source"));
  source.setAttribute("href", SOURCE_URL);
  // A new tab, so reading the source never leaves the game.
  source.setAttribute("target", "_blank");
  source.setAttribute("rel", "noopener");
  // Selectable, for a bug report (#2798).
  footer.append(
    source,
    h("p", "help-version", versionLine(__VIBEWARS_RELEASE__, __VIBEWARS_BUILD__)),
  );
  panel.append(picker, pane, footer);

  const targets = playerDocTargets();
  const show = (id: string, anchor?: string): void => {
    if (id === TRAILER_PAGE.id) {
      pane.dataset.page = TRAILER_PAGE.id;
      pane.replaceChildren();
      mountTrailer(pane);
    } else if (id === LICENCES_PAGE.id) {
      pane.dataset.page = LICENCES_PAGE.id;
      pane.replaceChildren();
      mountLicences(pane);
    } else {
      const page = pages.find((candidate) => candidate.id === id);
      if (page === undefined) {
        return;
      }
      pane.dataset.page = page.id;
      pane.replaceChildren(...renderPlayerDoc(page.markdown, targets).map(toDom));
    }
    picker.value = id;
    pane.scrollTop = 0;
    // A link to a section opens at its heading (#3812). Looked up in the
    // pane: an id is not unique across the app.
    if (anchor !== undefined) {
      const section = [...pane.querySelectorAll("[id]")].find((node) => node.id === anchor);
      section?.scrollIntoView({ block: "start" });
    }
  };
  picker.addEventListener("change", () => {
    show(picker.value);
  });
  // A link to another page stays in the window.
  pane.addEventListener("click", (event) => {
    const target = event.target;
    const link = target instanceof Element ? target.closest<HTMLElement>("a[data-page]") : null;
    if (link?.dataset.page !== undefined) {
      event.preventDefault();
      show(link.dataset.page, link.dataset.anchor);
    }
  });

  show(pageId ?? pages[0]?.id ?? "");
  return { panel, picker };
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
