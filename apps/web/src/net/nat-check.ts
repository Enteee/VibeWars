/**
 * Whether this browser sits behind a hard NAT (#2090): one a peer behind
 * another cannot reach without a relay, and there is no hosted TURN
 * (ADR-0022). The queue puts the answer on its ticket as `hardNat`, so
 * two hard players are not matched and a hard one does not host.
 * Unknown counts as not hard: the hint only ever keeps a ticket out.
 */

/**
 * Two STUN servers on different IPs: one alone cannot see a symmetric
 * NAT, which maps the same socket to a new port per destination. The
 * same providers Trystero already contacts, so they learn nothing new.
 */
const STUN_SERVERS: readonly string[] = [
  "stun:stun.cloudflare.com:3478",
  "stun:stun.l.google.com:19302",
];

/** How long gathering may take before the answer is unknown. */
export const NAT_CHECK_BUDGET_MS = 3000;

/** What `isHardNat` reads of one gathered ICE candidate. */
export interface NatCandidate {
  readonly type: string;
  readonly port: number;
  /** The local base it maps; `0.0.0.0` where the browser hides it. */
  readonly relatedAddress: string;
  readonly relatedPort: number;
  /** The STUN server it came from, where the browser says. */
  readonly url: string | undefined;
}

/** A related address the browser hid, as it does without media permission. */
function hidden(candidate: NatCandidate): boolean {
  return candidate.relatedAddress === "" || candidate.relatedAddress === "0.0.0.0";
}

/**
 * Whether `candidates`, gathered `complete`ly or not, show a hard NAT.
 * Only `srflx` ones count, since host ones may be mDNS names. Hard is:
 * one base mapped to two public ports (symmetric), or gathering that
 * completed with no `srflx` at all (UDP blocked). With the base hidden,
 * hard only when each STUN server gave exactly one and their ports
 * differ; more than one per server is ambiguous. Anything else, a
 * budget run out or one server answering included, is not hard.
 */
export function isHardNat(candidates: readonly NatCandidate[], complete: boolean): boolean {
  const reflexive = candidates.filter((candidate) => candidate.type === "srflx");
  if (reflexive.length === 0) {
    return complete;
  }
  const portsByBase = new Map<string, Set<number>>();
  for (const candidate of reflexive.filter((each) => !hidden(each))) {
    const base = `${candidate.relatedAddress}:${String(candidate.relatedPort)}`;
    portsByBase.set(base, (portsByBase.get(base) ?? new Set()).add(candidate.port));
  }
  if ([...portsByBase.values()].some((ports) => ports.size > 1)) {
    return true;
  }
  const byServer = new Map<string, NatCandidate[]>();
  for (const candidate of reflexive.filter(hidden)) {
    if (candidate.url !== undefined) {
      byServer.set(candidate.url, [...(byServer.get(candidate.url) ?? []), candidate]);
    }
  }
  const [first, second, ...rest] = [...byServer.values()];
  return (
    rest.length === 0 &&
    first?.length === 1 &&
    second?.length === 1 &&
    first[0]?.port !== second[0]?.port
  );
}

/**
 * The STUN server `event`'s candidate came from, which the DOM types do
 * not name yet: the candidate's `url` in Chromium, the event's, now
 * deprecated, in browsers that still have only that. Empty for a host one.
 */
function serverOf(event: RTCPeerConnectionIceEvent): string | undefined {
  for (const url of [Reflect.get(event.candidate ?? {}, "url"), Reflect.get(event, "url")]) {
    if (typeof url === "string" && url !== "") {
      return url;
    }
  }
  return undefined;
}

/**
 * Gather this browser's candidates against `STUN_SERVERS` on a throwaway
 * connection, within `NAT_CHECK_BUDGET_MS`, and say `isHardNat`. Never
 * rejects: an error is unknown, so not hard.
 */
export async function checkNat(): Promise<boolean> {
  let connection: RTCPeerConnection | undefined;
  try {
    const peer = new RTCPeerConnection({
      iceServers: STUN_SERVERS.map((urls) => ({ urls })),
    });
    connection = peer;
    const candidates: NatCandidate[] = [];
    const gathered = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        resolve(false);
      }, NAT_CHECK_BUDGET_MS);
      peer.addEventListener("icecandidate", (event) => {
        const { candidate } = event;
        if (candidate === null) {
          clearTimeout(timer);
          resolve(true);
          return;
        }
        candidates.push({
          type: candidate.type ?? "",
          port: candidate.port ?? 0,
          relatedAddress: candidate.relatedAddress ?? "",
          relatedPort: candidate.relatedPort ?? 0,
          url: serverOf(event),
        });
      });
    });
    // A channel, so the offer has something to gather candidates for.
    peer.createDataChannel("nat");
    await peer.setLocalDescription(await peer.createOffer());
    return isHardNat(candidates, await gathered);
  } catch {
    return false;
  } finally {
    connection?.close();
  }
}
