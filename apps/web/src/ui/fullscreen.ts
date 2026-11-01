import { fullscreenIcon } from "./icons.js";

/**
 * The ⛶ button (#454), in the top bar and in a match's HUD: the whole app
 * in fullscreen, or back. Not remembered: a browser wants a click for it
 * every time anyway.
 */

/** What the button shows: the window as it is now, not what a click does. */
export function fullscreenButtonState(fullscreen: boolean): {
  readonly label: string;
  readonly pressed: "true" | "false";
  readonly title: string;
  readonly icon: string;
} {
  return {
    label: "Fullscreen",
    pressed: fullscreen ? "true" : "false",
    title: fullscreen ? "Leave fullscreen" : "Fullscreen",
    icon: fullscreenIcon(fullscreen),
  };
}

/** The part of `document` the button needs. */
export interface FullscreenDocument {
  readonly fullscreenEnabled: boolean;
  readonly fullscreenElement: Element | null;
  exitFullscreen(): Promise<void>;
  addEventListener(type: "fullscreenchange", listener: () => void): void;
  removeEventListener(type: "fullscreenchange", listener: () => void): void;
}

/**
 * Make `button` toggle fullscreen on `target`. Its icon follows the
 * window, so leaving with the browser's own Esc updates it too. Hidden
 * where there is no fullscreen to have, as on an iPhone. Returns the
 * cleanup.
 */
export function attachFullscreenButton(
  button: HTMLButtonElement,
  target: HTMLElement,
  doc: FullscreenDocument = document,
): () => void {
  button.hidden = !doc.fullscreenEnabled;
  const paint = (): void => {
    const state = fullscreenButtonState(doc.fullscreenElement !== null);
    const icon = button.querySelector("img");
    if (icon !== null) {
      icon.src = state.icon;
    }
    button.setAttribute("aria-label", state.label);
    button.setAttribute("aria-pressed", state.pressed);
    button.title = state.title;
  };
  const toggle = (): void => {
    // Refused (no gesture, a frame that may not): the icon stays as it is.
    const request =
      doc.fullscreenElement === null ? target.requestFullscreen() : doc.exitFullscreen();
    request.catch((error: unknown) => {
      console.warn("[web] fullscreen refused", error);
    });
  };
  paint();
  button.addEventListener("click", toggle);
  doc.addEventListener("fullscreenchange", paint);
  return () => {
    button.removeEventListener("click", toggle);
    doc.removeEventListener("fullscreenchange", paint);
  };
}

/**
 * What goes fullscreen: the whole app, top bar or HUD and all. The whole
 * document, not `#app`: tooltips, effect tips and toasts hang off `<body>`,
 * and only the fullscreen element's subtree is drawn (#2012).
 */
export function fullscreenTarget(): HTMLElement {
  return document.documentElement;
}
