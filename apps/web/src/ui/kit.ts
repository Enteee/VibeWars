/**
 * The pieces every menu screen builds from (ADR-0030): an element, a
 * button, and a keyed list that updates in place.
 *
 * A screen mounts once and each region updates its own elements when the
 * state changes, so the library keeps its scroll, the pressed control
 * keeps focus, and a hover or a drag survives a change made elsewhere.
 */

export function h(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

/** The key each element `syncList` placed was made for. */
const listKeys = new WeakMap<Element, string>();

/**
 * Make `container`'s children one element per item of `items`, in order.
 *
 * An element whose key is still there is kept, moved only if its place
 * changed, and handed to `update`; it is never rebuilt, so its focus, hover
 * and listeners survive. A new key gets `create` and then `update`, so
 * `create` builds the structure and listeners and `update` fills in
 * everything that can change. Anything else in `container` is removed.
 */
export function syncList<T>(
  container: HTMLElement,
  items: readonly T[],
  key: (item: T) => string,
  create: (item: T) => HTMLElement,
  update: (element: HTMLElement, item: T) => void,
): void {
  const kept = new Map<string, HTMLElement>();
  for (const child of Array.from(container.children)) {
    const childKey = listKeys.get(child);
    if (childKey !== undefined && !kept.has(childKey)) {
      kept.set(childKey, child as HTMLElement);
    }
  }

  const wanted = items.map((item) => {
    const itemKey = key(item);
    let element = kept.get(itemKey);
    kept.delete(itemKey);
    if (element === undefined) {
      element = create(item);
      listKeys.set(element, itemKey);
    }
    update(element, item);
    return element;
  });

  const keep = new Set(wanted);
  for (const child of Array.from(container.children)) {
    if (!keep.has(child as HTMLElement)) {
      child.remove();
    }
  }
  wanted.forEach((element, index) => {
    const there = container.children[index];
    if (there !== element) {
      container.insertBefore(element, there ?? null);
    }
  });
}
