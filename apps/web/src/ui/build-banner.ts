import {
  NEW_VERSION_NOTICE,
  NEW_VERSION_WAITING,
  newVersionCountdown,
  type BuildBanner,
} from "../build-check.js";
import { button, h } from "./kit.js";

/** What the banner says for `banner`. */
export function buildBannerText(banner: BuildBanner): string {
  switch (banner.kind) {
    case "countdown":
      return newVersionCountdown(banner.seconds);
    case "waiting":
      return NEW_VERSION_WAITING;
    case "manual":
      return NEW_VERSION_NOTICE;
  }
}

export interface BuildBannerCallbacks {
  readonly onReloadNow: () => void;
  readonly onNotNow: () => void;
}

/**
 * The newer-build banner (#1268), at the top over every screen and the
 * match, until *Not now* or the reload. Not a toast: a screen change
 * leaves it up.
 */
export function mountBuildBanner(
  parent: HTMLElement,
  callbacks: BuildBannerCallbacks,
): (banner: BuildBanner | undefined) => void {
  const element = h("div", "build-banner");
  element.setAttribute("role", "status");
  element.hidden = true;
  const text = h("span", "build-banner-text");
  element.append(
    text,
    button("Reload now", "primary", callbacks.onReloadNow),
    button("Not now", "", callbacks.onNotNow),
  );
  parent.appendChild(element);
  return (banner) => {
    element.hidden = banner === undefined;
    if (banner !== undefined) {
      text.textContent = buildBannerText(banner);
    }
  };
}
