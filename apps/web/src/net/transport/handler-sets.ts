/**
 * The handlers a `Transport` adapter fans out to (#392): a set per
 * channel and one each for joins, leaves and trouble (#707), every `on*`
 * returning its remover, all of it dropped at once on `leave()`.
 */
import type { Channel } from "@vibewars/game-protocol";
import type { TransportTrouble } from "@vibewars/game-session";

type MessageHandler = (data: unknown, from: string) => void;
type PeerHandler = (peerId: string) => void;
type TroubleHandler = (trouble: TransportTrouble) => void;

/** Call each of `handlers`, as they are now: one may remove itself. */
function fire<A extends unknown[]>(handlers: Iterable<(...args: A) => void>, ...args: A): void {
  for (const handler of [...handlers]) {
    handler(...args);
  }
}

function subscribe<T>(set: Set<T>, handler: T): () => void {
  set.add(handler);
  return () => {
    set.delete(handler);
  };
}

export class HandlerSets {
  private readonly messages = new Map<Channel, Set<MessageHandler>>();
  private readonly joins = new Set<PeerHandler>();
  private readonly leaves = new Set<PeerHandler>();
  private readonly troubles = new Set<TroubleHandler>();

  on(channel: Channel, handler: MessageHandler): () => void {
    let handlers = this.messages.get(channel);
    if (handlers === undefined) {
      handlers = new Set();
      this.messages.set(channel, handlers);
    }
    return subscribe(handlers, handler);
  }

  onPeerJoin(handler: PeerHandler): () => void {
    return subscribe(this.joins, handler);
  }

  onPeerLeave(handler: PeerHandler): () => void {
    return subscribe(this.leaves, handler);
  }

  onTrouble(handler: TroubleHandler): () => void {
    return subscribe(this.troubles, handler);
  }

  message(channel: Channel, data: unknown, from: string): void {
    fire(this.messages.get(channel) ?? [], data, from);
  }

  joined(peerId: string): void {
    fire(this.joins, peerId);
  }

  left(peerId: string): void {
    fire(this.leaves, peerId);
  }

  trouble(trouble: TransportTrouble): void {
    fire(this.troubles, trouble);
  }

  /** Forget every handler: nothing is delivered after this. */
  clear(): void {
    this.messages.clear();
    this.joins.clear();
    this.leaves.clear();
    this.troubles.clear();
  }
}
