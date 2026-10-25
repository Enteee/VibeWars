import type { Intensity } from "../music/director.js";

/**
 * The now-playing toast (#372): "♪ <title>", top left, for a few
 * seconds whenever the track changes. Not in a fight: at intensity 2 or
 * more the player has better things to read.
 */

export const TOAST_MS = 3_000;

/** What the toast says for `trackId`, or `null` for none. */
export function nowPlayingText(
  trackId: string,
  tracks: readonly { readonly id: string; readonly title: string }[],
  intensity: Intensity,
): string | null {
  const track = tracks.find((candidate) => candidate.id === trackId);
  return track === undefined || intensity >= 2 ? null : `♪ ${track.title}`;
}

export function createNowPlayingToast(parent: HTMLElement): (text: string | null) => void {
  const toast = document.createElement("div");
  toast.className = "now-playing";
  toast.setAttribute("role", "status");
  toast.hidden = true;
  parent.appendChild(toast);
  let timer: number | undefined;
  return (text) => {
    if (text === null) {
      return;
    }
    toast.textContent = text;
    toast.hidden = false;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      toast.hidden = true;
    }, TOAST_MS);
  };
}
