import { t } from "../i18n/index.js";
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
import { MAX_RELAYED_PER_HOLDER } from "../net/transport/relay-offer.js";
import { button, h, shareLine, toast } from "./kit.js";
import { signedNamesLine, type KeyedPlayer } from "./player-label.js";
import type { OptionsSection } from "./options-sections.js";
import { onRelayStatus, relayStatus } from "./relay-status.js";

/**
 * The Relay (TURN) section of Options (#972, #2240): the one relay the
 * player keeps, from a friend's invite link or entered by hand, whether
 * their lobbies share it, and the link to pass it on. A link's secret is
 * never shown; a hand-entered credential is a password field. Whose
 * relay carries this page, and how many it carries, show here too (#2981).
 */
export const relaySection: OptionsSection = {
  id: "relay",
  get title() {
    return t("options.relay");
  },
  mount: mountRelay,
};

/** What Options says of a relay. */
export function relayLabel(relay: Relay | undefined): string {
  return relay === undefined ? t("relay.none") : relayHosts(relay);
}

/** The link that hands `shared` to a friend: this page, with it in the fragment. */
export function relayInviteLink(shared: SharedRelay, where: Location = location): string {
  return `${where.origin}${where.pathname}${where.search}#${encodeTurnFragment(shared)}`;
}

/** The URLs field's text as a list: commas, spaces or new lines between them. */
export function splitRelayUrls(text: string): string[] {
  return text.split(/[\s,]+/).filter((url) => url !== "");
}

/** What Options says sharing a relay means: who gets it, for how long, and what to lock down (#2531). */
export function sharedRelayExplanation(): string {
  return t("relay.sharedExplanation", { max: MAX_RELAYED_PER_HOLDER });
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
  const sharedBy = h("div", "relay-shared-by-holder");
  const sharing = h("div", "screen-info relay-sharing");
  const urls = input("relay-urls", "text");
  urls.placeholder = t("relay.urlsPlaceholder");
  const username = input("relay-username", "text");
  const credential = input("relay-credential", "password");
  const usernameField = field(t("relay.username"), username);
  const credentialField = field(t("relay.credential"), credential);
  // A link relay's secret is never shown, nor edited (#2240).
  const secret = h("div", "screen-info relay-secret", t("relay.secret"));
  const problem = h("div", "screen-problem relay-problem");
  problem.hidden = true;

  const shareField = document.createElement("label");
  shareField.className = "sound-toggle relay-share";
  const share = document.createElement("input");
  share.type = "checkbox";
  shareField.append(share, h("span", undefined, t("relay.share")));
  share.addEventListener("change", () => {
    saveRelaySharing(share.checked);
  });
  const shareHint = h("div", "screen-info relay-share-hint", t("relay.shareHint"));

  const link = shareLine(t("relay.inviteLink"));
  // Hand entry is a static relay only: a REST secret comes from a link.
  const save = button(t("relay.save"), "primary relay-save", () => {
    const relay = validateRelay({
      kind: "static",
      urls: splitRelayUrls(urls.value),
      username: username.value,
      credential: credential.value,
    });
    if (relay === undefined) {
      problem.textContent = t("relay.notARelay");
      problem.hidden = false;
      return;
    }
    saveRelay(relay);
    toast(t("relay.saved"));
    paint();
  });
  const copy = button(t("relay.copyLink"), "relay-copy", () => {
    const relay = loadRelay();
    if (relay?.kind === "rest") {
      link.show(relayInviteLink(relay));
    }
  });
  copy.title = t("relay.copyLinkTitle");
  const forget = button(t("relay.forget"), "relay-forget", () => {
    forgetRelay();
    paint();
  });
  const actions = h("div", "menu-row relay-actions");
  actions.append(save, copy, forget);

  panel.append(
    h("div", "screen-info relay-shared-explanation", sharedRelayExplanation()),
    current,
    sharedBy,
    sharing,
    field(t("relay.urls"), urls),
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
    current.textContent = t("relay.current", { relay: relayLabel(relay) });
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
  // The lobby's part alone: the fields keep what is being typed in them.
  const paintStatus = (): void => {
    const status = relayStatus();
    sharedBy.replaceChildren(
      ...(status.sharedBy === undefined ? [] : [relaySharedByLine(status.sharedBy)]),
    );
    sharedBy.hidden = status.sharedBy === undefined;
    sharing.textContent = status.sharingWith > 0 ? relaySharingText(status.sharingWith) : "";
    sharing.hidden = status.sharingWith === 0;
  };
  paint();
  paintStatus();
  const offStatus = onRelayStatus(paintStatus);
  return () => {
    offStatus();
    link.hide();
  };
}

/**
 * "Relay shared by name" for a member whose host connection goes through
 * another member's relay (#2531). `name` is a lobby name: text, never HTML.
 */
export function relaySharedByLine(holder: KeyedPlayer): HTMLElement {
  return signedNamesLine("screen-info relay-shared-by", "relay.sharedBy", "name", [holder]);
}

/** What Options says while this page's lobby shares its relay with `count` players (#2531). */
export function relaySharingText(count: number): string {
  return count >= MAX_RELAYED_PER_HOLDER
    ? t("relay.sharingFull", { count })
    : t("relay.sharing", { count });
}
