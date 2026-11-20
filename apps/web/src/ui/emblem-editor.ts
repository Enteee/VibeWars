import {
  EMBLEM_GRID,
  MAX_EMBLEM_COLOURS,
  canonicalEmblem,
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
 * The emblem editor (#3555, #3628): the cape designer's 16×16 pixel
 * grid, drawn by hand in up to `MAX_EMBLEM_COLOURS` colours of the
 * player's own. The model is pure functions on `number[]` grids,
 * row-major, each pixel 0 for empty or `i` for the editor's colour
 * `i - 1`, as `packEmblem` packs them; the DOM editor round them is
 * `emblemEditor`.
 */
export type EmblemGrid = readonly number[];

/** The tools: Pencil paints the picked index, Eraser paints empty, Fill floods. */
export type EmblemTool = "pencil" | "eraser" | "fill";

/** How many steps Undo goes back. */
export const UNDO_LIMIT = 20;

/** Each starting emblem's name (#3554), for its Start from button. */
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

/**
 * The colours Add colour offers first (#3628), the cape study's palette
 * (#1410): the first not yet on the emblem, else the drawing colour.
 */
const ADDED_COLOURS = [
  "e6c04a",
  "a078e0",
  "f2f2f2",
  "23272e",
  "9bd445",
  "f0963c",
  "2fb8a0",
  "e86fb4",
];

/** A colour as `<input type="color">` gives it, `#rrggbb`, as a cape carries it. */
export function fromColourInput(value: string): string {
  return value.replace(/^#/, "").toLowerCase();
}

/** The 8 px view's side, CSS px: the emblem as big as on a cape in a match, on its cloth. */
const PREVIEW_PX = 24;
/** The emblem's size inside it, CSS px. */
const IN_GAME_EMBLEM_PX = 8;

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

/** An emblem as a cape carries it (#3628): its colours, and its grid packed. */
export interface Emblem {
  readonly emblemColours: readonly string[];
  readonly emblem: string;
}

/** What the editor holds (#3628): the grid and its colours, unused ones too. */
interface Draft {
  readonly grid: EmblemGrid;
  readonly colours: readonly string[];
}

/** `cape`'s emblem as the editor opens it: a blank one holds the trim, ready to draw in. */
function draftOf(cape: WireCape): Draft {
  return {
    grid: unpackEmblem(cape.emblem, cape.emblemColours.length) ?? emptyGrid(),
    colours: cape.emblemColours.length === 0 ? [cape.trim] : cape.emblemColours,
  };
}

/** `draft` as a cape carries it, in its one spelling (`canonicalEmblem`). */
function emblemOf(draft: Draft): Emblem {
  const { pixels, colours } = canonicalEmblem(draft.grid, draft.colours);
  return { emblemColours: colours, emblem: packEmblem(pixels) };
}

function sameEmblem(a: Emblem, b: Emblem): boolean {
  return a.emblem === b.emblem && a.emblemColours.join() === b.emblemColours.join();
}

/** A cape colour as CSS, as it was picked. */
function picked(hex: string): string {
  return `#${hex}`;
}

/**
 * The editor for `cape`'s emblem, always shown in the cape designer
 * (#3555, #3628). Each finished stroke or tool action calls `onChange`
 * with the emblem as a cape carries it, so it is applied at once; a
 * colour added but not yet drawn in is kept here, not sent. `show`
 * puts on the cape as the designer now has it: its cloth, and its
 * emblem if that is not what the editor holds.
 */
export function emblemEditor(
  cape: WireCape,
  onChange: (emblem: Emblem) => void,
): { readonly root: HTMLElement; readonly show: (cape: WireCape) => void } {
  let worn = cape;
  let draft = draftOf(cape);
  let applied = emblemOf(draft);
  let steps: Draft[] = [];
  let tool: EmblemTool = "pencil";
  /** The drawing colour, `i` for `draft.colours[i - 1]`, or 0 for Empty. */
  let pick = 1;
  let mirror = false;
  let cursor = { row: EMBLEM_GRID / 2, column: EMBLEM_GRID / 2 };
  /** The draft as the pointer stroke under way found it, or `null` for none. */
  let stroke: Draft | null = null;
  /** The draft as the colour picker found it while it is being dragged, or `null`. */
  let recolouring: Draft | null = null;

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

  /** Applies the draft to the cape when what a cape carries of it changed. */
  const apply = (): void => {
    const next = emblemOf(draft);
    if (!sameEmblem(next, applied)) {
      applied = next;
      onChange(next);
    }
  };
  const commit = (next: Draft): void => {
    if (next !== draft) {
      steps = pushStep(steps, draft);
      draft = next;
    }
    render();
    apply();
  };
  const withGrid = (grid: EmblemGrid): Draft => (grid === draft.grid ? draft : { ...draft, grid });

  const palette = h("div", "emblem-editor-row");
  palette.setAttribute("role", "group");
  palette.setAttribute("aria-label", t("player.emblemPalette"));
  // One swatch for Empty and one for each colour there may be; those past
  // the draft's colours are hidden.
  const swatches = Array.from({ length: MAX_EMBLEM_COLOURS + 1 }, (_, index) => {
    const swatch = button("", "emblem-editor-swatch", () => {
      pick = index;
      if (tool === "eraser") {
        tool = "pencil";
      }
      render();
    });
    if (index === 0) {
      swatch.classList.add("emblem-editor-empty");
      swatch.setAttribute("aria-label", t("player.emblemEmpty"));
      swatch.title = t("player.emblemEmpty");
    }
    swatch.dataset.pixel = String(index);
    return palette.appendChild(swatch);
  });
  const addColour = button(t("player.emblemAddColour"), "emblem-editor-tool", () => {
    const { colours } = draft;
    const colour =
      ADDED_COLOURS.find((each) => !colours.includes(each)) ?? colours[pick - 1] ?? worn.trim;
    draft = { ...draft, colours: [...colours, colour] };
    pick = draft.colours.length;
    if (tool === "eraser") {
      tool = "pencil";
    }
    render();
  });
  addColour.dataset.action = "add-colour";
  // Beside the swatches, the drawing colour's own picker: it recolours
  // every pixel drawn in it, one undo step a drag.
  const picker = document.createElement("input");
  picker.type = "color";
  picker.className = "emblem-editor-picker";
  picker.setAttribute("aria-label", t("player.emblemColour"));
  picker.title = t("player.emblemColour");
  picker.addEventListener("input", () => {
    if (pick === 0) {
      return;
    }
    recolouring ??= draft;
    const colour = fromColourInput(picker.value);
    draft = {
      ...draft,
      colours: draft.colours.map((each, index) => (index === pick - 1 ? colour : each)),
    };
    render();
  });
  picker.addEventListener("change", () => {
    if (recolouring !== null && recolouring !== draft) {
      steps = pushStep(steps, recolouring);
    }
    recolouring = null;
    render();
    apply();
  });
  palette.append(addColour, picker);

  const starts = h("div", "emblem-editor-row");
  starts.setAttribute("role", "group");
  starts.setAttribute("aria-label", t("player.emblemStartFrom"));
  starts.appendChild(h("span", "emblem-editor-caption", t("player.emblemStartFrom")));
  for (const preset of EMBLEM_PRESET_NAMES) {
    const start = button("", "emblem-editor-start", () => {
      startFrom(preset);
    });
    start.setAttribute("aria-label", t(EMBLEM_NAMES[preset]));
    start.title = t(EMBLEM_NAMES[preset]);
    start.dataset.emblem = preset;
    // Drawn in one ink, whatever its colour: the shape is what is picked.
    start.appendChild(emblemIcon(packEmblem(presetEmblem(preset)), [SELF_RIM]));
    starts.appendChild(start);
  }
  /**
   * The grid replaced by `preset` in the drawing colour; with Empty
   * picked, in the trim's, added if it is not there and there is room,
   * else in the first colour.
   */
  const startFrom = (preset: EmblemPresetName): void => {
    let colours = draft.colours;
    let pixel = pick;
    if (pixel === 0) {
      const trim = colours.indexOf(worn.trim);
      if (trim >= 0) {
        pixel = trim + 1;
      } else if (colours.length < MAX_EMBLEM_COLOURS) {
        colours = [...colours, worn.trim];
        pixel = colours.length;
      } else {
        pixel = 1;
      }
    }
    pick = pixel;
    if (tool === "eraser") {
      tool = "pencil";
    }
    commit({ grid: presetEmblem(preset).map((each) => each * pixel), colours });
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
    commit(withGrid(draft.grid.every((pixel) => pixel === 0) ? draft.grid : emptyGrid()));
  });
  const undo = (): void => {
    const last = steps.at(-1);
    if (last !== undefined) {
      steps = steps.slice(0, -1);
      draft = last;
      render();
      apply();
    }
  };
  const undoButton = button(t("player.emblemUndo"), "emblem-editor-tool", undo);
  undoButton.setAttribute("aria-keyshortcuts", "Control+Z");
  tools.append(mirrorButton, clear, undoButton);
  root.append(top, palette, starts, tools);

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
      draft = withGrid(useTool(draft.grid, tool, cell.row, cell.column, pick, mirror));
      render();
    }
  };
  const endStroke = (): void => {
    if (stroke !== null && stroke !== draft) {
      steps = pushStep(steps, stroke);
    }
    stroke = null;
    render();
    apply();
  };
  board.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    board.setPointerCapture(event.pointerId);
    board.focus();
    stroke = draft;
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
    // The picker takes its own keys.
    if (event.altKey || event.target === picker) {
      return false;
    }
    const chosen = TOOLS.find((each) => each.key === key);
    if (chosen !== undefined) {
      tool = chosen.tool;
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
      commit(withGrid(useTool(draft.grid, tool, cursor.row, cursor.column, pick, mirror)));
      return true;
    }
    return false;
  };

  const drawPreview = (): void => {
    const context = preview.getContext("2d");
    if (context === null) {
      return;
    }
    // As others will see it: each colour kept off the team colours.
    const look = capeLook({ ...worn, ...emblemOf(draft) });
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
    const { grid, colours } = draft;
    pick = Math.min(pick, colours.length);
    root.style.setProperty("--cape-main", picked(worn.main));
    root.style.setProperty("--cape-trim", picked(worn.trim));
    cells.forEach((cell, index) => {
      const colour = colours[(grid[index] ?? 0) - 1];
      if (colour === undefined) {
        cell.style.removeProperty("--pixel");
      } else {
        cell.style.setProperty("--pixel", picked(colour));
      }
      cell.classList.toggle(
        "emblem-editor-cursor",
        index === cursor.row * EMBLEM_GRID + cursor.column,
      );
    });
    board.classList.toggle("emblem-editor-mirrored", mirror);
    swatches.forEach((swatch, index) => {
      const colour = colours[index - 1];
      if (index > 0) {
        swatch.hidden = colour === undefined;
        if (colour !== undefined) {
          swatch.style.setProperty("--swatch", picked(colour));
          swatch.setAttribute("aria-label", picked(colour));
          swatch.title = picked(colour);
        }
      }
      swatch.setAttribute("aria-pressed", String(tool !== "eraser" && index === pick));
    });
    addColour.disabled = colours.length >= MAX_EMBLEM_COLOURS;
    const drawing = colours[pick - 1];
    picker.disabled = drawing === undefined;
    if (drawing !== undefined) {
      picker.value = picked(drawing);
    }
    toolButtons.forEach((choice, index) => {
      choice.setAttribute("aria-pressed", String(TOOLS[index]?.tool === tool));
    });
    mirrorButton.setAttribute("aria-pressed", String(mirror));
    undoButton.disabled = steps.length === 0;
    drawPreview();
  };
  render();
  return {
    root,
    show: (next) => {
      worn = next;
      if (!sameEmblem(emblemOf(draft), next)) {
        draft = draftOf(next);
        applied = emblemOf(draft);
        steps = [];
      }
      render();
    },
  };
}

/** The Start from buttons' size, CSS px. */
const EMBLEM_BUTTON_PX = 20;

/**
 * `emblem` in `palette`, upright, sharp at the device's pixel ratio. An image
 * of a canvas, not the canvas: Options keeps no canvases of its own (#1422).
 */
export function emblemIcon(emblem: string, palette: readonly number[]): HTMLImageElement {
  const ratio = window.devicePixelRatio;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(EMBLEM_BUTTON_PX * ratio);
  canvas.height = Math.round(EMBLEM_BUTTON_PX * ratio);
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.scale(ratio, ratio);
    const half = EMBLEM_BUTTON_PX / 2;
    paintEmblem(
      canvasPainter(context),
      emblemShape(emblem, { x: half, y: half }, 0, EMBLEM_BUTTON_PX - 4),
      palette,
    );
  }
  const image = document.createElement("img");
  image.src = canvas.toDataURL();
  image.alt = "";
  image.width = EMBLEM_BUTTON_PX;
  image.height = EMBLEM_BUTTON_PX;
  return image;
}
