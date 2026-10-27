import type { StatusSnapshot } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STATUS_CATEGORY_NAME,
  createEffectsMonitor,
  effectRows,
  type EffectRow,
} from "./effects-monitor.js";

/**
 * The effects monitor (#834): its rows, and the icons it draws them as.
 * The unit tests run in Node, so the DOM here is a small fake; the hover
 * and real layout are the e2e suite's (e2e/effects-monitor.spec.ts).
 */

const ME = "me";
const NAMES = new Map([
  [ME, "Ann"],
  ["bob", "Bob"],
]);

function status(
  id: StatusSnapshot["id"],
  endsAt: number | null,
  durationSeconds: number | null,
  casterId = "bob",
): StatusSnapshot {
  return { id, endsAt, durationSeconds, casterId };
}

describe("effectRows (#834)", () => {
  it("keeps the order the host sent, oldest first", () => {
    const rows = effectRows(
      [status("bleeding", 20, 10), status("armor-boost", 15, 10), status("crippled", 30, 10)],
      ME,
      NAMES,
      10,
    );
    expect(rows.map((row) => row.id)).toEqual(["bleeding", "armor-boost", "crippled"]);
  });

  it("drains the bar from full to empty, and never below it", () => {
    const at = (now: number) =>
      effectRows([status("bleeding", 20, 10)], ME, NAMES, now)[0]?.fraction;
    expect(at(10)).toBe(1);
    expect(at(15)).toBe(0.5);
    expect(at(20)).toBe(0);
    expect(at(25)).toBe(0);
    // A late snapshot may put the clock before the start: still full.
    expect(at(8)).toBe(1);
  });

  it("gives a status with no duration no bar", () => {
    expect(effectRows([status("armor-boost", 0, 0)], ME, NAMES, 10)[0]?.fraction).toBeUndefined();
  });

  it("gives a maintained enchantment no bar and no seconds left (#837)", () => {
    const [row] = effectRows([status("mending", null, null)], ME, NAMES, 10);
    expect(row?.fraction).toBeUndefined();
    expect(row?.secondsLeft).toBeUndefined();
  });

  it("counts whole seconds left, rounded up, never below 0", () => {
    const left = (now: number) =>
      effectRows([status("bleeding", 20, 10)], ME, NAMES, now)[0]?.secondsLeft;
    expect(left(10)).toBe(10);
    expect(left(10.1)).toBe(10);
    expect(left(19.9)).toBe(1);
    expect(left(21)).toBe(0);
  });

  it("marks yours only an enchantment you cast", () => {
    const rows = effectRows(
      [
        status("armor-boost", 20, 10, ME),
        status("armor-boost", 20, 10, "bob"),
        status("faintheartedness", 20, 10, ME),
      ],
      ME,
      NAMES,
      10,
    );
    expect(rows.map((row) => row.yours)).toEqual([true, false, false]);
  });

  it("names the caster: you, their name, or someone who has left", () => {
    const rows = effectRows(
      [
        status("armor-boost", 20, 10, ME),
        status("bleeding", 20, 10),
        status("poison", 20, 10, "gone"),
      ],
      ME,
      NAMES,
      10,
    );
    expect(rows.map((row) => row.casterName)).toEqual(["you", "Bob", "someone"]);
  });

  it("carries each status's name and category, and an empty list is no rows", () => {
    const [row] = effectRows([status("deep-wound", 20, 10)], ME, NAMES, 10);
    expect(row?.name).toBe("Deep Wound");
    expect(row !== undefined && STATUS_CATEGORY_NAME[row.category]).toBe("Condition");
    expect(effectRows([], ME, NAMES, 10)).toEqual([]);
  });
});

/**
 * Just enough of an element for the monitor, without jsdom: children in
 * order, the moves made, and the fill widths written.
 */
class FakeElement {
  className = "";
  hidden = false;
  tabIndex = -1;
  src = "";
  alt = "";
  width = 0;
  height = 0;
  draggable = true;
  parent: FakeElement | undefined;
  readonly children: FakeElement[] = [];
  readonly classes = new Set<string>();
  readonly classList = {
    toggle: (name: string, on: boolean): void => {
      if (on) {
        this.classes.add(name);
      } else {
        this.classes.delete(name);
      }
    },
  };
  /** Every `style.width` written, in order. */
  readonly widths: string[] = [];
  readonly style = ((widths: string[]) => ({
    setProperty: (): void => undefined,
    set width(value: string) {
      widths.push(value);
    },
  }))(this.widths);
  moves = 0;

  readonly setAttribute = (): void => undefined;

  readonly addEventListener = (): void => undefined;

  appendChild(child: FakeElement): FakeElement {
    this.insertBefore(child, null);
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  insertBefore(child: FakeElement, before: FakeElement | null): void {
    this.moves += 1;
    child.remove();
    const index = before === null ? -1 : this.children.indexOf(before);
    this.children.splice(index === -1 ? this.children.length : index, 0, child);
    child.parent = this;
  }

  remove(): void {
    if (this.parent !== undefined) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = undefined;
    }
  }
}

function row(id: EffectRow["id"], fraction: number | undefined, yours = false): EffectRow {
  return {
    id,
    name: id,
    category: "condition",
    fraction,
    secondsLeft: 5,
    yours,
    casterName: "Bob",
  };
}

describe("createEffectsMonitor (#834)", () => {
  let parent: FakeElement;

  beforeEach(() => {
    parent = new FakeElement();
    vi.stubGlobal("document", { createElement: () => new FakeElement(), body: new FakeElement() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mount = (size = 24) => {
    const monitor = createEffectsMonitor(parent as unknown as HTMLElement, size, "your effects");
    const root = monitor.root as unknown as FakeElement;
    const icons = () => root.children.map((item) => item.children[0]?.alt);
    const fill = (index: number) => root.children[index]?.children[1]?.children[0];
    const bar = (index: number) => root.children[index]?.children[1];
    return { monitor, root, icons, fill, bar };
  };

  it("draws nothing, and takes no room, for no effects", () => {
    const { monitor, root } = mount();
    expect(root.hidden).toBe(true);
    monitor.update([row("bleeding", 1)]);
    expect(root.hidden).toBe(false);
    monitor.update([]);
    expect(root.hidden).toBe(true);
    expect(root.children).toEqual([]);
  });

  it("moves a refreshed status to the end, reusing its very icon", () => {
    const { monitor, root, icons } = mount();
    monitor.update([row("bleeding", 1), row("crippled", 1), row("poison", 1)]);
    const [bleeding, crippled, poison] = root.children;
    expect(icons()).toEqual(["bleeding", "crippled", "poison"]);

    root.moves = 0;
    monitor.update([row("bleeding", 0.9), row("crippled", 0.9), row("poison", 0.9)]);
    expect(root.moves).toBe(0);

    monitor.update([row("crippled", 0.8), row("poison", 0.8), row("bleeding", 1)]);
    expect(icons()).toEqual(["crippled", "poison", "bleeding"]);
    expect(root.children).toEqual([crippled, poison, bleeding]);
  });

  it("drops a status's icon the snapshot it is gone", () => {
    const { monitor, root, icons } = mount();
    monitor.update([row("bleeding", 1), row("crippled", 1)]);
    const crippled = root.children[1];
    monitor.update([row("crippled", 0.5)]);
    expect(icons()).toEqual(["crippled"]);
    expect(root.children[0]).toBe(crippled);
  });

  it("sets the bar in whole pixels, only when a pixel changes, and hides it with no duration", () => {
    const { monitor, fill, bar } = mount();
    monitor.update([row("bleeding", 0.5), row("armor-boost", undefined)]);
    expect(fill(0)?.widths).toEqual(["12px"]);
    expect(bar(0)?.hidden).toBe(false);
    expect(bar(1)?.hidden).toBe(true);

    monitor.update([row("bleeding", 0.49), row("armor-boost", undefined)]);
    expect(fill(0)?.widths).toEqual(["12px"]);
    monitor.update([row("bleeding", 0.25), row("armor-boost", undefined)]);
    expect(fill(0)?.widths).toEqual(["12px", "6px"]);
  });

  it("ticks only the icons marked yours", () => {
    const { monitor, root } = mount();
    monitor.update([row("armor-boost", 1, true), row("bleeding", 1)]);
    expect(root.children.map((item) => item.classes.has("is-yours"))).toEqual([true, false]);
    monitor.update([row("armor-boost", 1, false), row("bleeding", 1)]);
    expect(root.children[0]?.classes.has("is-yours")).toBe(false);
  });

  it("draws the target frame's icons and bars at its own size (#835)", () => {
    const { monitor, root, fill } = mount(16);
    monitor.update([row("bleeding", 0.5), row("crippled", 1)]);
    const images = root.children.map((item) => item.children[0]);
    expect(images.map((image) => [image?.alt, image?.width, image?.height])).toEqual([
      ["bleeding", 16, 16],
      ["crippled", 16, 16],
    ]);
    expect(fill(0)?.widths).toEqual(["8px"]);
  });
});
