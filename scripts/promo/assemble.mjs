#!/usr/bin/env node
/**
 * `pnpm run promo:assemble` — cut the captures of `promo:capture` into the
 * trailer (#3811): 45 s, one file per aspect ratio, in `out/promo/`:
 *
 *   vibewars-trailer-16x9.mp4   1920x1080
 *   vibewars-trailer-9x16.mp4   1080x1920, the middle of each frame
 *
 * Not part of CI. Needs ffmpeg and ffprobe (the devenv has them). Captions
 * are `captions.json`. The music is the one take of the fight scene, laid
 * so a beat falls on the frame of the interrupt (`plan.mjs`).
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { beatGrid, captionBox, cutSeconds, fightCuts, musicOffset, wrap } from "./plan.mjs";

const ROOT = path.join(import.meta.dirname, "..", "..");
const CAPTURE = path.join(ROOT, "out", "promo", "capture");
const OUT = path.join(ROOT, "out", "promo");
const FPS = 30;
const MAPS = ["broken-tower", "frozen-crossing", "ember-pits"];
/** @type {unknown} */
const raw = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "captions.json"), "utf8"));
const {
  captions: CAPTIONS,
  title: TITLE,
  end: END,
} = /** @type {{ captions: { scene: string, text: string }[], title: string, end: string[] }} */ (
  raw
);

/**
 * @param {string} name
 * @returns {{ events: { t: number, kind: string, skillId: string }[], marks: Record<string, number> }}
 */
function scene(name) {
  /** @type {unknown} */
  const read = JSON.parse(fs.readFileSync(path.join(CAPTURE, `${name}.json`), "utf8"));
  return /** @type {{ events: { t: number, kind: string, skillId: string }[], marks: Record<string, number> }} */ (
    read
  );
}

/** @param {string} file */
function seconds(file) {
  return Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]).toString(),
  );
}

/** The bold sans the system has: the game's own font stack is the player's. */
function fontFile() {
  const found = spawnSync("fc-match", ["-f", "%{file}", "sans-serif:bold"]).stdout.toString();
  return found === "" ? "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" : found;
}

/**
 * Onsets of the music, seconds: peaks of the rise in its loudness.
 *
 * @param {string} file
 */
function onsets(file) {
  const rate = 8000;
  const pcm = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-ac", "1", "-ar", String(rate), "-f", "s16le", "-"],
    { maxBuffer: 1 << 28 },
  );
  const hop = 160;
  const energy = [];
  for (let at = 0; at + hop <= pcm.length / 2; at += hop) {
    let sum = 0;
    for (let k = 0; k < hop; k += 1) {
      const sample = pcm.readInt16LE((at + k) * 2);
      sum += sample * sample;
    }
    energy.push(Math.sqrt(sum / hop));
  }
  const flux = energy.map((value, i) => Math.max(0, value - (energy[i - 1] ?? value)));
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  const found = [];
  for (let i = 2; i < flux.length - 2; i += 1) {
    const f = flux[i] ?? 0;
    const window = flux.slice(i - 2, i + 3);
    if (f > mean * 3 && f === Math.max(...window)) {
      const t = (i * hop) / rate;
      if (found.length === 0 || t - (found.at(-1) ?? 0) > 0.2) {
        found.push(t);
      }
    }
  }
  return found;
}

/**
 * One piece of the timeline, rendered to its own file at `width`x`height`.
 *
 * @param {{ src: string, from: number, to: number, speed: number }} cut
 * @param {number} width
 * @param {number} height
 * @param {string} file
 */
function renderCut(cut, width, height, file) {
  const portrait = height > width;
  // 9:16 takes the middle of the 16:9 frame, where the camera keeps the action.
  const crop = portrait ? "crop=ih*9/16:ih," : "";
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-ss",
    String(cut.from),
    "-t",
    String(cut.to - cut.from),
    "-i",
    cut.src,
    "-vf",
    `${crop}scale=${String(width)}:${String(height)},setpts=${String(1 / cut.speed)}*PTS,fps=${String(FPS)}`,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    file,
  ]);
}

/**
 * A still card of `lines`, `length` seconds, over the game's dark blue.
 *
 * @param {string[]} lines
 * @param {number} length
 * @param {number} width
 * @param {number} height
 * @param {string} file
 * @param {string} dir
 */
function renderCard(lines, length, width, height, file, dir) {
  const box = captionBox(width, height);
  const filters = lines.map((line, i) => {
    const textfile = path.join(dir, `card-${path.basename(file)}-${String(i)}.txt`);
    fs.writeFileSync(textfile, line);
    const size = Math.round(box.fontSize * (i === 0 ? 2.2 : 1));
    const y = Math.round(height * 0.38 + i * box.fontSize * 2.2);
    return `drawtext=fontfile=${fontFile()}:textfile=${textfile}:fontcolor=white:fontsize=${String(size)}:x=(w-text_w)/2:y=${String(y)}`;
  });
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x10182a:s=${String(width)}x${String(height)}:r=${String(FPS)}:d=${String(length)}`,
    "-vf",
    filters.join(","),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    file,
  ]);
}

/**
 * The timeline: its pieces in order, each `{ scene, src, from, to, speed }`
 * or a card, with the length each takes, and where the interrupt falls.
 */
function timeline() {
  /** @type {({ scene: string, src: string, from: number, to: number, speed: number } | { scene: string, card: string[], length: number })[]} */
  const pieces = [];
  const fight = scene("fight");
  const fightFile = path.join(CAPTURE, "fight.webm");
  const fightLength = seconds(fightFile);
  const start = fight.marks.matchStart ?? 0;
  pieces.push({ scene: "cold", src: fightFile, from: start + 2, to: start + 6, speed: 1 });

  const editorFile = path.join(CAPTURE, "editor.webm");
  const editor = scene("editor");
  const paste = editor.marks.paste ?? 0;
  pieces.push({ scene: "editor", src: editorFile, from: paste - 1, to: paste + 5.4, speed: 1.1 });

  const plan = fightCuts(fight.events, fightLength);
  if (plan === undefined) {
    throw new Error("the fight capture has no interrupt; shoot it again");
  }
  let total = plan.cuts.reduce((sum, cut) => sum + cutSeconds(cut), 0);
  // Fit the fight to its ten seconds: more run-up, or less aftermath.
  const first = plan.cuts[0];
  if (first !== undefined && total < 10) {
    const extra = Math.min(10 - total, first.from);
    first.from -= extra;
    total += extra;
  }
  while (total > 10 && plan.cuts.length > 2) {
    const dropped = plan.cuts.pop();
    total -= dropped === undefined ? 0 : cutSeconds(dropped);
  }
  for (const cut of plan.cuts) {
    pieces.push({ scene: "fight", src: fightFile, from: cut.from, to: cut.to, speed: cut.speed });
  }
  // The interrupt's frame, on the timeline: the cold open, the editor, the run-up, then 0.4 s of the slow cut at 0.5x.
  const before = plan.cuts.slice(0, plan.hit).reduce((sum, cut) => sum + cutSeconds(cut), 0);
  const hitAt = 4 + 6 + before + 0.8;

  for (const id of MAPS) {
    const map = scene(`map-${id}`);
    const from = (map.marks.pan ?? 4) - 0.5;
    pieces.push({
      scene: "maps",
      src: path.join(CAPTURE, `map-${id}.webm`),
      from,
      to: from + 2.7,
      speed: 1,
    });
  }
  const friends = scene("friends");
  const copy = friends.marks.copy ?? 0;
  pieces.push({
    scene: "friends",
    src: path.join(CAPTURE, "friends.webm"),
    from: copy - 0.5,
    to: copy + 6.5,
    speed: 7 / 6,
  });
  if (fs.existsSync(path.join(CAPTURE, "ranked.webm"))) {
    const ranked = scene("ranked");
    const src = path.join(CAPTURE, "ranked.webm");
    const panel = ranked.marks.panel ?? 0;
    const cape = ranked.marks.cape ?? 0;
    // The end panel, then the look it earned.
    pieces.push({ scene: "ranked", src, from: panel + 1, to: panel + 3.5, speed: 1 });
    pieces.push({ scene: "ranked", src, from: cape + 0.3, to: cape + 3.8, speed: 1 });
  }
  pieces.push({ scene: "end", card: END, length: 5 });
  return { pieces, hitAt };
}

/**
 * Cut one aspect ratio.
 *
 * @param {ReturnType<typeof timeline>} plan
 * @param {number} width
 * @param {number} height
 * @param {string} name
 * @param {number} musicStart where to start the music take
 */
function assemble(plan, width, height, name, musicStart) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "promo-assemble-"));
  try {
    /** @type {string[]} */
    const parts = [];
    /** @type {{ scene: string, at: number, length: number }[]} */
    const spans = [];
    let at = 0;
    plan.pieces.forEach((piece, i) => {
      const file = path.join(dir, `${String(i).padStart(2, "0")}.mp4`);
      const length = "card" in piece ? piece.length : cutSeconds(piece);
      if ("card" in piece) {
        renderCard(piece.card, piece.length, width, height, file, dir);
      } else {
        renderCut(piece, width, height, file);
      }
      parts.push(file);
      spans.push({ scene: piece.scene, at, length });
      at += length;
    });
    fs.writeFileSync(path.join(dir, "list.txt"), parts.map((f) => `file '${f}'`).join("\n"));
    const box = captionBox(width, height);
    const draws = [];
    // The title over the cold open; then a caption over each scene that has one.
    const wanted = [{ scene: "cold", text: TITLE }, ...CAPTIONS];
    for (const caption of wanted) {
      // Every piece of the scene: its first start to its last end.
      const of = spans.filter((s) => s.scene === caption.scene);
      const first = of[0];
      const last = of.at(-1);
      if (first === undefined || last === undefined) {
        continue;
      }
      const span = { at: first.at, length: last.at + last.length - first.at };
      const lines = wrap(caption.text, box.maxChars);
      const title = caption.scene === "cold";
      lines.forEach((line, i) => {
        const textfile = path.join(dir, `cap-${String(draws.length)}.txt`);
        fs.writeFileSync(textfile, line);
        const size = title ? box.fontSize * 2 : box.fontSize;
        const y = title ? Math.round(height * 0.42) : box.y + i * Math.round(size * 1.2);
        draws.push(
          `drawtext=fontfile=${fontFile()}:textfile=${textfile}:fontcolor=white:fontsize=${String(size)}` +
            `:borderw=${String(Math.round(size / 12))}:bordercolor=0x0b0f14:x=(w-text_w)/2:y=${String(y)}` +
            `:enable='between(t,${String(span.at + 0.3)},${String(span.at + span.length - 0.3)})'`,
        );
      });
    }
    const music = path.join(CAPTURE, "music.webm");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      path.join(dir, "list.txt"),
      "-ss",
      String(musicStart),
      "-i",
      music,
      "-vf",
      draws.join(","),
      "-af",
      `afade=t=in:d=0.5,afade=t=out:st=${String(at - 1.5)}:d=1.5`,
      "-t",
      String(at),
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      path.join(OUT, name),
    ]);
    const size = fs.statSync(path.join(OUT, name)).size;
    console.log(`${name}: ${at.toFixed(1)} s, ${(size / 1048576).toFixed(1)} MB`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

fs.mkdirSync(OUT, { recursive: true });
const plan = timeline();
const grid = beatGrid(onsets(path.join(CAPTURE, "music.webm")));
if (grid === undefined) {
  throw new Error("no beat found in the music take");
}
const start = musicOffset(grid, plan.hitAt);
console.log(
  `music: beat ${grid.period.toFixed(3)} s, starts at ${start.toFixed(2)} s, interrupt at ${plan.hitAt.toFixed(1)} s`,
);
assemble(plan, 1920, 1080, "vibewars-trailer-16x9.mp4", start);
assemble(plan, 1080, 1920, "vibewars-trailer-9x16.mp4", start);
