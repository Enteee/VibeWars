import {
  MAX_WIRE_ACTORS,
  MAX_WIRE_PROJECTILES,
  type WirePlayer,
  type WireProjectile,
  type WireSnapshot,
  type WireSnapshotPart,
} from "@vibewars/game-protocol";

import { messageBytes } from "./transport.js";

interface Run {
  readonly players: WirePlayer[];
  readonly projectiles: WireProjectile[];
}

/**
 * `snapshot` cut into parts each at most `maxBytes` as JSON (#662): what
 * the host sends as a tick's `"snapshot"` messages, so a message stays
 * one Trystero frame however many fields a player grows.
 *
 * Players first, then projectiles, in order, packed greedily the way
 * `packCombat` packs combat: each entry is measured once and the running
 * size is exact without serialising a part again. The header is measured
 * with `part` and `parts` as wide as they could print. An entry over
 * `maxBytes` on its own goes alone, never dropped or split;
 * `sizeChecked` says so. A tick that fits is one part.
 */
export function packSnapshot(snapshot: WireSnapshot, maxBytes: number): WireSnapshotPart[] {
  const { players, projectiles, ...header } = snapshot;
  const widest = Math.max(1, players.length + projectiles.length);
  const empty = messageBytes({
    ...header,
    part: widest,
    parts: widest,
    players: [],
    projectiles: [],
  });

  const runs: Run[] = [];
  let run: Run = { players: [], projectiles: [] };
  let bytes = empty;
  const place = <T>(entry: T, list: (run: Run) => T[]): void => {
    const size = messageBytes(entry);
    const filled = run.players.length + run.projectiles.length > 0;
    if (filled && bytes + (list(run).length === 0 ? 0 : 1) + size > maxBytes) {
      runs.push(run);
      run = { players: [], projectiles: [] };
      bytes = empty;
    }
    bytes += (list(run).length === 0 ? 0 : 1) + size;
    list(run).push(entry);
  };
  for (const player of players) {
    place(player, (into) => into.players);
  }
  for (const projectile of projectiles) {
    place(projectile, (into) => into.projectiles);
  }
  if (runs.length === 0 || run.players.length + run.projectiles.length > 0) {
    runs.push(run);
  }

  return runs.map((each, part) => ({
    ...header,
    part,
    parts: runs.length,
    players: each.players,
    projectiles: each.projectiles,
  }));
}

/** Whether two parts of one tick agree on everything but their runs. */
function sameHeader(a: WireSnapshotPart, b: WireSnapshotPart): boolean {
  return (
    a.parts === b.parts &&
    a.elapsedSeconds === b.elapsedSeconds &&
    a.score[0] === b.score[0] &&
    a.score[1] === b.score[1] &&
    a.phase === b.phase &&
    a.winningTeam === b.winningTeam &&
    a.endReason === b.endReason
  );
}

interface Pending {
  readonly tick: number;
  readonly parts: (WireSnapshotPart | undefined)[];
  received: number;
  /** A malformed part came: the rest of this tick is dropped too. */
  broken: boolean;
}

/**
 * Puts each tick's `"snapshot"` parts back together (#662): fed every
 * part as it arrives, it returns the whole `WireSnapshot` once the last
 * of a tick's parts is in, and `undefined` otherwise.
 *
 * Parts are placed by `part`, never by arrival order. It holds at most
 * one unfinished tick: a part of a newer one discards it, and a part of
 * a tick at or below the last assembled is dropped. A tick with a part
 * twice, a header disagreeing with another part's, or totals past the
 * caps is dropped whole, as a snapshot past a cap always was.
 */
export function snapshotAssembler(): (part: WireSnapshotPart) => WireSnapshot | undefined {
  let assembled: number | undefined;
  let pending: Pending | undefined;

  return (part) => {
    if (assembled !== undefined && part.tick <= assembled) {
      return undefined;
    }
    if (pending !== undefined && part.tick < pending.tick) {
      return undefined;
    }
    if (pending?.tick !== part.tick) {
      pending = {
        tick: part.tick,
        parts: Array.from({ length: part.parts }, () => undefined),
        received: 0,
        broken: false,
      };
    }
    if (pending.broken) {
      return undefined;
    }
    const first = pending.parts.find((each) => each !== undefined);
    if (
      part.parts !== pending.parts.length ||
      pending.parts[part.part] !== undefined ||
      (first !== undefined && !sameHeader(first, part))
    ) {
      pending.broken = true;
      return undefined;
    }
    pending.parts[part.part] = part;
    pending.received += 1;
    if (pending.received < pending.parts.length) {
      return undefined;
    }

    const parts = pending.parts.filter((each) => each !== undefined);
    pending = undefined;
    assembled = part.tick;
    const players = parts.flatMap((each) => each.players);
    const projectiles = parts.flatMap((each) => each.projectiles);
    if (players.length > MAX_WIRE_ACTORS || projectiles.length > MAX_WIRE_PROJECTILES) {
      return undefined;
    }
    return {
      tick: part.tick,
      elapsedSeconds: part.elapsedSeconds,
      score: part.score,
      phase: part.phase,
      winningTeam: part.winningTeam,
      endReason: part.endReason,
      players,
      projectiles,
    };
  };
}
