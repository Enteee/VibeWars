import {
  CAPE_COLOURS,
  EMBLEM_GRID,
  packEmblem,
  unpackEmblem,
  type WireCape,
} from "@vibewars/game-protocol";

import { t, type MessageKey } from "../i18n/index.js";
import { paintEmblem } from "../render/body-painter.js";
import { CAPE_PALETTE, emblemShape, type CapeColour } from "../render/cape-shape.js";
import { canvasPainter } from "./character-figure.js";
import { cssColour } from "./character-preview.js";
import { button, h } from "./kit.js";

/**
 * The emblem editor (#3555): the cape designer's 16×16 pixel grid, drawn
 * by hand. The model is pure functions on `number[]` grids, row-major,
 * each pixel 0 for empty or `i` for `CAPE_COLOURS[i - 1]`, as
 * `packEmblem` packs them; the DOM editor round them is `emblemEditor`.
 */
export type EmblemGrid = readonly number[];

/** The tools: Pencil paints the picked index, Eraser paints empty, Fill floods. */
export type EmblemTool = "pencil" | "eraser" | "fill";

/** How many steps Undo goes back. */
export const UNDO_LIMIT = 20;

/** Each cape colour's name, for its swatch's label (#1422). */
export const COLOUR_NAMES: Readonly<Record<CapeColour, MessageKey>> = {
  gold: "player.colourGold",
  violet: "player.colourViolet",
  white: "player.colourWhite",
  black: "player.colourBlack",
  lime: "player.colourLime",
  orange: "player.colourOrange",
  teal: "player.colourTeal",
  pink: "player.colourPink",
};

/** The column a mirrored stroke also paints: 0 and 15, …, 7 and 8. */
export function mirrorOf(column: number): number {
  return EMBLEM_GRID - 1 - column;
}

/**
 * `grid` with the pixel at `row`, `column` set to `pixel`, and its mirror
 * too if `mirror`. `grid` itself when nothing changes, so a stroke that
 * paints nothing new is no undo step.
 */
export function paint(
  grid: EmblemGrid,
  row: number,
  column: number,
  pixel: number,
  mirror: boolean,
): EmblemGrid {
  const columns = mirror ? [column, mirrorOf(column)] : [column];
  const indexes = columns.map((each) => row * EMBLEM_GRID + each);
  if (indexes.every((index) => grid[index] === pixel)) {
    return grid;
  }
  const next = [...grid];
  for (const index of indexes) {
    next[index] = pixel;
  }
  return next;
}

/**
 * `grid` with the 4-connected region of same-index pixels round `row`,
 * `column` set to `pixel`. `grid` itself if that pixel already is `pixel`.
 */
export function fill(grid: EmblemGrid, row: number, column: number, pixel: number): EmblemGrid {
  const from = grid[row * EMBLEM_GRID + column];
  if (from === undefined || from === pixel) {
    return grid;
  }
  const next = [...grid];
  const open: [number, number][] = [[row, column]];
  for (let cell = open.pop(); cell !== undefined; cell = open.pop()) {
    const [r, c] = cell;
    if (r < 0 || c < 0 || r >= EMBLEM_GRID || c >= EMBLEM_GRID) {
      continue;
    }
    const index = r * EMBLEM_GRID + c;
    if (next[index] !== from) {
      continue;
    }
    next[index] = pixel;
    open.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
  }
  return next;
}

/** `grid` after `tool` at `row`, `column` with `pick` the picked index. */
export function useTool(
  grid: EmblemGrid,
  tool: EmblemTool,
  row: number,
  column: number,
  pick: number,
  mirror: boolean,
): EmblemGrid {
  switch (tool) {
    case "pencil":
      return paint(grid, row, column, pick, mirror);
    case "eraser":
      return paint(grid, row, column, 0, mirror);
    case "fill": {
      const once = fill(grid, row, column, pick);
      return mirror ? fill(once, row, mirrorOf(column), pick) : once;
    }
  }
}

/** `steps` with `before` as the newest, the oldest dropped past `UNDO_LIMIT`. */
export function pushStep(steps: readonly EmblemGrid[], before: EmblemGrid): EmblemGrid[] {
  return [...steps, before].slice(-UNDO_LIMIT);
}

/** An empty grid. */
export function emptyGrid(): EmblemGrid {
  return Array.from({ length: EMBLEM_GRID * EMBLEM_GRID }, () => 0);
}

/** The 8 px view's side, CSS px: the emblem as big as on a cape in a match, on its cloth. */
const PREVIEW_PX = 24;
/** The emblem's size inside it, CSS px. */
const IN_GAME_EMBLEM_PX = 16;

const TOOLS: readonly {
  readonly tool: EmblemTool;
  readonly key: string;
  readonly label: MessageKey;
}[] = [
  { tool: "pencil", key: "p", label: "player.emblemPencil" },
  { tool: "eraser", key: "e", label: "player.emblemEraser" },
  { tool: "fill", key: "f", label: "player.emblemFill" },
];

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * The editor for `cape`'s emblem, in place in the cape designer (#3555).
 * Done calls `onClose` with the packed grid, Cancel with `null`; nothing
 * is saved here. Trim is the colour picked first.
 */
export function emblemEditor(
  cape: WireCape,
  onClose: (emblem: string | null) => void,
): HTMLElement {
  let grid: EmblemGrid = unpackEmblem(cape.emblem) ?? emptyGrid();
  let steps: EmblemGrid[] = [];
  let tool: EmblemTool = "pencil";
  let pick = CAPE_COLOURS.indexOf(cape.trim) + 1;
  let mirror = false;
  let cursor = { row: EMBLEM_GRID / 2, column: EMBLEM_GRID / 2 };
  /** The grid as the pointer stroke under way found it, or `null` for none. */
  let stroke: EmblemGrid | null = null;

  const root = h("div", "emblem-editor");
  root.style.setProperty("--cape-main", cssColour(CAPE_PALETTE[cape.main]));
  root.style.setProperty("--cape-trim", cssColour(CAPE_PALETTE[cape.trim]));

  const top = h("div", "emblem-editor-top");
  const board = h("div", "emblem-editor-grid");
  board.tabIndex = 0;
  board.setAttribute("role", "application");
  board.setAttribute("aria-label", t("player.emblem"));
  const cells: HTMLElement[] = [];
  for (let index = 0; index < EMBLEM_GRID * EMBLEM_GRID; index += 1) {
    cells.push(board.appendChild(h("span", "emblem-editor-cell")));
  }
  const preview = document.createElement("canvas");
  preview.className = "emblem-editor-preview";
  preview.setAttribute("role", "img");
  preview.setAttribute("aria-label", t("player.emblemInGame"));
  const ratio = window.devicePixelRatio;
  preview.width = Math.round(PREVIEW_PX * ratio);
  preview.height = Math.round(PREVIEW_PX * ratio);
  const side = h("div", "emblem-editor-side");
  side.append(preview, h("span", "emblem-editor-caption", t("player.emblemInGame")));
  top.append(board, side);

  const palette = h("div", "emblem-editor-row");
  palette.setAttribute("role", "group");
  palette.setAttribute("aria-label", t("player.emblemPalette"));
  const swatches = [null, ...CAPE_COLOURS].map((colour, index) => {
    const label = t(colour === null ? "player.emblemEmpty" : COLOUR_NAMES[colour]);
    const swatch = button("", "emblem-editor-swatch", () => {
      pick = index;
      if (tool === "eraser") {
        tool = "pencil";
      }
      render();
    });
    if (colour === null) {
      swatch.classList.add("emblem-editor-empty");
    } else {
      swatch.style.setProperty("--swatch", cssColour(CAPE_PALETTE[colour]));
    }
    swatch.setAttribute("aria-label", label);
    swatch.title = label;
    swatch.dataset.pixel = String(index);
    return palette.appendChild(swatch);
  });

  const tools = h("div", "emblem-editor-row");
  const toolButtons = TOOLS.map(({ tool: each, key, label }) => {
    const choice = button(t(label), "emblem-editor-tool", () => {
      tool = each;
      render();
    });
    choice.setAttribute("aria-keyshortcuts", key.toUpperCase());
    choice.dataset.tool = each;
    return tools.appendChild(choice);
  });
  const toggleMirror = (): void => {
    mirror = !mirror;
    render();
  };
  const mirrorButton = button(t("player.emblemMirror"), "emblem-editor-tool", toggleMirror);
  mirrorButton.setAttribute("aria-keyshortcuts", "M");
  const commit = (next: EmblemGrid): void => {
    if (next !== grid) {
      steps = pushStep(steps, grid);
      grid = next;
    }
    render();
  };
  const clear = button(t("player.emblemClear"), "emblem-editor-tool", () => {
    commit(grid.every((pixel) => pixel === 0) ? grid : emptyGrid());
  });
  const undo = (): void => {
    const last = steps.at(-1);
    if (last !== undefined) {
      steps = steps.slice(0, -1);
      grid = last;
      render();
    }
  };
  const undoButton = button(t("player.emblemUndo"), "emblem-editor-tool", undo);
  undoButton.setAttribute("aria-keyshortcuts", "Control+Z");
  tools.append(mirrorButton, clear, undoButton);

  const actions = h("div", "emblem-editor-row emblem-editor-actions");
  actions.append(
    button(t("player.emblemDone"), "emblem-editor-done", () => {
      onClose(packEmblem(grid));
    }),
    button(t("kit.cancel"), "emblem-editor-cancel", () => {
      onClose(null);
    }),
  );
  root.append(top, palette, tools, actions);

  /** The cell under a pointer event, or `undefined` off the grid. */
  const cellAt = (event: PointerEvent): { row: number; column: number } | undefined => {
    const rect = board.getBoundingClientRect();
    const column = Math.floor(((event.clientX - rect.left) / rect.width) * EMBLEM_GRID);
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * EMBLEM_GRID);
    return row < 0 || column < 0 || row >= EMBLEM_GRID || column >= EMBLEM_GRID
      ? undefined
      : { row, column };
  };
  const strokeAt = (event: PointerEvent): void => {
    const cell = cellAt(event);
    if (cell !== undefined) {
      cursor = cell;
      grid = useTool(grid, tool, cell.row, cell.column, pick, mirror);
      render();
    }
  };
  const endStroke = (): void => {
    if (stroke !== null && stroke !== grid) {
      steps = pushStep(steps, stroke);
    }
    stroke = null;
    render();
  };
  board.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    board.setPointerCapture(event.pointerId);
    board.focus();
    stroke = grid;
    strokeAt(event);
  });
  board.addEventListener("pointermove", (event: PointerEvent) => {
    // Fill floods once, where the stroke began.
    if (stroke !== null && tool !== "fill") {
      strokeAt(event);
    }
  });
  board.addEventListener("pointerup", endStroke);
  board.addEventListener("pointercancel", endStroke);

  root.addEventListener("keydown", (event: KeyboardEvent) => {
    if (handleKey(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  /** Whether `event` was one of the editor's keys, done. */
  const handleKey = (event: KeyboardEvent): boolean => {
    const key = event.key.toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (key === "z" && !event.altKey && !event.shiftKey) {
        undo();
        return true;
      }
      return false;
    }
    if (event.altKey) {
      return false;
    }
    const picked = TOOLS.find((each) => each.key === key);
    if (picked !== undefined) {
      tool = picked.tool;
      render();
      return true;
    }
    if (key === "m") {
      toggleMirror();
      return true;
    }
    // The cell keys only on the grid: Space on a button presses it.
    if (event.target !== board) {
      return false;
    }
    const arrow = ARROWS[event.key];
    if (arrow !== undefined) {
      const clamp = (value: number): number => Math.max(0, Math.min(EMBLEM_GRID - 1, value));
      cursor = { row: clamp(cursor.row + arrow[0]), column: clamp(cursor.column + arrow[1]) };
      render();
      return true;
    }
    if (event.key === " ") {
      commit(useTool(grid, tool, cursor.row, cursor.column, pick, mirror));
      return true;
    }
    return false;
  };

  const colourOf = (pixel: number): string | undefined => {
    const colour = CAPE_COLOURS[pixel - 1];
    return colour === undefined ? undefined : cssColour(CAPE_PALETTE[colour]);
  };
  const drawPreview = (): void => {
    const context = preview.getContext("2d");
    if (context === null) {
      return;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, PREVIEW_PX, PREVIEW_PX);
    context.fillStyle = cssColour(CAPE_PALETTE[cape.trim]);
    context.fillRect(0, 0, PREVIEW_PX, PREVIEW_PX);
    context.fillStyle = cssColour(CAPE_PALETTE[cape.main]);
    context.fillRect(2, 2, PREVIEW_PX - 4, PREVIEW_PX - 4);
    paintEmblem(
      canvasPainter(context),
      emblemShape(packEmblem(grid), { x: PREVIEW_PX / 2, y: PREVIEW_PX / 2 }, 0, IN_GAME_EMBLEM_PX),
      CAPE_COLOURS.map((colour) => CAPE_PALETTE[colour]),
    );
  };
  const render = (): void => {
    cells.forEach((cell, index) => {
      const colour = colourOf(grid[index] ?? 0);
      if (colour === undefined) {
        cell.style.removeProperty("--pixel");
      } else {
        cell.style.setProperty("--pixel", colour);
      }
      cell.classList.toggle(
        "emblem-editor-cursor",
        index === cursor.row * EMBLEM_GRID + cursor.column,
      );
    });
    board.classList.toggle("emblem-editor-mirrored", mirror);
    swatches.forEach((swatch, index) => {
      swatch.setAttribute("aria-pressed", String(tool !== "eraser" && index === pick));
    });
    toolButtons.forEach((choice, index) => {
      choice.setAttribute("aria-pressed", String(TOOLS[index]?.tool === tool));
    });
    mirrorButton.setAttribute("aria-pressed", String(mirror));
    undoButton.disabled = steps.length === 0;
    drawPreview();
  };
  render();
  return root;
}
