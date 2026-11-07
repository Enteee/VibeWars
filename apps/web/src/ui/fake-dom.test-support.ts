/**
 * Just enough of the DOM to mount the builders' parts in a unit test
 * (#2226, #2565): the unit tests run in Node.
 */

type Listener = (event: FakeEvent) => void;

export interface FakeEvent {
  readonly key: string | undefined;
  readonly target: FakeElement;
  preventDefault(): void;
  stopPropagation(): void;
}

/** An element, its classes, attributes, children and listeners. */
export class FakeElement {
  className = "";
  textContent = "";
  title = "";
  src = "";
  alt = "";
  type = "";
  value = "";
  hidden = false;
  disabled = false;
  draggable = false;
  tabIndex = -1;
  parent: FakeElement | undefined;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  readonly style = {
    left: "",
    top: "",
    width: "",
    background: "",
    setProperty: (): void => undefined,
  };

  readonly classList = {
    add: (...names: string[]): void => {
      for (const name of names) {
        this.classList.toggle(name, true);
      }
    },
    toggle: (name: string, on: boolean): void => {
      const names = this.className.split(" ").filter((part) => part !== "" && part !== name);
      this.className = (on ? [...names, name] : names).join(" ");
    },
    remove: (...names: string[]): void => {
      for (const name of names) {
        this.classList.toggle(name, false);
      }
    },
    contains: (name: string): boolean => this.className.split(" ").includes(name),
  };

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  contains(other: FakeElement): boolean {
    for (let node: FakeElement | undefined = other; node !== undefined; node = node.parent) {
      if (node === this) {
        return true;
      }
    }
    return false;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(): void {
    // Nothing here is torn down.
  }

  get lastElementChild(): FakeElement | null {
    return this.children.at(-1) ?? null;
  }

  appendChild(child: FakeElement): FakeElement {
    child.remove();
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...children: (FakeElement | string)[]): void {
    for (const child of children) {
      if (typeof child === "string") {
        const text = new FakeElement();
        text.textContent = child;
        this.appendChild(text);
      } else {
        this.appendChild(child);
      }
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of [...this.children]) {
      child.remove();
    }
    this.append(...children);
  }

  insertBefore(node: FakeElement, before: FakeElement | null): void {
    node.remove();
    node.parent = this;
    const index = before === null ? -1 : this.children.indexOf(before);
    this.children.splice(index === -1 ? this.children.length : index, 0, node);
  }

  after(node: FakeElement): void {
    this.parent?.insertBefore(
      node,
      this.parent.children[this.parent.children.indexOf(this) + 1] ?? null,
    );
  }

  remove(): void {
    if (this.parent !== undefined) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = undefined;
    }
  }

  insertAdjacentHTML(): void {
    // Markup (icons, badges) is not under test.
  }

  focus(): void {
    // Focus is not under test.
  }

  getBoundingClientRect(): {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  } {
    return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  }

  /** The first element under this one with class `name`, as `querySelector(".name")`. */
  querySelector(selector: string): FakeElement | null {
    return this.all(selector.replace(/^\./, ""))[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.all(selector.replace(/^\./, ""));
  }

  /** Every element under this one with class `name`, in document order. */
  all(name: string): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(child.classList.contains(name) ? [child] : []),
      ...child.all(name),
    ]);
  }

  fire(type: string): void {
    const event: FakeEvent = {
      key: undefined,
      target: this,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  click(): void {
    this.fire("click");
  }
}
