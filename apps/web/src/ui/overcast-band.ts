/**
 * Overcast on an energy bar (#461): the maximum energy it took away is a
 * grey band at the bar's right end, and the label counts to the ceiling
 * that is left. One place, so the match HUD and the Training panel agree.
 */

import { h, setIfChanged } from "./kit.js";

/** The band, to put in an energy bar after its fill. */
export function overcastBandElement(): HTMLElement {
  const band = h("div", "overcast-band");
  band.hidden = true;
  return band;
}

/** The share of the whole bar the band covers, in [0, 1]. */
export function overcastShare(overcast: number, maxEnergy: number): number {
  return maxEnergy > 0 ? Math.max(0, Math.min(1, overcast / maxEnergy)) : 0;
}

/** What the band needs of its element, so a test can hand it a plain object. */
export interface OvercastBand {
  hidden: HTMLElement["hidden"];
  readonly style: { width: string };
}

export function renderOvercastBand(band: OvercastBand, overcast: number, maxEnergy: number): void {
  const share = overcastShare(overcast, maxEnergy);
  setIfChanged(band, "hidden", share === 0);
  setIfChanged(band.style, "width", `${String(share * 100)}%`);
}

/** "20 / 25": energy over the ceiling overcast leaves, which can be below 0. */
export function energyLabel(energy: number, maxEnergy: number, overcast: number): string {
  return `${String(Math.round(energy))} / ${String(Math.round(maxEnergy - overcast))}`;
}
