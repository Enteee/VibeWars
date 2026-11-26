import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatNumber, t } from "../i18n/index.js";
import { FakeElement } from "./fake-dom.test-support.js";
import {
  TRAILER_MB,
  TRAILER_SECONDS,
  TRAILER_URL,
  TRAILER_VERTICAL_URL,
  mountTrailer,
} from "./trailer-section.js";

/** The trailer page, freshly drawn into a fake page. */
function trailer(): FakeElement {
  const container = new FakeElement();
  mountTrailer(container as unknown as HTMLElement);
  return container;
}

describe("mountTrailer (#3835)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads nothing until Play: no preload, no autoplay, the 16:9 cut", () => {
    const video = trailer().querySelector(".trailer-video");
    expect(video?.getAttribute("preload")).toBe("none");
    expect(video?.hasAttribute("autoplay")).toBe(false);
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(video?.hasAttribute("playsinline")).toBe(true);
    expect(video?.getAttribute("src")).toBe(TRAILER_URL);
  });

  it("downloads the same file, says its length and size, and links the phone cut", () => {
    const page = trailer();
    expect(page.querySelector(".trailer-download")?.getAttribute("href")).toBe(TRAILER_URL);
    expect(page.querySelector(".trailer-info")?.textContent).toBe(
      t("help.trailerInfo", { seconds: TRAILER_SECONDS, mb: formatNumber(TRAILER_MB) }),
    );
    expect(page.querySelector(".trailer-vertical")?.getAttribute("href")).toBe(
      TRAILER_VERTICAL_URL,
    );
  });

  it("gives way to the offline line when the video cannot load; Download stays", () => {
    const page = trailer();
    page.querySelector(".trailer-video")?.fire("error");
    expect(page.querySelector(".trailer-video")).toBeNull();
    expect(page.querySelector(".trailer-offline")?.textContent).toBe(t("help.trailerOffline"));
    expect(page.querySelector(".trailer-download")?.getAttribute("href")).toBe(TRAILER_URL);
  });
});
