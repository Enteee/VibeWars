import {
  encodeTurnFragment,
  forgetSharedRelay,
  forgetTurnConfig,
  loadRelaySharing,
  loadSharedRelay,
  loadTurnConfig,
  relayHosts,
  saveRelaySharing,
  saveSharedRelay,
  saveTurnConfig,
  validateSharedRelay,
  validateTurnConfig,
  type TurnConfig,
} from "../net/transport/turn-config.js";
import { button, h, shareLine, toast } from "./kit.js";
import type { OptionsSection } from "./options-sections.js";

/**
 * The Relay (TURN) section of Options (#972): the relay the player brought,
 * entered by hand or from an invite link, and the link to pass it on; and
 * the shared relay its lobbies may be offered (#2091). Credential and
 * secret are password fields; the rest of the app shows only the host.
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

function field(label: string, control: HTMLInputElement): HTMLElement {
  const wrap = h("label", "field");
  wrap.append(h("span", "field-label", label), control);
  return wrap;
}

function input(className: string, type: string): HTMLInputElement {
  const element = document.createElement("input");
  element.className = className;
  element.type = type;
  element.spellcheck = false;
  element.autocomplete = "off";
  return element;
}

function mountRelay(container: HTMLElement): () => void {
  const panel = h("div", "relay-section");
  container.appendChild(panel);
  const current = h("div", "relay-current");
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
  panel.append(sharedRelayPanel());
  return () => {
    link.hide();
  };
}

/** What Options says sharing a relay means: who gets it, for how long, and what to lock down. */
export const SHARED_RELAY_EXPLANATION =
  "A relay with a shared secret (coturn use-auth-secret) can be offered to your lobbies: " +
  "anyone with a lobby's invite link may relay through it for up to 2 hours after its last " +
  "offer, and that cannot be taken back early. Set denied-peer-ip for private ranges, " +
  "no-loopback-peers, no-multicast-peers and quotas on it. The secret stays on this device. " +
  "A relay with a username and password above is never shared; its invite link is how. " +
  "A relay on a LAN address is refused, here and in invite links.";

/**
 * The shared relay (#2091): a TURN server's REST secret, which mints the
 * short-lived credentials a hosted lobby offers, and whether to offer
 * them at all. Off until ticked.
 */
function sharedRelayPanel(): HTMLElement {
  const panel = h("div", "relay-shared");
  const current = h("div", "relay-shared-current");
  const urls = input("relay-shared-urls", "text");
  urls.placeholder = "turns:turn.example:5349";
  const secret = input("relay-shared-secret", "password");
  const problem = h("div", "screen-problem relay-shared-problem");
  problem.hidden = true;

  const shareField = document.createElement("label");
  shareField.className = "sound-toggle relay-share";
  const share = document.createElement("input");
  share.type = "checkbox";
  shareField.append(share, h("span", undefined, "Share my relay with my lobbies"));
  share.addEventListener("change", () => {
    saveRelaySharing(share.checked);
  });

  const save = button("Save shared relay", "relay-shared-save", () => {
    const shared = validateSharedRelay({ urls: splitRelayUrls(urls.value), secret: secret.value });
    if (shared === undefined) {
      problem.textContent = "Not a shared relay: give 1 to 4 turn: or turns: URLs and its secret.";
      problem.hidden = false;
      return;
    }
    saveSharedRelay(shared);
    toast("Saved");
    paint();
  });
  const forget = button("Forget shared relay", "relay-shared-forget", () => {
    forgetSharedRelay();
    saveRelaySharing(false);
    paint();
  });
  const actions = h("div", "menu-row relay-actions");
  actions.append(save, forget);

  panel.append(
    h("div", "screen-info relay-shared-explanation", SHARED_RELAY_EXPLANATION),
    current,
    field("Shared URLs", urls),
    field("Shared secret", secret),
    shareField,
    problem,
    actions,
  );

  const paint = (): void => {
    const shared = loadSharedRelay();
    current.textContent = `Shared relay: ${shared === undefined ? "None" : shared.urls.join(", ")}`;
    urls.value = shared?.urls.join(", ") ?? "";
    secret.value = shared?.secret ?? "";
    share.checked = shared !== undefined && loadRelaySharing();
    share.disabled = shared === undefined;
    forget.disabled = shared === undefined;
    problem.hidden = true;
  };
  paint();
  return panel;
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
