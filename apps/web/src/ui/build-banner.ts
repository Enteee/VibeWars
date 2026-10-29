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

/** The CSS variable the top of the screen and the HUD move down by (#1283). */
export const BUILD_BANNER_SPACE = "--build-banner-space";

/**
 * Writes the room the banner takes, its bottom edge in px or `undefined`
 * when hidden, through `set`, and only when it changed: the countdown
 * rewrites the text every second, and the layout must not jitter.
 */
export function bannerSpaceWriter(
  set: (value: string) => void,
): (bottom: number | undefined) => void {
  let last: string | undefined;
  return (bottom) => {
    const value = `${String(bottom === undefined ? 0 : Math.ceil(bottom))}px`;
    if (value !== last) {
      last = value;
      set(value);
    }
  };
}

export interface BuildBannerCallbacks {
  readonly onReloadNow: () => void;
  readonly onNotNow: () => void;
}

/**
 * The newer-build banner (#1268), at the top over every screen and the
 * match, until *Not now* or the reload. Not a toast: a screen change
 * leaves it up. While up, it keeps `BUILD_BANNER_SPACE` at its bottom
 * edge, so what sits at the top makes room rather than hiding under it.
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
  const writeSpace = bannerSpaceWriter((value) => {
    document.documentElement.style.setProperty(BUILD_BANNER_SPACE, value);
  });
  const measure = (): void => {
    writeSpace(element.hidden ? undefined : element.getBoundingClientRect().bottom);
  };
  // A wrap or a longer line changes its height; the observer catches both.
  new ResizeObserver(measure).observe(element);
  return (banner) => {
    element.hidden = banner === undefined;
    if (banner !== undefined) {
      text.textContent = buildBannerText(banner);
    }
    measure();
  };
}
