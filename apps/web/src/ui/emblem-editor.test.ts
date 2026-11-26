import {
  EMBLEM_GRID,
  MAX_EMBLEM_COLOURS,
  packEmblem,
  unpackEmblem,
  type WireCape,
} from "@vibewars/game-protocol";
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
  type EmblemPick,
} from "./emblem-editor.js";

const at = (row: number, column: number): number => row * EMBLEM_GRID + column;
const WHITE = 1;
const GOLD = 2;

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
  readonly scale = (): void => undefined;
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
  value = "";
  src = "";
  alt = "";
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
  readonly toDataURL = (): string => "data:,";
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

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0);
    this.append(...children);
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

describe("the emblem editor (#3555, #3628)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const cape: WireCape = {
    main: "a078e0",
    trim: "f2f2f2",
    emblemColours: ["f2f2f2"],
    emblem: packEmblem(presetEmblem("diamond")),
  };

  function open(from: WireCape = cape) {
    const changes: EmblemPick[] = [];
    const editor = emblemEditor(from, (emblem) => changes.push(emblem));
    const root = editor.root as unknown as FakeElement;
    const find = (test: (node: FakeElement) => boolean): FakeElement => {
      const found = root.all().find(test);
      if (found === undefined) {
        throw new Error("no such element");
      }
      return found;
    };
    const board = find((node) => node.className === "emblem-editor-grid");
    const preview = find((node) => node.tagName === "canvas");
    const recolour = find((node) => node.className === "emblem-editor-recolour");
    const byText = (text: string): FakeElement => find((node) => node.textContent === text);
    const swatch = (pixel: number): FakeElement | undefined =>
      root.all().find((node) => node.dataset.pixel === String(pixel));
    const swatchCount = (): number =>
      root.all().filter((node) => Number(node.dataset.pixel ?? 0) > 0).length;
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
    /** The emblem last applied, its pixels and colours. */
    const applied = (): { grid: EmblemGrid; colours: readonly string[] } => {
      const last = changes.at(-1);
      const grid = last === undefined ? undefined : unpackEmblem(last.emblem, MAX_EMBLEM_COLOURS);
      if (last === undefined || grid === undefined) {
        throw new Error("nothing applied");
      }
      return { grid, colours: last.emblemColours };
    };
    /** Pick `hex` in the colour input, as a player drags it and lets go. */
    const pickColour = (hex: string): void => {
      recolour.value = hex;
      recolour.fire("input", {});
      recolour.fire("change", {});
    };
    return {
      editor,
      board,
      preview,
      byText,
      swatch,
      swatchCount,
      stroke,
      applied,
      changes,
      pickColour,
    };
  }

  it("opens on the emblem's own colours, Empty first, and applies nothing until a change", () => {
    const { swatch, swatchCount, changes } = open();
    expect(swatch(1)?.attributes.get("aria-pressed")).toBe("true");
    expect(swatch(1)?.styles.get("--swatch")).toBe("#f2f2f2");
    expect(swatch(0)?.attributes.get("aria-label")).toBe("Empty");
    expect(swatchCount()).toBe(1);
    expect(changes).toEqual([]);
  });

  it("applies a stroke as it ends, in the picked colour, mirrored, with no Done", () => {
    const { byText, stroke, applied, changes } = open();
    byText("Clear").click();
    expect(changes).toHaveLength(1);
    byText("Mirror").click();
    stroke([0, 0], [0, 1], [1, 1]);
    expect(changes).toHaveLength(2);
    const { grid, colours } = applied();
    for (const index of [at(0, 0), at(0, 1), at(1, 1), at(0, 15), at(0, 14), at(1, 14)]) {
      expect(grid[index]).toBe(1);
    }
    expect(grid.filter((pixel) => pixel !== 0)).toHaveLength(6);
    expect(colours).toEqual(["f2f2f2"]);
  });

  it("adds colours up to 15, and a colour no pixel uses is not applied", () => {
    const { byText, swatchCount, stroke, applied } = open();
    const add = byText("Add colour");
    for (let colour = 1; colour < MAX_EMBLEM_COLOURS; colour += 1) {
      expect(add.disabled).toBe(false);
      add.click();
    }
    expect(swatchCount()).toBe(MAX_EMBLEM_COLOURS);
    expect(add.disabled).toBe(true);
    stroke([0, 0]);
    // Each new colour copies the picked one: the stroke is in the 15th, the
    // diamond in the 1st, and the 13 between, unused, are dropped.
    expect(applied().colours).toEqual(["f2f2f2", "f2f2f2"]);
    expect(applied().grid[at(0, 0)]).toBe(1);
  });

  it("recolours the picked swatch and every pixel drawn in it, as one undo step", () => {
    const { byText, pickColour, applied, swatch } = open();
    pickColour("#E6C04A");
    expect(swatch(1)?.styles.get("--swatch")).toBe("#e6c04a");
    expect(applied().colours).toEqual(["e6c04a"]);
    expect(applied().grid).toEqual(presetEmblem("diamond"));
    byText("Undo").click();
    expect(applied().colours).toEqual(["f2f2f2"]);
  });

  it("draws a second colour beside the first", () => {
    const { byText, pickColour, stroke, applied } = open();
    byText("Add colour").click();
    pickColour("#23272e");
    stroke([0, 0]);
    const { grid, colours } = applied();
    expect(colours).toEqual(["23272e", "f2f2f2"]);
    expect(grid[at(0, 0)]).toBe(1);
    expect(grid[at(1, 7)]).toBe(2);
  });

  it("starts from a preset in the drawing colour, and Undo puts the grid back", () => {
    const { byText, stroke, applied, editor } = open();
    byText("Clear").click();
    stroke([0, 0]);
    const drawn = applied().grid;
    const ring = (editor.root as unknown as FakeElement)
      .all()
      .find((node) => node.dataset.emblem === "ring");
    ring?.click();
    expect(applied().grid).toEqual(presetEmblem("ring"));
    byText("Undo").click();
    expect(applied().grid).toEqual(drawn);
  });

  it("starts from a preset in the trim with Empty picked", () => {
    const { swatch, applied, editor, pickColour } = open();
    pickColour("#e6c04a");
    swatch(0)?.click();
    (editor.root as unknown as FakeElement)
      .all()
      .find((node) => node.dataset.emblem === "bar")
      ?.click();
    expect(applied()).toEqual({ grid: presetEmblem("bar"), colours: ["f2f2f2"] });
  });

  it("undoes a whole stroke as one step, and at most UNDO_LIMIT steps", () => {
    const { byText, stroke, applied } = open();
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
    expect(applied().grid.filter((pixel) => pixel !== 0)).toHaveLength(6);
  });

  it("adds no step for a fill on a pixel already in the picked index", () => {
    const { byText, stroke, applied } = open();
    byText("Clear").click();
    byText("Fill").click();
    stroke([3, 3]);
    stroke([5, 5]);
    expect(applied().grid.every((pixel) => pixel === 1)).toBe(true);
    byText("Undo").click();
    expect(applied().grid.every((pixel) => pixel === 0)).toBe(true);
  });

  it("redraws the game-size preview on every change, and on a new cloth", () => {
    const { preview, stroke, byText, editor } = open();
    const before = preview.context.clears;
    stroke([0, 0]);
    expect(preview.context.clears).toBeGreaterThan(before);
    const after = preview.context.clears;
    byText("Clear").click();
    expect(preview.context.clears).toBeGreaterThan(after);
    const cleared = preview.context.clears;
    editor.show({ ...cape, main: "23272e" });
    expect(preview.context.clears).toBeGreaterThan(cleared);
  });

  it("shows another cape's emblem, and keeps its own when shown what it applied", () => {
    const { stroke, byText, applied, editor, changes } = open();
    byText("Clear").click();
    stroke([0, 0]);
    const mine = changes.at(-1);
    if (mine === undefined) throw new Error("nothing applied");
    editor.show({ ...cape, ...mine, main: "23272e" });
    expect(byText("Undo").disabled).toBe(false);
    editor.show({ ...cape, emblem: packEmblem(presetEmblem("ring")) });
    expect(byText("Undo").disabled).toBe(true);
    stroke([15, 15]);
    expect(applied().grid[at(4, 4)]).toBe(presetEmblem("ring")[at(4, 4)]);
  });

  it("paints from the keyboard: arrows move the cursor, Space paints, letters pick tools", () => {
    const { board, byText, applied } = open();
    byText("Clear").click();
    const press = (key: string, extra: { ctrlKey?: boolean } = {}): void => {
      board.fire("keydown", { key, ...extra });
    };
    // The cursor starts at row 8, column 8.
    press("ArrowUp");
    press("ArrowLeft");
    press(" ");
    expect(applied().grid[at(7, 7)]).toBe(1);
    press("m");
    expect(byText("Mirror").attributes.get("aria-pressed")).toBe("true");
    press("ArrowDown");
    press(" ");
    expect(applied().grid[at(8, 8)]).toBe(1);
    press("e");
    expect(byText("Eraser").attributes.get("aria-pressed")).toBe("true");
    press(" ");
    expect(applied().grid[at(8, 7)]).toBe(0);
    press("z", { ctrlKey: true });
    expect(applied().grid[at(8, 7)]).toBe(1);
    press("f");
    press("p");
    expect(byText("Pencil").attributes.get("aria-pressed")).toBe("true");
  });
});
