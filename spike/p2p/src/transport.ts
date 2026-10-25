/** The epic's Transport, as game-session has it (#82). */
export interface Transport {
  readonly selfId: string;
  send(channel: string, data: unknown, to?: string): void;
  on(channel: string, handler: (data: unknown, from: string) => void): () => void;
  onPeerJoin(handler: (peerId: string) => void): () => void;
  onPeerLeave(handler: (peerId: string) => void): () => void;
  leave(): Promise<void>;
}

export class Handlers<A extends unknown[]> {
  private readonly set = new Set<(...args: A) => void>();
  add(h: (...args: A) => void): () => void {
    this.set.add(h);
    return () => this.set.delete(h);
  }
  emit(...args: A): void {
    for (const h of [...this.set]) h(...args);
  }
}
