import type { Combatant } from "../skills/types.js";
import type { AltarState } from "./altar.js";
import type { CapturePointState } from "./capture-points.js";
import { MatchTally, type CombatLogEntry } from "./combat-log.js";
import type { StandState } from "./flags.js";
import type { MatchPhase } from "../match-rules.js";

/**
 * The match's charts (#3564): a small time series per player and a list
 * of what happened, recorded by the host as the match runs and sent once
 * at its end. Nothing here is stored.
 */

/** The most samples a series holds: a whole match's worth, however long. */
export const SAMPLE_CAP = 120;

/**
 * The most events of each kind the list holds; the rest are counted, not
 * kept. One cap per kind, so a long match's interrupts cannot crowd out
 * its late deaths. They sum to the wire's `MAX_CHART_EVENTS`.
 */
export const EVENT_CAPS: Readonly<Record<ChartEvent["kind"], number>> = {
  death: 80,
  resurrected: 30,
  interrupt: 60,
  objective: 30,
};

/** Seconds between samples, so a match run to its time limit fills `SAMPLE_CAP`. */
export function samplePeriod(timeLimitSeconds: number): number {
  return Math.max(1, Math.ceil(timeLimitSeconds / SAMPLE_CAP));
}

/** What an objective change was: a shrine taken, the flag stand or the altar claimed. */
export const CHART_OBJECTIVES = ["point", "stand", "altar"] as const;
export type ChartObjective = (typeof CHART_OBJECTIVES)[number];

/** One thing that happened, at `t` whole seconds since the match began. */
export type ChartEvent =
  | { readonly t: number; readonly kind: "death"; readonly id: string; readonly by: string | null }
  | { readonly t: number; readonly kind: "resurrected"; readonly id: string }
  | {
      readonly t: number;
      readonly kind: "interrupt";
      readonly by: string;
      readonly id: string;
      readonly skillId: string;
    }
  | {
      readonly t: number;
      readonly kind: "objective";
      readonly team: number;
      readonly what: ChartObjective;
    };

/** One player's series: every array one entry per sample. */
export interface ChartSeries {
  readonly id: string;
  /** Damage dealt to foes, cumulative, whole numbers. */
  readonly dealt: readonly number[];
  readonly taken: readonly number[];
  readonly healed: readonly number[];
  /** Percent of maximum, 0 to 100; 0 while dead or gone. */
  readonly health: readonly number[];
  readonly energy: readonly number[];
}

export interface MatchChartResult {
  readonly period: number;
  readonly players: readonly ChartSeries[];
  readonly events: readonly ChartEvent[];
  /** Events past their kind's `EVENT_CAPS`, not kept. */
  readonly dropped: number;
}

/** What the chart reads of the match: `MatchSimulation` is one. */
export interface MatchChartState {
  readonly elapsedSeconds: number;
  readonly phase: MatchPhase;
  participants(): Iterable<{ readonly id: string; readonly combatant: Vitals }>;
  readonly capturePoints: readonly CapturePointState[];
  readonly stand: StandState | undefined;
  readonly altarState: AltarState;
}

/** What a sample reads of a body. */
type Vitals = Pick<Combatant, "health" | "maxHealth" | "energy" | "maxEnergy" | "dead">;

interface Point {
  readonly dealt: number;
  readonly taken: number;
  readonly healed: number;
  readonly health: number;
  readonly energy: number;
}

const ABSENT: Point = { dealt: 0, taken: 0, healed: 0, health: 0, energy: 0 };

/**
 * Records `MatchChartResult` tick by tick. Damage, taken and healing are
 * `MatchTally`'s, so the last sample's totals are the summary's. A sample
 * is taken on every period's boundary and once more as the match
 * finishes; the closing one replaces the last when the series is full.
 */
export class MatchChart {
  readonly #isMember: (id: string) => boolean;
  readonly #tally: MatchTally;
  readonly #period: number;
  /** Every member ever seen, in order: one who left keeps their series. */
  readonly #seen = new Set<string>();
  readonly #samples: ReadonlyMap<string, Point>[] = [];
  readonly #events: ChartEvent[] = [];
  readonly #kept: Record<ChartEvent["kind"], number> = {
    death: 0,
    resurrected: 0,
    interrupt: 0,
    objective: 0,
  };
  #dropped = 0;
  #finished = false;
  #owners: readonly (number | null)[] = [];
  #standHolder: number | undefined;
  #altarHolder: number | null = null;

  /** `teamOf` and `isMember` as `MatchTally`'s. */
  public constructor(
    teamOf: (id: string) => number | undefined,
    isMember: (id: string) => boolean,
    timeLimitSeconds: number,
  ) {
    this.#isMember = isMember;
    this.#tally = new MatchTally(teamOf, isMember);
    this.#period = samplePeriod(timeLimitSeconds);
  }

  /** One tick's log, and the match as it stands after it. */
  public add(log: readonly CombatLogEntry[], state: MatchChartState): void {
    if (this.#finished) {
      return;
    }
    this.#tally.add(log);
    for (const entry of log) {
      this.#addEntry(entry);
    }
    this.#addObjectives(state);
    const finished = state.phase === "finished";
    const due = (this.#samples.length + 1) * this.#period;
    if (finished || (this.#samples.length < SAMPLE_CAP && state.elapsedSeconds >= due)) {
      this.#sample(state);
    }
    this.#finished = finished;
  }

  /** One series for each of `ids`, zeros for one never seen; events only between them. */
  public result(ids: readonly string[]): MatchChartResult {
    const members = new Set(ids);
    const series = (id: string, key: keyof Point): number[] =>
      this.#samples.map((sample) => (sample.get(id) ?? ABSENT)[key]);
    const events: ChartEvent[] = [];
    for (const event of this.#events) {
      if (event.kind === "objective") {
        events.push(event);
      } else if (members.has(event.id)) {
        if (event.kind === "death" && event.by !== null && !members.has(event.by)) {
          events.push({ t: event.t, kind: "death", id: event.id, by: null });
        } else if (event.kind !== "interrupt" || members.has(event.by)) {
          events.push(event);
        }
      }
    }
    return {
      period: this.#period,
      players: ids.map((id) => ({
        id,
        dealt: series(id, "dealt"),
        taken: series(id, "taken"),
        healed: series(id, "healed"),
        health: series(id, "health"),
        energy: series(id, "energy"),
      })),
      events,
      dropped: this.#dropped,
    };
  }

  #addEntry(entry: CombatLogEntry): void {
    const t = Math.floor(entry.atSeconds);
    const by = entry.sourceId;
    if (by !== undefined && this.#isMember(by)) {
      this.#seen.add(by);
    }
    for (const event of entry.events) {
      if (!this.#isMember(event.targetId)) {
        continue;
      }
      this.#seen.add(event.targetId);
      if (event.kind === "death") {
        this.#push(
          by !== undefined && by !== event.targetId && this.#isMember(by)
            ? { t, kind: "death", id: event.targetId, by }
            : { t, kind: "death", id: event.targetId, by: null },
        );
      } else if (event.kind === "resurrected") {
        this.#push({ t, kind: "resurrected", id: event.targetId });
      } else if (event.kind === "interrupted" && by !== undefined && this.#isMember(by)) {
        this.#push({ t, kind: "interrupt", by, id: event.targetId, skillId: event.skillId });
      }
    }
  }

  /** A shrine, the flag stand or the altar that changed hands to a team this tick. */
  #addObjectives(state: MatchChartState): void {
    const t = Math.floor(state.elapsedSeconds);
    const owners = state.capturePoints.map(({ owner }) => owner);
    owners.forEach((owner, index) => {
      if (owner !== null && (this.#owners[index] ?? null) !== owner) {
        this.#push({ t, kind: "objective", team: owner, what: "point" });
      }
    });
    this.#owners = owners;
    const standHolder = state.stand?.holder;
    if (standHolder !== undefined && standHolder !== this.#standHolder) {
      this.#push({ t, kind: "objective", team: standHolder, what: "stand" });
    }
    this.#standHolder = standHolder;
    const altarHolder = state.altarState.holder;
    if (altarHolder !== null && altarHolder !== this.#altarHolder) {
      this.#push({ t, kind: "objective", team: altarHolder, what: "altar" });
    }
    this.#altarHolder = altarHolder;
  }

  #push(event: ChartEvent): void {
    if (this.#kept[event.kind] < EVENT_CAPS[event.kind]) {
      this.#kept[event.kind] += 1;
      this.#events.push(event);
    } else {
      this.#dropped += 1;
    }
  }

  #sample(state: MatchChartState): void {
    const present = new Map<string, Vitals>();
    for (const { id, combatant } of state.participants()) {
      if (this.#isMember(id)) {
        this.#seen.add(id);
        present.set(id, combatant);
      }
    }
    const sample = new Map<string, Point>();
    for (const id of this.#seen) {
      const row = this.#tally.row(id);
      const body = present.get(id);
      const alive = body !== undefined && !body.dead;
      sample.set(id, {
        dealt: Math.round(row.damage),
        taken: Math.round(row.taken),
        healed: Math.round(row.healing),
        health: alive ? percent(body.health, body.maxHealth) : 0,
        energy: alive ? percent(body.energy, body.maxEnergy) : 0,
      });
    }
    if (this.#samples.length < SAMPLE_CAP) {
      this.#samples.push(sample);
    } else {
      this.#samples[SAMPLE_CAP - 1] = sample;
    }
  }
}

function percent(value: number, max: number): number {
  return max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
}
