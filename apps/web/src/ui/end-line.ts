import { button } from "./kit.js";

/**
 * The line over a finished team match's result (#1997): what comes next,
 * when, its button, and the one that stops its countdown (#3847), if any.
 */
export interface EndLine {
  readonly text: string;
  readonly button: string;
  readonly onPress: () => void;
  readonly stop: { readonly button: string; readonly onPress: () => void } | undefined;
}

/**
 * The end line's setter over the HUD's end column `end` (#3563): shows
 * `line` first in it, made the first time and updated in place after
 * (ADR-0030), or removes it.
 */
export function endLineSetter(end: HTMLElement): (line: EndLine | undefined) => void {
  let elements:
    | {
        readonly root: HTMLElement;
        readonly text: HTMLElement;
        readonly press: HTMLElement;
        readonly stop: HTMLElement;
      }
    | undefined;
  let shown: EndLine | undefined;
  return (line) => {
    shown = line;
    if (line === undefined) {
      elements?.root.remove();
      elements = undefined;
      return;
    }
    elements ??= mount(
      end,
      () => {
        shown?.onPress();
      },
      () => {
        shown?.stop?.onPress();
      },
    );
    elements.text.textContent = line.text;
    elements.press.textContent = line.button;
    elements.stop.hidden = line.stop === undefined;
    elements.stop.textContent = line.stop?.button ?? "";
  };
}

/** The line's elements, first in `end`: its text, its button, and Stop. */
function mount(
  end: HTMLElement,
  onPress: () => void,
  onStop: () => void,
): { root: HTMLElement; text: HTMLElement; press: HTMLElement; stop: HTMLElement } {
  const root = document.createElement("div");
  root.className = "hud-end-line";
  const text = root.appendChild(document.createElement("span"));
  const press = root.appendChild(button("", "", onPress));
  const stop = root.appendChild(button("", "", onStop));
  end.prepend(root);
  return { root, text, press, stop };
}
