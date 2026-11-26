import { t } from "./i18n/index.js";

/** How much of a commit a player reads out in a bug report. */
const BUILD_CHARS = 8;

/** Help's foot (#2798): the release and the build, cut short. */
export function versionLine(release: string, build: string): string {
  return t("help.version", { release, build: build.slice(0, BUILD_CHARS) });
}
