import {
  MAX_CHART_PARTS,
  type WireChartEvent,
  type WireChartSeries,
  type WireCombat,
  type WireCombatBatch,
  type WireMatchChart,
  type WireMatchChartPart,
} from "@vibewars/game-protocol";

import { messageBytes } from "./transport.js";

/**
 * `entries` in order, cut into batches each at most `maxBytes` as JSON
 * and `maxCount` long (#601): what the host sends as a tick's `"combat"`
 * messages, so a message stays one Trystero chunk however many fields an
 * event grows.
 *
 * Greedy, measuring each entry once: an array's JSON is its brackets,
 * its entries and a comma between each two, so the running size is
 * exact without serialising a batch again. An entry over `maxBytes` on
 * its own goes alone, never dropped or split; `sizeChecked` says so.
 */
export function packCombat(
  entries: readonly WireCombat[],
  maxBytes: number,
  maxCount: number,
): WireCombatBatch[] {
  const batches: WireCombat[][] = [];
  let batch: WireCombat[] = [];
  let bytes = 2;
  for (const entry of entries) {
    const size = messageBytes(entry);
    if (batch.length > 0 && (bytes + 1 + size > maxBytes || batch.length >= maxCount)) {
      batches.push(batch);
      batch = [];
      bytes = 2;
    }
    bytes += (batch.length === 0 ? 0 : 1) + size;
    batch.push(entry);
  }
  if (batch.length > 0) {
    batches.push(batch);
  }
  return batches;
}

/**
 * A match's charts cut into the parts the host sends as `"match-chart"`
 * (#3564), each at most `maxBytes` as JSON, as `packCombat` cuts a tick's
 * combat: series first, then events, in order. Always at least one part.
 */
export function packMatchChart(chart: WireMatchChart, maxBytes: number): WireMatchChartPart[] {
  const { period, dropped } = chart;
  const envelope = messageBytes({
    period,
    parts: MAX_CHART_PARTS,
    players: [],
    events: [],
    dropped,
  });
  const groups: { players: WireChartSeries[]; events: WireChartEvent[] }[] = [];
  let group = { players: [] as WireChartSeries[], events: [] as WireChartEvent[] };
  let bytes = envelope;
  const add = (size: number): void => {
    if (group.players.length + group.events.length > 0 && bytes + 1 + size > maxBytes) {
      groups.push(group);
      group = { players: [], events: [] };
      bytes = envelope;
    }
    bytes += 1 + size;
  };
  for (const series of chart.players) {
    add(messageBytes(series));
    group.players.push(series);
  }
  for (const event of chart.events) {
    add(messageBytes(event));
    group.events.push(event);
  }
  groups.push(group);
  return groups.map(({ players, events }) => ({
    period,
    parts: groups.length,
    players,
    events,
    dropped,
  }));
}
