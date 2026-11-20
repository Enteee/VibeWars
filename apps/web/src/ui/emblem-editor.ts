import {
  canonicalEmblem,
  EMBLEM_GRID,
  MAX_EMBLEM_COLOURS,
  packEmblem,
  unpackEmblem,
  type WireCape,
} from "@vibewars/game-protocol";

import { t, type MessageKey } from "../i18n/index.js";
import { SELF_RIM, paintEmblem } from "../render/body-painter.js";
import {
  EMBLEM_PRESET_NAMES,
  capeLook,
  emblemShape,
  presetEmblem,
  type EmblemPresetName,
} from "../render/cape-shape.js";
import { canvasPainter } from "./character-figure.js";
import { cssColour } from "./character-preview.js";
import { button, h } from "./kit.js";

/**
 * The emblem editor (#3555): the cape designer's 16×16 pixel grid, drawn
 * by hand. The model is pure functions on `number[]` grids, row-major,
 * each pixel 0 for empty or `i` for the emblem's colour `i - 1` (#3628),
 * as `packEmblem` packs them; the DOM editor round them is `emblemEditor`.
 */
export type EmblemGrid = readonly number[];

/** The tools: Pencil paints the picked index, Eraser paints empty, Fill floods. */
export type EmblemTool = "pencil" | "eraser" | "fill";

/** How many steps Undo goes back. */
export const UNDO_LIMIT = 20;

/** Each starting emblem's name (#3554), for its Start from button's label. */
export const EMBLEM_NAMES: Readonly<Record<EmblemPresetName, MessageKey>> = {
  disc: "player.emblemDisc",
  bar: "player.emblemBar",
  chevron: "player.emblemChevron",
  diamond: "player.emblemDiamond",
  triangle: "player.emblemTriangle",
  cross: "player.emblemCross",
  ring: "player.emblemRing",
  "half-disc": "player.emblemHalfDisc",
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
export function pushStep<Step>(steps: readonly Step[], before: Step): Step[] {
  return [...steps, before].slice(-UNDO_LIMIT);
}

/** An empty grid. */
export function emptyGrid(): EmblemGrid {
  return Array.from({ length: EMBLEM_GRID * EMBLEM_GRID }, () => 0);
}

/** The 8 px view's side, CSS px: the emblem as big as on a cape in a match, on its cloth. */
const PREVIEW_PX = 24;
/** The emblem's size inside it, CSS px. */
const IN_GAME_EMBLEM_PX = 13;
/** A Start from button's size, CSS px. */
const START_BUTTON_PX = 20;

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

/** `hex`, six hex digits as a cape colour is spelled (#3628), as CSS. */
function hexCss(hex: string): string {
  return `#${hex}`;
}

/** A colour input's `#rrggbb` as a cape colour: no `#`, lower case (#3628). */
export function inputHex(value: string): string {
  return value.replace(/^#/, "").toLowerCase();
}

/** An emblem as the cape carries it (#3628): its packed grid and the colours it names. */
export type EmblemPick = Pick<WireCape, "emblem" | "emblemColours">;

/** The editor's state an Undo goes back to: the grid and the colours it is drawn in. */
interface EmblemStep {
  readonly grid: EmblemGrid;
  readonly colours: readonly string[];
}

/**
 * The editor for `cape`'s emblem, always shown in the cape designer
 * (#3555, #3628). Each finished stroke or tool action calls `onChange`
 * with the emblem in its one spelling (`canonicalEmblem`), as a pick
 * does. While it works it may hold colours no pixel uses. `show` puts
 * another cape behind it: its cloth, and its emblem when that is not the
 * one drawn here.
 */
export function emblemEditor(
  cape: WireCape,
  onChange: (emblem: EmblemPick) => void,
): { readonly root: HTMLElement; readonly show: (cape: WireCape) => void } {
  let cloth = { main: cape.main, trim: cape.trim };
  let grid: EmblemGrid = emptyGrid();
  let colours: readonly string[] = [];
  /** The drawing colour, 1-based into `colours`; 0 for Empty. */
  let pick = 1;
  let steps: EmblemStep[] = [];
  let tool: EmblemTool = "pencil";
  let mirror = false;
  let cursor = { row: EMBLEM_GRID / 2, column: EMBLEM_GRID / 2 };
  /** The grid as the pointer stroke under way found it, or `null` for none. */
  let stroke: EmblemGrid | null = null;
  /** The state before the recolour under way, or `null` for none. */
  let recolouring: EmblemStep | null = null;

  /** The emblem as drawn here, in its one spelling. */
  const drawn = (): EmblemPick => {
    const canonical = canonicalEmblem(grid, colours);
    return { emblem: packEmblem(canonical.pixels), emblemColours: canonical.colours };
  };
  /** Draw `from`'s emblem: its colours, the trim to start with when it has none. */
  const load = (from: WireCape): void => {
    grid = unpackEmblem(from.emblem, from.emblemColours.length) ?? emptyGrid();
    colours = from.emblemColours.length === 0 ? [from.trim] : [...from.emblemColours];
    pick = 1;
    steps = [];
  };
  load(cape);

  const root = h("div", "emblem-editor");

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

  const snapshot = (): EmblemStep => ({ grid, colours });
  const apply = (): void => {
    onChange(drawn());
  };
  /** Make `next` the editor's state, one Undo step, and apply it. */
  const commit = (next: EmblemStep): void => {
    if (next.grid !== grid || next.colours !== colours) {
      steps = pushStep(steps, snapshot());
      grid = next.grid;
      colours = next.colours;
      apply();
    }
    render();
  };

  const palette = h("div", "emblem-editor-row");
  palette.setAttribute("role", "group");
  palette.setAttribute("aria-label", t("player.emblemPalette"));
  const empty = button("", "emblem-editor-swatch emblem-editor-empty", () => {
    choose(0);
  });
  empty.setAttribute("aria-label", t("player.emblemEmpty"));
  empty.title = t("player.emblemEmpty");
  empty.dataset.pixel = "0";
  const swatches = h("span", "emblem-editor-swatches");
  const addColour = button(
    t("player.emblemAddColour"),
    "emblem-editor-tool emblem-editor-add",
    () => {
      if (colours.length < MAX_EMBLEM_COLOURS) {
        const next = [...colours, colours[pick - 1] ?? cloth.trim];
        pick = next.length;
        tool = tool === "eraser" ? "pencil" : tool;
        commit({ grid, colours: next });
      }
    },
  );
  const recolour = document.createElement("input");
  recolour.type = "color";
  recolour.className = "emblem-editor-recolour";
  recolour.setAttribute("aria-label", t("player.emblemColour"));
  recolour.title = t("player.emblemColour");
  recolour.addEventListener("input", () => {
    if (pick === 0) {
      return;
    }
    recolouring ??= snapshot();
    colours = colours.map((colour, index) =>
      index === pick - 1 ? inputHex(recolour.value) : colour,
    );
    render();
  });
  recolour.addEventListener("change", () => {
    if (recolouring !== null) {
      steps = pushStep(steps, recolouring);
      recolouring = null;
      apply();
      render();
    }
  });
  palette.append(empty, swatches, addColour, recolour);
  const choose = (index: number): void => {
    pick = index;
    if (tool === "eraser" && index > 0) {
      tool = "pencil";
    }
    render();
  };

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
  const clear = button(t("player.emblemClear"), "emblem-editor-tool", () => {
    commit({ grid: grid.every((pixel) => pixel === 0) ? grid : emptyGrid(), colours });
  });
  const undo = (): void => {
    const last = steps.at(-1);
    if (last !== undefined) {
      steps = steps.slice(0, -1);
      grid = last.grid;
      colours = last.colours;
      pick = Math.min(pick, colours.length);
      apply();
      render();
    }
  };
  const undoButton = button(t("player.emblemUndo"), "emblem-editor-tool", undo);
  undoButton.setAttribute("aria-keyshortcuts", "Control+Z");
  tools.append(mirrorButton, clear, undoButton);

  // Start from (#3628): a preset in the drawing colour, the trim with none picked.
  const starts = h("div", "emblem-editor-row");
  starts.setAttribute("role", "group");
  starts.setAttribute("aria-label", t("player.emblemStartFrom"));
  starts.appendChild(h("span", "emblem-editor-caption", t("player.emblemStartFrom")));
  const startFrom = (name: EmblemPresetName): void => {
    let next = colours;
    let index = pick;
    if (index === 0) {
      const trim = colours.indexOf(cloth.trim);
      if (trim >= 0) {
        index = trim + 1;
      } else if (colours.length < MAX_EMBLEM_COLOURS) {
        next = [...colours, cloth.trim];
        index = next.length;
      } else {
        index = 1;
      }
    }
    pick = index;
    tool = tool === "eraser" ? "pencil" : tool;
    commit({ grid: presetEmblem(name).map((pixel) => pixel * index), colours: next });
  };
  for (const name of EMBLEM_PRESET_NAMES) {
    const choice = button("", "emblem-editor-start", () => {
      startFrom(name);
    });
    choice.setAttribute("aria-label", t(EMBLEM_NAMES[name]));
    choice.title = t(EMBLEM_NAMES[name]);
    choice.dataset.emblem = name;
    // Drawn in one ink: the shape is what is picked.
    choice.appendChild(emblemIcon(packEmblem(presetEmblem(name)), [SELF_RIM], START_BUTTON_PX));
    starts.appendChild(choice);
  }
  root.append(top, palette, tools, starts);

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
      steps = pushStep(steps, { grid: stroke, colours });
      apply();
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
    // The tool keys only off the colour input, which may take typing.
    if (event.target === recolour) {
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
      commit({ grid: useTool(grid, tool, cursor.row, cursor.column, pick, mirror), colours });
      return true;
    }
    return false;
  };

  const drawPreview = (look: ReturnType<typeof capeLook>): void => {
    const context = preview.getContext("2d");
    if (context === null) {
      return;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, PREVIEW_PX, PREVIEW_PX);
    context.fillStyle = cssColour(look.trim);
    context.fillRect(0, 0, PREVIEW_PX, PREVIEW_PX);
    context.fillStyle = cssColour(look.main);
    context.fillRect(2, 2, PREVIEW_PX - 4, PREVIEW_PX - 4);
    paintEmblem(
      canvasPainter(context),
      emblemShape(look.emblem, { x: PREVIEW_PX / 2, y: PREVIEW_PX / 2 }, 0, IN_GAME_EMBLEM_PX),
      look.palette,
    );
  };
  const render = (): void => {
    // The cloth and the preview as others will see them, nudged clear of
    // the team colours; the grid and the swatches as picked.
    const look = capeLook({ ...cloth, emblemColours: colours, emblem: packEmblem(grid) });
    root.style.setProperty("--cape-main", cssColour(look.main));
    root.style.setProperty("--cape-trim", cssColour(look.trim));
    cells.forEach((cell, index) => {
      const colour = colours[(grid[index] ?? 0) - 1];
      if (colour === undefined) {
        cell.style.removeProperty("--pixel");
      } else {
        cell.style.setProperty("--pixel", hexCss(colour));
      }
      cell.classList.toggle(
        "emblem-editor-cursor",
        index === cursor.row * EMBLEM_GRID + cursor.column,
      );
    });
    board.classList.toggle("emblem-editor-mirrored", mirror);
    empty.setAttribute("aria-pressed", String(tool === "eraser" || pick === 0));
    swatches.replaceChildren(
      ...colours.map((colour, index) => {
        const swatch = button("", "emblem-editor-swatch", () => {
          choose(index + 1);
        });
        swatch.style.setProperty("--swatch", hexCss(colour));
        swatch.setAttribute("aria-label", hexCss(colour));
        swatch.title = hexCss(colour);
        swatch.dataset.pixel = String(index + 1);
        swatch.setAttribute("aria-pressed", String(tool !== "eraser" && index + 1 === pick));
        return swatch;
      }),
    );
    addColour.disabled = colours.length >= MAX_EMBLEM_COLOURS;
    const picked = colours[pick - 1];
    recolour.disabled = picked === undefined;
    if (picked !== undefined) {
      recolour.value = hexCss(picked);
    }
    toolButtons.forEach((choice, index) => {
      choice.setAttribute("aria-pressed", String(TOOLS[index]?.tool === tool));
    });
    mirrorButton.setAttribute("aria-pressed", String(mirror));
    undoButton.disabled = steps.length === 0;
    drawPreview(look);
  };
  render();
  return {
    root,
    show: (next) => {
      cloth = { main: next.main, trim: next.trim };
      const here = drawn();
      if (here.emblem !== next.emblem || here.emblemColours.join() !== next.emblemColours.join()) {
        load(next);
      }
      render();
    },
  };
}

/**
 * `emblem` in `palette`, upright, `px` across, sharp at the device's pixel
 * ratio. An image of a canvas, not the canvas: Options keeps no canvases
 * of its own (#1422).
 */
export function emblemIcon(
  emblem: string,
  palette: readonly number[],
  px: number,
): HTMLImageElement {
  const ratio = window.devicePixelRatio;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(px * ratio);
  canvas.height = Math.round(px * ratio);
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.scale(ratio, ratio);
    const half = px / 2;
    paintEmblem(
      canvasPainter(context),
      emblemShape(emblem, { x: half, y: half }, 0, px - 4),
      palette,
    );
  }
  const image = document.createElement("img");
  image.src = canvas.toDataURL();
  image.alt = "";
  image.width = px;
  image.height = px;
  return image;
}
