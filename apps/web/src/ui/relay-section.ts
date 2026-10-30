import {
  encodeTurnFragment,
  forgetTurnConfig,
  loadTurnConfig,
  relayHosts,
  saveTurnConfig,
  validateTurnConfig,
  type TurnConfig,
} from "../net/transport/turn-config.js";
import { button, h, shareLine, toast } from "./kit.js";
import type { OptionsSection } from "./options-sections.js";

/**
 * The Relay (TURN) section of Options (#972): the relay the player brought,
 * entered by hand or from an invite link, and the link to pass it on. The
 * credential is a password field; the rest of the app shows only the host.
 */
export const relaySection: OptionsSection = {
  id: "relay",
  title: "relay (TURN)",
  mount: mountRelay,
};

/** What Options says of a relay; also how the lobby and queue screens name it. */
export function relayLabel(config: TurnConfig | undefined): string {
  return config === undefined ? "None" : relayHosts(config);
}

/** The link that hands `config` to a friend: this page, with it in the fragment. */
export function relayInviteLink(config: TurnConfig, where: Location = location): string {
  return `${where.origin}${where.pathname}${where.search}#${encodeTurnFragment(config)}`;
}

/** The URLs field's text as a list: commas, spaces or new lines between them. */
export function splitRelayUrls(text: string): string[] {
  return text.split(/[\s,]+/).filter((url) => url !== "");
}

function mountRelay(container: HTMLElement): () => void {
  const panel = h("div", "relay-section");
  container.appendChild(panel);
  const current = h("div", "relay-current");
  const field = (label: string, input: HTMLInputElement): HTMLElement => {
    const wrap = h("label", "field");
    wrap.append(h("span", "field-label", label), input);
    return wrap;
  };
  const input = (className: string, type: string): HTMLInputElement => {
    const element = document.createElement("input");
    element.className = className;
    element.type = type;
    element.spellcheck = false;
    element.autocomplete = "off";
    return element;
  };
  const urls = input("relay-urls", "text");
  urls.placeholder = "turn:turn.example:3478";
  const username = input("relay-username", "text");
  const credential = input("relay-credential", "password");
  const problem = h("div", "screen-problem relay-problem");
  problem.hidden = true;

  const link = shareLine("relay invite link");
  const save = button("Save relay", "primary relay-save", () => {
    const config = validateTurnConfig({
      urls: splitRelayUrls(urls.value),
      username: username.value,
      credential: credential.value,
    });
    if (config === undefined) {
      problem.textContent =
        "Not a relay: give 1 to 4 turn: or turns: URLs, a username and a credential.";
      problem.hidden = false;
      return;
    }
    saveTurnConfig(config);
    toast("Saved");
    paint();
  });
  const copy = button("Copy invite link", "relay-copy", () => {
    const config = loadTurnConfig();
    if (config !== undefined) {
      link.show(relayInviteLink(config));
    }
  });
  const forget = button("Forget relay", "relay-forget", () => {
    forgetTurnConfig();
    paint();
  });
  const actions = h("div", "menu-row relay-actions");
  actions.append(save, copy, forget);

  panel.append(
    current,
    field("URLs", urls),
    field("Username", username),
    field("Credential", credential),
    problem,
    actions,
    link.element,
  );

  const paint = (): void => {
    const config = loadTurnConfig();
    current.textContent = `Relay: ${relayLabel(config)}`;
    urls.value = config?.urls.join(", ") ?? "";
    username.value = config?.username ?? "";
    credential.value = config?.credential ?? "";
    problem.hidden = true;
    copy.disabled = config === undefined;
    forget.disabled = config === undefined;
    link.hide();
  };
  paint();
  return () => {
    link.hide();
  };
}

/**
 * "Relay: host" while a relay is saved, for the lobby and queue screens
 * (#972): a link from someone else never routes the player's traffic
 * without it showing.
 */
export function relayLine(): HTMLElement | undefined {
  const config = loadTurnConfig();
  return config === undefined
    ? undefined
    : h("div", "screen-info relay-line", `Relay: ${relayLabel(config)}`);
}
