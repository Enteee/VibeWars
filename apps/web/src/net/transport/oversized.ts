import { MAX_MESSAGE_BYTES, messageBytes } from "@vibewars/game-session";

/**
 * A check that drops what a peer sends over `MAX_MESSAGE_BYTES` (#403),
 * before anything parses it, and warns once per peer. No VibeWars peer
 * sends one, so one that arrives is from a broken or hostile peer.
 */
export function oversizedCheck(label: string): (data: unknown, from: string) => boolean {
  const warned = new Set<string>();
  return (data, from) => {
    const bytes = messageBytes(data);
    if (bytes <= MAX_MESSAGE_BYTES) {
      return false;
    }
    if (!warned.has(from)) {
      warned.add(from);
      console.warn(`${label}: dropped a ${String(bytes)}-byte message from ${from}`);
    }
    return true;
  };
}
