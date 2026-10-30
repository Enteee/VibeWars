import {
  MUSIC_MODES,
  saveMusicPreference,
  type MusicModeKind,
  type MusicPreference,
} from "../audio/music-preference.js";
import { beatEdits, type BeatEditStore } from "../music/beat-edits.js";
import { music, type MusicFollower } from "../music/play-music.js";
import { TRACKS, type Track } from "../music/tracks/index.js";
import { openBeatEditor } from "./beat-editor.js";
import { musicIcon } from "./icons.js";
import { mountSoundControls, soundControlsDeps } from "./sound-controls.js";
import { button, h, screenBar, selectableRow, syncList } from "./kit.js";

/**
 * The jukebox (#372, #366 §3.6): what plays. A menu screen, and the same
 * panel as a popover from the HUD's ♪ button in a match. How loud is the
 * sound controls' business (#424): the screen links to Options → Sound,
 * and the popover, the one place for them in a match, shows them itself.
 *
 * Click a row to hear it; the preview lasts until another row is picked
 * or the jukebox closes. Edit opens a track in the beat editor (#373), and
 * a track the player edited says so. Rows are the shared selectable rows (#581),
 * updated in place, so the pressed one keeps focus. Every change is saved at once. The rules are
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
  readonly edited: boolean;
}

export function jukeboxRows(
  tracks: readonly Pick<Track, "id" | "title" | "moods" | "bpm">[],
  preference: MusicPreference,
  previewId: string | null,
  edited: (trackId: string) => boolean,
): JukeboxRow[] {
  return tracks.map((track) => ({
    id: track.id,
    title: track.title,
    moods: track.moods.join(", "),
    bpm: `${String(track.bpm)} bpm`,
    pinned: track.id === preference.pinnedTrackId,
    previewing: track.id === previewId,
    edited: edited(track.id),
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
  edits: BeatEditStore = beatEdits,
): JukeboxPanel {
  let previewId: string | null = null;
  const panel = h("div", "jukebox");

  const modeField = h("label", "field");
  modeField.appendChild(h("span", "field-label", "Music"));
  const modePicker = document.createElement("select");
  modePicker.className = "jukebox-mode";
  for (const mode of MUSIC_MODES) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = MODE_NAMES[mode];
    modePicker.appendChild(option);
  }
  modeField.appendChild(modePicker);

  const editPlaying = button("Edit what plays", "jukebox-edit-playing", () => {
    if (player.nowPlaying !== null) {
      openBeatEditor(player.nowPlaying);
    }
  });
  const controls = h("div", "menu-row jukebox-controls");
  controls.append(modeField, editPlaying);
  panel.appendChild(controls);

  const list = h("div", "entity-list jukebox-list");
  panel.appendChild(list);

  const change = (next: MusicPreference): void => {
    player.setPreference(next);
    saveMusicPreference(next);
    paint();
  };

  modePicker.addEventListener("change", () => {
    const mode = MUSIC_MODES.find((kind) => kind === modePicker.value);
    if (mode !== undefined) {
      change(chooseMode(player.preference, mode));
    }
  });

  function paint(): void {
    const preference = player.preference;
    modePicker.value = preference.mode;
    editPlaying.disabled = player.nowPlaying === null;
    const pinnedOption = [...modePicker.options].find((option) => option.value === "pinned");
    if (pinnedOption !== undefined) {
      pinnedOption.disabled = preference.pinnedTrackId === null;
    }

    syncList(
      list,
      jukeboxRows(TRACKS, preference, previewId, (trackId) => edits.get(trackId) !== undefined),
      (row) => row.id,
      (row) => {
        const node = selectableRow({
          name: row.title,
          subtitle: `${row.moods} · ${row.bpm}`,
          actions: [
            button("Pin", "jukebox-pin", () => {
              change(pinTrack(player.preference, row.id));
            }),
            button("Edit", "jukebox-edit", () => {
              openBeatEditor(row.id);
            }),
          ],
          onSelect: () => {
            previewId = previewId === row.id ? null : row.id;
            player.preview(previewId);
            paint();
          },
        });
        node.classList.add("jukebox-row");
        node.dataset.trackId = row.id;
        node.querySelector(".selectable-row-choose")?.classList.add("jukebox-play");
        return node;
      },
      (node, row) => {
        node.classList.toggle("is-selected", row.previewing);
        node.classList.toggle("is-edited", row.edited);
        const play = node.querySelector(".jukebox-play");
        if (play instanceof HTMLElement) {
          play.setAttribute("aria-pressed", String(row.previewing));
          play.title = row.previewing ? "Stop the preview" : "Preview";
        }
        const edit = node.querySelector(".jukebox-edit");
        if (edit instanceof HTMLElement) {
          edit.setAttribute("aria-label", `Open ${row.title} in the beat editor`);
          edit.title = row.edited ? "Open your edit in the beat editor" : "Open in the beat editor";
        }
        const pin = node.querySelector(".jukebox-pin");
        if (pin instanceof HTMLButtonElement) {
          pin.textContent = row.pinned ? "Pinned" : "Pin";
          pin.disabled = row.pinned && preference.mode === "pinned";
        }
      },
    );
  }
  paint();
  const unsubscribeEdits = edits.subscribe(paint);
  // A fight's music changes with every snapshot: only this follows it.
  const unsubscribeMusic = player.onChange(() => {
    editPlaying.disabled = player.nowPlaying === null;
  });

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
      unsubscribeEdits();
      unsubscribeMusic();
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
export function renderJukeboxScreen(
  root: HTMLElement,
  callbacks: { onBack: () => void; onSoundSettings: () => void },
): void {
  disposeJukeboxScreen();
  root.replaceChildren();
  const screen = h("div", "screen jukebox-screen");
  screenBar({
    crumbs: ["VibeWars", "Music"],
    back: { label: "Back", onBack: callbacks.onBack },
    actions: [button("Sound settings", "jukebox-sound-settings", callbacks.onSoundSettings)],
  });
  const panel = jukeboxPanel(callbacks.onBack);
  screen.appendChild(panel.element);
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
    const panel = jukeboxPanel(close, music());
    // Above the tracks: in a match, how loud comes before what plays.
    const sound = h("div", "hud-sound");
    panel.element.prepend(sound);
    const defaults = soundControlsDeps();
    const unmountSound = mountSoundControls(sound, {
      ...defaults,
      saveMusicPreference: (preference) => {
        defaults.saveMusicPreference(preference);
        paintTrigger(preference);
      },
    });
    open = {
      element: panel.element,
      dispose() {
        unmountSound();
        panel.dispose();
      },
    };
    open.element.classList.add("screen", "hud-jukebox");
    open.element.setAttribute("role", "dialog");
    open.element.setAttribute("aria-label", "Sound and music");
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
