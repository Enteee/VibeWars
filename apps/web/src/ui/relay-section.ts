import {
  encodeTurnFragment,
  forgetRelay,
  loadRelay,
  loadRelaySharing,
  relayHosts,
  saveRelay,
  saveRelaySharing,
  validateRelay,
  type Relay,
  type SharedRelay,
} from "../net/transport/turn-config.js";
import { button, h, shareLine, toast } from "./kit.js";
import type { OptionsSection } from "./options-sections.js";

/**
 * The Relay (TURN) section of Options (#972, #2240): the one relay the
 * player keeps, from a friend's invite link or entered by hand, whether
 * their lobbies share it, and the link to pass it on. A link's secret is
 * never shown; a hand-entered credential is a password field; the rest
 * of the app shows only the host.
 */
export const relaySection: OptionsSection = {
  id: "relay",
  title: "relay (TURN)",
  mount: mountRelay,
};

/** What Options says of a relay; also how the lobby and queue screens name it. */
export function relayLabel(relay: Relay | undefined): string {
  return relay === undefined ? "None" : relayHosts(relay);
}

/** The link that hands `shared` to a friend: this page, with it in the fragment. */
export function relayInviteLink(shared: SharedRelay, where: Location = location): string {
  return `${where.origin}${where.pathname}${where.search}#${encodeTurnFragment(shared)}`;
}

/** The URLs field's text as a list: commas, spaces or new lines between them. */
export function splitRelayUrls(text: string): string[] {
  return text.split(/[\s,]+/).filter((url) => url !== "");
}

/** What Options says sharing a relay means: who gets it, for how long, and what to lock down. */
const SHARED_RELAY_EXPLANATION =
  "A relay from an invite link can be offered to your lobbies: anyone with a lobby's " +
  "invite link may relay through it for up to 4 hours after its last offer, and that " +
  "cannot be taken back early. Its operator should set denied-peer-ip for private ranges, " +
  "no-loopback-peers, no-multicast-peers and quotas on it. Its secret came from the relay " +
  "operator's link and never goes into a lobby offer. A relay with a username and " +
  "credential is never shared. A relay on a LAN address is refused, here and in invite links.";

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
  const usernameField = field("Username", username);
  const credentialField = field("Credential", credential);
  // A link relay's secret is never shown, nor edited (#2240).
  const secret = h("div", "screen-info relay-secret", "Secret: from invite link");
  const problem = h("div", "screen-problem relay-problem");
  problem.hidden = true;

  const shareField = document.createElement("label");
  shareField.className = "sound-toggle relay-share";
  const share = document.createElement("input");
  share.type = "checkbox";
  shareField.append(share, h("span", undefined, "Share my relay with my lobbies"));
  share.addEventListener("change", () => {
    saveRelaySharing(share.checked);
  });
  const shareHint = h(
    "div",
    "screen-info relay-share-hint",
    "Only a relay from an invite link can be shared",
  );

  const link = shareLine("relay invite link");
  // Hand entry is a static relay only: a REST secret comes from a link.
  const save = button("Save relay", "primary relay-save", () => {
    const relay = validateRelay({
      kind: "static",
      urls: splitRelayUrls(urls.value),
      username: username.value,
      credential: credential.value,
    });
    if (relay === undefined) {
      problem.textContent =
        "Not a relay: give 1 to 4 turn: or turns: URLs, a username and a credential.";
      problem.hidden = false;
      return;
    }
    saveRelay(relay);
    toast("Saved");
    paint();
  });
  const copy = button("Copy invite link", "relay-copy", () => {
    const relay = loadRelay();
    if (relay?.kind === "rest") {
      link.show(relayInviteLink(relay));
    }
  });
  copy.title = "Anyone with this link can use your relay.";
  const forget = button("Forget relay", "relay-forget", () => {
    forgetRelay();
    paint();
  });
  const actions = h("div", "menu-row relay-actions");
  actions.append(save, copy, forget);

  panel.append(
    h("div", "screen-info relay-shared-explanation", SHARED_RELAY_EXPLANATION),
    current,
    field("URLs", urls),
    usernameField,
    credentialField,
    secret,
    shareField,
    shareHint,
    problem,
    actions,
    link.element,
  );

  const paint = (): void => {
    const relay = loadRelay();
    const rest = relay?.kind === "rest";
    current.textContent = `Relay: ${relayLabel(relay)}`;
    urls.value = relay?.urls.join(", ") ?? "";
    // A link relay is replaced by Forget, then entering one: not edited in place.
    urls.readOnly = rest;
    username.value = relay?.kind === "static" ? relay.username : "";
    credential.value = relay?.kind === "static" ? relay.credential : "";
    usernameField.hidden = rest;
    credentialField.hidden = rest;
    secret.hidden = !rest;
    share.checked = rest && loadRelaySharing();
    share.disabled = !rest;
    shareHint.hidden = rest;
    save.disabled = rest;
    problem.hidden = true;
    copy.disabled = !rest;
    forget.disabled = relay === undefined;
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
  const relay = loadRelay();
  return relay === undefined
    ? undefined
    : h("div", "screen-info relay-line", `Relay: ${relayLabel(relay)}`);
}
