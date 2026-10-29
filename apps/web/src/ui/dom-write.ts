/**
 * Writes for the render loop (#1352). Each sets a value only when it
 * differs from the element's own: the browser takes even an unchanged
 * `textContent`, `hidden` or `disabled` as a change, and pays a style and
 * layout pass for it, every frame.
 */

export function setText(node: { textContent: string | null }, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

export function setHidden(element: { hidden: HTMLElement["hidden"] }, hidden: boolean): void {
  if (element.hidden !== hidden) {
    element.hidden = hidden;
  }
}

export function setDisabled(element: { disabled: boolean }, disabled: boolean): void {
  if (element.disabled !== disabled) {
    element.disabled = disabled;
  }
}

/** What `setStyle` needs of a style, so a test can hand it a plain object. */
export interface StyleWrites {
  getPropertyValue(name: string): string;
  setProperty(name: string, value: string): void;
}

/**
 * Set the inline `name`. The style reads back what the browser parsed, so
 * `value` must be as it serializes it: `percent` makes a width that is.
 */
export function setStyle(style: StyleWrites, name: string, value: string): void {
  if (style.getPropertyValue(name) !== value) {
    style.setProperty(name, value);
  }
}

/**
 * `share` of a whole, in [0, 1], as a CSS percentage to a hundredth: a
 * finer one reads back from the style rounded, so it would never match.
 */
export function percent(share: number): string {
  return `${String(Math.round(share * 10_000) / 100)}%`;
}
