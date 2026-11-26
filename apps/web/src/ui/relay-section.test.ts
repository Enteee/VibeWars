import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_RELAYED_PER_HOLDER } from "../net/transport/relay-offer.js";
import { FakeElement } from "./fake-dom.test-support.js";
import { relaySection } from "./relay-section.js";
import { setRelayStatus } from "./relay-status.js";

/** `element`'s text and all its children's, as `textContent` reads it. */
const text = (element: FakeElement): string =>
  element.textContent + element.children.map(text).join("");

const ANN = { name: "Ann", playerPubkey: null };

describe("Options > Relay: the lobby's relay status (#2981)", () => {
  const stored = new Map<string, string>();
  beforeEach(() => {
    stored.clear();
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
  });
  afterEach(() => {
    setRelayStatus({ sharedBy: undefined, sharingWith: 0 });
    vi.unstubAllGlobals();
  });

  const mount = (): { container: FakeElement; unmount: () => void } => {
    const container = new FakeElement();
    const unmount = relaySection.mount(container as unknown as HTMLElement);
    return { container, unmount };
  };
  /** The one element of class `name` under `container`, its text, or `undefined` while hidden. */
  const line = (container: FakeElement, name: string): string | undefined => {
    const [element] = container.all(name);
    if (element === undefined) {
      throw new Error(`no ${name}`);
    }
    return element.hidden ? undefined : text(element);
  };

  it("names whose relay carries this page, and how many this page's relay carries", () => {
    const { container } = mount();
    expect(line(container, "relay-shared-by-holder")).toBeUndefined();
    expect(line(container, "relay-sharing")).toBeUndefined();
    setRelayStatus({ sharedBy: ANN, sharingWith: 3 });
    expect(line(container, "relay-shared-by-holder")).toBe("Relay shared by Ann");
    expect(line(container, "relay-sharing")).toBe("Sharing your relay with 3 players");
    setRelayStatus({ sharedBy: undefined, sharingWith: MAX_RELAYED_PER_HOLDER });
    expect(line(container, "relay-shared-by-holder")).toBeUndefined();
    expect(line(container, "relay-sharing")).toBe(
      "Sharing your relay with 8 players (limit reached)",
    );
    setRelayStatus({ sharedBy: undefined, sharingWith: 0 });
    expect(line(container, "relay-sharing")).toBeUndefined();
  });

  it("shows what it was opened with", () => {
    setRelayStatus({ sharedBy: ANN, sharingWith: 1 });
    const { container } = mount();
    expect(line(container, "relay-shared-by-holder")).toBe("Relay shared by Ann");
    expect(line(container, "relay-sharing")).toBe("Sharing your relay with 1 player");
  });

  it("leaves what is being typed alone", () => {
    const { container } = mount();
    const [urls] = container.all("relay-urls");
    if (urls === undefined) {
      throw new Error("no relay-urls");
    }
    urls.value = "turn:half-typed";
    setRelayStatus({ sharedBy: ANN, sharingWith: 2 });
    expect(urls.value).toBe("turn:half-typed");
  });

  it("stops following the status once unmounted", () => {
    const { container, unmount } = mount();
    unmount();
    setRelayStatus({ sharedBy: ANN, sharingWith: 2 });
    expect(line(container, "relay-sharing")).toBeUndefined();
  });
});
