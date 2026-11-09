import { t } from "../i18n/index.js";
import { lightingOn, setLightingOn } from "../render/lighting-preference.js";
import { h } from "./kit.js";
import type { OptionsSection } from "./options-sections.js";

/**
 * Options > Display (#2987): the arena's lighting, on or off. The scene
 * reads it every frame, so a change shows at once, mid-match too.
 */
export const displaySection: OptionsSection = {
  id: "display",
  get title() {
    return t("options.display");
  },
  mount: (container) => {
    const field = document.createElement("label");
    field.className = "sound-toggle lighting-toggle";
    const lighting = document.createElement("input");
    lighting.type = "checkbox";
    lighting.checked = lightingOn();
    lighting.addEventListener("change", () => {
      setLightingOn(lighting.checked);
    });
    field.append(lighting, h("span", undefined, t("options.lightingLabel")));
    container.appendChild(field);
    return () => {
      // Nothing to undo: the checkbox goes with the pane.
    };
  },
};
