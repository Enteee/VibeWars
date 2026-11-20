import { button } from "./kit.js";

/** The end line (#1997): a countdown to what comes next, and its one button. */
export interface EndLineElements {
  readonly root: HTMLElement;
  readonly text: HTMLElement;
  readonly press: HTMLElement;
}

/** An end line over the result banner, first in the HUD's end column `end` (#3563). */
export function mountEndLine(end: HTMLElement, onPress: () => void): EndLineElements {
  const root = document.createElement("div");
  root.className = "hud-end-line";
  const text = root.appendChild(document.createElement("span"));
  const press = root.appendChild(button("", "", onPress));
  end.prepend(root);
  return { root, text, press };
}
