import { trysteroTransport } from "./trystero-transport";
import { broadcastTransport } from "./broadcast-transport";
import type { Transport } from "./transport";

const now = () => performance.timeOrigin + performance.now();
const pad = (bytes: number) => "x".repeat(bytes);

interface Recv { seq: number; sent: number; at: number }

const state = {
  t: undefined as (Transport & { ping?: (p: string) => Promise<number> }) | undefined,
  joinedAt: 0,
  peerJoins: [] as { id: string; ms: number }[],
  peerLeaves: [] as { id: string; at: number }[],
  recv: new Map<string, Recv[]>(),
  workerTicks: [] as number[],
  mainTicks: [] as number[],
  sentPerSecond: [] as number[],
  vis: [] as { at: number; state: string }[],
};
document.addEventListener("visibilitychange", () => state.vis.push({ at: now(), state: document.visibilityState }));

function listen(t: Transport) {
  t.onPeerJoin((id) => state.peerJoins.push({ id, ms: now() - state.joinedAt }));
  t.onPeerLeave((id) => state.peerLeaves.push({ id, at: now() }));
  t.on("snap", (data, from) => {
    const d = data as { seq: number; sent: number };
    let list = state.recv.get(from);
    if (!list) state.recv.set(from, (list = []));
    list.push({ seq: d.seq, sent: d.sent, at: now() });
  });
}

const spike = {
  joinTrystero(o: { appId: string; roomId: string; password: string; relayUrls?: string[] }) {
    state.joinedAt = now();
    state.t = trysteroTransport({ ...o, channels: ["snap", "intent"] });
    listen(state.t);
    return state.t.selfId;
  },
  joinBroadcast(roomId: string) {
    state.joinedAt = now();
    state.t = broadcastTransport(roomId);
    listen(state.t);
    return state.t.selfId;
  },
  peers: () => state.peerJoins,
  leaves: () => state.peerLeaves,
  send(channel: string, data: unknown, to?: string) {
    state.t?.send(channel, data, to);
  },
  /** Host: `hz` snapshots of `bytes` JSON to every peer, for `ms`. */
  stream(hz: number, bytes: number, ms: number) {
    let seq = 0;
    const body = pad(bytes - 40);
    const start = now();
    return new Promise<number>((resolve) => {
      const id = setInterval(() => {
        state.t?.send("snap", { seq: seq++, sent: now(), body });
        if (now() - start >= ms) {
          clearInterval(id);
          resolve(seq);
        }
      }, 1000 / hz);
    });
  },
  /** Host clock in a worker; each tick relays a `bytes` snapshot. Also a main-thread setInterval as a control. */
  workerHost(bytes: number) {
    const body = pad(bytes - 40);
    let seq = 0;
    const w = new Worker(new URL("./clock-worker.ts", import.meta.url), { type: "module" });
    w.onmessage = () => {
      state.workerTicks.push(now());
      state.t?.send("snap", { seq: seq++, sent: now(), body });
    };
    setInterval(() => state.mainTicks.push(now()), 50);
  },
  async ping(peer: string) {
    return state.t?.ping?.(peer);
  },
  recvStats() {
    const out: Record<string, unknown> = {};
    for (const [from, list] of state.recv) {
      let gaps = 0, reordered = 0, maxGapMs = 0;
      const lat = list.map((r) => r.at - r.sent).sort((a, b) => a - b);
      for (let i = 1; i < list.length; i++) {
        const d = list[i]!.seq - list[i - 1]!.seq;
        if (d > 1) gaps += d - 1;
        if (d < 1) reordered++;
        maxGapMs = Math.max(maxGapMs, list[i]!.at - list[i - 1]!.at);
      }
      const q = (p: number) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))]?.toFixed(1);
      out[from] = {
        received: list.length, firstSeq: list[0]?.seq, lastSeq: list.at(-1)?.seq, gaps, reordered,
        oneWayMs: { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: lat.at(-1)?.toFixed(1) },
        late100ms: lat.filter((l) => l > 100).length, maxArrivalGapMs: maxGapMs.toFixed(0),
      };
    }
    return out;
  },
  /** Ticks per minute since `from`, for the worker and the main-thread control. */
  tickRates(from: number) {
    const perMin = (ts: number[]) => {
      const m: number[] = [];
      for (const t of ts) if (t >= from) { const i = Math.floor((t - from) / 60000); m[i] = (m[i] ?? 0) + 1; }
      return Array.from(m, (v) => (v ?? 0) / 60);
    };
    return { worker: perMin(state.workerTicks), main: perMin(state.mainTicks), vis: state.vis };
  },
  arrivalRates(from: number) {
    const out: Record<string, number[]> = {};
    for (const [peer, list] of state.recv) {
      const m: number[] = [];
      for (const r of list) if (r.at >= from) { const i = Math.floor((r.at - from) / 60000); m[i] = (m[i] ?? 0) + 1; }
      out[peer] = Array.from(m, (v) => (v ?? 0) / 60);
    }
    return out;
  },
  now,
  leave: () => state.t?.leave(),
};
(window as unknown as { spike: typeof spike }).spike = spike;
document.body.dataset.ready = "1";
