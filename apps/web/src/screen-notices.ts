/**
 * The start-up notices (#373, #878, #1807): a stale beat edit, music
 * stopped, an unreadable saved relay, a malformed or framed relay link.
 * Each is said once, but on a screen the player can read: a notice
 * drawn on a rail entry is drawn again by every redraw of that entry, as
 * a lobby change makes just after start-up, and is gone for good the
 * first time the player leaves that screen.
 */
export interface ScreenNotices {
  /** A notice for the next draw, after any already waiting. */
  add(notice: string): void;
  /** The notices to show on a draw of `entry`, in the order they came. */
  draw(entry: string): readonly string[];
  /** The player left the screen: the notices drawn on it are over. */
  leave(): void;
}

export function createScreenNotices(initial: readonly string[]): ScreenNotices {
  let waiting = [...initial];
  let shown: { readonly entry: string; readonly notices: readonly string[] } | undefined;
  return {
    add(notice) {
      waiting = [...waiting, notice];
    },
    draw(entry) {
      const kept = shown?.entry === entry ? shown.notices : [];
      const notices = [...kept, ...waiting];
      waiting = [];
      shown = { entry, notices };
      return notices;
    },
    leave() {
      shown = undefined;
    },
  };
}
