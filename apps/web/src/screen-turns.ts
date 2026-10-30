/**
 * Whose turn the screen is (#1513). Every screen change takes one; a
 * screen that awaits before it draws, as Solo Play awaits its roster,
 * asks whether its turn is still the latest, and draws nothing if another
 * screen took the screen in the meantime. Otherwise a late draw paints
 * the menu over the lobby the player just hosted.
 */
export interface ScreenTurns {
  /** Take the screen: every turn taken before this one is over. */
  take(): ScreenTurn;
}

/** One screen change's turn. */
export type ScreenTurn = () => boolean;

export function createScreenTurns(): ScreenTurns {
  let latest = 0;
  return {
    take() {
      latest += 1;
      const mine = latest;
      return () => mine === latest;
    },
  };
}
