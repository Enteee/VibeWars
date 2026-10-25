import {
  MUSIC_MODES,
  saveMusicPreference,
  type MusicModeKind,
  type MusicPreference,
} from "../audio/music-preference.js";
import { music, type MusicFollower } from "../music/play-music.js";
import { TRACKS, type Track } from "../music/tracks/index.js";
import { musicIcon } from "./icons.js";

/**
 * The jukebox (#372, #366 §3.6): what plays, and how loud. A menu screen,
 * and the same panel as a popover from the HUD's ♪ button in a match.
 *
 * Click a row to hear it; the preview lasts until another row is picked
 * or the jukebox closes. Every change is saved at once. The rules are
 * plain functions, tested without a DOM; `jukeboxPanel` only draws them.
 */

export const MODE_NAMES: Readonly<Record<MusicModeKind, string>> = {
  auto: "Auto",
  shuffle: "Shuffle",
  pinned: "Pinned",
  off: "Off",
};

export interface JukeboxRow {
  readonly id: string;
  readonly title: string;
  readonly moods: string;
  readonly bpm: string;
  readonly pinned: boolean;
  readonly previewing: boolean;
}

export function jukeboxRows(
  tracks: readonly Pick<Track, "id" | "title" | "moods" | "bpm">[],
  preference: MusicPreference,
  previewId: string | null,
): JukeboxRow[] {
  return tracks.map((track) => ({
    id: track.id,
    title: track.title,
    moods: track.moods.join(", "),
    bpm: `${String(track.bpm)} bpm`,
    pinned: track.id === preference.pinnedTrackId,
    previewing: track.id === previewId,
  }));
}

/** Pin `trackId`, which plays it from now on. */
export function pinTrack(preference: MusicPreference, trackId: string): MusicPreference {
  return { ...preference, mode: "pinned", pinnedTrackId: trackId };
}

/** Pinned needs a pinned track; until there is one, choosing it changes nothing. */
export function chooseMode(preference: MusicPreference, mode: MusicModeKind): MusicPreference {
  return mode === "pinned" && preference.pinnedTrackId === null
    ? preference
    : { ...preference, mode };
}

function h(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

export interface JukeboxPanel {
  readonly element: HTMLElement;
  /** End the preview and stop listening. */
  dispose(): void;
}

/**
 * The jukebox's controls. Keys pressed in it go no further, so a game
 * key typed while it has focus does nothing in the match; Esc calls
 * `onClose`.
 */
export function jukeboxPanel(
  onClose: () => void,
  player: MusicFollower = music(),
  onPreferenceChange: (preference: MusicPreference) => void = () => undefined,
): JukeboxPanel {
  let previewId: string | null = null;
  const panel = h("div", "jukebox");

  const modeField = h("label", "field");
  modeField.appendChild(h("span", "field-label", "music"));
  const modePicker = document.createElement("select");
  modePicker.className = "jukebox-mode";
  for (const mode of MUSIC_MODES) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = MODE_NAMES[mode];
    modePicker.appendChild(option);
  }
  modeField.appendChild(modePicker);

  const volumeField = h("label", "field jukebox-volume");
  volumeField.appendChild(h("span", "field-label", "music volume"));
  const volume = document.createElement("input");
  volume.type = "range";
  volume.min = "0";
  volume.max = "1";
  volume.step = "0.05";
  volumeField.appendChild(volume);

  const mute = document.createElement("button");
  mute.type = "button";
  mute.className = "jukebox-mute";
  mute.appendChild(document.createElement("img")).alt = "";

  const controls = h("div", "menu-row jukebox-controls");
  controls.append(modeField, volumeField, mute);
  panel.appendChild(controls);

  const list = h("div", "entity-list jukebox-list");
  panel.appendChild(list);

  const change = (next: MusicPreference): void => {
    player.setPreference(next);
    saveMusicPreference(next);
    onPreferenceChange(next);
    paint();
  };

  modePicker.addEventListener("change", () => {
    const mode = MUSIC_MODES.find((kind) => kind === modePicker.value);
    if (mode !== undefined) {
      change(chooseMode(player.preference, mode));
    }
  });
  volume.addEventListener("input", () => {
    change({ ...player.preference, musicVolume: Number(volume.value) });
  });
  mute.addEventListener("click", () => {
    change({ ...player.preference, musicMuted: !player.preference.musicMuted });
  });

  function paint(): void {
    const preference = player.preference;
    modePicker.value = preference.mode;
    const pinnedOption = [...modePicker.options].find((option) => option.value === "pinned");
    if (pinnedOption !== undefined) {
      pinnedOption.disabled = preference.pinnedTrackId === null;
    }
    volume.value = String(preference.musicVolume);
    const icon = mute.querySelector("img");
    if (icon !== null) {
      icon.src = musicIcon(preference.musicMuted);
    }
    mute.setAttribute("aria-label", "Mute music");
    mute.setAttribute("aria-pressed", preference.musicMuted ? "true" : "false");
    mute.title = preference.musicMuted ? "Music off. Click to turn it on." : "Music on.";

    list.replaceChildren();
    for (const row of jukeboxRows(TRACKS, preference, previewId)) {
      const node = h("div", "entity-row jukebox-row");
      node.dataset.trackId = row.id;
      node.classList.toggle("is-previewing", row.previewing);
      const play = button("", "jukebox-play", () => {
        previewId = row.previewing ? null : row.id;
        player.preview(previewId);
        paint();
      });
      play.setAttribute("aria-pressed", row.previewing ? "true" : "false");
      play.title = row.previewing ? "Stop the preview" : "Preview";
      play.append(
        h("span", "jukebox-title", row.title),
        h("span", "jukebox-meta", `${row.moods} · ${row.bpm}`),
        // Filled by the beat editor (#373) for a track the player changed.
        h("span", "jukebox-edited"),
      );
      const pin = button(row.pinned ? "pinned" : "pin", "jukebox-pin", () => {
        change(pinTrack(player.preference, row.id));
      });
      pin.disabled = row.pinned && preference.mode === "pinned";
      const edit = button("open in editor", "jukebox-edit", () => undefined);
      // The beat editor (#373) enables this.
      edit.disabled = true;
      const actions = h("div", "menu-row");
      actions.append(pin, edit);
      node.append(play, actions);
      list.appendChild(node);
    }
  }
  paint();

  const onKeydown = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.code === "Escape") {
      event.preventDefault();
      onClose();
    }
  };
  panel.addEventListener("keydown", onKeydown);

  return {
    element: panel,
    dispose() {
      panel.removeEventListener("keydown", onKeydown);
      if (previewId !== null) {
        previewId = null;
        player.preview(null);
      }
    },
  };
}

let disposeScreen: (() => void) | undefined;

export function disposeJukeboxScreen(): void {
  disposeScreen?.();
  disposeScreen = undefined;
}

/** The jukebox as a menu screen. */
export function renderJukeboxScreen(root: HTMLElement, callbacks: { onBack: () => void }): void {
  disposeJukeboxScreen();
  root.replaceChildren();
  const screen = h("div", "screen jukebox-screen");
  screen.appendChild(h("h2", "screen-title", "music"));
  screen.appendChild(h("p", "screen-subtitle", "Click a track to hear it. Changes save at once."));
  const panel = jukeboxPanel(callbacks.onBack);
  screen.appendChild(panel.element);
  const actions = h("div", "menu-row");
  actions.appendChild(button("back", "", callbacks.onBack));
  screen.appendChild(actions);
  root.appendChild(screen);
  disposeScreen = () => {
    panel.dispose();
  };
  panel.element.querySelector<HTMLElement>(".jukebox-play")?.focus();
}

/**
 * The jukebox as a popover from the HUD's ♪ button: open on a click, shut
 * on another, on Esc, or on a click outside it.
 */
export function attachJukeboxPopover(
  trigger: HTMLButtonElement,
  parent: HTMLElement,
): { dispose(): void } {
  let open: JukeboxPanel | undefined;
  const paintTrigger = (preference: MusicPreference): void => {
    const icon = trigger.querySelector("img");
    if (icon !== null) {
      icon.src = musicIcon(preference.musicMuted);
    }
  };
  const close = (): void => {
    if (open === undefined) {
      return;
    }
    open.dispose();
    open.element.remove();
    open = undefined;
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  };
  const toggle = (): void => {
    if (open !== undefined) {
      close();
      return;
    }
    open = jukeboxPanel(close, music(), paintTrigger);
    open.element.classList.add("screen", "hud-jukebox");
    open.element.setAttribute("role", "dialog");
    open.element.setAttribute("aria-label", "Music");
    parent.appendChild(open.element);
    trigger.setAttribute("aria-expanded", "true");
    open.element.querySelector<HTMLElement>(".jukebox-play")?.focus();
  };
  const onOutside = (event: PointerEvent): void => {
    const target = event.target;
    if (
      open !== undefined &&
      target instanceof Node &&
      !open.element.contains(target) &&
      !trigger.contains(target)
    ) {
      close();
    }
  };
  paintTrigger(music().preference);
  trigger.setAttribute("aria-expanded", "false");
  trigger.addEventListener("click", toggle);
  document.addEventListener("pointerdown", onOutside);
  return {
    dispose() {
      trigger.removeEventListener("click", toggle);
      document.removeEventListener("pointerdown", onOutside);
      open?.dispose();
      open?.element.remove();
      open = undefined;
    },
  };
}
