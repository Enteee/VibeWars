/**
 * Whether this build can reach a game server.
 *
 * Off only for the static GitHub Pages deploy (#103), which has no server
 * behind it: the menu shows hosting, joining and Quick Match disabled, and
 * nothing fetches `/api/maps` or opens a WebSocket. This is a capability
 * switch for one kind of build, not a compatibility shim, and it goes away
 * when online play itself becomes static (#15).
 *
 * The only place that reads `VITE_VIBEWARS_ONLINE`.
 */
export const ONLINE_PLAY: boolean = import.meta.env.VITE_VIBEWARS_ONLINE !== "off";
