import { beatEdits, shippedHash, tooLarge, type BeatEditStore } from "../music/beat-edits.js";
import type { MusicLevel } from "../music/host-protocol.js";
import {
  intensityOverride,
  playedIntensity,
  type IntensityOverrideStore,
} from "../music/intensity-override.js";
import { musicPlayer, type MusicError, type MusicPlayer } from "../music/music-player.js";
import { music, type MusicFollower } from "../music/play-music.js";
import { pastedSource, shareLink } from "../music/share-link.js";
import { TRACKS, type Track } from "../music/tracks/index.js";
import type { CodeEditor } from "./code-editor.js";
import { button, h, shareLine } from "./kit.js";

/**
 * The beat editor (#373, #366 §3.7): the source of a track, edited while
 * it plays. Ctrl+Enter sends it to the music host, which plays it from
 * the next cycle; once the host says `evaluated` the edit is kept, and it
 * plays wherever that track would. A source that fails leaves the old
 * pattern playing and shows the error under its line.
 *
 * While it is open the editor holds its track over the director and any
 * preview, and its intensity slider holds the level; closing gives both
 * back. Keys typed in it go no further, so none reaches the game. The text
 * area is CodeMirror, its own chunk, loaded when the editor first opens.
 */

export interface BeatEditorDeps {
  readonly music: MusicFollower;
  readonly player: MusicPlayer;
  readonly edits: BeatEditStore;
  readonly override: IntensityOverrideStore;
  readonly tracks: readonly Track[];
}

const defaultDeps = (): BeatEditorDeps => ({
  music: music(),
  player: musicPlayer(),
  edits: beatEdits,
  override: intensityOverride,
  tracks: TRACKS,
});

/** What the host is evaluating for the editor, until it answers. */
type Pending = { readonly kind: "edit"; readonly source: string } | { readonly kind: "reset" };

interface OpenEditor {
  evaluated(): void;
  failed(error: MusicError): void;
  close(): void;
}

let open: OpenEditor | undefined;
const listening = new WeakSet<MusicPlayer>();

/** The host's answers go to the editor that is open, if one is. */
function listen(player: MusicPlayer): void {
  if (listening.has(player)) {
    return;
  }
  listening.add(player);
  player.onEvaluated(() => {
    open?.evaluated();
  });
  player.onError((error) => {
    open?.failed(error);
  });
}

function level(value: number): MusicLevel {
  return value <= 0 ? 0 : value >= 3 ? 3 : value === 1 ? 1 : 2;
}

/** Close the beat editor, if it is open. */
export function closeBeatEditor(): void {
  open?.close();
}

/** Open the beat editor on `trackId`, closing one already open. */
export function openBeatEditor(trackId: string, deps: BeatEditorDeps = defaultDeps()): void {
  const found = deps.tracks.find((candidate) => candidate.id === trackId);
  if (found === undefined) {
    return;
  }
  const track: Track = found;
  closeBeatEditor();
  listen(deps.player);
  const { player, edits, override } = deps;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const restoreOverride = override.get();
  let pending: Pending | undefined;
  let stopped = false;
  let editor: CodeEditor | undefined;
  let closed = false;

  const panel = h("div", "screen beat-editor");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", `Beat editor: ${track.title}`);

  const bar = h("div", "beat-editor-bar");
  const title = h("h2", "screen-title", track.title);
  const edited = h("span", "beat-editor-edited", "edited");
  title.appendChild(edited);
  bar.append(
    title,
    button("Close", "beat-editor-close", () => {
      close();
    }),
  );

  const tools = h("div", "menu-row beat-editor-tools");
  const evaluateButton = button("Play change", "primary beat-editor-evaluate", () => {
    evaluate();
  });
  evaluateButton.title = "Ctrl+Enter";
  const stopButton = button("Stop", "beat-editor-stop", () => {
    stop();
  });
  stopButton.title = "Ctrl+.";
  const resetButton = button("Reset to shipped", "beat-editor-reset", () => {
    reset();
  });

  const intensityField = h("label", "field beat-editor-intensity");
  intensityField.appendChild(h("span", "field-label", "Intensity"));
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "3";
  slider.step = "1";
  slider.value = String(playedIntensity(override.get(), deps.music.intensity));
  const sliderValue = h("output", "beat-editor-intensity-value", slider.value);
  intensityField.append(slider, sliderValue);
  slider.addEventListener("input", () => {
    sliderValue.textContent = slider.value;
    override.set(level(Number(slider.value)));
  });

  const link = shareLine("strudel.cc link");
  const copyButton = button("Copy strudel.cc link", "beat-editor-copy", () => {
    if (editor !== undefined) {
      link.show(shareLink(editor.text(), level(Number(slider.value))));
    }
  });
  const pasteBox = document.createElement("textarea");
  pasteBox.className = "beat-editor-paste";
  pasteBox.placeholder = "Paste a strudel.cc link or code here";
  pasteBox.setAttribute("aria-label", "Paste a strudel.cc link or code");
  pasteBox.hidden = true;
  const pasteButton = button("Paste link or code", "beat-editor-paste-open", () => {
    pasteBox.hidden = !pasteBox.hidden;
    if (!pasteBox.hidden) {
      pasteBox.value = "";
      pasteBox.focus();
    }
  });
  // The link opens under its button, as the build editor's share line does.
  const share = h("span", "beat-editor-share");
  share.append(copyButton, link.element);
  tools.append(evaluateButton, stopButton, resetButton, intensityField, share, pasteButton);

  const status = h("p", "beat-editor-status", "Loading the editor…");
  status.setAttribute("role", "status");
  const code = h("div", "beat-editor-code");
  const hint = h(
    "p",
    "beat-editor-hint",
    "Ctrl+Enter plays your change from the next cycle and keeps it. Ctrl+. stops. Esc closes.",
  );
  panel.append(bar, tools, pasteBox, status, code, hint);

  const paint = (): void => {
    const isEdited = edits.get(track.id) !== undefined;
    edited.hidden = !isEdited;
    resetButton.disabled = !isEdited;
  };
  const unsubscribe = edits.subscribe(paint);
  paint();

  function evaluate(): void {
    if (editor === undefined) {
      return;
    }
    const source = editor.text();
    if (tooLarge(source)) {
      editor.showError("This beat is over 64 KB, so it was not played or kept.", undefined);
      return;
    }
    pending = { kind: "edit", source };
    stopped = false;
    status.textContent = "Playing…";
    player.evaluate(source);
  }

  function stop(): void {
    stopped = true;
    player.stop();
    status.textContent = "Stopped. Ctrl+Enter plays it again.";
  }

  function reset(): void {
    edits.remove(track.id);
    editor?.setText(track.source);
    editor?.clearError();
    pending = { kind: "reset" };
    stopped = false;
    player.evaluate(track.source);
  }

  const paste = (text: string): void => {
    const source = pastedSource(text);
    pasteBox.hidden = true;
    if (source === null) {
      status.textContent = "That strudel.cc link could not be read.";
    } else if (tooLarge(source)) {
      status.textContent = "That beat is over 64 KB, so it was not pasted.";
    } else {
      editor?.setText(source);
      editor?.clearError();
      status.textContent = "Pasted. Ctrl+Enter plays it.";
    }
    editor?.focus();
  };
  pasteBox.addEventListener("paste", (event) => {
    event.preventDefault();
    paste(event.clipboardData?.getData("text/plain") ?? "");
  });
  pasteBox.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      paste(pasteBox.value);
    }
  });

  // Nothing typed here reaches the game. The text area handles its own
  // keys first and marks them handled; these are for everything else.
  const onKey = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.type !== "keydown" || event.defaultPrevented) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key === "Enter") {
      event.preventDefault();
      evaluate();
    } else if (mod && event.key === ".") {
      event.preventDefault();
      stop();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };
  panel.addEventListener("keydown", onKey);
  panel.addEventListener("keyup", onKey);

  function close(): void {
    if (closed) {
      return;
    }
    closed = true;
    open = undefined;
    if (stopped) {
      player.play();
    }
    deps.music.edit(null);
    override.set(restoreOverride);
    unsubscribe();
    editor?.destroy();
    panel.remove();
    opener?.focus();
  }

  open = {
    evaluated() {
      const done = pending;
      pending = undefined;
      editor?.clearError();
      if (done?.kind === "reset") {
        status.textContent = "Back to the shipped track.";
        return;
      }
      if (done === undefined) {
        return;
      }
      status.textContent = "Playing your change. It is kept.";
      if (done.source === track.source) {
        edits.remove(track.id);
        return;
      }
      void shippedHash(track.source).then((hash) => {
        edits.save(track.id, { shippedHash: hash, source: done.source });
      });
    },
    failed(error) {
      if (pending === undefined) {
        return;
      }
      pending = undefined;
      status.textContent = "That did not play; the last version plays on.";
      editor?.showError(error.message, error.line);
    },
    close,
  };

  deps.music.edit(track.id);
  override.set(level(Number(slider.value)));
  document.body.appendChild(panel);

  void import("./code-editor.js").then(({ createCodeEditor }) => {
    if (closed) {
      return;
    }
    editor = createCodeEditor(edits.get(track.id)?.source ?? track.source, {
      evaluate,
      stop,
      close,
    });
    code.appendChild(editor.element);
    status.textContent = "";
    editor.focus();
  });
}
