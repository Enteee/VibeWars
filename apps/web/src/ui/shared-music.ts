import { t } from "../i18n/index.js";
import type { MusicFollower } from "../music/play-music.js";
import type { SharedTracks } from "../music/shared-tracks.js";
import type { Track } from "../music/tracks/index.js";
import { button, h, syncList } from "./kit.js";

/**
 * The ♪ popover's *Shared with you* (#2745): a row a lobby member who
 * shared a track, "{name} · {title}", and its Play; *Back to my music*
 * while one plays. Hidden with nothing shared. A share is someone else's
 * code: only the sender's name and this player's own title for its track
 * reach the page, as text, never its source. In a match, Play waits for
 * the lobby.
 */
export function sharedMusicSection(
  player: MusicFollower,
  shared: SharedTracks,
  tracks: readonly Track[],
  inMatch: boolean,
): { readonly element: HTMLElement; dispose(): void } {
  const section = h("section", "jukebox-shared");
  section.appendChild(h("h3", "jukebox-shared-title", t("music.sharedWithYou")));
  const list = h("div", "entity-list jukebox-shared-list");
  const back = button(t("music.backToMine"), "jukebox-shared-back", () => {
    shared.setPlaying(null);
    player.playShared(null);
  });
  section.append(list, back);

  const paint = (): void => {
    const rows = shared.rows().flatMap((row) => {
      const track = tracks.find((candidate) => candidate.id === row.trackId);
      return track === undefined ? [] : [{ ...row, title: track.title }];
    });
    section.hidden = rows.length === 0 && player.sharing === null;
    back.hidden = player.sharing === null;
    syncList(
      list,
      rows,
      (row) => row.from,
      (row) => {
        const node = h("div", "jukebox-shared-row");
        const label = h("span", "jukebox-shared-name");
        const play = button(t("music.playShared"), "jukebox-shared-play", () => {
          const current = shared.rows().find((candidate) => candidate.from === row.from);
          if (current === undefined || inMatch) {
            return;
          }
          shared.setPlaying(current.from);
          player.playShared({ trackId: current.trackId, source: current.source });
        });
        node.append(label, play);
        return node;
      },
      (node, row) => {
        const label = node.querySelector(".jukebox-shared-name");
        if (label !== null) {
          label.textContent = t("music.sharedRow", { name: row.name, title: row.title });
        }
        const playing = shared.playing === row.from && player.sharing !== null;
        node.classList.toggle("is-selected", playing);
        const play = node.querySelector(".jukebox-shared-play");
        if (play instanceof HTMLButtonElement) {
          play.textContent = playing ? t("music.sharedPlaying") : t("music.playShared");
          play.disabled = inMatch;
          play.title = inMatch ? t("music.playSharedInLobby") : "";
          play.setAttribute("aria-pressed", String(playing));
        }
      },
    );
  };
  paint();
  const unsubscribeShared = shared.onChange(paint);
  // A fight's music changes with every snapshot: only a share ending repaints.
  let sharing = player.sharing;
  const unsubscribeMusic = player.onChange(() => {
    if (player.sharing !== sharing) {
      sharing = player.sharing;
      paint();
    }
  });
  return {
    element: section,
    dispose() {
      unsubscribeShared();
      unsubscribeMusic();
    },
  };
}
