import { joinRoom, selfId, type JsonValue, type MessageAction } from "trystero/nostr";
import { Handlers, type Transport } from "./transport";

export interface TrysteroOptions {
  appId: string;
  roomId: string;
  password: string;
  relayUrls?: string[];
  channels: readonly string[];
  maxReceiveBytes?: number;
}

/**
 * Transport over Trystero 0.26 (Nostr). Every channel is one action, made up
 * front: Trystero's action names are 1-32 UTF-8 bytes, each action has ONE
 * onMessage slot, and the room ONE onPeerJoin/onPeerLeave slot, so this
 * multiplexes handlers onto them.
 */
export function trysteroTransport(o: TrysteroOptions): Transport & { ping(peer: string): Promise<number>; room: ReturnType<typeof joinRoom> } {
  const room = joinRoom(
    {
      appId: o.appId,
      password: o.password,
      maxReceiveBytes: o.maxReceiveBytes ?? 64 * 1024,
      ...(o.relayUrls ? { relayConfig: { urls: o.relayUrls } } : {}),
    },
    o.roomId,
    { onJoinError: (e) => console.warn("join error", e) },
  );
  const joins = new Handlers<[string]>();
  const leaves = new Handlers<[string]>();
  room.onPeerJoin = (id) => joins.emit(id);
  room.onPeerLeave = (id) => leaves.emit(id);
  const actions = new Map<string, { action: MessageAction<JsonValue>; handlers: Handlers<[unknown, string]> }>();
  for (const channel of o.channels) {
    const handlers = new Handlers<[unknown, string]>();
    const action = room.makeAction<JsonValue>(channel);
    action.onMessage = (data, ctx) => handlers.emit(data, ctx.peerId);
    actions.set(channel, { action, handlers });
  }
  const get = (channel: string) => {
    const a = actions.get(channel);
    if (!a) throw new Error(`unknown channel ${channel}`);
    return a;
  };
  return {
    selfId,
    room,
    send(channel, data, to) {
      // send() returns a Promise: it rejects when the target is gone. The
      // Transport sketch's void send has to swallow that.
      void get(channel).action.send(data as JsonValue, to === undefined ? {} : { target: to }).catch((e) => console.warn("send failed", e));
    },
    on: (channel, h) => get(channel).handlers.add(h),
    onPeerJoin: (h) => joins.add(h),
    onPeerLeave: (h) => leaves.add(h),
    leave: () => room.leave(),
    ping: (peer) => room.ping(peer),
  };
}
