import {
  RELAY_IS_SAVED,
  relayHosts,
  saveTurnConfig,
  type TurnConfig,
} from "../net/transport/turn-config.js";
import { button, h, toast } from "./kit.js";

/** How long Use stays disabled after the prompt opens, as a browser's permission prompt does. */
const ARM_USE_MS = 500;

/** What a build on a shared origin (GitHub Pages) says of the relay. */
export const RELAY_VISIT_ONLY =
  "Kept for this visit only: this site shares its storage with others, so it is not saved. Open the link again next time.";

/**
 * Asked over the menu when the page was opened from a relay invite link
 * (#972): a link from someone else never routes the player's traffic until
 * they say Use. Ignore, or Esc, saves nothing. With a relay already saved
 * it names both, and replaces only on Use.
 */
export function openRelayPrompt(
  parent: HTMLElement,
  offered: TurnConfig,
  saved: TurnConfig | undefined,
): void {
  const backdrop = h("div", "relay-prompt-overlay");
  const panel = h("div", "screen relay-prompt");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Relay link");

  const question =
    saved === undefined
      ? `Use relay ${relayHosts(offered)} for connections?`
      : `Use relay ${relayHosts(offered)} for connections, instead of ${relayHosts(saved)}?`;
  panel.append(
    h("p", "relay-prompt-question", question),
    h(
      "p",
      "screen-subtitle",
      "Only use a relay from someone you trust: whoever runs it sees your IP address and when you play.",
    ),
  );
  if (!RELAY_IS_SAVED) {
    panel.append(h("p", "screen-subtitle", RELAY_VISIT_ONLY));
  }

  const close = (): void => {
    document.removeEventListener("keydown", onKey, true);
    backdrop.remove();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  };
  const use = button("Use", "primary relay-prompt-use", () => {
    saveTurnConfig(offered);
    close();
    toast(`Relay: ${relayHosts(offered)}`);
  });
  const ignore = button("Ignore", "relay-prompt-ignore", close);
  // A page that opens this link mid double-click must not land the second click on Use.
  use.disabled = true;
  window.setTimeout(() => {
    use.disabled = false;
  }, ARM_USE_MS);
  const actions = h("div", "menu-row relay-prompt-actions");
  actions.append(use, ignore);
  panel.appendChild(actions);

  backdrop.appendChild(panel);
  parent.appendChild(backdrop);
  document.addEventListener("keydown", onKey, true);
  // Enter on a link nobody read should not route traffic: focus starts on Ignore.
  ignore.focus();
}
