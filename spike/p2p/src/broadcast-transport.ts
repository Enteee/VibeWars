import { Handlers, type Transport } from "./transport";

type Frame =
  | { k: "hello"; from: string; reply: boolean }
  | { k: "bye"; from: string }
  | { k: "msg"; from: string; to?: string; channel: string; data: unknown };

/**
 * Same-origin tabs over BroadcastChannel. Peers find each other with a
 * hello/hello-back; a tab that goes says bye on leave() and on pagehide.
 */
export function broadcastTransport(roomId: string, selfId = crypto.randomUUID()): Transport {
  const bc = new BroadcastChannel(`vibewars:${roomId}`);
  const peers = new Set<string>();
  const joins = new Handlers<[string]>();
  const leaves = new Handlers<[string]>();
  const channels = new Map<string, Handlers<[unknown, string]>>();
  let left = false;
  const post = (f: Frame) => bc.postMessage(f);
  const join = (id: string) => {
    if (!peers.has(id)) {
      peers.add(id);
      joins.emit(id);
    }
  };
  bc.onmessage = (ev: MessageEvent<Frame>) => {
    const f = ev.data;
    if (left || f.from === selfId) return;
    if (f.k === "hello") {
      join(f.from);
      if (!f.reply) post({ k: "hello", from: selfId, reply: true });
    } else if (f.k === "bye") {
      if (peers.delete(f.from)) leaves.emit(f.from);
    } else if (f.to === undefined || f.to === selfId) {
      join(f.from);
      channels.get(f.channel)?.emit(f.data, f.from);
    }
  };
  const bye = () => post({ k: "bye", from: selfId });
  addEventListener("pagehide", bye);
  queueMicrotask(() => post({ k: "hello", from: selfId, reply: false }));
  return {
    selfId,
    send(channel, data, to) {
      if (!left) post({ k: "msg", from: selfId, channel, data, ...(to === undefined ? {} : { to }) });
    },
    on(channel, h) {
      let hs = channels.get(channel);
      if (!hs) channels.set(channel, (hs = new Handlers()));
      return hs.add(h);
    },
    onPeerJoin: (h) => joins.add(h),
    onPeerLeave: (h) => leaves.add(h),
    async leave() {
      bye();
      left = true;
      removeEventListener("pagehide", bye);
      bc.close();
    },
  };
}
