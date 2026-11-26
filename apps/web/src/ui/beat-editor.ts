import { MAX_SHARED_SOURCE_BYTES, sharedSourceBytes } from "@vibewars/game-protocol";

import { t } from "../i18n/index.js";
import { beatEdits, shippedHash, tooLarge, type BeatEditStore } from "../music/beat-edits.js";
import { beatEvaluations } from "../music/beat-evaluations.js";
import type { MusicLevel } from "../music/host-protocol.js";
import {
  intensityOverride,
  playedIntensity,
  type IntensityOverrideStore,
} from "../music/intensity-override.js";
import { musicPlayer, type MusicError, type MusicPlayer } from "../music/music-player.js";
import { music, type MusicFollower } from "../music/play-music.js";
import { pastedSource, shareLink } from "../music/share-link.js";
import { sharedTracks, type SharedTracks } from "../music/shared-tracks.js";
import { TRACKS, type Track } from "../music/tracks/index.js";
import type { CodeEditor } from "./code-editor.js";
import { button, h, overlayClose, shareLine, toast } from "./kit.js";

/**
 * The beat editor (#373, #366 §3.7): the source of a track, edited while
 * it plays. Ctrl+Enter sends it to the music host, which plays it from
 * the next cycle; once the host says `evaluated` the edit is kept, and it
 * plays wherever that track would. A source that fails leaves the old
 * pattern playing and shows the error under its line. Music switched
 * off (#878) says so in the status.
 *
 * While it is open the editor holds its track over the director and any
 * preview, and its intensity slider holds the level; closing gives both
 * back. *Share with lobby* (#2745) sends the text as it is, saved or not,
 * to the other members of a coded lobby. Keys typed in it go no further,
 * so none reaches the game. The text area is CodeMirror, its own chunk,
 * loaded when the editor first opens.
 */

export interface BeatEditorDeps {
  readonly music: MusicFollower;
  readonly player: MusicPlayer;
  readonly edits: BeatEditStore;
  readonly override: IntensityOverrideStore;
  readonly tracks: readonly Track[];
  /** Where *Share with lobby* sends (#2745). */
  readonly shared: SharedTracks;
}

const defaultDeps = (): BeatEditorDeps => ({
  music: music(),
  player: musicPlayer(),
  edits: beatEdits,
  override: intensityOverride,
  tracks: TRACKS,
  shared: sharedTracks,
});

interface OpenEditor {
  evaluated(seq: number): void;
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
  player.onEvaluated((seq) => {
    open?.evaluated(seq);
  });
  player.onError((error) => {
    open?.failed(error);
  });
}

/** How long *Share with lobby* says *Shared.* (#2745). */
const SHARED_SHOWN_MS = 2_000;

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
  const evaluations = beatEvaluations(track.id, track.source, edits, shippedHash(track.source));
  let stopped = false;
  let editor: CodeEditor | undefined;
  let closed = false;

  const panel = h("div", "screen beat-editor");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", t("beatEditor.label", { track: track.title }));

  const bar = h("div", "beat-editor-bar");
  const title = h("h2", "screen-title", track.title);
  const edited = h("span", "beat-editor-edited", t("beatEditor.edited"));
  title.appendChild(edited);
  bar.append(title);

  const tools = h("div", "menu-row beat-editor-tools");
  const evaluateButton = button(t("beatEditor.play"), "primary beat-editor-evaluate", () => {
    evaluate();
  });
  evaluateButton.title = t("beatEditor.playTitle");
  const stopButton = button(t("beatEditor.stop"), "beat-editor-stop", () => {
    stop();
  });
  stopButton.title = t("beatEditor.stopTitle");
  const resetButton = button(t("beatEditor.reset"), "beat-editor-reset", () => {
    reset();
  });

  const intensityField = h("label", "field beat-editor-intensity");
  intensityField.appendChild(h("span", "field-label", t("beatEditor.intensity")));
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

  const link = shareLine(t("beatEditor.strudelLink"));
  const copyButton = button(t("beatEditor.copyLink"), "beat-editor-copy", () => {
    if (editor !== undefined) {
      link.show(shareLink(editor.text(), level(Number(slider.value))));
    }
  });
  const pasteBox = document.createElement("textarea");
  pasteBox.className = "beat-editor-paste";
  pasteBox.placeholder = t("beatEditor.pastePlaceholder");
  pasteBox.setAttribute("aria-label", t("beatEditor.pasteLabel"));
  pasteBox.hidden = true;
  const pasteButton = button(t("beatEditor.paste"), "beat-editor-paste-open", () => {
    pasteBox.hidden = !pasteBox.hidden;
    if (!pasteBox.hidden) {
      pasteBox.value = "";
      pasteBox.focus();
    }
  });
  // The link opens under its button, as the build editor's share line does.
  const share = h("span", "beat-editor-share");
  share.append(copyButton, link.element);
  const lobbyButton = button(t("music.shareWithLobby"), "beat-editor-share-lobby", () => {
    shareWithLobby();
  });
  /** While it says *Shared.*, the timer that ends it. */
  let sharedTimer: number | undefined;
  tools.append(
    evaluateButton,
    stopButton,
    resetButton,
    intensityField,
    share,
    pasteButton,
    lobbyButton,
  );

  const status = h("p", "beat-editor-status", t("beatEditor.loading"));
  status.setAttribute("role", "status");
  const code = h("div", "beat-editor-code");
  panel.append(
    overlayClose(() => {
      close();
    }),
    bar,
    tools,
    pasteBox,
    status,
    code,
  );

  const paint = (): void => {
    const isEdited = edits.get(track.id) !== undefined;
    edited.hidden = !isEdited;
    resetButton.disabled = !isEdited;
  };
  const unsubscribe = edits.subscribe(paint);
  paint();

  /** *Share with lobby*: on in a lobby to share with, the text under the cap. */
  const paintShare = (): void => {
    if (sharedTimer !== undefined) {
      return;
    }
    lobbyButton.textContent = t("music.shareWithLobby");
    const tooLong =
      editor !== undefined && sharedSourceBytes(editor.text()) > MAX_SHARED_SOURCE_BYTES;
    lobbyButton.disabled = !deps.shared.canShare || editor === undefined || tooLong;
    lobbyButton.title = !deps.shared.canShare
      ? t("music.shareNoLobby")
      : tooLong
        ? t("music.shareTooLong")
        : "";
  };
  const unsubscribeShared = deps.shared.onChange(paintShare);
  // Too soon by the host's clock (#2779): it was not shared after all.
  const unsubscribeThrottled = deps.shared.onHostThrottled(() => {
    window.clearTimeout(sharedTimer);
    sharedTimer = undefined;
    paintShare();
  });
  code.addEventListener("input", paintShare);
  code.addEventListener("keyup", paintShare);
  paintShare();

  function shareWithLobby(): void {
    if (editor === undefined) {
      paintShare();
      return;
    }
    const outcome = deps.shared.share(track.id, editor.text());
    if (outcome === "throttled") {
      toast(t("music.shareThrottled"));
      return;
    }
    if (outcome === "refused") {
      paintShare();
      return;
    }
    lobbyButton.textContent = t("music.shared");
    lobbyButton.disabled = true;
    sharedTimer = window.setTimeout(() => {
      sharedTimer = undefined;
      paintShare();
    }, SHARED_SHOWN_MS);
  }

  function evaluate(): void {
    if (editor === undefined) {
      return;
    }
    const source = editor.text();
    if (tooLarge(source)) {
      editor.showError(t("beatEditor.tooLargeToPlay"), undefined);
      return;
    }
    stopped = false;
    status.textContent = t("beatEditor.playing");
    evaluations.sent(player.evaluate(source), { kind: "edit", source });
  }

  function stop(): void {
    stopped = true;
    player.stop();
    status.textContent = t("beatEditor.stopped");
  }

  function reset(): void {
    evaluations.reset();
    editor?.setText(track.source);
    editor?.clearError();
    stopped = false;
    evaluations.sent(player.evaluate(track.source), { kind: "reset" });
    // The button just disabled itself; without this, focus falls to the body.
    editor?.focus();
  }

  const paste = (text: string): void => {
    const source = pastedSource(text);
    pasteBox.hidden = true;
    if (source === null) {
      status.textContent = t("beatEditor.unreadableLink");
    } else if (tooLarge(source)) {
      status.textContent = t("beatEditor.tooLargeToPaste");
    } else {
      editor?.setText(source);
      editor?.clearError();
      status.textContent = t("beatEditor.pasted");
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
    unsubscribeShared();
    unsubscribeThrottled();
    window.clearTimeout(sharedTimer);
    editor?.destroy();
    panel.remove();
    opener?.focus();
  }

  open = {
    evaluated(seq) {
      const done = evaluations.evaluated(seq);
      if (done === undefined) {
        return;
      }
      editor?.clearError();
      status.textContent =
        done.kind === "reset" ? t("beatEditor.backToShipped") : t("beatEditor.kept");
    },
    failed(error) {
      if (error.evaluation === undefined) {
        // The music was switched off, or the pattern failed as it played
        // (#878): no line of this text to mark.
        status.textContent = error.message;
        return;
      }
      if (!evaluations.failed(error.evaluation)) {
        return;
      }
      status.textContent = t("beatEditor.didNotPlay");
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
    paintShare();
    status.textContent = "";
    editor.focus();
  });
}
