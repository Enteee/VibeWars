import { formatNumber, t } from "../i18n/index.js";
import { h } from "./kit.js";

/**
 * Help's Trailer page (#3835): the promo cut, drawn by code like the
 * licences. Both cuts live on the v0.12.0 release, uploaded there by
 * `.github/workflows/trailer.yml` (#3922); a re-cut replaces the files, so
 * these never change.
 */
export const TRAILER_URL =
  "https://github.com/Enteee/VibeWars/releases/download/v0.12.0/vibewars-trailer-16x9.mp4";

/** The 9:16 cut, for a phone held upright: linked, not embedded. */
export const TRAILER_VERTICAL_URL =
  "https://github.com/Enteee/VibeWars/releases/download/v0.12.0/vibewars-trailer-9x16.mp4";

/** The 16:9 cut's length, `ffprobe`'s duration rounded to whole seconds. */
export const TRAILER_SECONDS = 44;

/** The 16:9 cut's size: 7,475,807 bytes, in MB to one decimal place. */
export const TRAILER_MB = 7.5;

/** A still of a fight from the 16:9 cut, shown until Play. */
const POSTER_URL = `${import.meta.env.BASE_URL}promo/trailer-poster.webp`;

/**
 * The trailer into `container`. `preload="none"`: nothing is fetched until
 * Play. When the video cannot load, offline or blocked, the player gives
 * way to a line saying so; the Download link stays.
 */
export function mountTrailer(container: HTMLElement): void {
  const panel = h("div", "trailer-section");
  const video = h("video", "trailer-video");
  video.setAttribute("controls", "");
  video.setAttribute("preload", "none");
  video.setAttribute("playsinline", "");
  video.setAttribute("poster", POSTER_URL);
  video.setAttribute("src", TRAILER_URL);
  video.addEventListener("error", () => {
    video.after(h("p", "trailer-offline", t("help.trailerOffline")));
    video.remove();
  });

  const download = h("a", "trailer-download", t("help.trailerDownload"));
  download.setAttribute("href", TRAILER_URL);
  const vertical = h("a", "trailer-vertical", t("help.trailerVertical"));
  vertical.setAttribute("href", TRAILER_VERTICAL_URL);

  panel.append(
    video,
    h(
      "p",
      "trailer-info",
      t("help.trailerInfo", { seconds: TRAILER_SECONDS, mb: formatNumber(TRAILER_MB) }),
    ),
    download,
    vertical,
  );
  container.appendChild(panel);
}
