/**
 * Just enough STUN and TURN (RFC 8489, RFC 8656) over UDP for turn-check
 * (#974): a Binding request, and an authenticated Allocate that is released
 * at once. turnutils_uclient allocates too, but then relays to a peer, which
 * DENIED_PEERS refuses on loopback, and its output does not say plainly
 * whether the allocation itself succeeded. Here the answer is a STUN code.
 * A CreatePermission on the allocation asks whether a peer is allowed
 * (#1266) without sending it a packet.
 */
import crypto from "node:crypto";
import dgram from "node:dgram";
import net from "node:net";

const MAGIC = 0x2112a442;

const TYPE = { binding: 0x0001, allocate: 0x0003, refresh: 0x0004, createPermission: 0x0008 };
const SUCCESS = 0x0100;

const ATTR = {
  username: 0x0006,
  integrity: 0x0008,
  errorCode: 0x0009,
  lifetime: 0x000d,
  peer: 0x0012,
  realm: 0x0014,
  nonce: 0x0015,
  relayed: 0x0016,
  transport: 0x0019,
  mapped: 0x0020,
};

/**
 * @typedef {object} Message
 * @property {number} type
 * @property {Buffer} txid
 * @property {Map<number, Buffer>} attrs
 */

/**
 * @param {number} type
 * @param {Buffer} txid
 * @param {[number, Buffer][]} attrs
 * @param {Buffer | null} key  long-term key; adds MESSAGE-INTEGRITY when set
 * @returns {Buffer}
 */
export function encode(type, txid, attrs, key) {
  const body = Buffer.concat(
    attrs.map(([attr, value]) => {
      const head = Buffer.alloc(4);
      head.writeUInt16BE(attr, 0);
      head.writeUInt16BE(value.length, 2);
      return Buffer.concat([head, value, Buffer.alloc((4 - (value.length % 4)) % 4)]);
    }),
  );
  /** @param {number} length */
  const header = (length) => {
    const h = Buffer.alloc(20);
    h.writeUInt16BE(type, 0);
    h.writeUInt16BE(length, 2);
    h.writeUInt32BE(MAGIC, 4);
    txid.copy(h, 8);
    return h;
  };
  if (key === null) return Buffer.concat([header(body.length), body]);
  // The integrity covers the header with a length that already counts itself.
  const signed = Buffer.concat([header(body.length + 24), body]);
  const mac = crypto.createHmac("sha1", key).update(signed).digest();
  const head = Buffer.alloc(4);
  head.writeUInt16BE(ATTR.integrity, 0);
  head.writeUInt16BE(20, 2);
  return Buffer.concat([signed, head, mac]);
}

/**
 * @param {Buffer} buf
 * @returns {Message | null}  null for anything that is not a STUN message
 */
export function decode(buf) {
  if (buf.length < 20 || buf.readUInt32BE(4) !== MAGIC) return null;
  const length = buf.readUInt16BE(2);
  if (buf.length < 20 + length) return null;
  /** @type {Map<number, Buffer>} */
  const attrs = new Map();
  let at = 20;
  while (at + 4 <= 20 + length) {
    const attr = buf.readUInt16BE(at);
    const size = buf.readUInt16BE(at + 2);
    if (at + 4 + size > buf.length) return null;
    if (!attrs.has(attr)) attrs.set(attr, buf.subarray(at + 4, at + 4 + size));
    at += 4 + size + ((4 - (size % 4)) % 4);
  }
  return { type: buf.readUInt16BE(0), txid: buf.subarray(8, 20), attrs };
}

/**
 * The STUN error code of an error response, e.g. 401.
 *
 * @param {Message} msg
 * @returns {number | null}
 */
export function errorCode(msg) {
  const v = msg.attrs.get(ATTR.errorCode);
  if (v === undefined || v.length < 4) return null;
  return ((v[2] ?? 0) & 0x07) * 100 + (v[3] ?? 0);
}

/**
 * The reason phrase of an error response, e.g. "Forbidden IP".
 *
 * @param {Message} msg
 * @returns {string}
 */
export function errorReason(msg) {
  const v = msg.attrs.get(ATTR.errorCode);
  return v === undefined ? "" : v.subarray(4).toString("utf8");
}

/**
 * An XOR-MAPPED-ADDRESS or XOR-RELAYED-ADDRESS, as `address:port`.
 *
 * @param {Message} msg
 * @param {number} attr
 * @returns {{ address: string, port: number } | null}
 */
function xorAddress(msg, attr) {
  const v = msg.attrs.get(attr);
  if (v === undefined || v.length < 8) return null;
  const port = v.readUInt16BE(2) ^ (MAGIC >>> 16);
  if (v[1] === 0x01) {
    const ip = (v.readUInt32BE(4) ^ MAGIC) >>> 0;
    return { address: [24, 16, 8, 0].map((s) => String((ip >>> s) & 0xff)).join("."), port };
  }
  if (v.length < 20) return null;
  const mask = Buffer.concat([Buffer.from([0x21, 0x12, 0xa4, 0x42]), msg.txid]);
  const raw = Buffer.from(v.subarray(4, 20).map((b, i) => b ^ (mask[i] ?? 0)));
  const groups = [];
  for (let i = 0; i < 16; i += 2) groups.push(raw.readUInt16BE(i).toString(16));
  return { address: groups.join(":"), port };
}

/**
 * The long-term credential key, MD5(username:realm:password).
 *
 * @param {string} username
 * @param {string} realm
 * @param {string} password
 */
export function longTermKey(username, realm, password) {
  return crypto.createHash("md5").update(`${username}:${realm}:${password}`).digest();
}

/**
 * Sends requests on one socket and pairs each with its response.
 *
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs
 * @param {(ask: (type: number, attrs: [number, Buffer][], key: Buffer | null) => Promise<Message>) => Promise<T>} body
 * @returns {Promise<T>}
 * @template T
 */
async function exchange(host, port, timeoutMs, body) {
  const socket = dgram.createSocket(net.isIPv6(host) ? "udp6" : "udp4");
  /** @type {Map<string, (msg: Message) => void>} */
  const waiting = new Map();
  socket.on("message", (buf) => {
    const msg = decode(buf);
    if (msg === null) return;
    waiting.get(msg.txid.toString("hex"))?.(msg);
  });
  // A send that fails (no route, port unreachable) surfaces as the request timing out.
  socket.on("error", () => undefined);
  /** @type {(type: number, attrs: [number, Buffer][], key: Buffer | null) => Promise<Message>} */
  const ask = (type, attrs, key) =>
    new Promise((resolve, reject) => {
      const txid = crypto.randomBytes(12);
      const id = txid.toString("hex");
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error(`no answer from ${host}:${String(port)} in ${String(timeoutMs)} ms`));
      }, timeoutMs);
      waiting.set(id, (msg) => {
        clearTimeout(timer);
        waiting.delete(id);
        resolve(msg);
      });
      socket.send(encode(type, txid, attrs, key), port, host);
    });
  try {
    return await body(ask);
  } finally {
    socket.close();
  }
}

/**
 * A STUN Binding: the address this host is seen from.
 *
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs]
 * @returns {Promise<{ address: string, port: number }>}
 */
export function binding(host, port, timeoutMs = 2000) {
  return exchange(host, port, timeoutMs, async (ask) => {
    const res = await ask(TYPE.binding, [], null);
    const mapped = res.type === (TYPE.binding | SUCCESS) ? xorAddress(res, ATTR.mapped) : null;
    if (mapped === null) throw new Error("binding answered without a mapped address");
    return mapped;
  });
}

/**
 * An XOR-PEER-ADDRESS for an IPv4 peer, port 0.
 *
 * @param {string} ip
 * @returns {Buffer}
 */
export function xorPeerV4(ip) {
  const v = Buffer.alloc(8);
  v[1] = 0x01;
  v.writeUInt16BE(MAGIC >>> 16, 2);
  const raw = ip.split(".").reduce((acc, part) => (acc << 8) | Number(part), 0);
  v.writeUInt32BE((raw ^ MAGIC) >>> 0, 4);
  return v;
}

/**
 * @typedef {object} AllocateOptions
 * @property {string} host
 * @property {number} port
 * @property {string} username
 * @property {string} password
 * @property {number} [timeoutMs]
 */

/**
 * An authenticated TURN Allocate. `body` runs on the allocation, which is
 * released again after it.
 *
 * @param {AllocateOptions} opts
 * @param {(relayed: string, ask: (type: number, attrs: [number, Buffer][]) => Promise<Message>) => Promise<T>} body
 * @returns {Promise<{ ok: true, relayed: string, result: T } | { ok: false, code: number | null }>}
 * @template T
 */
function withAllocation({ host, port, username, password, timeoutMs = 2000 }, body) {
  const udp = Buffer.from([17, 0, 0, 0]);
  return exchange(host, port, timeoutMs, async (ask) => {
    // The first, unauthenticated, request is answered 401 with a realm and a nonce.
    const challenge = await ask(TYPE.allocate, [[ATTR.transport, udp]], null);
    const realm = challenge.attrs.get(ATTR.realm);
    const nonce = challenge.attrs.get(ATTR.nonce);
    if (errorCode(challenge) !== 401 || realm === undefined || nonce === undefined) {
      return { ok: false, code: errorCode(challenge) };
    }
    const key = longTermKey(username, realm.toString("utf8"), password);
    const auth = /** @type {[number, Buffer][]} */ ([
      [ATTR.username, Buffer.from(username, "utf8")],
      [ATTR.realm, realm],
      [ATTR.nonce, nonce],
    ]);
    const res = await ask(TYPE.allocate, [[ATTR.transport, udp], ...auth], key);
    if (res.type !== (TYPE.allocate | SUCCESS)) return { ok: false, code: errorCode(res) };
    const address = xorAddress(res, ATTR.relayed);
    const relayed = address === null ? "?" : `${address.address}:${String(address.port)}`;
    try {
      const result = await body(relayed, (type, attrs) => ask(type, [...attrs, ...auth], key));
      return { ok: true, relayed, result };
    } finally {
      const zero = Buffer.alloc(4);
      await ask(TYPE.refresh, [[ATTR.lifetime, zero], ...auth], key).catch(() => null);
    }
  });
}

/**
 * An authenticated TURN Allocate, released again at once.
 *
 * @param {AllocateOptions} opts
 * @returns {Promise<{ ok: true, relayed: string } | { ok: false, code: number | null }>}
 */
export async function allocate(opts) {
  const res = await withAllocation(opts, () => Promise.resolve(null));
  return res.ok ? { ok: true, relayed: res.relayed } : res;
}

/** @typedef {{ peer: string, code: number | null, reason: string | null }} Answer */

/**
 * Asks for a permission toward each IPv4 peer, each on its own allocation,
 * released before the next (#1379): an answer about one peer never depends
 * on what coturn did with the last. A peer's code and reason are null when
 * it was granted, else the error's: 403 is a peer coturn refuses.
 *
 * @param {AllocateOptions & { peers: readonly string[] }} opts
 * @returns {Promise<{ ok: true, answers: Answer[] } | { ok: false, code: number | null }>}
 */
export async function permissions(opts) {
  /** @type {Answer[]} */
  const answers = [];
  for (const peer of opts.peers) {
    /** @type {(relayed: string, ask: (type: number, attrs: [number, Buffer][]) => Promise<Message>) => Promise<Answer>} */
    const body = async (_relayed, ask) => {
      const reply = await ask(TYPE.createPermission, [[ATTR.peer, xorPeerV4(peer)]]);
      const granted = reply.type === (TYPE.createPermission | SUCCESS);
      return granted
        ? { peer, code: null, reason: null }
        : { peer, code: errorCode(reply) ?? 0, reason: errorReason(reply) };
    };
    const res = await withAllocation(opts, body);
    if (!res.ok) return res;
    answers.push(res.result);
  }
  return { ok: true, answers };
}
