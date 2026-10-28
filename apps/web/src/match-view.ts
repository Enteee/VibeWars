import { allWallSegments } from "@vibewars/game-maps/geometry";
import type { WallDescriptor } from "@vibewars/game-protocol";
import type { MatchConnection, MatchSnapshot } from "@vibewars/game-session";

import { attachMatchSounds } from "./audio/match-sounds.js";
import { onGlobalMute, setGlobalMute } from "./audio/global-mute.js";
import { soundPlayer } from "./audio/sound-player.js";
import { attackKeyIntents, hasActionToCancel } from "./input/attack-key.js";
import { createDoubleClick } from "./input/double-click.js";
import { attachKeyboardMoveInput } from "./input/keyboard-move.js";
import { loadLayoutLabeller } from "./input/key-labels.js";
import { actionForCode, isShortcut } from "./input/keymap.js";
import { loadKeymap } from "./input/keymap-preference.js";
import {
  calledTargetIntent,
  callTargetCall,
  middleClickAction,
  pingCall,
  secondaryClickIntents,
} from "./input/mouse-intents.js";
import { attachNameReveal } from "./input/name-reveal.js";
import { closestTarget, nextTabTarget, selfTargetIntent } from "./input/tab-target.js";
import { skillSlotForKeyDown } from "./input/skill-keys.js";
import { attachMatchMusic } from "./music/match-music.js";
import { music } from "./music/play-music.js";
import { TRACKS } from "./music/tracks/index.js";
import {
  ACTOR_RADIUS,
  CREATURE_RADIUS,
  withCalls,
  withNames,
  teamColour,
  toRenderableGroundEffect,
  type ArenaSnapshot,
  type RenderableWall,
} from "./render/arena-snapshot.js";
import { attackCastOf } from "./render/attack-clock.js";
import { NoWebGlError, createArenaViewport, type ArenaViewport } from "./render/arena-viewport.js";
import { attachFollowCamera } from "./render/follow-camera.js";
import { showCombatFeedback } from "./render/combat-feedback.js";
import { projectileSprite } from "./render/projectiles.js";
import {
  createHud,
  describeRefusal,
  flashMessage,
  flashTargetCast,
  renderLeave,
  renderKeyLabels,
  renderMute,
  refreshSkillBar,
  renderSkillBar,
  updateHud,
  updateRecharges,
} from "./ui/hud.js";
import { compassReach, createCompass } from "./ui/compass.js";
import { noWebGlNotice } from "./ui/arena-notice.js";
import { attachFullscreenButton, fullscreenTarget } from "./ui/fullscreen.js";
import { attachJukeboxPopover } from "./ui/jukebox.js";
import {
  closeOptionsOverlay,
  isOptionsOverlayOpen,
  openOptionsOverlay,
} from "./ui/options-screen.js";
import { createPartyWindow } from "./ui/party-window.js";
import { attachReconnectCountdown, mountReconnectOverlay } from "./ui/reconnect-overlay.js";
import { renderSummary, summaryTables, type SummaryTable } from "./ui/match-summary.js";
import { flashSlot, slotFlashes } from "./ui/skill-slot-state.js";

/**
 * The in-match view: a Phaser viewport for the arena plus the DOM HUD,
 * wired to a live match connection.
 *
 * Owns its own teardown so the app shell can leave a match and come back
 * without leaking a Phaser game, a socket, or a keyboard listener.
 */

export interface MatchViewCallbacks {
  readonly onLeave: () => void;
  /** Surfaces connection trouble so the shell can tell the player. */
  readonly onConnectionChange?: (state: "online" | "reconnecting" | "lost") => void;
  /** Once, on the first snapshot of the match finished (#881): how it ended for this player. */
  readonly onFinished?: (outcome: MatchOutcome) => void;
}

/** How a match ended, as `describeOutcome` reads it; `selfTeam` is undefined for a spectator. */
export interface MatchOutcome {
  readonly winningTeam: number | undefined;
  readonly endReason: string | undefined;
  readonly selfTeam: number | undefined;
}

export interface MatchViewOptions {
  /**
   * Where the match comes from: a lobby's match over its transport, or the
   * Training Ground's local simulation.
   */
  readonly connect: () => Promise<MatchConnection>;
}

export interface MatchView {
  /** The match summary's tables once the host has sent them (#1057), for the queue screen. */
  summary(): readonly SummaryTable[] | undefined;
  dispose(): Promise<void>;
}

export function toRenderableWall(wall: WallDescriptor): RenderableWall {
  return wall.kind === "rect"
    ? { kind: "rect", x: wall.x, y: wall.y, width: wall.width, height: wall.height }
    : { kind: "polygon", points: wall.points };
}

/** Project the wire snapshot onto the renderer's own shape (ADR-0001). */
export function toArenaSnapshot(
  match: MatchSnapshot,
  walls: readonly RenderableWall[],
): ArenaSnapshot {
  const self = match.players.find((player) => player.sessionId === match.selfSessionId);

  return {
    walls,
    clock: match.elapsedSeconds,
    projectiles: match.projectiles.map((shot) => {
      const shooter = match.players.find((player) => player.sessionId === shot.attackerId);
      return {
        id: shot.id,
        sprite: projectileSprite(shooter?.weaponId, shot.skillId),
        from: shot.from,
        to: shot.to,
        launchedAt: shot.launchedAt,
        flightSeconds: shot.flightSeconds,
        // Tinted by side; a shooter who has left counts as the other side.
        colour: teamColour(shooter !== undefined && shooter.team === self?.team ? "ally" : "enemy"),
      };
    }),
    groundEffects: match.groundEffects.map((effect) =>
      toRenderableGroundEffect(effect, self?.team),
    ),
    // Render the target the *server* confirmed, not whatever was last
    // clicked — a click is only a request (brief §32).
    targetId: self?.targetSessionId,
    // Whose names show is the caller's to say (`withNames`, #253).
    hoverId: undefined,
    showAllNames: false,
    // Your team's calls are the caller's (`withCalls`, #443).
    calledId: undefined,
    pings: [],
    actors: match.players.map((player) => {
      return {
        id: player.sessionId,
        name: player.name,
        position: { x: player.x, y: player.y },
        facing: player.facing,
        weaponId: player.weaponId,
        swingElapsed: player.swingElapsed,
        swingTotal: player.swingTotal,
        attackCast: attackCastOf(player.castingSkillId, player.castRemaining, player.castTotal),
        offhandId: player.offhandId,
        profession: player.primaryProfession,
        radius: player.creature === undefined ? ACTOR_RADIUS : CREATURE_RADIUS,
        team:
          player.sessionId === match.selfSessionId
            ? ("self" as const)
            : player.team === self?.team
              ? ("ally" as const)
              : ("enemy" as const),
        health: player.health,
        maxHealth: player.maxHealth,
        dead: player.dead,
        exploited: player.corpseExploited,
        // From the snapshot, not the event, so a dropped event or a late
        // joiner still draws it right, and it stands up the moment it is 0.
        knockedDown: player.knockdownRemaining > 0,
        castProgress:
          // The server's total, not the skill's activation time: dazed
          // doubles a cast, and the bar must fill over the real one.
          player.castingSkillId !== undefined && player.castTotal > 0
            ? Math.max(0, Math.min(1, 1 - player.castRemaining / player.castTotal))
            : undefined,
        statuses: player.statuses.map((status) => status.id),
      };
    }),
  };
}

/** Whether a key press is someone typing, which no match key may steal. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable)
  );
}

/**
 * Calls `handler` once per animation frame with the seconds since the
 * last, for a match with no arena to drive the frames (#655). Returns the
 * stop.
 */
function animationFrames(handler: (deltaSeconds: number) => void): () => void {
  let last: number | undefined;
  let request = 0;
  const step = (now: number): void => {
    handler(last === undefined ? 0 : (now - last) / 1000);
    last = now;
    request = requestAnimationFrame(step);
  };
  request = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(request);
  };
}

export async function startMatchView(
  parent: HTMLElement,
  callbacks: MatchViewCallbacks,
  options: MatchViewOptions,
): Promise<MatchView> {
  // With no WebGL there is no arena, said plainly where it would be
  // (#655). The match itself goes on: the HUD still shows it, and a host
  // keeps hosting for its peers.
  let viewport: ArenaViewport | undefined;
  let notice: HTMLElement | undefined;
  try {
    viewport = await createArenaViewport(parent);
  } catch (error) {
    if (!(error instanceof NoWebGlError)) {
      throw error;
    }
    console.warn("[web] no arena in this match", error);
    notice = noWebGlNotice();
    parent.appendChild(notice);
  }

  let connection: MatchConnection;
  try {
    connection = await options.connect();
  } catch (error) {
    // Refused, or the host never answered: no arena to leave behind.
    viewport?.destroy();
    notice?.remove();
    throw error;
  }
  const walls = connection.map.walls.map(toRenderableWall);
  // Once per match, for the skill bar's line-of-sight hint (#485).
  const wallSegments = allWallSegments(connection.map.walls);
  const camera =
    viewport === undefined
      ? undefined
      : attachFollowCamera(viewport, parent, connection.map, () => viewport.size());

  const hud = createHud(parent, (targetId, status) => {
    connection.sendIntent({ kind: "end-upkeep", targetId, status });
  });
  // Your team's health, right middle (#1055); a row's click targets its member.
  const partyWindow = createPartyWindow(parent, (targetSessionId) => {
    connection.sendIntent({ kind: "target", targetSessionId });
  });
  // The compass (#486), top right under the match controls.
  const compass = createCompass(parent, compassReach(connection.map));
  // The arena's edge stops below the target frame and above the bars, not
  // under them (#440, #1042). From the bars, as the lines above them come
  // and go; to the frame's bottom, as its effects row grows.
  const measureCover = (): void => {
    // The chat panel (#479) sits just above the HUD, wherever its top is.
    parent.style.setProperty("--hud-height", `${String(hud.root.offsetHeight)}px`);
    camera?.setCover({
      top: hud.top.offsetTop + hud.top.offsetHeight,
      bottom: hud.root.offsetHeight - hud.bars.offsetTop,
    });
  };
  const coverObserver = new ResizeObserver(measureCover);
  coverObserver.observe(hud.root);
  coverObserver.observe(hud.bars);
  coverObserver.observe(hud.top);
  const useSkill = (slot: number): void => {
    connection.sendIntent({ kind: "use-skill", slot });
  };
  renderSkillBar(hud, () => connection.skillBar, connection.ranks, useSkill);
  // Read once per match: a keymap changed elsewhere applies from the next.
  const keymap = loadKeymap();
  renderKeyLabels(hud, keymap);
  let disposed = false;
  void loadLayoutLabeller().then((label) => {
    if (label !== undefined && !disposed) {
      renderKeyLabels(hud, keymap, label);
    }
  });

  const sounds = soundPlayer();
  const matchSounds = attachMatchSounds(connection, sounds);
  const matchMusic = attachMatchMusic(connection, {
    screen: "match",
    mode: () => music().mode(),
    tracks: TRACKS,
    onChange: (state) => {
      music().follow(state);
    },
  });
  const toggleMute = (): void => {
    setGlobalMute(!sounds.muted);
  };
  // Also when the jukebox popover's Sound controls mute all (#424).
  const offMute = onGlobalMute((muted) => {
    renderMute(hud, muted);
  });
  renderMute(hud, sounds.muted);
  hud.mute.addEventListener("click", toggleMute);
  const jukebox = attachJukeboxPopover(hud.music, parent);
  // Esc cancels an attack now, so leaving is a button that asks first (#160).
  const leave = renderLeave(hud, callbacks.onLeave);
  // Options over the match (#454): the match goes on underneath.
  const openOptions = (): void => {
    openOptionsOverlay(parent, () => {
      hud.options.setAttribute("aria-expanded", "false");
      hud.options.focus();
    });
    hud.options.setAttribute("aria-expanded", "true");
  };
  hud.options.setAttribute("aria-expanded", "false");
  hud.options.addEventListener("click", openOptions);
  const detachFullscreen = attachFullscreenButton(hud.fullscreen, fullscreenTarget());

  const detachMovement = attachKeyboardMoveInput(window, keymap, (direction) => {
    if (direction.x === 0 && direction.y === 0) {
      connection.sendIntent({ kind: "stop" });
    } else {
      connection.sendIntent({ kind: "move", dirX: direction.x, dirY: direction.y });
    }
  });

  const handleKeyDown = (event: KeyboardEvent): void => {
    // Ctrl, Alt and Meta are the browser's: Ctrl+R, Ctrl+W and the rest
    // do what they always do, and no game key fires with them (#302).
    if (isShortcut(event)) {
      return;
    }
    // F10, GW1's menu key, asks to leave (#221): the way out without a mouse.
    if (event.key === "F10") {
      // Some browsers focus their menu bar on F10.
      event.preventDefault();
      event.stopPropagation();
      // Not under Options (#454): its keys are its own, so no question
      // opens beneath it.
      if (!event.repeat && !isOptionsOverlayOpen()) {
        if (leave.isOpen()) {
          leave.close();
        } else {
          leave.open();
        }
      }
      return;
    }
    if (leave.isOpen()) {
      // While it asks, keys answer it and nothing else: Esc is "no" and
      // does not also cancel the attack, Tab moves between the answers,
      // and Enter or Space press the focused one, natively. No skill,
      // target or attack goes out. Movement keys still move.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        leave.close();
      } else if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        leave.cycleFocus();
      } else if (event.key !== "Enter" && event.key !== " ") {
        event.stopPropagation();
      }
      return;
    }
    // Options over the match (#454): keys are its, as for the leave
    // question. Its Esc closes it, on the screen bar's own listener, which
    // runs first, so an Esc it used is not also Cancel Action. Movement
    // keys still move.
    if (isOptionsOverlayOpen() || (event.key === "Escape" && event.defaultPrevented)) {
      return;
    }
    if (event.key === "Escape") {
      // Cancel Action (#300): the cast, the attack and a walk, whichever run.
      if (!event.repeat && hasActionToCancel(connection.getSnapshot())) {
        connection.sendIntent({ kind: "cancel" });
      }
      return;
    }
    if (isTyping(event.target)) {
      return;
    }
    const action = actionForCode(keymap, event.code);
    if (action === undefined) {
      return;
    }
    if (action !== "show-names") {
      // A bound key is the game's: never the browser's focus cycle (#55),
      // nor a page scroll on the arrows or Space.
      event.preventDefault();
    }
    // Held keys auto-repeat; one press is one target, attack, toggle or
    // cast (#43, #160).
    if (event.repeat) {
      return;
    }
    if (action === "target-next") {
      const current = latestMatch.players.find(
        (player) => player.sessionId === connection.selfSessionId,
      )?.targetSessionId;
      const next = nextTabTarget(
        latestMatch.players,
        connection.selfSessionId,
        current,
        event.shiftKey ? -1 : 1,
      );
      if (next !== undefined && next !== current) {
        connection.sendIntent({ kind: "target", targetSessionId: next });
      }
    } else if (action === "target-closest") {
      const current = latestMatch.players.find(
        (player) => player.sessionId === connection.selfSessionId,
      )?.targetSessionId;
      const closest = closestTarget(latestMatch.players, connection.selfSessionId);
      if (closest !== undefined && closest !== current) {
        connection.sendIntent({ kind: "target", targetSessionId: closest });
      }
    } else if (action === "target-called") {
      const intent = calledTargetIntent(connection.getSnapshot(), connection.getCalls());
      if (intent !== undefined) {
        connection.sendIntent(intent);
      }
    } else if (action === "target-self") {
      const intent = selfTargetIntent(latestMatch.players, connection.selfSessionId);
      if (intent !== undefined) {
        connection.sendIntent(intent);
      }
    } else if (action === "attack") {
      for (const intent of attackKeyIntents(connection.getSnapshot())) {
        connection.sendIntent(intent);
      }
    } else if (action === "mute") {
      toggleMute();
    } else if (action === "call-target" || action === "ping") {
      // For a mouse without a wheel click (#443).
      const snapshot = connection.getSnapshot();
      const call =
        action === "call-target"
          ? callTargetCall(snapshot)
          : pingCall(snapshot, viewport?.pointerWorld());
      if (call !== undefined) {
        connection.sendCall(call);
      }
    } else {
      const slot = skillSlotForKeyDown(event, keymap, connection.skillBar);
      if (slot !== undefined) {
        useSkill(slot);
      }
    }
  };
  window.addEventListener("keydown", handleKeyDown);

  let latestMatch = connection.getSnapshot();
  let latestArena = toArenaSnapshot(latestMatch, walls);
  // The names key shows every name; the cursor shows one (#253).
  const nameReveal = attachNameReveal(window, keymap);
  // While the match runs, closing or reloading the tab asks first: an
  // accidental Ctrl+W must not drop the player (#302). Not once the
  // result shows; then leaving is what they mean.
  const askBeforeUnload = (event: BeforeUnloadEvent): void => {
    event.preventDefault();
  };
  let guardingUnload = false;
  const guardUnload = (running: boolean): void => {
    if (running !== guardingUnload) {
      guardingUnload = running;
      if (running) {
        window.addEventListener("beforeunload", askBeforeUnload);
      } else {
        window.removeEventListener("beforeunload", askBeforeUnload);
      }
    }
  };
  const reconnectOverlay = mountReconnectOverlay(parent);
  const reconnectCountdown = attachReconnectCountdown(reconnectOverlay);
  connection.onConnectionChange((state) => {
    reconnectCountdown.connectionChanged(state);
    matchSounds.connectionChanged(state);
    matchMusic.connectionChanged(state);
    callbacks.onConnectionChange?.(state);
  });

  connection.onCombat((message) => {
    if (viewport !== undefined) {
      showCombatFeedback(viewport.scene, message, latestMatch);
    }
    // A cast of ours that never went off flashes its slot (#300).
    const buttons = hud.skillBar.querySelectorAll("button");
    for (const flash of slotFlashes(
      message.events,
      connection.selfSessionId,
      connection.skillBar,
    )) {
      const button = buttons[flash.slot];
      if (button !== undefined) {
        flashSlot(button, flash.kind);
      }
    }
    // So does the target's, in the target frame (#484).
    const self = latestMatch.players.find((p) => p.sessionId === connection.selfSessionId);
    flashTargetCast(hud, message.events, self?.targetSessionId);
  });
  // A key that does nothing reads as a broken game; say why (issue #51).
  connection.onCastRefused((message) => {
    flashMessage(hud, describeRefusal(message));
  });

  let finished = false;
  /** The summary (#1057), drawn once under the result banner when the host's `ended` lands. */
  let summary:
    { readonly tables: readonly SummaryTable[]; readonly panel: HTMLElement } | undefined;
  const onFrame = (deltaSeconds: number): void => {
    latestMatch = connection.getSnapshot();
    matchSounds.snapshot(latestMatch);
    matchMusic.snapshot(latestMatch);
    guardUnload(latestMatch.phase !== "finished");
    const self = latestMatch.players.find((p) => p.sessionId === connection.selfSessionId);
    if (latestMatch.phase === "finished" && !finished) {
      finished = true;
      callbacks.onFinished?.({
        winningTeam: latestMatch.winningTeam,
        endReason: latestMatch.endReason,
        selfTeam: self?.team,
      });
    }
    // The snapshot that says "finished" may land a frame before the `ended` that carries it.
    if (
      latestMatch.phase === "finished" &&
      summary === undefined &&
      latestMatch.summary !== undefined
    ) {
      const tables = summaryTables(latestMatch.summary, connection.selfSessionId, self?.team);
      const panel = renderSummary(parent, tables);
      panel.classList.add("hud-summary");
      summary = { tables, panel };
    }
    camera?.frame(deltaSeconds, self);
    // Hover is hit-tested every frame, through the camera as it is now, so
    // a body that walks under a still cursor, or a camera that moves under
    // it, shows the right name.
    partyWindow.update(latestMatch);
    latestArena = withCalls(
      withNames(toArenaSnapshot(latestMatch, walls), viewport?.pointerWorld(), nameReveal.held()),
      connection.getCalls(),
    );
    viewport?.scene.setSnapshot(latestArena);
    compass.update(latestArena, connection.selfSessionId);
    // For the e2e specs: who your team has called.
    const called = latestArena.calledId ?? "";
    if (parent.dataset.called !== called) {
      parent.dataset.called = called;
    }

    const target = latestMatch.players.find((p) => p.sessionId === self?.targetSessionId);
    // `latestMatch` carries the score, clock and outcome. Omitting it
    // here left the scoreboard, the match clock and the victory banner
    // permanently blank: the server tracked all three and the HUD could
    // draw all three, and nothing connected them.
    refreshSkillBar(hud, connection.skillBar);
    updateHud(
      hud,
      self,
      target,
      connection.skillBar,
      connection.getAdrenaline(),
      connection.getAdrenalineLossIn(),
      (targetId) => connection.getChainMark(targetId),
      wallSegments,
      latestMatch,
    );
    updateRecharges(hud, connection.skillBar, connection.getRecharges());
  };
  const offFrame = viewport?.onFrame(onFrame) ?? animationFrames(onFrame);

  // A misclick must never move you (#438): the left button only walks,
  // bodies included, and keeps the target; the right one picks, on its
  // release, so a later drag can pan instead.
  const doubleClick = createDoubleClick();
  const offPointer = viewport?.onButton(({ button, phase, world }) => {
    if (button === "left" && phase === "down") {
      connection.sendIntent({ kind: "walk-to", x: world.x, y: world.y });
      viewport.scene.showWalkMarker(world);
    } else if (button === "middle" && phase === "down") {
      // A wheel click calls a foe, or pings the point (#443, #1055).
      const action = middleClickAction(latestMatch, latestArena, world);
      if (action.kind === "call") {
        connection.sendCall(action.call);
      }
    }
  });
  // An RMB drag pans; a click picks (#442).
  camera?.onSecondaryClick((world) => {
    const intents = secondaryClickIntents(
      latestMatch,
      latestArena,
      world,
      doubleClick,
      performance.now(),
    );
    for (const intent of intents) {
      connection.sendIntent(intent);
    }
  });

  return {
    summary: () => summary?.tables,
    async dispose(): Promise<void> {
      // Order matters: stop listening before tearing down, so a late
      // event cannot touch a destroyed scene.
      disposed = true;
      offFrame();
      guardUnload(false);
      offPointer?.();
      coverObserver.disconnect();
      camera?.dispose();
      partyWindow.dispose();
      compass.dispose();
      delete parent.dataset.called;
      parent.style.removeProperty("--hud-height");
      nameReveal.detach();
      window.removeEventListener("keydown", handleKeyDown);
      detachMovement();
      matchSounds.dispose();
      matchMusic.dispose();
      reconnectCountdown.dispose();
      reconnectOverlay.destroy();
      // The scoreboard and target frame, result and mute button sit beside
      // the HUD root, in the shared viewport, so they go one by one or pile
      // up per match.
      hud.root.remove();
      hud.slotTips.dispose();
      hud.effects.dispose();
      hud.targetEffects.dispose();
      hud.top.remove();
      hud.result.remove();
      summary?.panel.remove();
      offMute();
      jukebox.dispose();
      closeOptionsOverlay();
      detachFullscreen();
      hud.controls.remove();
      viewport?.destroy();
      notice?.remove();
      await connection.disconnect();
    },
  };
}
