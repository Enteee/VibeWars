import type { WireCape } from "@vibewars/game-protocol";

import { t } from "../i18n/index.js";
import { button, h, toast } from "./kit.js";
import { capePreview, playerGuildTag, saveGuildCape, saveGuildTag } from "./player-section.js";

/** How long Join stays disabled after the prompt opens, as the relay link's Use does. */
const ARM_JOIN_MS = 500;

/** The open prompt's close, so a second link replaces it rather than stacking on it. */
let closeOpen: (() => void) | undefined;

/**
 * Asked over the menu when the page was opened from a guild link (#3167).
 * Anyone can send one, so it never applies silently: Join writes the tag
 * and cape where Options keeps them, No or Esc changes nothing. With
 * another tag already set it names both. `onClose` runs once it is gone,
 * either way, so a lobby link opened with it waits its turn.
 */
export function openGuildLinkPrompt(
  parent: HTMLElement,
  tag: string,
  cape: WireCape | null,
  onClose: () => void = () => undefined,
): void {
  closeOpen?.();
  const backdrop = h("div", "relay-prompt-overlay");
  const panel = h("div", "screen relay-prompt guild-link-prompt");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", t("player.guildLink"));

  const old = playerGuildTag();
  const question =
    old === null || old === tag
      ? t("guildLink.question", { tag })
      : t("guildLink.questionReplace", { old, tag });
  const ask = h("p", "relay-prompt-question guild-link-question", question);
  if (cape !== null) {
    ask.prepend(capePreview(cape));
  }
  panel.append(ask, h("p", "screen-subtitle", t("guildLink.trust")));

  const close = (): void => {
    document.removeEventListener("keydown", onKey, true);
    backdrop.remove();
    if (closeOpen === close) {
      closeOpen = undefined;
    }
    onClose();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  };
  const join = button(t("guildLink.join"), "primary guild-link-join", () => {
    saveGuildTag(tag);
    saveGuildCape(cape);
    close();
    toast(cape === null ? t("guildLink.joinedNoCape", { tag }) : t("guildLink.joined", { tag }));
  });
  const decline = button(t("guildLink.decline"), "guild-link-decline", close);
  // A page that opens this link mid double-click must not land the second click on Join.
  join.disabled = true;
  window.setTimeout(() => {
    join.disabled = false;
  }, ARM_JOIN_MS);
  const actions = h("div", "menu-row overlay-actions relay-prompt-actions");
  actions.append(join, decline);
  panel.appendChild(actions);

  backdrop.appendChild(panel);
  parent.appendChild(backdrop);
  closeOpen = close;
  document.addEventListener("keydown", onKey, true);
  // Enter on a link nobody read should change nothing: focus starts on No.
  decline.focus();
}
