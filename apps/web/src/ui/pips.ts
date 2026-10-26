/**
 * Regeneration and degeneration pips (#455, #504): GW1's arrows inside a
 * health or energy bar, one per net pip, pointing right for regeneration
 * and left for degeneration, none at 0. The host sends the clamped net
 * count; this only draws it.
 */

/** The most arrows a bar shows: GW1's clamp, which the host applies too. */
const MAX_ARROWS = 10;

/** The arrows for `pips` net pips, as text: `"›››"` for +3, `"‹‹"` for −2, `""` for 0. */
export function pipArrows(pips: number): string {
  const count = Math.min(MAX_ARROWS, Math.abs(Math.trunc(pips)));
  return (pips > 0 ? "›" : "‹").repeat(count);
}

/** The element a bar's arrows go in; `renderPips` fills it. */
export function pipsElement(): HTMLElement {
  const element = document.createElement("span");
  element.className = "vital-pips";
  element.hidden = true;
  return element;
}

/** Show `pips` net pips in `element`; the DOM is touched only when they change. */
export function renderPips(element: HTMLElement, pips: number): void {
  const key = String(pips);
  if (element.dataset.pips === key) {
    return;
  }
  element.dataset.pips = key;
  element.textContent = pipArrows(pips);
  element.hidden = pips === 0;
  element.classList.toggle("is-regen", pips > 0);
  element.classList.toggle("is-degen", pips < 0);
  element.title = pips === 0 ? "" : `${pips > 0 ? "+" : "−"}${String(Math.abs(pips))} pips`;
}
