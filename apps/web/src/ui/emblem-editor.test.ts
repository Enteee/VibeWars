import { CAPE_COLOURS, EMBLEM_GRID, unpackEmblem, type WireCape } from "@vibewars/game-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { presetEmblem } from "../render/cape-shape.js";
import {
  UNDO_LIMIT,
  emblemEditor,
  emptyGrid,
  fill,
  mirrorOf,
  paint,
  pushStep,
  useTool,
  type EmblemGrid,
} from "./emblem-editor.js";

const at = (row: number, column: number): number => row * EMBLEM_GRID + column;
const WHITE = CAPE_COLOURS.indexOf("white") + 1;
const GOLD = CAPE_COLOURS.indexOf("gold") + 1;

describe("the emblem editor's model (#3555)", () => {
  it("paints one pixel, and with the eraser paints it empty", () => {
    const painted = paint(emptyGrid(), 2, 3, GOLD, false);
    expect(painted[at(2, 3)]).toBe(GOLD);
    expect(painted.filter((pixel) => pixel !== 0)).toHaveLength(1);
    const erased = useTool(painted, "eraser", 2, 3, GOLD, false);
    expect(erased).toEqual(emptyGrid());
  });

  it("returns the grid itself when a paint changes nothing", () => {
    const painted = paint(emptyGrid(), 0, 0, GOLD, false);
    expect(paint(painted, 0, 0, GOLD, false)).toBe(painted);
  });

  it("mirrors column c onto 15 - c, the middle columns 7 and 8 onto each other", () => {
    expect(mirrorOf(0)).toBe(15);
    expect(mirrorOf(15)).toBe(0);
    expect(mirrorOf(7)).toBe(8);
    expect(mirrorOf(8)).toBe(7);
    const painted = paint(emptyGrid(), 4, 7, GOLD, true);
    expect(painted[at(4, 7)]).toBe(GOLD);
    expect(painted[at(4, 8)]).toBe(GOLD);
    expect(paint(emptyGrid(), 1, 2, GOLD, true)[at(1, 13)]).toBe(GOLD);
  });

  it("fills an enclosed region and nothing outside it", () => {
    let grid: EmblemGrid = emptyGrid();
    // A 4x4 white ring at rows and columns 2..5: its inside is 3..4.
    for (let index = 2; index <= 5; index += 1) {
      grid = paint(grid, 2, index, WHITE, false);
      grid = paint(grid, 5, index, WHITE, false);
      grid = paint(grid, index, 2, WHITE, false);
      grid = paint(grid, index, 5, WHITE, false);
    }
    const filled = fill(grid, 3, 3, GOLD);
    expect([at(3, 3), at(3, 4), at(4, 3), at(4, 4)].map((index) => filled[index])).toEqual([
      GOLD,
      GOLD,
      GOLD,
      GOLD,
    ]);
    expect(filled.filter((pixel) => pixel === GOLD)).toHaveLength(4);
    expect(filled[at(0, 0)]).toBe(0);
  });

  it("fills the whole grid, and a fill on the picked index is a no-op", () => {
    const whole = fill(emptyGrid(), 9, 9, GOLD);
    expect(whole.every((pixel) => pixel === GOLD)).toBe(true);
    expect(fill(whole, 0, 0, GOLD)).toBe(whole);
  });

  it("keeps at most the last UNDO_LIMIT steps", () => {
    let steps: EmblemGrid[] = [];
    for (let step = 0; step < UNDO_LIMIT + 5; step += 1) {
      steps = pushStep(steps, paint(emptyGrid(), 0, 0, (step % 8) + 1, false));
    }
    expect(steps).toHaveLength(UNDO_LIMIT);
  });
});

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  readonly key?: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly button?: number;
  readonly pointerId?: number;
  readonly clientX?: number;
  readonly clientY?: number;
  target?: FakeElement;
  readonly preventDefault: () => void;
  readonly stopPropagation: () => void;
}

/** A canvas context that counts its redraws. */
class FakeContext {
  fillStyle = "";
  clears = 0;
  readonly setTransform = (): void => undefined;
  readonly clearRect = (): void => {
    this.clears += 1;
  };
  readonly fillRect = (): void => undefined;
  readonly beginPath = (): void => undefined;
  readonly moveTo = (): void => undefined;
  readonly lineTo = (): void => undefined;
  readonly closePath = (): void => undefined;
  readonly fill = (): void => undefined;
}

/** Just enough DOM for the editor; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  title = "";
  type = "";
  tabIndex = -1;
  disabled = false;
  hidden = false;
  width = 0;
  height = 0;
  readonly dataset: Record<string, string> = {};
  readonly styles = new Map<string, string>();
  readonly style = {
    setProperty: (name: string, value: string): void => {
      this.styles.set(name, value);
    },
    removeProperty: (name: string): void => {
      this.styles.delete(name);
    },
  };
  readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string): void => {
      this.classes.add(name);
    },
    toggle: (name: string, on: boolean): void => {
      if (on) {
        this.classes.add(name);
      } else {
        this.classes.delete(name);
      }
    },
  };
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener>();
  readonly context = new FakeContext();
  parent: FakeElement | undefined;

  readonly tagName: string;

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  readonly addEventListener = (type: string, listener: Listener): void => {
    this.listeners.set(type, listener);
  };

  readonly getContext = (): FakeContext => this.context;
  readonly getBoundingClientRect = () => ({ left: 0, top: 0, width: 256, height: 256 });
  readonly setPointerCapture = (): void => undefined;
  readonly focus = (): void => undefined;

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  remove(): void {
    // Detached by the designer; nothing to do here.
  }

  all(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }

  /** Dispatch `type` here and up through the parents, as a bubbling event. */
  fire(type: string, init: Omit<FakeEvent, "preventDefault" | "stopPropagation" | "target">): void {
    const event: FakeEvent = {
      ...init,
      target: this,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    };
    this.listeners.get(type)?.(event);
    for (let node = this.parent; node !== undefined; node = node.parent) {
      node.listeners.get(type)?.(event);
    }
  }

  click(): void {
    this.fire("click", {});
  }
}

describe("the emblem editor (#3555)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const cape: WireCape = {
    main: "violet",
    trim: "white",
    emblem: presetEmblem("diamond", "white"),
  };

  function open(from: WireCape = cape) {
    const closed: (string | null)[] = [];
    const root = emblemEditor(from, (emblem) => closed.push(emblem)) as unknown as FakeElement;
    const shown = root.all();
    const board = shown.find((node) => node.className === "emblem-editor-grid");
    const preview = shown.find((node) => node.tagName === "canvas");
    if (board === undefined || preview === undefined) {
      throw new Error("no grid or preview");
    }
    const byText = (text: string): FakeElement => {
      const found = shown.find((node) => node.textContent === text);
      if (found === undefined) {
        throw new Error(`no ${text}`);
      }
      return found;
    };
    const swatch = (pixel: number): FakeElement | undefined =>
      shown.find((node) => node.dataset.pixel === String(pixel));
    /** One stroke through `cells`, pointer down on the first to up on the last. */
    const stroke = (...cells: [number, number][]): void => {
      cells.forEach(([row, column], index) => {
        board.fire(index === 0 ? "pointerdown" : "pointermove", {
          button: 0,
          pointerId: 1,
          clientX: column * 16 + 8,
          clientY: row * 16 + 8,
        });
      });
      board.fire("pointerup", { pointerId: 1 });
    };
    const done = (): EmblemGrid => {
      byText("Done").click();
      const last = closed.at(-1);
      const grid = last === null || last === undefined ? undefined : unpackEmblem(last);
      if (grid === undefined) {
        throw new Error("Done gave no emblem");
      }
      return grid;
    };
    return { root, board, preview, byText, swatch, stroke, done, closed };
  }

  it("picks the trim first, and Done gives the grid it opened with", () => {
    const { swatch, done } = open();
    expect(swatch(WHITE)?.attributes.get("aria-pressed")).toBe("true");
    expect(swatch(0)?.attributes.get("aria-label")).toBe("Empty");
    expect(swatch(GOLD)?.attributes.get("aria-label")).toBe("gold");
    expect(done()).toEqual(unpackEmblem(cape.emblem));
  });

  it("paints a stroke in the picked colour, mirrored, and Done keeps it", () => {
    const { swatch, byText, stroke, done } = open({
      ...cape,
      emblem: presetEmblem("disc", "white"),
    });
    byText("Clear").click();
    swatch(GOLD)?.click();
    byText("Mirror").click();
    stroke([0, 0], [0, 1], [1, 1]);
    const grid = done();
    for (const index of [at(0, 0), at(0, 1), at(1, 1), at(0, 15), at(0, 14), at(1, 14)]) {
      expect(grid[index]).toBe(GOLD);
    }
    expect(grid.filter((pixel) => pixel !== 0)).toHaveLength(6);
  });

  it("Cancel gives nothing, so the cape stays as it was", () => {
    const { byText, stroke, closed } = open();
    stroke([0, 0]);
    byText("Cancel").click();
    expect(closed).toEqual([null]);
  });

  it("undoes a whole stroke as one step, and at most UNDO_LIMIT steps", () => {
    const { byText, stroke, done } = open();
    byText("Clear").click();
    for (let step = 0; step < UNDO_LIMIT + 3; step += 1) {
      const row = step % EMBLEM_GRID;
      const column = Math.floor(step / EMBLEM_GRID) * 2;
      stroke([row, column], [row, column + 1]);
    }
    const undo = byText("Undo");
    for (let step = 0; step < UNDO_LIMIT; step += 1) {
      expect(undo.disabled).toBe(false);
      undo.click();
    }
    expect(undo.disabled).toBe(true);
    // The three oldest strokes, and the Clear before them, are past the limit.
    const grid = done();
    expect(grid.filter((pixel) => pixel !== 0)).toHaveLength(6);
  });

  it("adds no step for a fill on a pixel already in the picked index", () => {
    const { byText, stroke, done } = open();
    byText("Clear").click();
    byText("Fill").click();
    stroke([3, 3]);
    stroke([5, 5]);
    expect(done().every((pixel) => pixel === WHITE)).toBe(true);
    byText("Undo").click();
    expect(done().every((pixel) => pixel === 0)).toBe(true);
  });

  it("redraws the game-size preview on every change", () => {
    const { preview, stroke, byText } = open();
    const before = preview.context.clears;
    stroke([0, 0]);
    expect(preview.context.clears).toBeGreaterThan(before);
    const after = preview.context.clears;
    byText("Clear").click();
    expect(preview.context.clears).toBeGreaterThan(after);
  });

  it("paints from the keyboard: arrows move the cursor, Space paints, letters pick tools", () => {
    const { board, byText, done } = open();
    byText("Clear").click();
    const press = (key: string, extra: { ctrlKey?: boolean } = {}): void => {
      board.fire("keydown", { key, ...extra });
    };
    // The cursor starts at row 8, column 8.
    press("ArrowUp");
    press("ArrowLeft");
    press(" ");
    expect(done()[at(7, 7)]).toBe(WHITE);
    press("m");
    expect(byText("Mirror").attributes.get("aria-pressed")).toBe("true");
    press("ArrowDown");
    press(" ");
    expect(done()[at(8, 8)]).toBe(WHITE);
    press("e");
    expect(byText("Eraser").attributes.get("aria-pressed")).toBe("true");
    press(" ");
    expect(done()[at(8, 7)]).toBe(0);
    press("z", { ctrlKey: true });
    expect(done()[at(8, 7)]).toBe(WHITE);
    press("f");
    press("p");
    expect(byText("Pencil").attributes.get("aria-pressed")).toBe("true");
  });
});
